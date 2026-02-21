/**
 * Conversation Context Manager
 * 
 * Manages conversation history for each edge + sender combination
 * Implements sliding window strategy to handle limited LLM context windows
 */

import Store from 'electron-store';
import type { ConversationContext, ChatMessage } from '../shared/types';
import { DEFAULT_CONTEXT_WINDOW_SIZE } from '../shared/constants';

interface StoredContext {
  edgeId: string;
  senderHash: string;
  senderPublicKey?: string; // Sender's X25519 public key (base64)
  messages: ChatMessage[];
  systemPrompt: string;
  maxTokens: number;
  lastActivity: string; // ISO date string
}

/**
 * Context Manager for maintaining conversation state
 */
export class ContextManager {
  private contexts: Map<string, ConversationContext>;
  private store: Store<{ contexts: StoredContext[] }>;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.contexts = new Map();
    
    // Initialize persistent store
    this.store = new Store({
      name: 'conversation-contexts',
      encryptionKey: 'relay-llm-bridge-contexts-encryption-key',
    });

    // Load contexts from disk
    this.load();

    console.log('[Context] Manager initialized');
  }

  /**
   * Get unique key for a conversation
   */
  private getKey(edgeId: string, senderHash: string): string {
    return `${edgeId}:${senderHash}`;
  }

  /**
   * Get or create context for a conversation
   */
  getContext(
    edgeId: string,
    senderHash: string,
    systemPrompt?: string,
    maxTokens?: number,
    senderPublicKey?: string
  ): ConversationContext {
    const key = this.getKey(edgeId, senderHash);
    
    let context = this.contexts.get(key);
    
    if (!context) {
      // Create new context
      context = {
        edgeId,
        senderHash,
        senderPublicKey,
        messages: [],
        systemPrompt: systemPrompt || '',
        maxTokens: maxTokens || DEFAULT_CONTEXT_WINDOW_SIZE,
        lastActivity: new Date(),
      };
      
      this.contexts.set(key, context);
      console.log('[Context] Created new context:', key);
    } else {
      // Update last activity
      context.lastActivity = new Date();
      
      // Update system prompt if provided and changed
      if (systemPrompt && systemPrompt !== context.systemPrompt) {
        context.systemPrompt = systemPrompt;
        console.log('[Context] Updated system prompt:', key);
      }
      
      // Update public key if provided and not already set
      if (senderPublicKey && !context.senderPublicKey) {
        context.senderPublicKey = senderPublicKey;
        console.log('[Context] Stored sender public key:', key);
      }
    }

    return context;
  }

  /**
   * Add message to context and trim if needed
   */
  addMessage(
    edgeId: string,
    senderHash: string,
    message: ChatMessage,
    senderPublicKey?: string
  ): void {
    const context = this.getContext(edgeId, senderHash, undefined, undefined, senderPublicKey);
    
    // Add timestamp if not present
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    context.messages.push(message);
    context.lastActivity = new Date();

    // Trim context if exceeded
    this.trimContext(context);

    // Debounced save
    this.debounceSave();

    console.log('[Context] Added message:', {
      key: this.getKey(edgeId, senderHash),
      role: message.role,
      messageCount: context.messages.length,
    });
  }

  /**
   * Trim context using sliding window strategy
   * 
   * Strategy:
   * 1. Always keep first user message (important context)
   * 2. Keep last N messages (most recent conversation)
   * 3. Drop messages in the middle when limit exceeded
   */
  private trimContext(context: ConversationContext): void {
    const limit = context.maxTokens;
    
    if (context.messages.length <= limit) {
      return; // No trimming needed
    }

    console.log('[Context] Trimming context:', {
      current: context.messages.length,
      limit,
    });

    // Find first user message
    const firstUserIndex = context.messages.findIndex(m => m.role === 'user');
    
    if (firstUserIndex === -1) {
      // No user messages yet, just keep last N
      context.messages = context.messages.slice(-limit);
      return;
    }

    const firstUserMessage = context.messages[firstUserIndex];
    const recentMessages = context.messages.slice(-(limit - 1));

    // Check if first user message is already in recent messages
    const firstIsInRecent = recentMessages.some(
      m => m.timestamp === firstUserMessage.timestamp
    );

    if (firstIsInRecent) {
      // First message is recent, just keep last N
      context.messages = recentMessages;
    } else {
      // Keep first user message + recent messages
      context.messages = [firstUserMessage, ...recentMessages];
    }
  }

  /**
   * Get sender public key for encryption
   */
  getSenderPublicKey(
    edgeId: string,
    senderHash: string
  ): string | undefined {
    const context = this.contexts.get(this.getKey(edgeId, senderHash));
    return context?.senderPublicKey;
  }

  /**
   * Get messages formatted for LLM API
   */
  getMessagesForLLM(
    edgeId: string,
    senderHash: string
  ): ChatMessage[] {
    const context = this.getContext(edgeId, senderHash);
    
    const messages: ChatMessage[] = [];

    // Add system prompt if present
    if (context.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.systemPrompt,
      });
    }

    // Add conversation history
    messages.push(...context.messages);

    return messages;
  }

  /**
   * Clear context for specific conversation
   */
  clearContext(edgeId: string, senderHash: string): void {
    const key = this.getKey(edgeId, senderHash);
    this.contexts.delete(key);
    this.debounceSave();
    console.log('[Context] Cleared context:', key);
  }

  /**
   * Clear all contexts for an edge
   */
  clearEdgeContexts(edgeId: string): void {
    let count = 0;
    
    for (const [key, context] of this.contexts.entries()) {
      if (context.edgeId === edgeId) {
        this.contexts.delete(key);
        count++;
      }
    }

    this.debounceSave();
    console.log('[Context] Cleared edge contexts:', { edgeId, count });
  }

  /**
   * Get conversation count for an edge
   */
  getConversationCount(edgeId: string): number {
    let count = 0;
    
    for (const context of this.contexts.values()) {
      if (context.edgeId === edgeId && context.messages.length > 0) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get total message count across all contexts
   */
  getTotalMessageCount(): number {
    let count = 0;
    
    for (const context of this.contexts.values()) {
      count += context.messages.length;
    }

    return count;
  }

  /**
   * Estimate memory usage (approximate)
   */
  estimateMemoryUsage(): number {
    let bytes = 0;
    
    for (const context of this.contexts.values()) {
      // Rough estimate: avg 100 bytes per message
      bytes += context.messages.length * 100;
      bytes += context.systemPrompt.length * 2; // UTF-16
    }

    return bytes;
  }

  /**
   * Save contexts to disk (debounced)
   */
  private debounceSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.save();
    }, 2000); // Save 2 seconds after last change
  }

  /**
   * Save all contexts to disk
   */
  save(): void {
    const stored: StoredContext[] = [];

    for (const context of this.contexts.values()) {
      stored.push({
        edgeId: context.edgeId,
        senderHash: context.senderHash,
        senderPublicKey: context.senderPublicKey,
        messages: context.messages,
        systemPrompt: context.systemPrompt,
        maxTokens: context.maxTokens,
        lastActivity: context.lastActivity.toISOString(),
      });
    }

    this.store.set('contexts', stored);
    console.log('[Context] Saved contexts to disk:', stored.length);
  }

  /**
   * Load contexts from disk
   */
  load(): void {
    const stored = this.store.get('contexts', []);
    
    for (const ctx of stored) {
      const key = this.getKey(ctx.edgeId, ctx.senderHash);
      
      this.contexts.set(key, {
        edgeId: ctx.edgeId,
        senderHash: ctx.senderHash,
        senderPublicKey: ctx.senderPublicKey,
        messages: ctx.messages,
        systemPrompt: ctx.systemPrompt,
        maxTokens: ctx.maxTokens,
        lastActivity: new Date(ctx.lastActivity),
      });
    }

    console.log('[Context] Loaded contexts from disk:', stored.length);
  }

  /**
   * Cleanup old contexts (not accessed in 7 days)
   */
  cleanupStale(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    let count = 0;

    for (const [key, context] of this.contexts.entries()) {
      const age = now - context.lastActivity.getTime();
      
      if (age > maxAgeMs) {
        this.contexts.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.debounceSave();
      console.log('[Context] Cleaned up stale contexts:', count);
    }
  }

  /**
   * Dispose (cleanup on shutdown)
   */
  dispose(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.save();
    console.log('[Context] Disposed');
  }
}

// Export singleton instance
export const contextManager = new ContextManager();

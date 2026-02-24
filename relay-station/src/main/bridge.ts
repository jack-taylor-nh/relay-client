/**
 * Relay Bridge Connection
 * 
 * @deprecated Bridges are being phased out in favor of RelayAI Operators.
 * This module is kept for backward compatibility only.
 * New deployments should use the RelayAI Operator system instead.
 * 
 * Manages SSE connection to Relay server and handles message encryption/decryption
 */

import EventSource from 'eventsource';
import { randomBytes } from 'crypto';
import * as crypto from './crypto';
import { llmClient } from './llm';
import { contextManager } from './context';
import { configStore } from './store';
import { ratchetStorage } from './ratchet-storage';
import { statsDb } from './services/StatsDatabase';
import { 
  sanitizeError, 
  createSafeLogContext, 
  estimateTokens 
} from './utils/secure-logging';
import { 
  type EncryptedRatchetMessage, 
  RatchetDecrypt,
} from '@relay/core';
import { decodeBase64 } from 'tweetnacl-util';
import type { BridgeEdge, BridgeStatus } from '../shared/types';
import { RELAY_API_BASE_URL, RELAY_API_TIMEOUT } from '../shared/constants';

/**
 * API Key Header Format
 * 
 * Clients embed API keys in message content using header format:
 * X-Relay-API-Key: relay_pk_abc123
 * 
 * Actual message content...
 */
const API_KEY_HEADER_REGEX = /^X-Relay-API-Key:\s*([^\n]+)\n/i;

/**
 * Parse API key from message content
 * Returns: { apiKey: string | null, content: string }
 */
function parseAPIKey(content: string): { apiKey: string | null; content: string } {
  const match = content.match(API_KEY_HEADER_REGEX);
  if (match) {
    const apiKey = match[1].trim();
    const cleanContent = content.replace(API_KEY_HEADER_REGEX, '').trim();
    return { apiKey, content: cleanContent };
  }
  return { apiKey: null, content };
}

/**
 * Generate a new API key
 */
function generateAPIKey(): string {
  const bytes = randomBytes(24);
  const key = bytes.toString('base64url'); // URL-safe base64
  return `relay_pk_${key}`;
}

/**
 * Single bridge connection using the bridge's own edge
 */
export class BridgeConnection {
  private bridgeEdge: BridgeEdge | null = null;
  private eventSource: EventSource | null = null;
  private status: BridgeStatus = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private onStatusChange?: (status: BridgeStatus) => void;
  private onLog?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void;
  
  // Health monitoring
  private lastEventTimestamp = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 15000; // Check every 15 seconds
  private readonly MAX_SILENCE_MS = 60000; // 60 seconds without event = dead connection
  
  // State machine tracking
  private isReconnecting = false; // Track if we're in reconnection mode
  
  // Network state tracking
  private isOnline = true;

  constructor(onStatusChange?: (status: BridgeStatus) => void, onLog?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void) {
    this.onStatusChange = onStatusChange;
    this.onLog = onLog;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, details?: any): void {
    // 🔒 SECURITY: Ensure details don't contain plaintext message content
    // Only log if details is a safe metadata object
    const safeDetails = details && typeof details === 'object' 
      ? createSafeLogContext(details)
      : undefined;
    
    console.log(`[Bridge] ${message}`, safeDetails || '');
    if (this.onLog) {
      this.onLog(level, message, safeDetails);
    }
  }

  /**
   * Start the bridge connection using the bridge's own edge
   */
  async connect(): Promise<void> {
    // Load bridge edge from config
    this.bridgeEdge = configStore.getBridgeEdge() || null;
    
    if (!this.bridgeEdge) {
      this.log('error', 'No bridge edge found. Bridge edge must be initialized first.');
      this.updateStatus('failed');
      return;
    }

    if (this.eventSource) {
      this.log('warn', 'Already connected - preventing duplicate connection', { edgeId: this.bridgeEdge.id });
      return;
    }

    // Determine if this is initial connection or reconnection
    const targetStatus = this.isReconnecting ? 'reconnecting' : 'connecting';
    this.updateStatus(targetStatus);
    this.log('info', `${this.isReconnecting ? 'Reconnecting' : 'Connecting'} with bridge edge`, { 
      edgeId: this.bridgeEdge.id,
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts,
    });

    try {
      // Build SSE URL with bridge's edge ID in path
      const url = `${RELAY_API_BASE_URL}/v1/stream/edge/${this.bridgeEdge.id}`;
      
      this.log('info', 'Connecting to SSE endpoint', { url, edgeId: this.bridgeEdge.id });
      
      // Create EventSource with bridge's X25519 secret key as Bearer token
      // Server authenticates by deriving public key from secret key
      this.eventSource = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.x25519PrivateKey}`,
        },
      });

      // Setup event handlers
      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.updateStatus('connected');
        this.log('info', 'Connected successfully to SSE stream');
        
        // 📊 STATS: Start session tracking
        if (this.bridgeEdge) {
          statsDb.startSession(this.bridgeEdge.id);
          this.log('info', 'Session tracking started');
        }
        
        // Start health monitoring
        this.startHealthCheck();
      };

      this.eventSource.onerror = (error: any) => {
        // 🔒 SECURITY: Sanitize error before logging
        const errorDetails = sanitizeError(error);
        this.log('error', 'Connection error', errorDetails);
        this.handleDisconnect();
      };

      // Listen for different message types
      this.eventSource.addEventListener('connected', this.handleConnected.bind(this));
      this.eventSource.addEventListener('edge.message', this.handleEdgeMessage.bind(this));
      this.eventSource.addEventListener('ping', this.handlePing.bind(this));

    } catch (error) {
      this.log('error', 'Connection failed', error);
      // Don't update status here - scheduleReconnect will handle it
      this.scheduleReconnect();
    }
  }

  /**
   * Handle initial connection confirmation from server
   */
  private handleConnected(event: MessageEvent): void {
    this.lastEventTimestamp = Date.now();
    const data = JSON.parse(event.data);
    this.log('info', 'Server confirmed connection', data);
  }

  /**
   * Handle ping to keep connection alive
   */
  private handlePing(event: MessageEvent): void {
    this.lastEventTimestamp = Date.now();
    const data = JSON.parse(event.data);
    this.log('info', 'Heartbeat ping received', { serverTimestamp: data.timestamp });
  }

  /**
   * Handle incoming edge message
   */
  private async handleEdgeMessage(event: MessageEvent): Promise<void> {
    this.lastEventTimestamp = Date.now();
    
    try {
      const data = JSON.parse(event.data);
      this.log('info', 'Edge message received', { messageId: data.messageId });

      // Fetch full message with encrypted content
      const message = await this.fetchMessage(data.messageId);
      
      if (!message) {
        this.log('error', 'Failed to fetch message', { messageId: data.messageId });
        return;
      }

      // 🚫 CRITICAL: Skip messages sent by THIS bridge to prevent infinite loop
      // When bridge sends streaming chunks, SSE notifies us about our own messages
      if (message.edgeId === this.bridgeEdge?.id) {
        this.log('info', 'Skipping own message', { 
          messageId: data.messageId,
          edgeId: message.edgeId,
        });
        return;
      }

      // Decrypt the message using bridge's private key
      const decrypted = await this.decryptMessage(message);
      
      if (!decrypted) {
        this.log('error', 'Failed to decrypt message', { messageId: data.messageId });
        return;
      }

      this.log('info', 'Decrypted message', {
        messageId: data.messageId,
        conversationId: message.conversationId,
        contentLength: decrypted.content.length,
      });

      // Check streaming config and route accordingly
      const config = configStore.getConfig();
      const streamingEnabled = config.streamResponses ?? false; // Default to false (complete responses)

      this.log('info', 'Processing message', {
        conversationId: message.conversationId,
        streamingEnabled,
      });

      // Process the message with streaming or completion
      if (streamingEnabled) {
        await this.processMessageStreaming(message.conversationId, decrypted);
      } else {
        await this.processMessage(message.conversationId, decrypted);
      }

    } catch (error) {
      this.log('error', 'Error handling edge message', error);
    }
  }

  /**
   * Fetch full message from API
   */
  private async fetchMessage(messageId: string): Promise<any> {
    if (!this.bridgeEdge) {
      throw new Error('Bridge edge not initialized');
    }

    try {
      const url = `${RELAY_API_BASE_URL}/v1/messages/${messageId}`;
      this.log('info', 'Fetching message', { url, messageId });
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      this.log('info', 'Message fetch response', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorText = await response.text();
        this.log('error', 'Message fetch failed', { 
          status: response.status, 
          statusText: response.statusText,
          body: errorText 
        });
        throw new Error(`Failed to fetch message: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.log('info', 'Message fetched successfully', { 
        messageId: (data as any).id,
        conversationId: (data as any).conversationId,
        hasCiphertext: !!(data as any).ciphertext,
        hasEphemeralKey: !!(data as any).ephemeralPubkey,
        hasNonce: !!(data as any).nonce,
      });
      
      return data;
    } catch (error) {
      this.log('error', 'Error fetching message', { 
        messageId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Decrypt a Double Ratchet message
   */
  private async decryptMessage(message: any): Promise<{
    content: string;
    senderEdgeId: string;
  } | null> {
    if (!this.bridgeEdge) {
      return null;
    }

    try {
      this.log('info', 'Decrypting message', {
        messageId: message.id,
        conversationId: message.conversationId,
        hasCiphertext: !!message.ciphertext,
        hasEphemeralPubkey: !!message.ephemeralPubkey,
        hasNonce: !!message.nonce,
        hasRatchetPn: message.ratchetPn !== null && message.ratchetPn !== undefined,
        hasRatchetN: message.ratchetN !== null && message.ratchetN !== undefined,
        ciphertextLength: message.ciphertext?.length,
        ephemeralPubkeyLength: message.ephemeralPubkey?.length,
        nonceLength: message.nonce?.length,
        ratchetPn: message.ratchetPn,
        ratchetN: message.ratchetN,
      });
      
      // Validate required Double Ratchet fields
      const { ciphertext, ephemeralPubkey, nonce, ratchetPn, ratchetN, conversationId, edgeId } = message;
      
      if (!ciphertext || !ephemeralPubkey || !nonce) {
        throw new Error('Missing required encryption fields (ciphertext, ephemeralPubkey, nonce)');
      }

      if (ratchetPn === null || ratchetPn === undefined || ratchetN === null || ratchetN === undefined) {
        throw new Error('Missing required Double Ratchet fields (ratchetPn, ratchetN)');
      }

      if (!conversationId) {
        throw new Error('Missing conversationId');
      }

      if (!edgeId) {
        throw new Error('Missing sender edgeId');
      }

      this.log('info', 'Loading/initializing ratchet state', {
        conversationId,
        senderEdgeId: edgeId,
        bridgeX25519PublicKey: this.bridgeEdge.x25519PublicKey.substring(0, 20) + '...',
        bridgeX25519PrivateKeyLength: this.bridgeEdge.x25519PrivateKey.length,
      });

      // Load or initialize ratchet state for this conversation
      let ratchetState = await ratchetStorage.load(conversationId);
      
      if (!ratchetState) {
        this.log('info', 'Initializing new ratchet state as Bob (receiver)');
        
        // We need the sender's edge X25519 public key to initialize
        // For now, we'll fetch it from the conversation details
        // In production, this should be cached or included in the message
        const senderPublicKey = await this.fetchSenderPublicKey(conversationId, edgeId);
        
        if (!senderPublicKey) {
          throw new Error('Failed to get sender X25519 public key');
        }

        // Initialize ratchet state as Bob (receiver)
        ratchetState = await ratchetStorage.initializeAsBob(
          conversationId,
          {
            publicKey: decodeBase64(this.bridgeEdge.x25519PublicKey),
            secretKey: decodeBase64(this.bridgeEdge.x25519PrivateKey),
          },
          decodeBase64(senderPublicKey)
        );
      }

      // Build EncryptedRatchetMessage from server message
      const encryptedMessage: EncryptedRatchetMessage = {
        ciphertext: ciphertext,
        dh: ephemeralPubkey, // DH public key (base64)
        pn: ratchetPn,       // Previous chain length
        n: ratchetN,         // Message number
        nonce: nonce,        // AEAD nonce
      };

      this.log('info', 'Attempting Double Ratchet decryption', {
        dhKeyPreview: ephemeralPubkey.substring(0, 20) + '...',
        pn: ratchetPn,
        n: ratchetN,
      });

      // Decrypt using Double Ratchet
      const result = RatchetDecrypt(ratchetState, encryptedMessage);

      if (!result) {
        throw new Error('RatchetDecrypt returned null - decryption failed');
      }

      const { plaintext, newState } = result;

      // Save updated ratchet state
      await ratchetStorage.save(conversationId, newState);

      this.log('info', 'Decryption successful', {
        contentLength: plaintext.length,
        contentPreview: plaintext.substring(0, 50),
      });

      return {
        content: plaintext,
        senderEdgeId: edgeId,
      };

    } catch (error) {
      this.log('error', 'Decryption error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Fetch sender's X25519 public key from edge
   */
  private async fetchSenderPublicKey(conversationId: string, senderEdgeId: string): Promise<string | null> {
    try {
      if (!this.bridgeEdge) {
        throw new Error('Bridge edge not initialized');
      }

      this.log('info', 'Fetching sender X25519 public key', { conversationId, senderEdgeId });

      // Fetch edge details to get X25519 public key
      const url = `${RELAY_API_BASE_URL}/v1/edges/${senderEdgeId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch edge: ${response.status}`);
      }

      const edge: any = await response.json();
      
      if (!edge.x25519PublicKey) {
        throw new Error('Edge missing x25519PublicKey');
      }

      this.log('info', 'Fetched sender public key', {
        senderEdgeId,
        publicKeyPreview: edge.x25519PublicKey.substring(0, 20) + '...',
      });

      return edge.x25519PublicKey;
    } catch (error) {
      this.log('error', 'Failed to fetch sender public key', {
        conversationId,
        senderEdgeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Send error message back to sender
   */
  private async sendErrorMessage(
    conversationId: string,
    recipientEdgeId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await this.sendResponse(conversationId, recipientEdgeId, errorMessage);
    } catch (error) {
      this.log('error', 'Failed to send error message', {
        conversationId,
        recipientEdgeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update API key usage statistics
   */
  private updateAPIKeyStats(apiKey: string): void {
    try {
      const config = configStore.getConfig();
      const apiKeys = config.apiKeys || [];
      
      const updatedKeys = apiKeys.map(key => {
        if (key.key === apiKey) {
          return {
            ...key,
            lastUsed: Date.now(),
            requestCount: key.requestCount + 1,
          };
        }
        return key;
      });
      
      configStore.updateConfig({ apiKeys: updatedKeys });
      
      this.log('info', 'Updated API key stats', {
        keyLabel: updatedKeys.find(k => k.key === apiKey)?.label,
      });
    } catch (error) {
      this.log('error', 'Failed to update API key stats', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * DEPRECATED: Update authorized user stats (lastSeen and requestCount)
   * Kept for backward compatibility with edge ID whitelist
   */
  // @ts-ignore - Deprecated but kept for migration
  private updateUserStats(userId: string): void {
    try {
      const config = configStore.getConfig();
      const authorizedUsers = config.authorizedUsers || [];
      
      const updatedUsers = authorizedUsers.map(user => {
        if (user.id === userId) {
          return {
            ...user,
            lastSeen: Date.now(),
            requestCount: user.requestCount + 1,
          };
        }
        return user;
      });
      
      configStore.updateConfig({ authorizedUsers: updatedUsers });
    } catch (error) {
      this.log('error', 'Failed to update user stats', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process decrypted message and generate LLM response
   */
  /**
   * Process an incoming encrypted message and respond via streaming chunks
   */
  private async processMessageStreaming(
    conversationId: string,
    decrypted: {
      content: string;
      senderEdgeId: string;
      messageId?: string;
    }
  ): Promise<void> {
    if (!this.bridgeEdge) {
      console.error('[Bridge] Cannot process message: bridge edge not initialized');
      return;
    }

    const startTime = Date.now();
    const messageId = decrypted.messageId || 'unknown';
    let errorCode: string | null = null;

    try {
      const config = configStore.getConfig();
      const systemPrompt = config.systemPrompt;
      
      // Parse API key and check access control (same as non-streaming)
      const { apiKey, content } = parseAPIKey(decrypted.content);
      const accessMode = config.accessControl || 'public';
      const apiKeys = config.apiKeys || [];
      
      // Same access control logic as before
      if (accessMode === 'hidden') {
        errorCode = 'BRIDGE_OFFLINE';
        this.log('warn', 'Request ignored: bridge is hidden/offline', {
          conversationId,
          senderEdgeId: decrypted.senderEdgeId,
        });
        return;
      } else if (accessMode === 'private') {
        if (!apiKey) {
          errorCode = 'MISSING_API_KEY';
          await this.sendErrorMessage(
            conversationId,
            decrypted.senderEdgeId,
            'This bridge requires an API key. Please contact the operator for access.'
          );
          return;
        }
        
        const keyConfig = apiKeys.find(k => k.key === apiKey);
        if (!keyConfig) {
          errorCode = 'INVALID_API_KEY';
          await this.sendErrorMessage(
            conversationId,
            decrypted.senderEdgeId,
            'Invalid API key. Please check your key and try again.'
          );
          return;
        }
        
        // Rate limit checks (simplified - same as before)
        if (keyConfig.rateLimit?.requestsPerHour) {
          const now = Date.now();
          const oneHourAgo = now - 3600000;
          const recentRequests = keyConfig.lastUsed && keyConfig.lastUsed > oneHourAgo 
            ? keyConfig.requestCount 
            : 0;
          
          if (recentRequests >= keyConfig.rateLimit.requestsPerHour) {
            errorCode = 'RATE_LIMIT_EXCEEDED';
            await this.sendErrorMessage(
              conversationId,
              decrypted.senderEdgeId,
              `Rate limit exceeded. Maximum ${keyConfig.rateLimit.requestsPerHour} requests per hour.`
            );
            return;
          }
        }
        
        this.updateAPIKeyStats(apiKey);
      }
      
      // Get or create conversation context
      contextManager.getContext(
        conversationId,
        decrypted.senderEdgeId,
        systemPrompt
      );
      
      // Add user message
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'user',
          content: content,
          timestamp: new Date().toISOString(),
        },
        decrypted.senderEdgeId
      );

      const messages = contextManager.getMessagesForLLM(
        conversationId,
        decrypted.senderEdgeId
      );

      const llmProvider = llmClient.getActiveProvider();
      if (!llmProvider) {
        throw new Error('No active LLM provider configured');
      }

      const model = config.defaultModel || llmProvider.defaultModel || llmProvider.models[0];

      this.log('info', 'Generating streaming LLM response', {
        conversationId,
        provider: llmProvider.name,
        model,
        messageCount: messages.length,
      });

      // 🚀 STREAMING: Send tokens with minimal buffering for better UX
      // Reduced chunk size from 10 to 3 for faster visual updates
      const chunkSize = config.chunkSize || 3;
      let chunkBuffer: string[] = [];
      let fullResponse = '';
      let chunkSeq = 0;
      let lastSendTime = Date.now();
      const flushIntervalMs = 300; // Send chunk after 300ms even if not full

      try {
        for await (const token of llmClient.chatStream(messages, { model })) {
          fullResponse += token;
          chunkBuffer.push(token);

          const timeSinceLastSend = Date.now() - lastSendTime;
          const shouldFlush = chunkBuffer.length >= chunkSize || timeSinceLastSend >= flushIntervalMs;

          // Send chunk when buffer reaches target size OR timeout passes
          if (shouldFlush && chunkBuffer.length > 0) {
            const chunkContent = chunkBuffer.join('');
            await this.sendResponse(
              conversationId,
              decrypted.senderEdgeId,
              chunkContent,
              { seq: chunkSeq++, isFinal: false, streamingChunk: true }
            );
            
            this.log('info', 'Sent streaming chunk', {
              seq: chunkSeq - 1,
              length: chunkContent.length,
              tokens: chunkBuffer.length,
              reason: chunkBuffer.length >= chunkSize ? 'size' : 'timeout',
            });
            
            chunkBuffer = [];
            lastSendTime = Date.now();
          }
        }

        // Send final chunk with remaining tokens
        if (chunkBuffer.length > 0) {
          const finalChunk = chunkBuffer.join('');
          await this.sendResponse(
            conversationId,
            decrypted.senderEdgeId,
            finalChunk,
            { seq: chunkSeq, isFinal: true, streamingChunk: true }
          );
          
          this.log('info', 'Sent final streaming chunk', {
            seq: chunkSeq,
            length: finalChunk.length,
          });
        }

      } catch (streamError) {
        this.log('error', 'Streaming error', sanitizeError(streamError));
        throw streamError;
      }

      this.log('info', 'Streaming response complete', {
        totalLength: fullResponse.length,
        chunkCount: chunkSeq + 1,
      });

      // Add complete assistant message to context
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'assistant',
          content: fullResponse,
        }
      );

      // Log stats
      const latencyMs = Date.now() - startTime;
      const tokensIn = estimateTokens(content);
      const tokensOut = estimateTokens(fullResponse);

      const userFingerprint = accessMode === 'private' && apiKey 
        ? apiKey.substring(0, 20)
        : decrypted.senderEdgeId;

      statsDb.logUsageEvent({
        bridgeId: this.bridgeEdge.id,
        userFingerprint,
        userHandle: (apiKey ? apiKeys.find(k => k.key === apiKey)?.label : null) ?? null,
        conversationId,
        messageId,
        model,
        tokensIn,
        tokensOut,
        latencyMs,
        errorCode: null,
        metadata: {
          provider: llmProvider.name,
          messageCount: messages.length,
          accessMode,
          apiKeyUsed: !!apiKey,
          streamingChunks: chunkSeq + 1,
        },
      });

    } catch (error) {
      errorCode = error instanceof Error ? error.constructor.name : 'UnknownError';
      const latencyMs = Date.now() - startTime;
      
      const { content: cleanContent } = parseAPIKey(decrypted.content);
      
      statsDb.logUsageEvent({
        bridgeId: this.bridgeEdge.id,
        userFingerprint: decrypted.senderEdgeId,
        userHandle: null,
        conversationId,
        messageId,
        model: 'unknown',
        tokensIn: estimateTokens(cleanContent),
        tokensOut: 0,
        latencyMs,
        errorCode,
        metadata: { errorMessage: error instanceof Error ? error.message : String(error) },
      });

      this.log('error', 'Error processing streaming message', sanitizeError(error));
      
      const errorMsg = 'Sorry, I encountered an error processing your message. Please try again.';
      try {
        await this.sendResponse(conversationId, decrypted.senderEdgeId, errorMsg);
      } catch (sendError) {
        this.log('error', 'Failed to send error message', sanitizeError(sendError));
      }
    }
  }

  /**
   * Process an incoming encrypted message and respond
   */
  private async processMessage(conversationId: string, decrypted: {
    content: string;
    senderEdgeId: string;
    messageId?: string;
  }): Promise<void> {
    if (!this.bridgeEdge) {
      console.error('[Bridge] Cannot process message: bridge edge not initialized');
      return;
    }

    // 📊 STATS: Start timing
    const startTime = Date.now();
    const messageId = decrypted.messageId || 'unknown';
    let errorCode: string | null = null;

    try {
      // Get system prompt from config
      const config = configStore.getConfig();
      const systemPrompt = config.systemPrompt;
      
      // � PARSE API KEY: Extract from content if present
      const { apiKey, content } = parseAPIKey(decrypted.content);
      
      // 🔒 ACCESS CONTROL: Check access mode and API key
      const accessMode = config.accessControl || 'public';
      const apiKeys = config.apiKeys || [];
      
      if (accessMode === 'hidden') {
        // Hidden mode: Bridge is offline - don't respond at all
        errorCode = 'BRIDGE_OFFLINE';
        this.log('warn', 'Request ignored: bridge is hidden/offline', {
          conversationId,
          senderEdgeId: decrypted.senderEdgeId,
        });
        return; // Don't send error - just ignore silently
      } else if (accessMode === 'private') {
        // Private mode: requires valid API key
        if (!apiKey) {
          errorCode = 'MISSING_API_KEY';
          this.log('warn', 'Request blocked: no API key provided', {
            conversationId,
            senderEdgeId: decrypted.senderEdgeId,
          });
          
          await this.sendErrorMessage(
            conversationId,
            decrypted.senderEdgeId,
            'This bridge requires an API key. Please contact the operator for access.'
          );
          return;
        }
        
        // Find API key in config
        const keyConfig = apiKeys.find(k => k.key === apiKey);
        
        if (!keyConfig) {
          errorCode = 'INVALID_API_KEY';
          this.log('warn', 'Request blocked: invalid API key', {
            conversationId,
            senderEdgeId: decrypted.senderEdgeId,
            apiKeyPrefix: apiKey.substring(0, 15) + '...',
          });
          
          await this.sendErrorMessage(
            conversationId,
            decrypted.senderEdgeId,
            'Invalid API key. Please check your key and try again.'
          );
          return;
        }
        
        // API key is valid - check rate limits if configured
        if (keyConfig.rateLimit) {
          const now = Date.now();
          
          // Check hourly request limit
          if (keyConfig.rateLimit.requestsPerHour) {
            const oneHourAgo = now - 3600000;
            const recentRequests = keyConfig.lastUsed && keyConfig.lastUsed > oneHourAgo 
              ? keyConfig.requestCount 
              : 0;
            
            if (recentRequests >= keyConfig.rateLimit.requestsPerHour) {
              errorCode = 'RATE_LIMIT_EXCEEDED';
              this.log('warn', 'Request blocked: rate limit exceeded', {
                conversationId,
                keyLabel: keyConfig.label,
                requestsPerHour: keyConfig.rateLimit.requestsPerHour,
              });
              
              await this.sendErrorMessage(
                conversationId,
                decrypted.senderEdgeId,
                `Rate limit exceeded. Maximum ${keyConfig.rateLimit.requestsPerHour} requests per hour.`
              );
              return;
            }
          }
          
          // Check daily token limit
          if (keyConfig.rateLimit.tokensPerDay) {
            // TODO: Track tokens per day (requires aggregating from stats DB)
            // For now, skip this check - implement in future iteration
          }
        }
        
        // Update API key stats
        this.updateAPIKeyStats(apiKey);
      } else if (accessMode === 'public') {
        // Public mode: Check global rate limits if configured
        const globalRateLimit = config.rateLimit;
        
        if (globalRateLimit) {
          // Check global hourly request limit
          if (globalRateLimit.requestsPerHour) {
            // TODO: Implement proper global rate limiting using stats DB
            // For now, track in-memory per sender edge
            // This is a placeholder - needs proper implementation with stats DB queries
            this.log('info', 'Global rate limit configured but not enforced yet', {
              conversationId,
              senderEdgeId: decrypted.senderEdgeId,
              limit: globalRateLimit.requestsPerHour,
            });
          }
          
          // Check global daily token limit
          if (globalRateLimit.tokensPerDay) {
            // TODO: Implement token tracking using stats DB
            this.log('info', 'Global token limit configured but not enforced yet', {
              conversationId,
              senderEdgeId: decrypted.senderEdgeId,
              limit: globalRateLimit.tokensPerDay,
            });
          }
        }
      }
      
      // If we reach here, user is authorized (or mode is public)
      
      // Get or create conversation context with system prompt
      contextManager.getContext(
        conversationId,
        decrypted.senderEdgeId,
        systemPrompt
      );
      
      // Add user message to context (use cleaned content without API key header)
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'user',
          content: content, // ← Use cleaned content
          timestamp: new Date().toISOString(),
        },
        decrypted.senderEdgeId // Store sender edge ID for response
      );

      // Get conversation context for LLM
      const messages = contextManager.getMessagesForLLM(
        conversationId,
        decrypted.senderEdgeId
      );

      // Get active LLM provider
      const llmProvider = llmClient.getActiveProvider();
      
      if (!llmProvider) {
        throw new Error('No active LLM provider configured');
      }

      // Use configured default model, or fall back to provider's default
      const model = config.defaultModel || llmProvider.defaultModel || llmProvider.models[0];

      this.log('info', 'Generating LLM response', {
        conversationId,
        provider: llmProvider.name,
        model,
        messageCount: messages.length,
      });

      // Generate LLM response
      const llmResponse = await llmClient.chat(messages, { model });

      if (!llmResponse) {
        throw new Error('LLM returned empty response');
      }

      this.log('info', 'LLM response generated', { length: llmResponse.length });

      // Add assistant message to context
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'assistant',
          content: llmResponse,
        }
      );

      // 📊 STATS: Log successful usage event
      const latencyMs = Date.now() - startTime;
      const tokensIn = estimateTokens(content); // Use cleaned content
      const tokensOut = estimateTokens(llmResponse);

      // Track by API key ID in private mode, edge ID in public mode
      const userFingerprint = accessMode === 'private' && apiKey 
        ? apiKey.substring(0, 20) // Use API key prefix as fingerprint
        : decrypted.senderEdgeId;

      statsDb.logUsageEvent({
        bridgeId: this.bridgeEdge.id, // Using bridge edge ID as bridge ID for now
        userFingerprint,
        userHandle: (apiKey ? apiKeys.find(k => k.key === apiKey)?.label : null) ?? null,
        conversationId,
        messageId,
        model,
        tokensIn,
        tokensOut,
        latencyMs,
        errorCode: null,
        metadata: {
          provider: llmProvider.name,
          messageCount: messages.length,
          accessMode,
          apiKeyUsed: !!apiKey,
        },
      });

      // Send encrypted response back
      await this.sendResponse(conversationId, decrypted.senderEdgeId, llmResponse);

    } catch (error) {
      // 📊 STATS: Log error event
      errorCode = error instanceof Error ? error.constructor.name : 'UnknownError';
      const latencyMs = Date.now() - startTime;
      
      // Parse content to get cleaned version (in case we error before parsing)
      const { content: cleanContent } = parseAPIKey(decrypted.content);
      
      statsDb.logUsageEvent({
        bridgeId: this.bridgeEdge.id,
        userFingerprint: decrypted.senderEdgeId,
        userHandle: null,
        conversationId,
        messageId,
        model: 'unknown',
        tokensIn: estimateTokens(cleanContent),
        tokensOut: 0,
        latencyMs,
        errorCode,
        metadata: { errorMessage: error instanceof Error ? error.message : String(error) },
      });

      // 🔒 SECURITY: Sanitize error before logging
      this.log('error', 'Error processing message', sanitizeError(error));
      
      // Send error message back to user
      const errorMsg = 'Sorry, I encountered an error processing your message. Please try again.';
      try {
        await this.sendResponse(conversationId, decrypted.senderEdgeId, errorMsg);
      } catch (sendError) {
        this.log('error', 'Failed to send error message', sanitizeError(sendError));
      }
    }
  }

  /**
   * Send encrypted response back to Relay server using Double Ratchet
   */
  private async sendResponse(
    conversationId: string,
    recipientEdgeId: string,
    content: string,
    metadata?: { seq?: number; isFinal?: boolean; streamingChunk?: boolean }
  ): Promise<void> {
    if (!this.bridgeEdge) {
      throw new Error('Bridge edge not initialized');
    }

    try {
      // Prepend metadata if provided (for streaming chunks)
      let messageContent = content;
      if (metadata && metadata.streamingChunk) {
        const metadataHeader = JSON.stringify({
          type: 'streaming-chunk',
          seq: metadata.seq ?? 0,
          isFinal: metadata.isFinal ?? false,
        });
        messageContent = `__RELAY_CHUNK_METADATA__:${metadataHeader}\n${content}`;
      }

      this.log('info', 'Sending response', {
        conversationId,
        recipientEdgeId,
        contentLength: messageContent.length,
        streaming: metadata?.streamingChunk ?? false,
        seq: metadata?.seq,
        isFinal: metadata?.isFinal,
      });

      // Load ratchet state for this conversation
      let ratchetState = await ratchetStorage.load(conversationId);
      
      if (!ratchetState) {
        throw new Error('Ratchet state not found - cannot send response without initialized conversation');
      }

      // Encrypt using Double Ratchet
      const { RatchetEncrypt } = await import('@relay/core');
      const { message: encryptedMessage, newState } = RatchetEncrypt(ratchetState, messageContent);

      // Save updated ratchet state
      await ratchetStorage.save(conversationId, newState);

      this.log('info', 'Encrypted response with Double Ratchet', {
        dhKeyPreview: encryptedMessage.dh.substring(0, 20) + '...',
        pn: encryptedMessage.pn,
        n: encryptedMessage.n,
      });

      // Sign the message envelope
      const signatureMessage = `relay-msg:${recipientEdgeId}:${encryptedMessage.nonce}`;
      const signature = crypto.sign(signatureMessage, this.bridgeEdge.ed25519PrivateKey);

      // Send to Relay API with Double Ratchet fields
      const response = await fetch(`${RELAY_API_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          edge_id: this.bridgeEdge.id,
          origin: 'local-llm',
          security_level: 'e2ee',
          payload: {
            content_type: 'text/plain',
            ciphertext: encryptedMessage.ciphertext,
            ephemeral_pubkey: encryptedMessage.dh,
            nonce: encryptedMessage.nonce,
            dh: encryptedMessage.dh,
            pn: encryptedMessage.pn,
            n: encryptedMessage.n,
          },
          signature,
        }),
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(`Failed to send message: ${errorData.error || response.statusText}`);
      }

      this.log('info', 'Response sent successfully');

    } catch (error) {
      this.log('error', 'Error sending response', error);
      throw error;
    }
  }

  /**
   * Handle disconnection and schedule reconnect
   */
  private handleDisconnect(): void {
    this.stopHealthCheck();
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('error', 'Max reconnect attempts reached', {
        attempts: this.reconnectAttempts,
        max: this.maxReconnectAttempts,
      });
      this.isReconnecting = false;
      this.updateStatus('failed');
      return;
    }

    // If offline, don't schedule reconnect - wait for network restore
    if (!this.isOnline) {
      this.log('info', 'Network offline - pausing reconnection attempts');
      this.isReconnecting = true;
      this.updateStatus('reconnecting');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.isReconnecting = true;
    this.updateStatus('reconnecting');
    
    this.log('info', 'Scheduling reconnect', { 
      delayMs: delay, 
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Start health check monitoring
   * Detects silent connection failures by checking for events
   */
  private startHealthCheck(): void {
    // Record connection time
    this.lastEventTimestamp = Date.now();
    
    // Stop any existing health check
    this.stopHealthCheck();
    
    this.log('info', 'Starting health check monitoring', {
      checkInterval: this.HEALTH_CHECK_INTERVAL,
      maxSilence: this.MAX_SILENCE_MS,
    });
    
    // Check health every 15 seconds
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastEvent = now - this.lastEventTimestamp;
      
      if (timeSinceLastEvent > this.MAX_SILENCE_MS) {
        this.log('warn', 'Connection appears dead - no events received', {
          timeSinceLastEvent,
          maxSilence: this.MAX_SILENCE_MS,
        });
        
        // Force disconnect and reconnect
        this.handleDisconnect();
      } else {
        // Log health status
        this.log('info', 'Connection health check passed', {
          timeSinceLastEvent,
          status: 'healthy',
        });
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.log('info', 'Stopped health check monitoring');
    }
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: BridgeStatus): void {
    this.status = status;
    
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Get current status
   */
  getStatus(): BridgeStatus {
    return this.status;
  }

  /**
   * Force immediate reconnection (bypasses backoff)
   * Used when network connectivity is restored
   */
  forceReconnect(): void {
    this.log('info', 'Force reconnect requested');
    
    // Cancel any pending reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Reset reconnect attempts for immediate connection
    this.reconnectAttempts = 0;
    this.isReconnecting = true;
    
    // Disconnect if currently connected
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // Immediate reconnection
    this.connect();
  }

  /**
   * Handle network online event
   */
  handleNetworkOnline(): void {
    this.log('info', 'Network online detected');
    this.isOnline = true;
    
    // If we're in a reconnecting or failed state, force immediate reconnection
    if (this.status === 'reconnecting' || this.status === 'failed') {
      this.forceReconnect();
    }
  }

  /**
   * Handle network offline event
   */
  handleNetworkOffline(): void {
    this.log('warn', 'Network offline detected');
    this.isOnline = false;
    
    // Cancel any pending reconnection attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Keep current status but stop active attempts
    if (this.status === 'connected' || this.status === 'connecting') {
      this.updateStatus('reconnecting');
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[Bridge] Disconnecting');

    // 📊 STATS: End session tracking
    statsDb.endSession();
    this.log('info', 'Session tracking ended');

    this.stopHealthCheck();
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('disconnected');
  }
}

/**
 * Manager for multiple bridge connections
 */
/**
 * Bridge Manager - Manages single bridge connection
 */
export class BridgeManager {
  private bridge: BridgeConnection | null = null;
  private mainWindow: Electron.BrowserWindow | null = null;

  constructor() {
    this.bridge = null;
  }

  /**
   * Set the main window for sending IPC events
   */
  setMainWindow(window: Electron.BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Emit log to renderer
   */
  private emitLog(level: 'info' | 'warn' | 'error', message: string, details?: any): void {
    console.log(`[BridgeManager] Emitting log: ${message}`, { hasWindow: !!this.mainWindow, details });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('bridge-log', {
        timestamp: new Date().toISOString(),
        level,
        message,
        details,
      });
    } else {
      console.warn('[BridgeManager] Cannot emit log - mainWindow not available');
    }
  }

  /**
   * Emit status change to renderer
   */
  private emitStatus(status: BridgeStatus): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('bridge-status-change', status);
    }
  }

  /**
   * Start the bridge connection
   */
  async start(): Promise<void> {
    if (this.bridge) {
      console.warn('[BridgeManager] Bridge already running');
      return;
    }

    console.log('[BridgeManager] Initializing bridge connection...');
    this.emitLog('info', 'Bridge manager starting', { hasMainWindow: !!this.mainWindow });

    const bridge = new BridgeConnection(
      (status) => {
        console.log('[BridgeManager] Bridge status:', status);
        this.emitStatus(status);
      },
      (level, message, details) => {
        this.emitLog(level, message, details);
      }
    );

    this.bridge = bridge;
    await bridge.connect();
  }

  /**
   * Stop the bridge connection
   */
  stop(): void {
    if (!this.bridge) {
      console.warn('[BridgeManager] Bridge not running');
      return;
    }

    this.bridge.disconnect();
    this.bridge = null;
  }

  /**
   * Get bridge status
   */
  getStatus(): BridgeStatus {
    return this.bridge ? this.bridge.getStatus() : 'disconnected';
  }

  /**
   * Get bridge's edge ID
   */
  getBridgeEdgeId(): string | null {
    const bridgeEdge = configStore.getBridgeEdge();
    return bridgeEdge ? bridgeEdge.id : null;
  }

  /**
   * Reload bridges from config (kept for compatibility)
   */
  async reloadFromConfig(): Promise<void> {
    console.log('[BridgeManager] Starting bridge connection');
    await this.start();
  }

  /**
   * Handle network online event
   */
  handleNetworkOnline(): void {
    console.log('[BridgeManager] Network online event');
    if (this.bridge) {
      this.bridge.handleNetworkOnline();
    }
  }

  /**
   * Handle network offline event
   */
  handleNetworkOffline(): void {
    console.log('[BridgeManager] Network offline event');
    if (this.bridge) {
      this.bridge.handleNetworkOffline();
    }
  }

  /**
   * Dispose (cleanup on shutdown)
   */
  dispose(): void {
    this.stop();
    console.log('[BridgeManager] Disposed');
  }
}

// Export singleton instance
export const bridgeManager = new BridgeManager();

// Export utility functions
export { generateAPIKey, parseAPIKey };

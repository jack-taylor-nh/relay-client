import { useState, useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Lock, Mail, FileText, ChevronLeft, Send, Link as LinkIcon, Copy, MoreVertical, Smile, Reply, X, SmilePlus } from 'lucide-react';
import { selectedConversationId, currentIdentity, showToast, sendMessage, conversations, tempConversations } from '../state';
import type { ConversationType } from '../../types';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SecurityBadge } from '@/components/relay/SecurityBadge';
import { ViaBadge } from '@/components/relay/ViaBadge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AIChatView } from './AIChatView';
import { EmojiPicker } from '../components/EmojiPicker';
import { ReactionPicker } from '../components/ReactionPicker';
import { FileUploadButton } from '@/components/relay/FileUploadButton';
import { FileMessage } from '@/components/relay/FileMessage';
import {
  encryptFile,
  decryptFile,
  uploadFile,
  downloadFile,
  createFileMessage,
  parseFileMessage,
  isFileMessage,
  serializeRatchetState,
  deserializeRatchetState,
} from '@relay/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================
// Types
// ============================================

interface ReplyContext {
  messageId: string;
  content: string;
  isMine: boolean;
}

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean; // Did the current user react with this emoji?
}

interface Message {
  id: string;
  senderFingerprint: string;
  content: string; // Decrypted content
  createdAt: string;
  isMine: boolean;
  reactions?: Reaction[];
}

interface ConversationDetails {
  id: string;
  type: ConversationType;
  counterpartyName: string;
  counterpartyFingerprint?: string;
}

// ============================================
// State
// ============================================

const messages = signal<Message[]>([]);
const conversationDetails = signal<ConversationDetails | null>(null);
const isLoadingMessages = signal(false);
const replyContext = signal<ReplyContext | null>(null);

// ============================================
// Load Messages from API
// ============================================

async function loadMessages(conversationId: string, isPolling = false) {
  // Only show loading indicator on initial load, not polling
  if (!isPolling) {
    isLoadingMessages.value = true;
  }
  
  try {
    // Find conversation details from state
    const conv = conversations.value.find(c => c.id === conversationId);
    if (conv) {
      conversationDetails.value = {
        id: conv.id,
        type: conv.type,
        counterpartyName: conv.counterpartyName || 'Unknown Contact',
        counterpartyFingerprint: conv.participants[0] !== 'unknown' ? conv.participants[0] : undefined,
      };
    }
    
    // Skip loading messages for temp conversations (not yet created on server)
    if (conversationId.startsWith('temp-')) {
      if (!isPolling) {
        console.log('Skipping message load for temp conversation:', conversationId);
      }
      messages.value = [];
      isLoadingMessages.value = false;
      return;
    }
    
    // Load AI conversations from local storage instead of server
    if (conv?.type === 'local-llm') {
      if (!isPolling) {
        console.log('Loading AI conversation from local storage:', conversationId);
      }
      
      // Dynamic import to avoid circular dependency
      const { loadConversation } = await import('./AIChatView');
      const aiMessages = await loadConversation(conversationId);
      
      // Convert AI message format to regular message format
      messages.value = aiMessages.map(msg => ({
        id: msg.id,
        senderFingerprint: msg.role === 'user' ? (currentIdentity.value?.id || 'user') : 'assistant',
        content: msg.content,
        createdAt: msg.timestamp.toISOString(),
        isMine: msg.role === 'user',
      }));
      
      isLoadingMessages.value = false;
      return;
    }
    
    if (!isPolling) {
      console.log('Loading messages for conversation:', conversationId);
    }
    
    // Fetch messages from background worker
    const result = await sendMessage<{
      success: boolean;
      securityLevel?: string;
      messages?: Array<{
        id: string;
        senderIdentityId?: string;
        senderExternalId?: string;
        content: string;
        createdAt: string;
        isMine: boolean;
      }>;
      error?: string;
    }>({ type: 'GET_MESSAGES', payload: { conversationId } });
    
    if (result.success && result.messages) {
      const newMessages: Message[] = result.messages.map(msg => ({
        id: msg.id,
        senderFingerprint: msg.senderIdentityId || msg.senderExternalId || 'unknown',
        content: msg.content,
        createdAt: msg.createdAt,
        isMine: msg.isMine,
      })).reverse(); // Reverse so oldest is first
      
      // Merge messages incrementally to avoid UI flash
      const existingIds = new Set(messages.value.map(m => m.id));
      const messagesToAdd = newMessages.filter(m => !existingIds.has(m.id));
      
      if (messagesToAdd.length > 0 || messages.value.length === 0) {
        // If we have new messages or this is initial load
        let combinedMessages: Message[];
        
        if (messages.value.length === 0) {
          // Initial load - set all messages
          combinedMessages = newMessages;
          console.log('Initial load:', newMessages.length, 'messages');
        } else {
          // Incremental update - only add new messages
          combinedMessages = [...messages.value, ...messagesToAdd];
          console.log('Added', messagesToAdd.length, 'new messages');
        }
        
        // Aggregate reactions across all messages
        messages.value = aggregateReactions(combinedMessages);
      }
    } else {
      if (!isPolling) {
        console.log('No messages or error:', result);
        if (result.error) {
          showToast(`Error loading messages: ${result.error}`);
        }
        messages.value = [];
      }
    }
  } catch (error) {
    console.error('Load messages error:', error);
    if (!isPolling) {
      showToast('Failed to load messages');
      messages.value = [];
    }
  } finally {
    if (!isPolling) {
      isLoadingMessages.value = false;
    }
  }
}

// ============================================
// Reaction Aggregation
// ============================================

/**
 * Parse reaction message format: [REACT:messageId:emoji:add|remove]
 */
function parseReactionMessage(content: string): { isReaction: boolean; messageId?: string; emoji?: string; action?: 'add' | 'remove' } {
  const match = content.match(/^\[REACT:([^:]+):([^:]+):(add|remove)\]$/);
  if (match) {
    return {
      isReaction: true,
      messageId: match[1],
      emoji: match[2],
      action: match[3] as 'add' | 'remove',
    };
  }
  return { isReaction: false };
}

/**
 * Aggregate reactions across all messages
 */
function aggregateReactions(allMessages: Message[]): Message[] {
  const myFingerprint = currentIdentity.value?.id || '';
  
  // Separate regular messages from reaction messages
  const regularMessages: Message[] = [];
  const reactionData: Map<string, Map<string, { count: number; userReacted: boolean }>> = new Map();
  
  for (const msg of allMessages) {
    const parsed = parseReactionMessage(msg.content);
    
    if (parsed.isReaction && parsed.messageId && parsed.emoji) {
      // This is a reaction message
      if (!reactionData.has(parsed.messageId)) {
        reactionData.set(parsed.messageId, new Map());
      }
      const messageReactions = reactionData.get(parsed.messageId)!;
      
      if (!messageReactions.has(parsed.emoji)) {
        messageReactions.set(parsed.emoji, { count: 0, userReacted: false });
      }
      
      const reactionInfo = messageReactions.get(parsed.emoji)!;
      
      if (parsed.action === 'add') {
        reactionInfo.count++;
        if (msg.isMine) {
          reactionInfo.userReacted = true;
        }
      } else if (parsed.action === 'remove') {
        reactionInfo.count = Math.max(0, reactionInfo.count - 1);
        if (msg.isMine) {
          reactionInfo.userReacted = false;
        }
      }
    } else {
      // This is a regular message
      regularMessages.push(msg);
    }
  }
  
  // Attach aggregated reactions to messages
  return regularMessages.map(msg => {
    const msgReactions = reactionData.get(msg.id);
    if (msgReactions && msgReactions.size > 0) {
      const reactions: Reaction[] = Array.from(msgReactions.entries())
        .filter(([emoji, info]) => info.count > 0)
        .map(([emoji, info]) => ({
          emoji,
          count: info.count,
          userReacted: info.userReacted,
        }));
      
      return { ...msg, reactions };
    }
    return msg;
  });
}

// ============================================
// Components
// ============================================

/**
 * Try to parse webhook payload JSON from message content
 */
function tryParseWebhookPayload(content: string): {
  isWebhook: boolean;
  sender?: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
  raw?: any;
  detectedService?: string;
} {
  try {
    const parsed = JSON.parse(content);
    // Check if it looks like a webhook payload
    // Either has our structured format (sender, title, body)
    // Or has raw field (flexible format from external services)
    if (parsed && typeof parsed === 'object' && 
        (parsed.sender || parsed.title || parsed.body || parsed.raw)) {
      return {
        isWebhook: true,
        sender: parsed.sender,
        title: parsed.title,
        body: parsed.body,
        data: parsed.data,
        raw: parsed.raw,
        detectedService: parsed.detectedService,
      };
    }
  } catch {
    // Not JSON, that's fine
  }
  return { isWebhook: false };
}

/**
 * Simple markdown renderer for webhook messages
 * Supports: **bold**, *italic*, `code`, [links](url), ```code blocks```
 */
function renderMarkdown(text: string): preact.JSX.Element {
  if (!text) return <></>;
  
  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts: Array<{ type: 'text' | 'codeblock'; content: string; language?: string }> = [];
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'codeblock', content: match[2], language: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'codeblock') {
          return (
            <pre key={i} class="markdown-codeblock">
              <code>{part.content}</code>
            </pre>
          );
        }
        
        // Process inline markdown
        return <span key={i}>{renderInlineMarkdown(part.content)}</span>;
      })}
    </>
  );
}

/**
 * Render inline markdown (bold, italic, code, links)
 */
function renderInlineMarkdown(text: string): preact.JSX.Element {
  // Process line by line to handle bullet points
  const lines = text.split('\n');
  
  return (
    <>
      {lines.map((line, lineIndex) => {
        const elements: preact.JSX.Element[] = [];
        
        // Check for bullet points
        const bulletMatch = line.match(/^(\s*)[•\-\*]\s+(.*)$/);
        if (bulletMatch) {
          const indent = bulletMatch[1].length;
          elements.push(
            <div key={lineIndex} class="markdown-bullet" style={{ paddingLeft: `${indent * 8 + 12}px` }}>
              <span class="bullet-dot">•</span>
              {processInlineFormatting(bulletMatch[2])}
            </div>
          );
        } else {
          elements.push(
            <span key={lineIndex}>
              {processInlineFormatting(line)}
              {lineIndex < lines.length - 1 && <br />}
            </span>
          );
        }
        
        return elements;
      })}
    </>
  );
}

/**
 * Process inline formatting (bold, italic, code, links)
 */
function processInlineFormatting(text: string): preact.JSX.Element {
  // Regex patterns for inline formatting
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, render: (m: string) => <strong>{m}</strong> },
    { regex: /\*(.+?)\*/g, render: (m: string) => <em>{m}</em> },
    { regex: /`([^`]+)`/g, render: (m: string) => <code class="markdown-inline-code">{m}</code> },
    { regex: /\[([^\]]+)\]\(([^)]+)\)/g, render: (m: string, url: string) => (
      <a href={url} target="_blank" rel="noopener noreferrer" class="markdown-link">{m}</a>
    )},
  ];
  
  // Simple approach: process text and replace patterns
  // This is a simplified version - a full parser would handle nesting better
  const elements: (string | preact.JSX.Element)[] = [];
  let remaining = text;
  let key = 0;
  
  // Process bold
  remaining = remaining.replace(/\*\*(.+?)\*\*/g, (_, content) => `\x00B${content}\x00`);
  // Process italic (but not ** which we already processed)
  remaining = remaining.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, content) => `\x00I${content}\x00`);
  // Process inline code
  remaining = remaining.replace(/`([^`]+)`/g, (_, content) => `\x00C${content}\x00`);
  // Process links
  remaining = remaining.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `\x00L${text}\x01${url}\x00`);
  
  // Split using capture group so format tokens retain their \x00 prefix —
  // plain text segments can never be mistaken for format tokens.
  const tokens = remaining.split(/(\x00[BICL][^\x00]*\x00)/);
  
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith('\x00B')) {
          return <strong key={i}>{token.slice(2, -1)}</strong>;
        } else if (token.startsWith('\x00I')) {
          return <em key={i}>{token.slice(2, -1)}</em>;
        } else if (token.startsWith('\x00C')) {
          return <code key={i} class="markdown-inline-code">{token.slice(2, -1)}</code>;
        } else if (token.startsWith('\x00L')) {
          const [linkText, url] = token.slice(2, -1).split('\x01');
          return <a key={i} href={url} target="_blank" rel="noopener noreferrer" class="markdown-link">{linkText}</a>;
        }
        return <span key={i}>{token}</span>;
      })}
    </>
  );
}

/**
 * Try to parse a string as JSON and return formatted version
 */
function tryParseAndFormatJSON(value: string): { isJSON: boolean; formatted?: string; parsed?: any } {
  try {
    const parsed = JSON.parse(value);
    const formatted = JSON.stringify(parsed, null, 2);
    return { isJSON: true, formatted, parsed };
  } catch {
    return { isJSON: false };
  }
}

/**
 * Individual webhook data item with smart JSON rendering
 */
function WebhookDataItem({ dataKey, value }: { dataKey: string; value: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Format the value
  let displayValue = formatDataValue(value);
  let isJSON = false;
  let jsonFormatted = '';
  
  // Check if value is a stringified JSON object
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
    const result = tryParseAndFormatJSON(value);
    if (result.isJSON) {
      isJSON = true;
      jsonFormatted = result.formatted!;
      displayValue = value.substring(0, 50) + (value.length > 50 ? '...' : '');
    }
  } else if (typeof value === 'object' && value !== null) {
    // Value is already an object
    isJSON = true;
    jsonFormatted = JSON.stringify(value, null, 2);
    displayValue = JSON.stringify(value).substring(0, 50) + '...';
  }
  
  return (
    <div class="webhook-data-item-container">
      <div class="webhook-data-item">
        <span class="webhook-data-key">{formatDataKey(dataKey)}</span>
        {isJSON ? (
          <button 
            class="webhook-data-json-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse JSON' : 'Expand JSON'}
          >
            {isExpanded ? '▼ JSON' : '▶ JSON'}
          </button>
        ) : (
          <span class="webhook-data-value">{displayValue}</span>
        )}
      </div>
      {isJSON && isExpanded && (
        <div class="webhook-data-json-expanded">
          <CodeBlock code={jsonFormatted} language="json" maxHeight="300px" />
        </div>
      )}
    </div>
  );
}

/**
 * Render webhook data object in a readable format with collapsible sections
 */
function WebhookDataDisplay({ data, isRaw = false }: { data: Record<string, any>; isRaw?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  
  // Filter out internal fields for raw display
  const displayEntries = isRaw 
    ? entries.filter(([key]) => !['sender', 'title', 'body', 'data', 'raw', 'detectedService', 'timestamp'].includes(key))
    : entries;
  
  if (displayEntries.length === 0) return null;
  
  // Show first 3 entries as preview when collapsed
  const previewCount = 3;
  const entriesToShow = isExpanded ? displayEntries : displayEntries.slice(0, previewCount);
  const hasMore = displayEntries.length > previewCount;
  
  return (
    <div class="webhook-data">
      <div class="webhook-data-header">
        {isRaw ? 'Payload Data' : 'Additional Data'}
        {hasMore && (
          <button 
            class="webhook-data-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Show less' : 'Show all'}
          >
            {isExpanded ? '▼ Show less' : `▶ Show ${displayEntries.length - previewCount} more`}
          </button>
        )}
      </div>
      <div class="webhook-data-list">
        {entriesToShow.map(([key, value]) => (
          <WebhookDataItem key={key} dataKey={key} value={value} />
        ))}
      </div>
    </div>
  );
}

/**
 * Format a data key for display (e.g., "source" -> "Source", "user_id" -> "User ID")
 */
function formatDataKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format a data value for display
 */
function formatDataValue(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    // For nested objects/arrays, show compact JSON
    return JSON.stringify(value);
  }
  // For timestamps, try to format them nicely
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
  return String(value);
}

function MessageBubble({ message, onSend }: { message: Message; onSend: (content: string) => void }) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  
  const time = new Date(message.createdAt).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const webhookPayload = tryParseWebhookPayload(message.content);
  
  // Parse reply metadata from message content
  function parseReplyMetadata(content: string): { replyToId: string | null; actualContent: string } {
    const replyMatch = content.match(/^\[REPLY:([^\]]+)\]/);
    if (replyMatch) {
      return {
        replyToId: replyMatch[1],
        actualContent: content.substring(replyMatch[0].length),
      };
    }
    return { replyToId: null, actualContent: content };
  }
  
  const { replyToId, actualContent } = parseReplyMetadata(message.content);
  const replyToMessage = replyToId ? messages.value.find(m => m.id === replyToId) : null;
  
  // Copy message text to clipboard
  async function handleCopyMessage() {
    try {
      await navigator.clipboard.writeText(actualContent);
      showToast('Message copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      showToast('Failed to copy message');
    }
    setContextMenuOpen(false);
  }
  
  // Reply to this message
  function handleReplyToMessage() {
    replyContext.value = {
      messageId: message.id,
      content: actualContent,
      isMine: message.isMine,
    };
    setContextMenuOpen(false);
  }
  
  // React to this message
  function handleReactToMessage(emoji: string) {
    // Check if user already reacted with this emoji
    const existingReaction = message.reactions?.find(r => r.emoji === emoji);
    const action = existingReaction?.userReacted ? 'remove' : 'add';
    
    // Send reaction message with format: [REACT:messageId:emoji:add|remove]
    const reactionContent = `[REACT:${message.id}:${emoji}:${action}]`;
    onSend(reactionContent);
    
    setShowReactionPicker(false);
  }
  
  // Handle right-click to open context menu
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  }
  
  // Liquid glass effect styles for message bubbles
  // Inspired by liquid-glass-react but kept subtle and lowkey
  const glassStyles = {
    // Sent message: accent with liquid glass effect
    sent: [
      // Base gradient with slight transparency for glass depth
      "bg-gradient-to-br from-[hsl(var(--accent))] via-[hsl(var(--accent)/0.92)] to-[hsl(var(--accent)/0.85)]",
      "text-white",
      // Multi-layer shadow: inner highlight (top), inner shadow (bottom), outer glow
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),inset_0_-1px_2px_0_rgba(0,0,0,0.15),0_4px_12px_-4px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,255,255,0.1)]",
      // Blur and saturation for true glass feel
      "backdrop-blur-md backdrop-saturate-150",
      // Subtle border for edge definition
      "border border-white/10",
    ].join(" "),
    // Received message: frosted glass effect
    received: [
      // Subtle gradient with transparency
      "bg-gradient-to-br from-[hsl(var(--muted)/0.9)] via-[hsl(var(--muted)/0.85)] to-[hsl(var(--muted)/0.8)]",
      "text-[hsl(var(--foreground))]",
      // Inner highlight and subtle depth shadow
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_2px_0_rgba(0,0,0,0.05),0_4px_12px_-4px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(255,255,255,0.15)]",
      // Glass blur effect
      "backdrop-blur-md backdrop-saturate-125",
      // Defined edge
      "border border-[hsl(var(--border)/0.3)]",
    ].join(" "),
  };
  
  // Render webhook message with structured layout
  if (webhookPayload.isWebhook) {
    // Determine what data to show
    const hasStructuredData = webhookPayload.data && Object.keys(webhookPayload.data).length > 0;
    const hasRawData = webhookPayload.raw && Object.keys(webhookPayload.raw).length > 0;
    
    return (
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <DropdownMenuTrigger asChild>
          <div 
            className={cn(
              "message-bubble webhook-message max-w-[85%] p-0 overflow-hidden rounded-2xl cursor-context-menu",
              message.isMine 
                ? cn("self-end rounded-br-md ml-[20%]", glassStyles.sent)
                : cn("self-start rounded-bl-md mr-[20%]", glassStyles.received)
            )}
            onContextMenu={handleContextMenu}
          >
            {webhookPayload.sender && (
              <div className={cn(
                "px-3.5 pt-2.5 pb-1.5 text-xs font-semibold uppercase tracking-wide",
                message.isMine ? "text-white/70" : "text-[hsl(var(--muted-foreground))]"
              )}>
                {webhookPayload.detectedService && (
                  <Badge variant="accent" className="text-[10px] mr-2">
                    {webhookPayload.detectedService}
                  </Badge>
                )}
                {webhookPayload.sender}
              </div>
            )}
            {webhookPayload.title && (
              <div className={cn(
                "px-3.5 pb-2 text-[15px] font-semibold leading-tight",
                message.isMine ? "text-white" : "text-[hsl(var(--foreground))]"
              )}>{renderMarkdown(webhookPayload.title)}</div>
            )}
            {webhookPayload.body && (
              <div className={cn(
                "px-3.5 pb-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                message.isMine ? "text-white/95" : "text-[hsl(var(--foreground))]"
              )}>{renderMarkdown(webhookPayload.body)}</div>
            )}
            {hasStructuredData && !webhookPayload.raw && (
              <WebhookDataDisplay data={webhookPayload.data!} />
            )}
            {hasRawData && (
              <WebhookDataDisplay data={webhookPayload.raw!} isRaw={true} />
            )}
            <div className={cn(
              "px-3.5 py-1.5 text-[11px] text-right border-t",
              message.isMine 
                ? "text-white/60 border-white/10 bg-black/10" 
                : "text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
            )}>{time}</div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleReplyToMessage}>
            <Reply className="h-4 w-4 mr-2" />
            Reply
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyMessage}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Message
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  
  // Regular message with glass effect
  const isLocalLLM = conversationDetails.value?.type === 'local-llm';
  const shouldRenderMarkdown = isLocalLLM && !message.isMine; // Only LLM responses get markdown
  
  // Helper to format reply preview (first 50 characters)
  function getReplyPreview(content: string): string {
    if (content.length <= 50) return content;
    return content.substring(0, 50) + '...';
  }
  
  return (
    <div className={cn(
      "relative max-w-[75%] group",
      message.isMine ? "self-end ml-[20%]" : "self-start mr-[20%]"
    )}>
      {/* Add Reaction Button - Top Left Edge, Hover Only */}
      <button
        onClick={() => setShowReactionPicker(true)}
        className={cn(
          "absolute -top-2 -left-2 z-10 flex items-center justify-center w-7 h-7 rounded-full text-xs transition-all opacity-0 group-hover:opacity-100 shadow-lg",
          message.isMine
            ? "bg-[hsl(var(--accent))] border border-white/20 text-white hover:bg-[hsl(var(--accent)/0.9)]"
            : "bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        )}
        title="Add reaction"
      >
        <SmilePlus className="h-4 w-4" />
      </button>
      
      {/* Reaction Picker */}
      {showReactionPicker && (
        <div className={cn(
          "absolute -top-2 z-20",
          message.isMine ? "-right-2" : "-left-2"
        )}>
          <ReactionPicker
            onReactionSelect={handleReactToMessage}
            onClose={() => setShowReactionPicker(false)}
            alignRight={message.isMine}
          />
        </div>
      )}
      
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <DropdownMenuTrigger asChild>
          <div 
            className={cn(
              "px-4 py-3 rounded-2xl cursor-context-menu",
              message.isMine 
                ? cn("rounded-br-md", glassStyles.sent)
                : cn("rounded-bl-md", glassStyles.received)
            )}
            onContextMenu={handleContextMenu}
          >
          {/* Reply Quote */}
          {replyToMessage && (
            <div className={cn(
              "mb-2 px-2 py-1.5 rounded-lg border-l-2 text-xs",
              message.isMine
                ? "bg-white/10 border-white/30 text-white/80"
                : "bg-[hsl(var(--muted))] border-[hsl(var(--primary))] text-[hsl(var(--muted-foreground))]"
            )}>
              <div className="font-medium mb-0.5">
                {replyToMessage.isMine ? 'You' : 'Them'}
              </div>
              <div className="opacity-90 truncate">
                {getReplyPreview(replyToMessage.content)}
              </div>
            </div>
          )}
          
          {/* Message Content */}
          <div className="text-[15px] leading-snug whitespace-pre-wrap break-words">
            {isFileMessage(actualContent) ? (
              (() => {
                const fileData = parseFileMessage(actualContent);
                if (!fileData) return actualContent;
                
                return (
                  <FileMessage
                    fileId={fileData.fileId}
                    mimeType={fileData.mimeType}
                    originalFilename={fileData.originalFilename}
                    onDownload={async (fileId) => {
                      // Access the parent component's handleFileDownload via a ref or context
                      // For now, we'll implement it inline
                      const authResult = await sendMessage<{
                        token?: string;
                        apiUrl?: string;
                      }>({ type: 'GET_AUTH_TOKEN' });
                      
                      if (!authResult.token || !authResult.apiUrl) {
                        throw new Error('Authentication failed');
                      }
                      
                      const encryptedData = await downloadFile(
                        fileId,
                        authResult.apiUrl,
                        authResult.token
                      );
                      
                      const conversationId = selectedConversationId.value;
                      if (!conversationId) throw new Error('No conversation selected');
                      
                      // Get ratchet state from storage
                      const ratchetKey = `ratchet:${conversationId}`;
                      const storedState = await chrome.storage.local.get([ratchetKey]);
                      
                      if (!storedState[ratchetKey]) {
                        throw new Error('Decryption keys not found');
                      }
                      
                      const ratchetState = deserializeRatchetState(storedState[ratchetKey]);
                      
                      const decryptResult = decryptFile(
                        {
                          ciphertext: encryptedData,
                          nonce: fileData.nonce,
                          encryptedKey: fileData.encryptedKey,
                          mimeType: fileData.mimeType,
                          encryptedFilename: fileData.encryptedFilename,
                        },
                        ratchetState
                      );
                      
                      if (!decryptResult) {
                        throw new Error('Failed to decrypt file');
                      }
                      
                      // Save updated ratchet state
                      await chrome.storage.local.set({ 
                        [ratchetKey]: serializeRatchetState(decryptResult.newState) 
                      });
                      
                      return {
                        data: decryptResult.fileData,
                        filename: decryptResult.filename || fileData.originalFilename || null,
                      };
                    }}
                    className={message.isMine ? "text-white" : ""}
                  />
                );
              })()
            ) : shouldRenderMarkdown ? (
              renderMarkdown(actualContent)
            ) : (
              actualContent
            )}
          </div>
          
          {/* Reactions Display */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {message.reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => handleReactToMessage(reaction.emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all",
                    reaction.userReacted
                      ? message.isMine
                        ? "bg-white/25 border border-white/40 text-white shadow-sm"
                        : "bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.4)] text-[hsl(var(--primary))] shadow-sm"
                      : message.isMine
                        ? "bg-white/10 border border-white/20 text-white/80 hover:bg-white/15"
                        : "bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.8)]"
                  )}
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              ))}
            </div>
          )}
          
          <div className={cn(
            "text-[11px] mt-1 text-right font-medium",
            message.isMine ? "text-white/60" : "text-[hsl(var(--muted-foreground))]"
          )}>{time}</div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={handleReplyToMessage}>
          <Reply className="h-4 w-4 mr-2" />
          Reply
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyMessage}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}

function MessageInput({ onSend, conversationId, onFileUpload }: { onSend: (content: string) => void; conversationId: string; onFileUpload: (file: File) => void }) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentReply = replyContext.value;
  
  // Load draft when conversation changes
  useEffect(() => {
    if (!conversationId) return;
    
    const draftKey = `draft:${conversationId}`;
    chrome.storage.local.get([draftKey]).then((result) => {
      if (result[draftKey]) {
        setText(result[draftKey]);
      } else {
        setText('');
      }
    });
  }, [conversationId]);
  
  // Save draft when text changes (debounced)
  useEffect(() => {
    if (!conversationId) return;
    
    const draftKey = `draft:${conversationId}`;
    const timeoutId = setTimeout(() => {
      if (text.trim()) {
        chrome.storage.local.set({ [draftKey]: text });
      } else {
        chrome.storage.local.remove([draftKey]);
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [text, conversationId]);
  
  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    // If replying, include reply metadata in the message
    let messageContent = trimmed;
    if (currentReply) {
      const replyPrefix = `[REPLY:${currentReply.messageId}]`;
      messageContent = replyPrefix + trimmed;
    }
    
    onSend(messageContent);
    setText('');
    replyContext.value = null; // Clear reply context
    
    // Clear draft from storage
    if (conversationId) {
      chrome.storage.local.remove([`draft:${conversationId}`]);
    }
    
    inputRef.current?.focus();
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Cancel reply on Escape
    if (e.key === 'Escape' && currentReply) {
      e.preventDefault();
      replyContext.value = null;
    }
  }
  
  function handleEmojiSelect(emoji: string) {
    // Insert emoji at cursor position
    const textarea = inputRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = text.substring(0, start) + emoji + text.substring(end);
      setText(newText);
      
      // Set cursor position after emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText(text + emoji);
    }
  }
  
  // Format reply preview (first 50 characters)
  function getReplyPreview(content: string): string {
    if (content.length <= 50) return content;
    return content.substring(0, 50) + '...';
  }
  
  return (
    <div className="relative flex flex-col bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
      {/* Reply Preview */}
      {currentReply && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
          <Reply className="h-4 w-4 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Replying to {currentReply.isMine ? 'yourself' : 'them'}
            </div>
            <div className="text-sm text-[hsl(var(--foreground))] truncate">
              {getReplyPreview(currentReply.content)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => replyContext.value = null}
            className="flex-shrink-0 h-6 w-6"
            aria-label="Cancel reply"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {/* Input Area */}
      <div className="flex items-center gap-3 p-4">
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        
        {/* File Upload Button */}
        <FileUploadButton
          onFileSelect={onFileUpload}
          accept="image/*,application/pdf,.doc,.docx,.txt"
          maxSize={50 * 1024 * 1024}
        />
        
        {/* Emoji Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="flex-shrink-0"
          aria-label="Insert emoji"
        >
          <Smile className="h-4 w-4" />
        </Button>
        
        {/* Text Input */}
        <textarea
          ref={inputRef}
          className="flex-1 px-3 py-2 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md resize-none max-h-32 min-h-10 leading-normal text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] transition-colors"
          placeholder={currentReply ? "Type your reply..." : "Type a message..."}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        
        {/* Send Button */}
        <Button
          variant="accent"
          size="icon"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="flex-shrink-0"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Main View
// ============================================

// Polling interval for new messages (5 seconds)
const MESSAGE_POLL_INTERVAL = 5000;
const MESSAGE_POLL_INTERVAL_STREAMING = 1500; // Faster polling for streaming LLM responses

export function ConversationDetailView() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationId = selectedConversationId.value;
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Load messages initially and set up polling
  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId, false);
      
      // Mark conversation as seen (for notification badge)
      sendMessage({ type: 'MARK_CONVERSATION_SEEN', payload: { conversationId } })
        .then(() => {
          // Update local state immediately so UI reflects read status
          conversations.value = conversations.value.map(c =>
            c.id === conversationId ? { ...c, isUnread: false, unreadCount: 0 } : c
          );
        })
        .catch(() => {}); // Ignore errors
      
      // 🚀 REAL-TIME: Listen for streaming chunk updates from background
      const chunkListener = (message: any) => {
        if (message.type === 'STREAMING_CHUNK_UPDATE' && message.payload.conversationId === conversationId) {
          console.log('[ConversationDetailView] Real-time chunk update:', {
            messageId: message.payload.messageId,
            contentLength: message.payload.content.length,
            isComplete: message.payload.isComplete,
            chunkSeq: message.payload.chunkSeq,
          });
          
          // Update the message content in real-time
          messages.value = messages.value.map(msg => 
            msg.id === message.payload.messageId 
              ? { ...msg, content: message.payload.content }
              : msg
          );
          
          // If this is a new message not yet in state, fetch it
          if (!messages.value.some(m => m.id === message.payload.messageId)) {
            console.log('[ConversationDetailView] New streaming message, fetching...');
            loadMessages(conversationId, true);
          }
        }
      };
      
      chrome.runtime.onMessage.addListener(chunkListener);
      
      // Use slower polling now that we have real-time updates (fallback only)
      const pollInterval = 10000; // 10 seconds (was 1.5s for streaming)
      
      console.log(`[ConversationDetailView] Starting fallback polling at ${pollInterval}ms with real-time push enabled`);
      
      // Set up polling for new messages (fallback if push fails)
      pollIntervalRef.current = setInterval(() => {
        loadMessages(conversationId, true);
      }, pollInterval);
    }
    
    return () => {
      // Clean up polling on unmount or conversation change
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      messages.value = [];
      conversationDetails.value = null;
    };
  }, [conversationId]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.value.length]);
  
  function handleBack() {
    selectedConversationId.value = null;
  }
  
  async function handleSendMessage(content: string) {
    console.log('[ConversationDetailView] handleSendMessage called with content:', content.substring(0, 50));
    console.log('[ConversationDetailView] conversationId:', conversationId);
    console.log('[ConversationDetailView] conversations.value.length:', conversations.value.length);
    console.log('[ConversationDetailView] conversations IDs:', conversations.value.map(c => c.id));
    
    if (!conversationId) {
      console.error('[ConversationDetailView] No conversationId!');
      return;
    }
    
    const conv = conversations.value.find(c => c.id === conversationId);
    if (!conv) {
      console.error('[ConversationDetailView] Conversation not found in list! conversationId:', conversationId);
      return;
    }
    
    console.log('[ConversationDetailView] handleSendMessage - conversation:', {
      id: conv.id,
      type: conv.type,
      securityLevel: conv.securityLevel,
      myEdgeId: conv.myEdgeId,
      counterpartyEdgeId: conv.counterpartyEdgeId,
      hasX25519Key: !!conv.counterpartyX25519PublicKey,
      x25519KeyPreview: conv.counterpartyX25519PublicKey?.substring(0, 20),
    });
    
    // Check if this is a reaction message
    const isReactionMessage = /^\[REACT:[^:]+:[^:]+:(add|remove)\]$/.test(content);
    
    // Add optimistic message (skip for reactions as they don't display as regular messages)
    let optimisticMessageId: string | null = null;
    if (!isReactionMessage) {
      optimisticMessageId = `msg_${Date.now()}`;
      const newMessage: Message = {
        id: optimisticMessageId,
        senderFingerprint: currentIdentity.value?.id || '',
        content,
        createdAt: new Date().toISOString(),
        isMine: true,
      };
      
      messages.value = [...messages.value, newMessage];
    }
    
    try {
      // Phase 4: Use unified SEND_TO_EDGE if we have edge info
      if (conv.myEdgeId && conv.counterpartyEdgeId && conv.counterpartyX25519PublicKey) {
        console.log('[ConversationDetailView] Using unified SEND_TO_EDGE:', {
          myEdgeId: conv.myEdgeId,
          counterpartyEdgeId: conv.counterpartyEdgeId,
          hasX25519Key: !!conv.counterpartyX25519PublicKey,
        });
        
        const result = await sendMessage<{
          success: boolean;
          conversationId?: string;
          messageId?: string;
          error?: string;
        }>({ 
          type: 'SEND_TO_EDGE', 
          payload: { 
            myEdgeId: conv.myEdgeId,
            recipientEdgeId: conv.counterpartyEdgeId,
            recipientX25519PublicKey: conv.counterpartyX25519PublicKey,
            content,
            // For temp conversations, don't pass the ID - let it be treated as new
            conversationId: conversationId.startsWith('temp-') ? undefined : conversationId,
            origin: conv.type === 'native' ? 'native' : conv.type === 'email' ? 'email' : conv.type === 'local-llm' ? 'local-llm' : conv.type === 'webhook' ? 'other' : 'contact_link',
          }
        });
        
        if (!result.success) {
          showToast(`Failed to send: ${result.error}`);
          // Only filter out optimistic message if it was added (not for reactions)
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
        } else {
          // For reaction messages, reload to see the aggregated reaction immediately
          if (isReactionMessage) {
            loadMessages(conversationId, true);
          } else if (optimisticMessageId) {
            // Update optimistic message with real ID from server
            if (result.messageId) {
              messages.value = messages.value.map(m => 
                m.id === optimisticMessageId ? { ...m, id: result.messageId! } : m
              );
            }
          }
          
          // If this was a temp conversation, replace it with the real one
          if (result.conversationId && conversationId.startsWith('temp-')) {
            console.log('[ConversationDetailView] Replacing temp conversation ID:', {
              tempId: conversationId,
              realId: result.conversationId,
            });
            
            // Update selectedConversationId to the real ID
            selectedConversationId.value = result.conversationId;
            
            // Remove temp conversation from tempConversations
            tempConversations.value = tempConversations.value.filter(c => c.id !== conversationId);
            
            // Trigger a poll to fetch the full conversation from the server
            chrome.runtime.sendMessage({ type: 'POLL_CONVERSATIONS' });
          }
          
          // Don't reload - the optimistic message is already correct
          // Polling will pick up any new messages from the counterparty
        }
      } else if (conv.securityLevel === 'e2ee' && conv.type === 'native') {
        // Fallback: Legacy native E2EE - need sender and recipient handles
        console.log('[ConversationDetailView] Falling back to legacy SEND_NATIVE_MESSAGE');
        
        // Get user's handles
        const handlesResult = await sendMessage<{
          success: boolean;
          handles?: Array<{ id: string; handle: string; displayName: string | null; nativeEdgeId: string }>;
        }>({ type: 'GET_HANDLES' });
        
        if (!handlesResult.success || !handlesResult.handles || handlesResult.handles.length === 0) {
          showToast('No handle found to send from');
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
          return;
        }
        
        const senderHandle = handlesResult.handles[0].handle;
        
        // Get recipient handle from conversation counterparty
        if (!conv.counterpartyName) {
          showToast('Cannot send: recipient unknown');
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
          return;
        }
        const recipientHandle = conv.counterpartyName.replace(/^&/, ''); // Remove & prefix
        
        const result = await sendMessage<{
          success: boolean;
          conversationId?: string;
          messageId?: string;
          error?: string;
        }>({ 
          type: 'SEND_NATIVE_MESSAGE', 
          payload: { 
            recipientHandle,
            senderHandle,
            content 
          }
        });
        
        if (!result.success) {
          showToast(`Failed to send: ${result.error}`);
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
        } else {
          // Update optimistic message with real ID
          if (result.messageId && optimisticMessageId) {
            messages.value = messages.value.map(m => 
              m.id === optimisticMessageId ? { ...m, id: result.messageId! } : m
            );
          }
          // Don't reload - the optimistic message is already correct
          // Polling will pick up any new messages from the counterparty
        }
      } else if (conv.securityLevel === 'gateway_secured' && conv.type === 'discord') {
        // Discord - use discord send API
        const result = await sendMessage<{
          success?: boolean;
          messageId?: string;
          error?: string;
        }>({ 
          type: 'SEND_DISCORD', 
          payload: { conversationId, content }
        });
        
        if (!result.success) {
          showToast(`Failed to send: ${result.error}`);
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
        } else {
          // Remove optimistic message and reload to get the server message
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
          await loadMessages(conversationId, false);
        }
      } else if (conv.securityLevel === 'gateway_secured') {
        // Email or contact endpoint - use email send API
        const result = await sendMessage<{
          success?: boolean;
          messageId?: string;
          error?: string;
        }>({ 
          type: 'SEND_EMAIL', 
          payload: { conversationId, content }
        });
        
        if (!result.success) {
          showToast(`Failed to send: ${result.error}`);
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
        } else {
          // Remove optimistic message and reload to get the server message
          if (optimisticMessageId) {
            messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
          }
          await loadMessages(conversationId, false);
        }
      } else {
        console.error('[ConversationDetailView] No send path matched:', {
          type: conv.type,
          securityLevel: conv.securityLevel,
          myEdgeId: conv.myEdgeId,
          counterpartyEdgeId: conv.counterpartyEdgeId,
          hasX25519Key: !!conv.counterpartyX25519PublicKey,
        });
        showToast('Unsupported conversation type');
        if (optimisticMessageId) {
          messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
        }
      }
    } catch (error) {
      console.error('Send error:', error);
      showToast('Failed to send message');
      if (optimisticMessageId) {
        messages.value = messages.value.filter(m => m.id !== optimisticMessageId);
      }
    }
  }
  
  async function handleFileUpload(file: File) {
    if (!conversationId) return;
    
    const conv = conversations.value.find(c => c.id === conversationId);
    if (!conv) {
      showToast('Conversation not found');
      return;
    }
    
    showToast('Encrypting and uploading file...');
    
    try {
      // Read file data
      const fileData = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileData);
      
      // Get ratchet state from storage
      const ratchetKey = `ratchet:${conversationId}`;
      const storedState = await chrome.storage.local.get([ratchetKey]);
      
      if (!storedState[ratchetKey]) {
        showToast('Encryption keys not found');
        return;
      }
      
      const ratchetState = deserializeRatchetState(storedState[ratchetKey]);
      
      // Encrypt file
      const { encrypted, newState } = encryptFile(
        fileBytes,
        file.type || 'application/octet-stream',
        file.name,
        ratchetState
      );
      
      // Save updated ratchet state
      await chrome.storage.local.set({ 
        [ratchetKey]: serializeRatchetState(newState) 
      });
      
      // Get auth token and API URL
      const authResult = await sendMessage<{
        token?: string;
        apiUrl?: string;
      }>({ type: 'GET_AUTH_TOKEN' });
      
      if (!authResult.token || !authResult.apiUrl) {
        showToast('Authentication failed');
        return;
      }
      
      // Upload encrypted file
      const metadata = await uploadFile(
        encrypted,
        conversationId,
        undefined, // messageId will be set when we send the message
        authResult.apiUrl,
        authResult.token
      );
      
      // Create file message
      const fileMessageContent = createFileMessage(
        metadata.id,
        encrypted,
        file.name
      );
      
      // Send message with file reference
      await handleSendMessage(fileMessageContent);
      
      showToast('File uploaded successfully');
    } catch (error) {
      console.error('File upload error:', error);
      showToast('Failed to upload file');
    }
  }
  
  
  if (!conversationId) {
    return null;
  }
  
  const details = conversationDetails.value;
  const conv = conversations.value.find(c => c.id === conversationId);
  const isNativeChat = details?.type === 'native';

  // AI conversations get the full AIChatView experience (streaming, model picker, tool calls, etc.)
  if (conv?.type === 'local-llm') {
    return (
      <AIChatView
        onBack={handleBack}
        conversationTitle={conv.counterpartyName ?? 'AI Assistant'}
        initialConversationId={conversationId}
      />
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] min-h-[56px]">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back to inbox">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[hsl(var(--foreground))] truncate">
            {details?.counterpartyName}
          </div>
          {details?.counterpartyFingerprint && (
            <div className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
              {details.counterpartyFingerprint.slice(0, 12)}...
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Edge badge - show which edge received this conversation */}
          {conv?.edgeAddress && (
            <ViaBadge 
              address={conv.edgeAddress}
              type={conv.type}
              maxLength={12}
            />
          )}
          
          {/* Security level badge */}
          {conv?.securityLevel && (
            <SecurityBadge level={conv.securityLevel} size="sm" />
          )}
        </div>
      </div>
      
      {/* Messages - subtle gradient background for glass effect depth */}
      <ScrollArea className="flex-1 messages-glass-bg">
        <div className="p-4 flex flex-col gap-2">
        {isLoadingMessages.value ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[hsl(var(--primary))] border-t-transparent" />
          </div>
        ) : messages.value.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {conv?.type === 'contact_endpoint' ? (
              <div className="flex flex-col items-center gap-3 p-6 max-w-[280px]">
                <LinkIcon className="h-6 w-6 text-[hsl(var(--primary))] opacity-70" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Someone started a conversation via your contact link, but hasn't sent a message yet.
                </p>
              </div>
            ) : (
              <div className="text-[hsl(var(--muted-foreground))]">No messages yet</div>
            )}
          </div>
        ) : (
          <>
            {messages.value.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onSend={handleSendMessage} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
        </div>
      </ScrollArea>
      
      {/* Input - for all conversations */}
      <MessageInput onSend={handleSendMessage} conversationId={conversationId} onFileUpload={handleFileUpload} />
      
      <style>{`
        /* Subtle gradient background for glass effect depth */
        .messages-glass-bg {
          background: 
            radial-gradient(ellipse at 20% 0%, hsl(var(--primary) / 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, hsl(var(--accent) / 0.04) 0%, transparent 50%),
            linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.3) 100%);
        }
        
        .conversation-detail {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: var(--color-background);
        }
        
        .conversation-detail-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background-color: var(--color-background-elevated);
          border-bottom: 1px solid var(--color-border);
          min-height: 64px;
        }
        
        .back-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--color-text-secondary);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }
        
        .back-button:hover {
          background-color: var(--color-background-hover);
          color: var(--color-text-primary);
        }
        
        .conversation-detail-info {
          flex: 1;
        }
        
        .conversation-detail-name {
          font-weight: 600;
          color: var(--color-text-primary);
        }
        
        .conversation-detail-fingerprint {
          font-size: 11px;
          font-family: var(--font-mono);
          color: var(--color-text-tertiary);
        }
        
        .conversation-detail-badges {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          border-radius: var(--radius-full);
          white-space: nowrap;
          cursor: help;
        }
        
        .badge-encrypted {
          background-color: var(--color-success-subtle);
          color: var(--color-success);
        }
        
        .badge-relayed {
          background-color: var(--color-info-subtle);
          color: var(--color-info);
        }
        
        .badge-edge {
          background-color: var(--color-bg-sunken);
          color: var(--color-text-tertiary);
          font-weight: 500;
          padding: 4px 10px;
          font-size: 12px;
        }
        
        .badge-contact {
          background-color: var(--color-warning-subtle);
          color: var(--color-warning);
        }
        
        .messages-container {
          flex: 1;
          min-height: 0; /* Critical for flexbox scrolling */
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .messages-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        
        .message-bubble {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: 18px;
          position: relative;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
          margin: 2px 0;
          flex-shrink: 0; /* Prevent messages from being compressed */
        }
        
        .message-bubble.mine {
          align-self: flex-end;
          background-color: var(--color-accent);
          color: white;
          border-bottom-right-radius: 6px;
          margin-left: 20%;
        }
        
        .message-bubble.theirs {
          align-self: flex-start;
          background-color: var(--color-bg-hover);
          border: none;
          color: var(--color-text-primary);
          border-bottom-left-radius: 6px;
          margin-right: 20%;
        }
        
        /* Webhook message styles */
        .message-bubble.webhook-message {
          max-width: 85%;
          padding: 0;
          overflow: hidden;
        }
        
        .message-bubble.webhook-message.theirs {
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border-default);
        }
        
        .webhook-sender {
          padding: 10px 14px 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .webhook-title {
          padding: 0 14px 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--color-text-primary);
          line-height: 1.3;
        }
        
        .webhook-body {
          padding: 0 14px 12px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--color-text-primary);
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .webhook-data {
          border-top: 1px solid var(--color-border-default);
          padding: 10px 14px;
          background-color: var(--color-bg-sunken);
        }
        
        .webhook-data-header {
          font-size: 11px;
          font-weight: 600;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .webhook-data-toggle {
          background: none;
          border: none;
          color: var(--color-accent);
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background-color 0.2s;
          text-transform: none;
        }
        
        .webhook-data-toggle:hover {
          background-color: var(--color-bg-hover);
        }
        
        .webhook-data-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .webhook-data-item-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .webhook-data-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          font-size: 12px;
        }
        
        .webhook-data-key {
          color: var(--color-text-secondary);
          font-weight: 500;
          flex-shrink: 0;
        }
        
        .webhook-data-value {
          color: var(--color-text-primary);
          text-align: right;
          word-break: break-all;
          font-family: var(--font-mono, monospace);
          font-size: 11px;
        }
        
        .webhook-data-json-toggle {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border-default);
          color: var(--color-accent);
          cursor: pointer;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .webhook-data-json-toggle:hover {
          background-color: var(--color-accent);
          color: white;
          border-color: var(--color-accent);
        }
        
        .webhook-data-json-expanded {
          margin-top: 4px;
          margin-left: 0;
        }
        
        /* Markdown rendering styles */
        .markdown-codeblock {
          background: rgba(0, 0, 0, 0.05);
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
          font-size: 13px;
          line-height: 1.5;
          margin: 8px 0;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        
        /* Code blocks in sent messages (white text on accent) */
        .message-bubble.mine .markdown-codeblock {
          background: rgba(0, 0, 0, 0.15);
          border-color: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.95);
        }
        
        /* Code blocks in received messages */
        .message-bubble.theirs .markdown-codeblock {
          background: rgba(0, 0, 0, 0.04);
          border-color: rgba(0, 0, 0, 0.08);
        }
        
        .markdown-codeblock code {
          color: inherit;
        }
        
        .markdown-inline-code {
          background: rgba(0, 0, 0, 0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
          font-size: 0.9em;
          color: inherit;
          opacity: 0.95;
        }
        
        /* Inline code in sent messages */
        .message-bubble.mine .markdown-inline-code {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
        
        .markdown-link {
          color: hsl(var(--accent));
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        
        /* Links in sent messages */
        .message-bubble.mine .markdown-link {
          color: rgba(255, 255, 255, 0.95);
          text-decoration-color: rgba(255, 255, 255, 0.5);
        }
        
        .markdown-link:hover {
          opacity: 0.8;
        }
        
        .markdown-bullet {
          display: flex;
          align-items: baseline;
          margin: 4px 0;
        }
        
        .bullet-dot {
          margin-right: 8px;
          opacity: 0.6;
          font-weight: bold;
        }
        
        .markdown-bold {
          font-weight: 600;
        }
        
        .markdown-italic {
          font-style: italic;
        }
        
        /* Service badge in webhook */
        .webhook-service-badge {
          display: inline-block;
          padding: 2px 6px;
          background: var(--color-info-subtle);
          color: var(--color-info);
          font-size: 10px;
          font-weight: 600;
          border-radius: 4px;
          margin-right: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .message-bubble.webhook-message .message-time {
          padding: 6px 14px 10px;
          margin-top: 0;
          background-color: var(--color-bg-sunken);
          border-top: 1px solid var(--color-border-default);
          color: var(--color-text-tertiary);
        }
        
        .message-content {
          font-size: 15px;
          line-height: 1.4;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .message-time {
          font-size: 11px;
          opacity: 0.6;
          margin-top: 4px;
          text-align: right;
          font-weight: 500;
        }
        
        .message-bubble.theirs .message-time {
          color: var(--color-text-secondary);
        }
        
        .message-input-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background-color: var(--color-background-elevated);
          border-top: 1px solid var(--color-border);
        }
        
        .message-input {
          flex: 1;
          padding: 10px 16px;
          font-size: 15px;
          font-family: inherit;
          border: 1.5px solid var(--color-border);
          border-radius: 24px;
          background-color: var(--color-background);
          color: var(--color-text-primary);
          resize: none;
          max-height: 120px;
          line-height: 1.5;
          min-height: 40px;
          transition: border-color 0.2s;
        }
        
        .message-input:focus {
          outline: none;
          border-color: var(--color-accent);
        }
        
        .message-input::placeholder {
          color: var(--color-text-tertiary);
        }
        
        .send-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: none;
          background-color: var(--color-border-focus);
          color: white;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
          flex-shrink: 0;
        }
        
        .send-button:hover:not(:disabled) {
          background-color: var(--color-primary-hover);
        }
        
        .send-button:active:not(:disabled) {
          background-color: var(--color-primary-active);
        }
        
        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background-color: var(--color-text-tertiary);
        }
        
        .read-only-notice {
          padding: 12px;
          text-align: center;
          font-size: 13px;
          color: var(--color-text-tertiary);
          background-color: var(--color-background-elevated);
          border-top: 1px solid var(--color-border);
        }
        
        .contact-link-notice {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 24px;
          text-align: center;
          max-width: 280px;
          margin: auto;
        }
        
        .contact-link-icon {
          color: var(--color-success);
          opacity: 0.8;
        }
        
        .contact-link-text {
          font-size: 14px;
          color: var(--color-text-secondary);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

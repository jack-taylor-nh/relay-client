import { useState, useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Lock, Mail, FileText, ChevronLeft, Send, Link as LinkIcon } from 'lucide-react';
import { selectedConversationId, currentIdentity, showToast, sendMessage, conversations } from '../state';
import type { ConversationType } from '../../types';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SecurityBadge } from '@/components/relay/SecurityBadge';
import { ViaBadge } from '@/components/relay/ViaBadge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface Message {
  id: string;
  senderFingerprint: string;
  content: string; // Decrypted content
  createdAt: string;
  isMine: boolean;
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
      const newMessages = result.messages.map(msg => ({
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
        if (messages.value.length === 0) {
          // Initial load - set all messages
          messages.value = newMessages;
          console.log('Initial load:', newMessages.length, 'messages');
        } else {
          // Incremental update - only add new messages
          messages.value = [...messages.value, ...messagesToAdd];
          console.log('Added', messagesToAdd.length, 'new messages');
        }
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
  
  // Split and render
  const tokens = remaining.split('\x00');
  
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith('B')) {
          return <strong key={i}>{token.slice(1)}</strong>;
        } else if (token.startsWith('I')) {
          return <em key={i}>{token.slice(1)}</em>;
        } else if (token.startsWith('C')) {
          return <code key={i} class="markdown-inline-code">{token.slice(1)}</code>;
        } else if (token.startsWith('L')) {
          const [linkText, url] = token.slice(1).split('\x01');
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

function MessageBubble({ message }: { message: Message }) {
  const time = new Date(message.createdAt).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const webhookPayload = tryParseWebhookPayload(message.content);
  
  // Glass effect styles for message bubbles
  const glassStyles = {
    // Sent message: accent blue with glass effect
    sent: [
      "bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent)/0.85)]",
      "text-white",
      "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.2),inset_0_-1px_2px_0_rgba(0,0,0,0.15),0_2px_8px_-2px_rgba(0,0,0,0.15)]",
      "backdrop-blur-sm",
    ].join(" "),
    // Received message: subtle glass effect
    received: [
      "bg-gradient-to-br from-[hsl(var(--muted))] to-[hsl(var(--muted)/0.85)]",
      "text-[hsl(var(--foreground))]",
      "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.4),inset_0_-1px_2px_0_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.08)]",
      "backdrop-blur-sm",
      "border border-[hsl(var(--border)/0.5)]",
    ].join(" "),
  };
  
  // Render webhook message with structured layout
  if (webhookPayload.isWebhook) {
    // Determine what data to show
    const hasStructuredData = webhookPayload.data && Object.keys(webhookPayload.data).length > 0;
    const hasRawData = webhookPayload.raw && Object.keys(webhookPayload.raw).length > 0;
    
    return (
      <div className={cn(
        "message-bubble webhook-message max-w-[85%] p-0 overflow-hidden rounded-2xl",
        message.isMine 
          ? cn("self-end rounded-br-md ml-[20%]", glassStyles.sent)
          : cn("self-start rounded-bl-md mr-[20%]", glassStyles.received)
      )}>
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
    );
  }
  
  // Regular message with glass effect
  return (
    <div className={cn(
      "max-w-[75%] px-4 py-3 rounded-2xl",
      message.isMine 
        ? cn("self-end rounded-br-md ml-[20%]", glassStyles.sent)
        : cn("self-start rounded-bl-md mr-[20%]", glassStyles.received)
    )}>
      <div className="text-[15px] leading-snug whitespace-pre-wrap break-words">{message.content}</div>
      <div className={cn(
        "text-[11px] mt-1 text-right font-medium",
        message.isMine ? "text-white/60" : "text-[hsl(var(--muted-foreground))]"
      )}>{time}</div>
    </div>
  );
}

function MessageInput({ onSend }: { onSend: (content: string) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
  
  return (
    <div className="flex items-center gap-3 p-4 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
      <textarea
        ref={inputRef}
        className="flex-1 px-4 py-2.5 text-sm bg-[hsl(var(--background))] border-2 border-[hsl(var(--border))] rounded-full resize-none max-h-32 min-h-10 leading-normal text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
        placeholder="Type a message..."
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <Button
        variant="accent"
        size="icon"
        onClick={handleSubmit}
        disabled={!text.trim()}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================
// Main View
// ============================================

// Polling interval for new messages (5 seconds)
const MESSAGE_POLL_INTERVAL = 5000;

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
      
      // Set up polling for new messages
      pollIntervalRef.current = setInterval(() => {
        loadMessages(conversationId, true);
      }, MESSAGE_POLL_INTERVAL);
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
    if (!conversationId) return;
    
    const conv = conversations.value.find(c => c.id === conversationId);
    if (!conv) return;
    
    // Add optimistic message
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      senderFingerprint: currentIdentity.value?.id || '',
      content,
      createdAt: new Date().toISOString(),
      isMine: true,
    };
    
    messages.value = [...messages.value, newMessage];
    
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
            conversationId,
            origin: conv.type === 'native' ? 'native' : conv.type === 'email' ? 'email' : 'contact_link',
          }
        });
        
        if (!result.success) {
          showToast(`Failed to send: ${result.error}`);
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
        } else {
          // Update optimistic message with real ID from server
          if (result.messageId) {
            messages.value = messages.value.map(m => 
              m.id === newMessage.id ? { ...m, id: result.messageId! } : m
            );
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
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
          return;
        }
        
        const senderHandle = handlesResult.handles[0].handle;
        
        // Get recipient handle from conversation counterparty
        if (!conv.counterpartyName) {
          showToast('Cannot send: recipient unknown');
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
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
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
        } else {
          // Update optimistic message with real ID
          if (result.messageId) {
            messages.value = messages.value.map(m => 
              m.id === newMessage.id ? { ...m, id: result.messageId! } : m
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
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
        } else {
          // Remove optimistic message and reload to get the server message
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
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
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
        } else {
          // Remove optimistic message and reload to get the server message
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
          await loadMessages(conversationId, false);
        }
      } else {
        showToast('Unsupported conversation type');
        messages.value = messages.value.filter(m => m.id !== newMessage.id);
      }
    } catch (error) {
      console.error('Send error:', error);
      showToast('Failed to send message');
      messages.value = messages.value.filter(m => m.id !== newMessage.id);
    }
  }
  
  if (!conversationId) {
    return null;
  }
  
  const details = conversationDetails.value;
  const conv = conversations.value.find(c => c.id === conversationId);
  const isNativeChat = details?.type === 'native';
  
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
      
      {/* Messages */}
      <ScrollArea className="flex-1">
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
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
        </div>
      </ScrollArea>
      
      {/* Input - for all conversations */}
      <MessageInput onSend={handleSendMessage} />
      
      <style>{`
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
          background: var(--color-background-elevated, #f1f5f9);
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
          font-size: 12px;
          line-height: 1.5;
          margin: 8px 0;
          border: 1px solid var(--color-border, #e2e8f0);
        }
        
        .markdown-codeblock code {
          color: var(--color-text-primary, #1e293b);
        }
        
        .markdown-inline-code {
          background: var(--color-background-elevated, #f1f5f9);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
          font-size: 0.9em;
          color: var(--color-error);
        }
        
        .markdown-link {
          color: var(--color-accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        
        .markdown-link:hover {
          color: var(--color-accent-hover);
        }
        
        .markdown-bullet {
          display: flex;
          align-items: baseline;
          margin: 4px 0;
        }
        
        .bullet-dot {
          margin-right: 8px;
          color: var(--color-text-tertiary, #6b7280);
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

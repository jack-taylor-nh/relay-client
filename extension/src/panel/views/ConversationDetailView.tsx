import { useState, useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { selectedConversationId, currentIdentity, showToast, sendMessage, conversations } from '../state';

// ============================================
// Icons
// ============================================

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function MailIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function FileTextIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

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
  type: 'native' | 'email' | 'contact_endpoint';
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

function MessageBubble({ message }: { message: Message }) {
  const time = new Date(message.createdAt).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  return (
    <div class={`message-bubble ${message.isMine ? 'mine' : 'theirs'}`}>
      <div class="message-content">{message.content}</div>
      <div class="message-time">{time}</div>
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
    <div class="message-input-container">
      <textarea
        ref={inputRef}
        class="message-input"
        placeholder="Type a message..."
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button
        class="send-button"
        onClick={handleSubmit}
        disabled={!text.trim()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
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
    <div class="conversation-detail">
      {/* Header */}
      <div class="conversation-detail-header">
        <button class="back-button" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        
        <div class="conversation-detail-info">
          <div class="conversation-detail-name">
            {details?.counterpartyName}
          </div>
          {details?.counterpartyFingerprint && (
            <div class="conversation-detail-fingerprint">
              {details.counterpartyFingerprint.slice(0, 12)}...
            </div>
          )}
        </div>
        
        <div class="conversation-detail-badge">
          {conv?.securityLevel === 'e2ee' && <span class="badge badge-encrypted"><LockIcon /> E2EE</span>}
          {conv?.securityLevel === 'gateway_secured' && <span class="badge badge-email">Relayed</span>}
        </div>
      </div>
      
      {/* Messages */}
      <div class="messages-container">
        {isLoadingMessages.value ? (
          <div class="messages-loading">
            <div class="loading-spinner"></div>
          </div>
        ) : messages.value.length === 0 ? (
          <div class="messages-empty">
            <div class="text-secondary">No messages yet</div>
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
        
        .conversation-detail-badge {
          display: flex;
          align-items: center;
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
        }
        
        .badge-encrypted {
          background-color: #dcfce7;
          color: #166534;
        }
        
        .badge-email {
          background-color: #dbeafe;
          color: #1e40af;
        }
        
        .badge-contact {
          background-color: #fef3c7;
          color: #92400e;
        }
        
        .messages-container {
          flex: 1;
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
        }
        
        .message-bubble.mine {
          align-self: flex-end;
          background-color: #0ea5e9;
          color: white;
          border-bottom-right-radius: 6px;
          margin-left: 20%;
        }
        
        .message-bubble.theirs {
          align-self: flex-start;
          background-color: #f3f4f6;
          border: none;
          color: #1f2937;
          border-bottom-left-radius: 6px;
          margin-right: 20%;
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
          color: #6b7280;
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
          background-color: #475569;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
          flex-shrink: 0;
        }
        
        .send-button:hover:not(:disabled) {
          background-color: #334155;
        }
        
        .send-button:active:not(:disabled) {
          background-color: #1e293b;
        }
        
        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background-color: #9ca3af;
        }
        
        .read-only-notice {
          padding: 12px;
          text-align: center;
          font-size: 13px;
          color: var(--color-text-tertiary);
          background-color: var(--color-background-elevated);
          border-top: 1px solid var(--color-border);
        }
      `}</style>
    </div>
  );
}

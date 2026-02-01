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

async function loadMessages(conversationId: string) {
  isLoadingMessages.value = true;
  
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
    
    console.log('Loading messages for conversation:', conversationId);
    
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
      console.log('Loaded messages:', result.messages.length);
      messages.value = result.messages.map(msg => ({
        id: msg.id,
        senderFingerprint: msg.senderIdentityId || msg.senderExternalId || 'unknown',
        content: msg.content,
        createdAt: msg.createdAt,
        isMine: msg.isMine,
      })).reverse(); // Reverse so oldest is first
    } else {
      console.log('No messages or error:', result);
      if (result.error) {
        showToast(`Error loading messages: ${result.error}`);
      }
      messages.value = [];
    }
  } catch (error) {
    console.error('Load messages error:', error);
    showToast('Failed to load messages');
    messages.value = [];
  } finally {
    isLoadingMessages.value = false;
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

export function ConversationDetailView() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationId = selectedConversationId.value;
  
  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId);
    }
    
    return () => {
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
      // Send via appropriate endpoint based on conversation type
      if (conv.securityLevel === 'gateway_secured') {
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
          // Remove optimistic message on failure
          messages.value = messages.value.filter(m => m.id !== newMessage.id);
        }
      } else {
        // Native E2EE - use encrypted message send
        // TODO: Implement native send
        showToast('Native E2EE send not yet implemented');
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
          background-color: var(--color-bg);
        }
        
        .conversation-detail-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-bg-elevated);
          border-bottom: 1px solid var(--color-border);
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
          background-color: var(--color-bg-hover);
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
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--color-text-tertiary);
        }
        
        .conversation-detail-badge {
          display: flex;
          align-items: center;
        }
        
        .badge {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-xs);
          border-radius: var(--radius-full);
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
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        
        .messages-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        
        .message-bubble {
          max-width: 80%;
          padding: var(--space-3);
          border-radius: var(--radius-lg);
          position: relative;
        }
        
        .message-bubble.mine {
          align-self: flex-end;
          background-color: var(--color-accent);
          color: white;
        }
        
        .message-bubble.theirs {
          align-self: flex-start;
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
        }
        
        .message-content {
          font-size: var(--text-sm);
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .message-time {
          font-size: 10px;
          opacity: 0.7;
          margin-top: var(--space-1);
          text-align: right;
        }
        
        .message-bubble.theirs .message-time {
          color: var(--color-text-tertiary);
        }
        
        .message-input-container {
          display: flex;
          align-items: flex-end;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-bg-elevated);
          border-top: 1px solid var(--color-border);
        }
        
        .message-input {
          flex: 1;
          padding: var(--space-3);
          font-size: var(--text-sm);
          font-family: inherit;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background-color: var(--color-bg);
          color: var(--color-text-primary);
          resize: none;
          max-height: 120px;
          line-height: 1.4;
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
          background-color: var(--color-accent);
          color: white;
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .send-button:hover:not(:disabled) {
          background-color: var(--color-accent-hover);
        }
        
        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .read-only-notice {
          padding: var(--space-3);
          text-align: center;
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
          background-color: var(--color-bg-elevated);
          border-top: 1px solid var(--color-border);
        }
      `}</style>
    </div>
  );
}

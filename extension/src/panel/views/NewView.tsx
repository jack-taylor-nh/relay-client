import { useState } from 'preact/hooks';
import { showToast, aliases, selectedConversationId, conversations, resolveHandle, sendNewMessage, createAlias } from '../state';
import { activeTab } from '../App';

// ============================================
// Icons
// ============================================

function LightbulbIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 019 14" />
    </svg>
  );
}

function ShieldLockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="9" y="9" width="6" height="5" rx="1" />
      <path d="M10 9V7a2 2 0 014 0v2" />
    </svg>
  );
}

type NewAction = 'chat' | 'alias' | 'contact';

export function NewView() {
  const [action, setAction] = useState<NewAction | null>(null);

  if (!action) {
    return (
      <div class="new-view">
        <h2 class="new-title">Create new</h2>
        
        <div class="new-options">
          <button class="new-option" onClick={() => setAction('chat')}>
            <div class="option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div class="option-content">
              <h3>Start a chat</h3>
              <p>Send an encrypted message to another handle</p>
            </div>
          </button>
          
          <button class="new-option" onClick={() => setAction('alias')}>
            <div class="option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div class="option-content">
              <h3>Create email alias</h3>
              <p>Get a private address to share instead of your real email</p>
            </div>
          </button>
          
          <button class="new-option" onClick={() => setAction('contact')}>
            <div class="option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div class="option-content">
              <h3>Create contact link</h3>
              <p>Share a link for anyone to message you privately</p>
            </div>
          </button>
        </div>

        <style>{`
          .new-view {
            flex: 1;
            padding: var(--space-4);
          }
          
          .new-title {
            margin-bottom: var(--space-4);
          }
          
          .new-options {
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
          }
          
          .new-option {
            display: flex;
            align-items: flex-start;
            gap: var(--space-3);
            padding: var(--space-4);
            background-color: var(--color-bg-elevated);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            cursor: pointer;
            text-align: left;
            transition: all var(--transition-fast);
          }
          
          .new-option:hover {
            border-color: var(--color-accent);
            background-color: var(--color-accent-subtle);
          }
          
          .option-icon {
            flex-shrink: 0;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--color-bg-hover);
            border-radius: var(--radius-md);
            color: var(--color-text-secondary);
          }
          
          .option-icon svg {
            width: 20px;
            height: 20px;
          }
          
          .option-content h3 {
            font-size: var(--text-sm);
            font-weight: 600;
            margin-bottom: var(--space-1);
          }
          
          .option-content p {
            font-size: var(--text-xs);
            color: var(--color-text-secondary);
          }
        `}</style>
      </div>
    );
  }

  if (action === 'chat') {
    return <StartChatForm onBack={() => setAction(null)} />;
  }

  if (action === 'alias') {
    return <CreateAliasForm onBack={() => setAction(null)} />;
  }

  if (action === 'contact') {
    return <CreateContactForm onBack={() => setAction(null)} />;
  }

  return null;
}

function StartChatForm({ onBack }: { onBack: () => void }) {
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState('');
  const [resolvedUser, setResolvedUser] = useState<{ handle: string; fingerprint: string; publicKey: string } | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();

  async function handleResolve() {
    if (!cleanHandle || cleanHandle.length < 3) {
      setError('Handle must be at least 3 characters');
      return;
    }
    
    setError(null);
    setIsResolving(true);
    
    const result = await resolveHandle(cleanHandle);
    
    if (result.success && result.publicKey && result.fingerprint) {
      setResolvedUser({
        handle: result.handle || cleanHandle,
        fingerprint: result.fingerprint,
        publicKey: result.publicKey,
      });
    } else {
      setError(result.error || `Handle &${cleanHandle} not found`);
    }
    
    setIsResolving(false);
  }

  async function handleSend() {
    if (!resolvedUser || !message.trim()) return;
    
    setIsSending(true);
    
    const result = await sendNewMessage(
      resolvedUser.fingerprint,
      resolvedUser.publicKey,
      message.trim()
    );
    
    if (result.success && result.conversationId) {
      // Add to conversations list
      const newConversation = {
        id: result.conversationId,
        type: 'native' as const,
        securityLevel: 'e2ee' as const,
        participants: [resolvedUser.fingerprint],
        counterpartyName: resolvedUser.handle,
        lastMessagePreview: message.trim().slice(0, 50),
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        unreadCount: 0,
      };
      
      conversations.value = [newConversation, ...conversations.value];
      selectedConversationId.value = result.conversationId;
      activeTab.value = 'inbox';
      
      showToast(`Message sent to &${resolvedUser.handle}`);
    } else {
      setError(result.error || 'Failed to send message');
    }
    
    setIsSending(false);
  }

  function handleClear() {
    setResolvedUser(null);
    setError(null);
    setMessage('');
  }

  return (
    <div class="form-view">
      <button class="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      
      <h2>Start a chat</h2>
      <p class="form-desc">Enter a handle to start an encrypted conversation.</p>
      
      {!resolvedUser ? (
        // Handle lookup form
        <div class="lookup-form">
          <div class="input-group">
            <label for="handle">Handle</label>
            <div class="handle-input-row">
              <div class="handle-input-wrapper">
                <span class="handle-prefix">&amp;</span>
                <input
                  id="handle"
                  class="form-input handle-input"
                  type="text"
                  placeholder="username"
                  value={handle}
                  onInput={(e) => {
                    setHandle((e.target as HTMLInputElement).value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleResolve();
                    }
                  }}
                />
              </div>
              <button
                class="btn btn-primary"
                onClick={handleResolve}
                disabled={isResolving || cleanHandle.length < 3}
              >
                {isResolving ? '...' : 'Find'}
              </button>
            </div>
          </div>
          
          {error && <div class="error-message">{error}</div>}
          
          <div class="lookup-hint">
            <p class="text-xs text-secondary">
              <span class="hint-icon"><LightbulbIcon /></span> Try searching for <button class="link-btn" onClick={() => setHandle('alice')}>alice</button> or{' '}
              <button class="link-btn" onClick={() => setHandle('bob')}>bob</button>
            </p>
          </div>
        </div>
      ) : (
        // Compose message form
        <div class="compose-form">
          <div class="recipient-card">
            <div class="recipient-info">
              <div class="recipient-handle">&amp;{resolvedUser.handle}</div>
              <div class="recipient-fingerprint">{resolvedUser.fingerprint.slice(0, 16)}...</div>
            </div>
            <button class="btn btn-ghost" onClick={handleClear}>Change</button>
          </div>
          
          <div class="input-group">
            <label for="message">Message</label>
            <textarea
              id="message"
              class="form-input message-textarea"
              placeholder="Type your message..."
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              rows={4}
            />
          </div>
          
          <div class="encryption-notice">
            <span class="encryption-icon"><ShieldLockIcon /></span>
            <span>This message will be end-to-end encrypted</span>
          </div>
          
          <button
            class="btn btn-primary btn-lg"
            onClick={handleSend}
            disabled={isSending || !message.trim()}
          >
            {isSending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      )}

      <style>{`
        ${formStyles}
        
        .handle-input-row {
          display: flex;
          gap: var(--space-2);
        }
        
        .handle-input-row .handle-input-wrapper {
          flex: 1;
        }
        
        .handle-input-row .btn {
          flex-shrink: 0;
        }
        
        .lookup-hint {
          margin-top: var(--space-4);
          padding: var(--space-3);
          background-color: var(--color-bg-hover);
          border-radius: var(--radius-md);
        }
        
        .link-btn {
          background: none;
          border: none;
          color: var(--color-accent);
          cursor: pointer;
          font-size: inherit;
          padding: 0;
        }
        
        .link-btn:hover {
          text-decoration: underline;
        }
        
        .recipient-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3);
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }
        
        .recipient-handle {
          font-weight: 600;
          color: var(--color-text-primary);
        }
        
        .recipient-fingerprint {
          font-size: var(--text-xs);
          font-family: var(--font-mono);
          color: var(--color-text-tertiary);
        }
        
        .message-textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        .encryption-notice {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-success);
        }
        
        .encryption-icon {
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
}

function CreateAliasForm({ onBack }: { onBack: () => void }) {
  const [label, setLabel] = useState('');
  const [isRandom, setIsRandom] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const result = await createAlias(label || undefined);
    
    if (result.success && result.alias) {
      aliases.value = [...aliases.value, {
        id: result.alias.id,
        address: result.alias.address,
        label: result.alias.label,
        isActive: true,
        createdAt: new Date().toISOString(),
        messageCount: 0,
      }];
      
      showToast('Alias created!');
      navigator.clipboard.writeText(result.alias.address);
      showToast('Copied to clipboard');
      onBack();
    } else {
      setError(result.error || 'Failed to create alias');
    }
    
    setIsLoading(false);
  };

  return (
    <div class="form-view">
      <button class="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      
      <h2>Create email alias</h2>
      <p class="form-desc">
        Get a private email address. Messages sent here will appear in your Relay inbox.
      </p>
      
      <form onSubmit={handleSubmit}>
        <div class="input-group">
          <label for="label">Label (optional)</label>
          <input
            id="label"
            class="input"
            type="text"
            placeholder="e.g., Newsletters, Shopping"
            value={label}
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          />
        </div>
        
        <div class="checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={isRandom}
              onChange={(e) => setIsRandom((e.target as HTMLInputElement).checked)}
            />
            Generate random address
          </label>
        </div>
        
        {error && <div class="error-message">{error}</div>}
        
        <button class="btn btn-primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create alias'}
        </button>
      </form>

      <style>{formStyles}</style>
    </div>
  );
}

function CreateContactForm({ onBack }: { onBack: () => void }) {
  const [purpose, setPurpose] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Create contact endpoint via API
    await new Promise((r) => setTimeout(r, 500));
    
    const link = `relay.sh/c/${Math.random().toString(36).slice(2, 10)}`;
    navigator.clipboard.writeText(`https://${link}`);
    showToast('Contact link copied!');
    setIsLoading(false);
    onBack();
  };

  return (
    <div class="form-view">
      <button class="back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      
      <h2>Create contact link</h2>
      <p class="form-desc">
        Anyone with this link can send you a message without knowing your email.
      </p>
      
      <form onSubmit={handleSubmit}>
        <div class="input-group">
          <label for="purpose">Purpose (optional)</label>
          <input
            id="purpose"
            class="input"
            type="text"
            placeholder="e.g., Portfolio inquiries"
            value={purpose}
            onInput={(e) => setPurpose((e.target as HTMLInputElement).value)}
          />
        </div>
        
        <button class="btn btn-primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create link'}
        </button>
      </form>

      <style>{formStyles}</style>
    </div>
  );
}

const formStyles = `
  .form-view {
    flex: 1;
    padding: var(--space-4);
  }
  
  .back-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) 0;
    margin-bottom: var(--space-4);
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    transition: color var(--transition-fast);
  }
  
  .back-btn:hover {
    color: var(--color-text-primary);
  }
  
  .back-btn svg {
    width: 16px;
    height: 16px;
  }
  
  .form-view h2 {
    margin-bottom: var(--space-2);
  }
  
  .form-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }
  
  .form-view form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  
  .input-group label {
    font-size: var(--text-sm);
    font-weight: 500;
  }
  
  .checkbox-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  
  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    cursor: pointer;
  }
`;

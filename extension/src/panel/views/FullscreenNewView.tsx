import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges } from '../state';
import { activeTab } from '../App';
import { EdgeCard } from '../components/EdgeCard';
import { FullscreenInboxView } from './FullscreenInboxView';

// Track state for fullscreen new view
const selectedEdge = signal<string | null>(null);

export function FullscreenNewView() {
  const [recipientHandle, setRecipientHandle] = useState('');
  const [message, setMessage] = useState('');
  const [resolvedUser, setResolvedUser] = useState<{ 
    handle: string; 
    fingerprint: string; 
    publicKey: string;
    x25519PublicKey?: string;
    edgeId?: string;
  } | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageSent, setMessageSent] = useState(false);

  const allEdges = edges.value;
  const nativeEdges = allEdges.filter(e => e.type === 'native' && e.status === 'active');
  const emailEdges = allEdges.filter(e => e.type === 'email' && e.status === 'active');
  const cleanHandle = recipientHandle.toLowerCase().replace(/^&/, '').trim();

  // Load edges when component mounts
  useEffect(() => {
    loadEdges();
  }, []);

  // Reset state when edge selection changes
  useEffect(() => {
    setResolvedUser(null);
    setRecipientHandle('');
    setMessage('');
    setError(null);
  }, [selectedEdge.value]);

  // Resolve recipient handle
  async function handleResolve() {
    if (!cleanHandle || cleanHandle.length < 3) {
      setError('Handle must be at least 3 characters');
      return;
    }
    
    setError(null);
    setIsResolving(true);
    
    const result = await resolveHandle(cleanHandle);
    
    if (result.success && result.x25519PublicKey && result.edgeId) {
      setResolvedUser({
        handle: result.handle || cleanHandle,
        fingerprint: result.edgeId,
        publicKey: result.x25519PublicKey,
        x25519PublicKey: result.x25519PublicKey,
        edgeId: result.edgeId,
      });
    } else {
      setError(result.error || `Handle &${cleanHandle} not found`);
    }
    
    setIsResolving(false);
  }

  // Send message
  async function handleSend() {
    if (!resolvedUser || !message.trim() || !selectedEdge.value) return;
    
    setIsSending(true);
    
    try {
      const edgeId = selectedEdge.value.replace('edge:', '');
      const senderEdge = allEdges.find(e => e.id === edgeId);
      
      if (!senderEdge) {
        setError('Sender edge not found');
        setIsSending(false);
        return;
      }

      if (senderEdge.type !== 'native') {
        setError('Native messaging requires using a native handle edge');
        setIsSending(false);
        return;
      }

      const senderHandle = senderEdge.address.replace(/^&/, '');

      const result = await sendMessage<{
        success: boolean;
        conversationId?: string;
        messageId?: string;
        error?: string;
      }>({
        type: 'SEND_NATIVE_MESSAGE',
        payload: {
          recipientHandle: resolvedUser.handle,
          senderHandle: senderHandle,
          content: message.trim(),
        },
      });

      if (!result.success) {
        setError(result.error || 'Failed to send message');
        setIsSending(false);
        return;
      }
      
      // Add conversation to list
      const newConversation = {
        id: result.conversationId!,
        type: 'native' as const,
        securityLevel: 'e2ee' as const,
        participants: [resolvedUser.fingerprint],
        counterpartyName: `&${resolvedUser.handle}`,
        lastMessagePreview: message.trim().slice(0, 50),
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        unreadCount: 0,
      };
      
      conversations.value = [newConversation, ...conversations.value];
      selectedConversationId.value = result.conversationId!;
      
      showToast(`Message sent to &${resolvedUser.handle}`);
      
      // Switch to inbox view showing the new conversation
      setMessageSent(true);
      activeTab.value = 'inbox';
    } catch (error) {
      console.error('Send error:', error);
      setError('Network error');
    }
    
    setIsSending(false);
  }

  // If message was sent, switch to inbox
  if (messageSent) {
    return <FullscreenInboxView />;
  }

  return (
    <div class="flex h-full">
      {/* Left Panel - Edge Selection */}
      <div class="w-80 flex-shrink-0 flex flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
        <div class="px-4 py-4 border-b border-[var(--color-border-default)]">
          <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Start new conversation</h2>
          <p class="text-sm text-[var(--color-text-secondary)] mt-1">Choose which edge to use</p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Native Handles */}
          {nativeEdges.length > 0 && (
            <div>
              <h3 class="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Your Handles</h3>
              <div class="space-y-2">
                {nativeEdges.map((edge) => (
                  <div 
                    key={edge.id} 
                    onClick={() => { selectedEdge.value = `edge:${edge.id}`; }}
                    class={`cursor-pointer rounded-lg transition-all duration-150 ${
                      selectedEdge.value === `edge:${edge.id}` 
                        ? 'ring-2 ring-sky-500 ring-offset-2' 
                        : ''
                    }`}
                  >
                    <EdgeCard
                      id={edge.id}
                      type="native"
                      address={edge.address.startsWith('&') ? edge.address : `&${edge.address}`}
                      subtitle={edge.metadata?.displayName || null}
                      status="active"
                      createdAt={edge.createdAt}
                      onCopy={() => {}}
                      onDispose={() => {}}
                      expandable={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email Aliases */}
          {emailEdges.length > 0 && (
            <div>
              <h3 class="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Email Aliases</h3>
              <div class="space-y-2">
                {emailEdges.map((edge) => (
                  <div 
                    key={edge.id} 
                    onClick={() => { selectedEdge.value = `edge:${edge.id}`; }}
                    class={`cursor-pointer rounded-lg transition-all duration-150 ${
                      selectedEdge.value === `edge:${edge.id}` 
                        ? 'ring-2 ring-sky-500 ring-offset-2' 
                        : ''
                    }`}
                  >
                    <EdgeCard
                      id={edge.id}
                      type="email"
                      address={edge.address}
                      subtitle={edge.label}
                      status={edge.status}
                      messageCount={edge.messageCount}
                      createdAt={edge.createdAt}
                      onCopy={() => {}}
                      onDispose={() => {}}
                      expandable={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {allEdges.length === 0 && (
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[var(--color-text-tertiary)] mb-3">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <h3 class="text-base font-semibold text-[var(--color-text-primary)] mb-1">No identities yet</h3>
              <p class="text-sm text-[var(--color-text-secondary)] mb-4">Claim a handle or create an alias in the Edges tab</p>
              <button
                class="px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors"
                onClick={() => { activeTab.value = 'edges'; }}
              >
                Go to Edges
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Compose Area */}
      <div class="flex-1 flex flex-col bg-[var(--color-bg-sunken)]">
        {!selectedEdge.value ? (
          // No edge selected - prompt
          <div class="flex-1 flex flex-col items-center justify-center text-center px-5">
            <svg class="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <p class="text-[var(--color-text-tertiary)]">Select an edge to send from</p>
          </div>
        ) : (
          // Edge selected - show compose form
          <div class="flex-1 flex flex-col max-w-2xl mx-auto w-full p-6">
            <div class="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--color-border-default)]">
              <div class="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">New Conversation</h3>
                <p class="text-sm text-[var(--color-text-tertiary)]">
                  Sending from: {allEdges.find(e => `edge:${e.id}` === selectedEdge.value)?.address}
                </p>
              </div>
            </div>

            {!resolvedUser ? (
              // Step 1: Enter recipient
              <div class="flex-1">
                <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Recipient handle</label>
                <div class="flex gap-2 mb-2">
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] font-medium">&</span>
                    <input
                      type="text"
                      class="w-full pl-7 pr-3 py-3 text-base border border-[var(--color-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      placeholder="username"
                      value={recipientHandle}
                      onInput={(e) => {
                        setRecipientHandle((e.target as HTMLInputElement).value);
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
                    class="px-6 py-3 text-base font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] rounded-lg transition-colors"
                    onClick={handleResolve}
                    disabled={isResolving || cleanHandle.length < 3}
                  >
                    {isResolving ? 'Finding...' : 'Find'}
                  </button>
                </div>
                {error && <p class="text-sm text-red-600 mt-2">{error}</p>}
              </div>
            ) : (
              // Step 2: Compose message
              <div class="flex-1 flex flex-col">
                {/* Recipient card */}
                <div class="p-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg mb-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-base font-semibold text-[var(--color-text-primary)]">&{resolvedUser.handle}</div>
                      <div class="text-sm font-mono text-[var(--color-text-tertiary)]">{resolvedUser.fingerprint.slice(0, 16)}...</div>
                    </div>
                    <button
                      class="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] font-medium"
                      onClick={() => {
                        setResolvedUser(null);
                        setError(null);
                      }}
                    >
                      Change
                    </button>
                  </div>
                </div>

                {/* Message textarea */}
                <div class="flex-1 flex flex-col">
                  <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Message</label>
                  <textarea
                    class="flex-1 min-h-[200px] px-4 py-3 text-base border border-[var(--color-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                    placeholder="Type your message..."
                    value={message}
                    onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
                  />
                </div>

                {error && <div class="mt-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">{error}</div>}

                <button
                  class="mt-4 w-full px-6 py-3 text-base font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] disabled:cursor-not-allowed rounded-lg transition-colors"
                  onClick={handleSend}
                  disabled={isSending || !message.trim()}
                >
                  {isSending ? 'Sending...' : 'Send message'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

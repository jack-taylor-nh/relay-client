import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges } from '../state';
import { activeTab } from '../App';
import { EdgeCard } from '../components/EdgeCard';
import { FullscreenInboxView } from './FullscreenInboxView';

// Track state for fullscreen new view
const selectedEdge = signal<string | null>(null);

interface RecentContact {
  handle: string;
  counterpartyName: string;
  lastActivityAt: string;
}

export function FullscreenNewView() {
  const [recipientHandle, setRecipientHandle] = useState('');
  const [recents, setRecents] = useState<RecentContact[]>([]);
  const [filteredRecents, setFilteredRecents] = useState<RecentContact[]>([]);
  const [resolvedUser, setResolvedUser] = useState<{ 
    handle: string; 
    fingerprint: string; 
    publicKey: string;
    x25519PublicKey?: string;
    edgeId?: string;
  } | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allEdges = edges.value;
  const nativeEdges = allEdges.filter(e => e.type === 'native' && e.status === 'active');
  const emailEdges = allEdges.filter(e => e.type === 'email' && e.status === 'active');
  const cleanHandle = recipientHandle.toLowerCase().replace(/^&/, '').trim();

  // Load edges when component mounts
  useEffect(() => {
    loadEdges();
  }, []);

  // Load recents from chrome.storage.local on mount
  useEffect(() => {
    loadRecents();
  }, []);

  async function loadRecents() {
    try {
      const storage = await chrome.storage.local.get(['processedConversations']);
      const storedConversations = storage.processedConversations || [];
      
      // Extract unique native contacts sorted by last activity
      const uniqueContacts = new Map<string, RecentContact>();
      
      storedConversations
        .filter((c: any) => c.type === 'native' && c.counterpartyName?.startsWith('&'))
        .forEach((c: any) => {
          const handle = c.counterpartyName.replace(/^&/, '');
          if (!uniqueContacts.has(handle) || 
              new Date(c.lastActivityAt) > new Date(uniqueContacts.get(handle)!.lastActivityAt)) {
            uniqueContacts.set(handle, {
              handle,
              counterpartyName: c.counterpartyName,
              lastActivityAt: c.lastActivityAt,
            });
          }
        });
      
      const recentsList = Array.from(uniqueContacts.values())
        .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
        .slice(0, 10); // Top 10 recents
      
      setRecents(recentsList);
      setFilteredRecents(recentsList);
    } catch (error) {
      console.error('Failed to load recents:', error);
    }
  }

  // Filter recents as user types
  useEffect(() => {
    if (!cleanHandle) {
      setFilteredRecents(recents);
      return;
    }
    
    const filtered = recents.filter(r => 
      r.handle.toLowerCase().includes(cleanHandle.toLowerCase())
    );
    setFilteredRecents(filtered);
  }, [recipientHandle, recents]);

  // Reset state when edge selection changes
  useEffect(() => {
    setResolvedUser(null);
    setRecipientHandle('');
    setError(null);
  }, [selectedEdge.value]);

  // Select a recent contact
  function selectRecent(handle: string) {
    setRecipientHandle(handle);
    handleResolve(handle);
  }

  // Resolve recipient handle
  async function handleResolve(handleToResolve?: string) {
    const targetHandle = handleToResolve || cleanHandle;
    
    if (!targetHandle || targetHandle.length < 3) {
      setError('Handle must be at least 3 characters');
      return;
    }
    
    setError(null);
    setIsResolving(true);
    
    const result = await resolveHandle(targetHandle);
    
    if (result.success && result.x25519PublicKey && result.edgeId) {
      setResolvedUser({
        handle: result.handle || targetHandle,
        fingerprint: result.edgeId,
        publicKey: result.x25519PublicKey,
        x25519PublicKey: result.x25519PublicKey,
        edgeId: result.edgeId,
      });
      
      // Create conversation immediately
      await createConversation(result.handle || targetHandle, result.edgeId);
    } else {
      setError(result.error || `Handle &${targetHandle} not found`);
    }
    
    setIsResolving(false);
  }

  // Create conversation and navigate to it
  async function createConversation(recipientHandle: string, recipientEdgeId: string) {
    if (!selectedEdge.value) return;
    
    setIsCreatingConversation(true);
    
    try {
      const edgeId = selectedEdge.value.replace('edge:', '');
      const senderEdge = allEdges.find(e => e.id === edgeId);
      
      if (!senderEdge) {
        setError('Sender edge not found');
        setIsCreatingConversation(false);
        return;
      }

      if (senderEdge.type !== 'native') {
        setError('Native messaging requires using a native handle edge');
        setIsCreatingConversation(false);
        return;
      }

      const senderHandle = senderEdge.address.replace(/^&/, '');

      // Send empty initialization message to create conversation
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
          content: '', // Empty message just creates the conversation
        },
      });

      if (!result.success) {
        setError(result.error || 'Failed to create conversation');
        setIsCreatingConversation(false);
        return;
      }
      
      // Add conversation to list
      const newConversation = {
        id: result.conversationId!,
        type: 'native' as const,
        securityLevel: 'e2ee' as const,
        participants: [recipientEdgeId],
        counterpartyName: `&${recipientHandle}`,
        lastMessagePreview: '',
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        unreadCount: 0,
        myEdgeId: senderEdge.id,
        counterpartyEdgeId: recipientEdgeId,
      };
      
      conversations.value = [newConversation, ...conversations.value];
      selectedConversationId.value = result.conversationId!;
      
      // Switch to inbox view showing the new conversation
      activeTab.value = 'inbox';
    } catch (error) {
      console.error('Create conversation error:', error);
      setError('Network error');
    }
    
    setIsCreatingConversation(false);
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
          // Edge selected - show recipient lookup
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

            {/* Recipient lookup */}
            <div class="flex-1">
              <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Find recipient</label>
              <div class="flex gap-2 mb-4">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] font-medium">&</span>
                  <input
                    type="text"
                    class="w-full pl-7 pr-3 py-3 text-base border border-[var(--color-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                    placeholder="username"
                    value={recipientHandle}
                    onInput={(e) => {
                      setRecipientHandle((e.target as HTMLInputElement).value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && cleanHandle.length >= 3) {
                        e.preventDefault();
                        handleResolve();
                      }
                    }}
                    disabled={isResolving || isCreatingConversation}
                  />
                </div>
                <button
                  class="px-6 py-3 text-base font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] rounded-lg transition-colors"
                  onClick={() => handleResolve()}
                  disabled={isResolving || isCreatingConversation || cleanHandle.length < 3}
                >
                  {isResolving || isCreatingConversation ? 'Finding...' : 'Find'}
                </button>
              </div>
              
              {error && (
                <div class="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Recents list */}
              {filteredRecents.length > 0 && !isResolving && !isCreatingConversation && (
                <div class="mt-4">
                  <h4 class="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
                    {cleanHandle ? 'Matching contacts' : 'Recent contacts'}
                  </h4>
                  <div class="space-y-1">
                    {filteredRecents.map((recent) => (
                      <button
                        key={recent.handle}
                        class="w-full flex items-center justify-between px-4 py-3 text-left rounded-lg bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] transition-colors"
                        onClick={() => selectRecent(recent.handle)}
                      >
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                            <svg class="w-4 h-4 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                          <div>
                            <div class="text-sm font-medium text-[var(--color-text-primary)]">{recent.counterpartyName}</div>
                            <div class="text-xs text-[var(--color-text-tertiary)]">
                              Last active {formatRelativeTime(recent.lastActivityAt)}
                            </div>
                          </div>
                        </div>
                        <svg class="w-5 h-5 text-[var(--color-text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredRecents.length === 0 && cleanHandle && !isResolving && !isCreatingConversation && (
                <div class="mt-4 text-center py-8 text-[var(--color-text-tertiary)]">
                  <p class="text-sm">No matching recent contacts</p>
                  <p class="text-xs mt-1">Press Enter or click Find to search</p>
                </div>
              )}

              {recents.length === 0 && !cleanHandle && !isResolving && !isCreatingConversation && (
                <div class="mt-4 text-center py-8 text-[var(--color-text-tertiary)]">
                  <p class="text-sm">No recent contacts yet</p>
                  <p class="text-xs mt-1">Enter a handle to start a new conversation</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

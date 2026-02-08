import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges } from '../state';
import { activeTab } from '../App';
import { EdgeCard } from '@/components/relay/EdgeCard';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link, User, Users, MessageSquare, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className="flex h-full">
      {/* Left Panel - Edge Selection */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="px-4 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Start new conversation</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Choose which edge to use</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Native Handles */}
            {nativeEdges.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Your Handles</h3>
                <div className="space-y-2">
                  {nativeEdges.map((edge) => (
                    <div 
                      key={edge.id} 
                      onClick={() => { selectedEdge.value = `edge:${edge.id}`; }}
                      className={cn(
                        "cursor-pointer rounded-lg transition-all duration-150",
                        selectedEdge.value === `edge:${edge.id}` && "ring-2 ring-[hsl(var(--ring))] ring-offset-2"
                      )}
                    >
                      <EdgeCard
                        id={edge.id}
                        type="native"
                        address={edge.address.startsWith('&') ? edge.address : `&${edge.address}`}
                        label={edge.metadata?.displayName || undefined}
                        onCopy={() => {}}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email Aliases */}
            {emailEdges.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">Email Aliases</h3>
                <div className="space-y-2">
                  {emailEdges.map((edge) => (
                    <div 
                      key={edge.id} 
                      onClick={() => { selectedEdge.value = `edge:${edge.id}`; }}
                      className={cn(
                        "cursor-pointer rounded-lg transition-all duration-150",
                        selectedEdge.value === `edge:${edge.id}` && "ring-2 ring-[hsl(var(--ring))] ring-offset-2"
                      )}
                    >
                      <EdgeCard
                        id={edge.id}
                        type="email"
                        address={edge.address}
                        label={edge.label || undefined}
                        onCopy={() => {}}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {allEdges.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-3" strokeWidth={1.5} />
                <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-1">No identities yet</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Claim a handle or create an alias in the Edges tab</p>
                <Button
                  variant="accent"
                  onClick={() => { activeTab.value = 'edges'; }}
                >
                  Go to Edges
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Compose Area */}
      <div className="flex-1 flex flex-col bg-[hsl(var(--background))]">
        {!selectedEdge.value ? (
          // No edge selected - prompt
          <div className="flex-1 flex flex-col items-center justify-center text-center px-5">
            <Link className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-4" strokeWidth={1.5} />
            <p className="text-[hsl(var(--muted-foreground))]">Select an edge to send from</p>
          </div>
        ) : (
          // Edge selected - show recipient lookup
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-6">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[hsl(var(--border))]">
              <div className="w-10 h-10 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">New Conversation</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Sending from: {allEdges.find(e => `edge:${e.id}` === selectedEdge.value)?.address}
                </p>
              </div>
            </div>

            {/* Recipient lookup */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Find recipient</label>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] font-medium">&</span>
                  <input
                    type="text"
                    className="w-full pl-7 pr-3 py-3 text-base border border-[hsl(var(--border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
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
                <Button
                  variant="accent"
                  onClick={() => handleResolve()}
                  disabled={isResolving || isCreatingConversation || cleanHandle.length < 3}
                >
                  {isResolving || isCreatingConversation ? 'Finding...' : 'Find'}
                </Button>
              </div>
              
              {error && (
                <div className="mb-4 p-3 bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/30 text-sm text-[hsl(var(--destructive))] rounded-lg">
                  {error}
                </div>
              )}

              {/* Recents list */}
              {filteredRecents.length > 0 && !isResolving && !isCreatingConversation && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-2">
                    {cleanHandle ? 'Matching contacts' : 'Recent contacts'}
                  </h4>
                  <div className="space-y-1">
                    {filteredRecents.map((recent) => (
                      <button
                        key={recent.handle}
                        className="w-full flex items-center justify-between px-4 py-3 text-left rounded-lg bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))] border border-[hsl(var(--border))] transition-colors cursor-pointer"
                        onClick={() => selectRecent(recent.handle)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-[hsl(var(--primary))]" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-[hsl(var(--foreground))]">{recent.counterpartyName}</div>
                            <div className="text-xs text-[hsl(var(--muted-foreground))]">
                              Last active {formatRelativeTime(recent.lastActivityAt)}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredRecents.length === 0 && cleanHandle && !isResolving && !isCreatingConversation && (
                <div className="mt-4 text-center py-8 text-[hsl(var(--muted-foreground))]">
                  <p className="text-sm">No matching recent contacts</p>
                  <p className="text-xs mt-1">Press Enter or click Find to search</p>
                </div>
              )}

              {recents.length === 0 && !cleanHandle && !isResolving && !isCreatingConversation && (
                <div className="mt-4 text-center py-8 text-[hsl(var(--muted-foreground))]">
                  <p className="text-sm">No recent contacts yet</p>
                  <p className="text-xs mt-1">Enter a handle to start a new conversation</p>
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

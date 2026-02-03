import { useState, useEffect } from 'preact/hooks';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges } from '../state';
import { activeTab } from '../App';
import { EdgeCard } from '../components/EdgeCard';

export function NewView() {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
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

  const allEdges = edges.value;
  const nativeEdges = allEdges.filter(e => e.type === 'native' && e.status === 'active');
  const emailEdges = allEdges.filter(e => e.type === 'email' && e.status === 'active');
  const cleanHandle = recipientHandle.toLowerCase().replace(/^&/, '').trim();

  // Load edges when component mounts
  useEffect(() => {
    loadEdges();
  }, []);

  // Step 1: Select which edge to use
  if (!selectedEdge) {
    return (
      <div class="flex flex-col h-full bg-stone-50">
        <div class="px-4 py-4 bg-white border-b border-stone-200">
          <h2 class="text-lg font-semibold text-stone-900">Start new conversation</h2>
          <p class="text-sm text-stone-600 mt-1">Choose which edge to use</p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Native Handles */}
          {nativeEdges.length > 0 && (
            <div>
              <h3 class="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Your Handles</h3>
              {nativeEdges.map((edge) => (
                <div key={edge.id} onClick={() => setSelectedEdge(`edge:${edge.id}`)}>
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
          )}

          {/* Email Aliases */}
          {emailEdges.length > 0 && (
            <div>
              <h3 class="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Email Aliases</h3>
              {emailEdges.map((edge) => (
                <div key={edge.id} onClick={() => setSelectedEdge(`edge:${edge.id}`)}>
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
          )}

          {/* Empty state */}
          {allEdges.length === 0 && (
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-stone-400 mb-3">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <h3 class="text-base font-semibold text-stone-900 mb-1">No identities yet</h3>
              <p class="text-sm text-stone-600 mb-4">Claim a handle or create an alias in the Edges tab</p>
              <button
                class="px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-md transition-colors"
                onClick={() => { activeTab.value = 'edges'; }}
              >
                Go to Edges
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Resolve recipient handle
  async function handleResolve() {
    if (!cleanHandle || cleanHandle.length < 3) {
      setError('Handle must be at least 3 characters');
      return;
    }
    
    setError(null);
    setIsResolving(true);
    
    const result = await resolveHandle(cleanHandle);
    
    // Phase 6: Use edge-based resolution (no identity data)
    if (result.success && result.x25519PublicKey && result.edgeId) {
      setResolvedUser({
        handle: result.handle || cleanHandle,
        fingerprint: result.edgeId,  // Use edgeId as identifier
        publicKey: result.x25519PublicKey,  // Use edge key
        x25519PublicKey: result.x25519PublicKey,
        edgeId: result.edgeId,
      });
    } else {
      setError(result.error || `Handle &${cleanHandle} not found`);
    }
    
    setIsResolving(false);
  }

  // Step 3: Send message using Double Ratchet encryption
  async function handleSend() {
    if (!resolvedUser || !message.trim() || !selectedEdge) return;
    
    setIsSending(true);
    
    try {
      // Get sender edge
      const edgeId = selectedEdge.replace('edge:', '');
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

      // Get the sender handle address (without the & prefix)
      const senderHandle = senderEdge.address.replace(/^&/, '');

      // Use background worker's SEND_NATIVE_MESSAGE which handles Double Ratchet encryption
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
      activeTab.value = 'inbox';
      
      showToast(`Message sent to &${resolvedUser.handle}`);
    } catch (error) {
      console.error('Send error:', error);
      setError('Network error');
    }
    
    setIsSending(false);
  }

  // Compose UI
  return (
    <div class="flex flex-col h-full bg-stone-50">
      <div class="px-4 py-3 bg-white border-b border-stone-200">
        <button
          class="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-2"
          onClick={() => {
            setSelectedEdge(null);
            setResolvedUser(null);
            setRecipientHandle('');
            setMessage('');
            setError(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 class="text-lg font-semibold text-stone-900">New conversation</h2>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {!resolvedUser ? (
          <>
            <div>
              <label class="block text-sm font-medium text-stone-700 mb-2">Recipient handle</label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-medium">&</span>
                  <input
                    type="text"
                    class="w-full pl-7 pr-3 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
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
                  class="px-4 py-2.5 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:bg-stone-300 rounded-lg transition-colors"
                  onClick={handleResolve}
                  disabled={isResolving || cleanHandle.length < 3}
                >
                  {isResolving ? 'Finding...' : 'Find'}
                </button>
              </div>
              {error && <p class="text-xs text-red-600 mt-1.5">{error}</p>}
            </div>
          </>
        ) : (
          <>
            <div class="p-4 bg-white border border-stone-200 rounded-lg">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <div class="text-sm font-semibold text-stone-900">&{resolvedUser.handle}</div>
                  <div class="text-xs font-mono text-stone-500">{resolvedUser.fingerprint.slice(0, 16)}...</div>
                </div>
                <button
                  class="text-xs text-slate-600 hover:text-slate-800 font-medium"
                  onClick={() => {
                    setResolvedUser(null);
                    setError(null);
                  }}
                >
                  Change
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-stone-700 mb-2">Message</label>
              <textarea
                class="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                placeholder="Type your message..."
                rows={6}
                value={message}
                onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              />
            </div>

            {error && <div class="p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">{error}</div>}

            <button
              class="w-full px-6 py-3 text-base font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              onClick={handleSend}
              disabled={isSending || !message.trim()}
            >
              {isSending ? 'Sending...' : 'Send message'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

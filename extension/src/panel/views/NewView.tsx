import { useState, useEffect, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Link2Off, Hash, Mail, User } from 'lucide-react';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges, loadConversations } from '../state';
import { activeTab } from '../App';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/relay/EmptyState';
import { cn } from '@/lib/utils';
import type { Conversation } from '../../types';

interface PreviousRecipient {
  identifier: string; // handle or email
  type: 'native' | 'email';
  displayName?: string;
  lastUsed: string;
}

export function NewView() {
  const [step, setStep] = useState<'selectEdge' | 'selectRecipient' | 'compose'>('selectEdge');
  const [selectedEdge, setSelectedEdge] = useState<{ id: string; type: 'native' | 'email'; address: string } | null>(null);
  const [recipientInput, setRecipientInput] = useState('');
  const [filteredRecipients, setFilteredRecipients] = useState<PreviousRecipient[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allEdges = edges.value;
  const nativeEdges = allEdges.filter(e => e.type === 'native' && e.status === 'active');
  const emailEdges = allEdges.filter(e => e.type === 'email' && e.status === 'active');

  // Load edges when component mounts
  useEffect(() => {
    loadEdges();
  }, []);

  // Focus input when entering recipient selection step
  useEffect(() => {
    if (step === 'selectRecipient' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  // Get previous recipients from existing conversations
  useEffect(() => {
    if (step !== 'selectRecipient' || !recipientInput) {
      setFilteredRecipients([]);
      return;
    }

    const query = recipientInput.toLowerCase().replace(/^&/, '').trim();
    if (query.length < 1) {
      setFilteredRecipients([]);
      return;
    }

    // Extract unique recipients from conversations
    const recipients = new Map<string, PreviousRecipient>();
    
    conversations.value.forEach(conv => {
      // For native conversations
      if (conv.type === 'native' && selectedEdge?.type === 'native') {
        const handle = conv.counterpartyName?.replace(/^&/, '');
        if (handle && handle.toLowerCase().includes(query)) {
          recipients.set(handle, {
            identifier: handle,
            type: 'native',
            displayName: conv.counterpartyName || undefined,
            lastUsed: conv.lastActivityAt || conv.createdAt
          });
        }
      }
      // For email conversations
      if (conv.type === 'email' && selectedEdge?.type === 'email') {
        const email = conv.counterpartyName;
        if (email && email.toLowerCase().includes(query)) {
          recipients.set(email, {
            identifier: email,
            type: 'email',
            displayName: email,
            lastUsed: conv.lastActivityAt || conv.createdAt
          });
        }
      }
    });

    // Sort by last used
    const sorted = Array.from(recipients.values()).sort((a, b) => 
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    );

    setFilteredRecipients(sorted.slice(0, 5)); // Show top 5
  }, [recipientInput, step, selectedEdge, conversations.value]);

  // Reset state
  function resetFlow() {
    setStep('selectEdge');
    setSelectedEdge(null);
    setRecipientInput('');
    setFilteredRecipients([]);
    setError(null);
  }

  // Step 1: Select edge
  function handleEdgeSelect(edgeId: string, edgeType: 'native' | 'email', address: string) {
    const edge = allEdges.find(e => e.id === edgeId);
    if (!edge) return;

    setSelectedEdge({ id: edgeId, type: edgeType, address });
    setStep('selectRecipient');
  }

  // Step 2: Handle recipient selection/input
  async function handleRecipientSubmit(recipientIdentifier?: string) {
    const recipient = recipientIdentifier || recipientInput.trim();
    
    if (!recipient) {
      setError('Please enter a recipient');
      return;
    }

    if (!selectedEdge) return;

    setError(null);

    if (selectedEdge.type === 'native') {
      // For native, resolve the handle
      const cleanHandle = recipient.toLowerCase().replace(/^&/, '').trim();
      
      if (cleanHandle.length < 3) {
        setError('Handle must be at least 3 characters');
        return;
      }

      setIsResolving(true);
      const result = await resolveHandle(cleanHandle);
      setIsResolving(false);

      if (!result.success || !result.x25519PublicKey || !result.edgeId) {
        setError(result.error || `Handle &${cleanHandle} not found`);
        return;
      }

      // Create local conversation immediately
      createLocalConversation({
        type: 'native',
        counterpartyName: `&${cleanHandle}`,
        counterpartyIdentifier: result.edgeId,
        counterpartyPublicKey: result.x25519PublicKey,
        senderEdgeId: selectedEdge.id,
      });

    } else if (selectedEdge.type === 'email') {
      // For email, validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipient)) {
        setError('Please enter a valid email address');
        return;
      }

      // Create local conversation immediately
      createLocalConversation({
        type: 'email',
        counterpartyName: recipient,
        counterpartyIdentifier: recipient,
        senderEdgeId: selectedEdge.id,
      });
    }
  }

  // Create a local conversation and switch to compose mode
  function createLocalConversation(params: {
    type: 'native' | 'email';
    counterpartyName: string;
    counterpartyIdentifier: string;
    counterpartyPublicKey?: string;
    senderEdgeId: string;
  }) {
    // Check if conversation already exists
    const existingConv = conversations.value.find(c => 
      c.type === params.type && 
      c.counterpartyName === params.counterpartyName &&
      c.myEdgeId === params.senderEdgeId
    );

    if (existingConv) {
      // Navigate to existing conversation
      selectedConversationId.value = existingConv.id;
      activeTab.value = 'inbox';
      showToast('Conversation already exists');
      return;
    }

    // Create new local conversation with temporary ID
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newConversation: Conversation = {
      id: tempId,
      type: params.type,
      securityLevel: params.type === 'native' ? 'e2ee' : 'gateway_secured',
      participants: [params.counterpartyIdentifier],
      counterpartyName: params.counterpartyName,
      lastMessagePreview: '',
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      unreadCount: 0,
      myEdgeId: params.senderEdgeId,
      counterpartyEdgeId: params.counterpartyIdentifier,
      counterpartyX25519PublicKey: params.counterpartyPublicKey,
    };

    // Add to conversations list
    conversations.value = [newConversation, ...conversations.value];
    
    // Navigate to the conversation
    selectedConversationId.value = tempId;
    activeTab.value = 'inbox';
  }

  // Step 1: Select Edge
  if (step === 'selectEdge') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Start New Conversation</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Choose which edge to send from</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {(nativeEdges.length > 0 || emailEdges.length > 0) ? (
              <div className="flex flex-col gap-4">
                {/* Native Handles */}
                {nativeEdges.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2 pl-1">Your Handles</h3>
                    <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                      {nativeEdges.map((edge) => {
                        const displayAddress = edge.address.startsWith('&') ? edge.address : `&${edge.address}`;
                        return (
                          <button
                            key={edge.id}
                            onClick={() => handleEdgeSelect(edge.id, 'native', displayAddress)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-[hsl(var(--accent))] transition-colors text-left"
                          >
                            <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center">
                              <Hash className="h-4 w-4 text-[hsl(var(--primary))]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-[hsl(var(--foreground))] block truncate">{displayAddress}</span>
                              {edge.metadata?.displayName && (
                                <span className="text-xs text-[hsl(var(--muted-foreground))]">{edge.metadata.displayName}</span>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Email Aliases */}
                {emailEdges.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2 pl-1">Email Aliases</h3>
                    <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                      {emailEdges.map((edge) => (
                        <button
                          key={edge.id}
                          onClick={() => handleEdgeSelect(edge.id, 'email', edge.address)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-[hsl(var(--accent))] transition-colors text-left"
                        >
                          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--secondary)/0.2)] flex items-center justify-center">
                            <Mail className="h-4 w-4 text-[hsl(var(--secondary-foreground))]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-[hsl(var(--foreground))] block truncate">{edge.address}</span>
                            {edge.label && (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">{edge.label}</span>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<Link2Off className="w-12 h-12" strokeWidth={1.5} />}
                title="No edges yet"
                description="Create a handle or email alias to start conversations"
                action={{
                  label: "Go to Edges",
                  onClick: () => { activeTab.value = 'edges'; },
                  variant: "accent"
                }}
                className="py-16"
              />
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Step 2: Select/Enter Recipient
  if (step === 'selectRecipient') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
          <button
            onClick={resetFlow}
            className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors mb-2 bg-transparent border-none p-0 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Select Recipient</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Sending from: <span className="font-medium text-[hsl(var(--foreground))]">{selectedEdge?.address}</span>
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* Input */}
            <div className="mb-4">
              <div className="relative">
                {selectedEdge?.type === 'native' && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-sm text-[hsl(var(--muted-foreground))]">&</span>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  className={cn(
                    "w-full pr-3 py-3 text-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
                    selectedEdge?.type === 'native' ? 'pl-7' : 'pl-3'
                  )}
                  placeholder={selectedEdge?.type === 'native' ? 'Enter handle (e.g., username)' : 'Enter email address'}
                  value={recipientInput}
                  onInput={(e) => {
                    setRecipientInput((e.target as HTMLInputElement).value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && recipientInput.trim()) {
                      e.preventDefault();
                      handleRecipientSubmit();
                    }
                  }}
                />
              </div>
              {error && (
                <p className="text-xs text-[hsl(var(--destructive))] mt-2">{error}</p>
              )}
            </div>

            {/* Previous Recipients */}
            {filteredRecipients.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2 pl-1">Recent Conversations</h3>
                <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                  {filteredRecipients.map((recipient) => (
                    <button
                      key={recipient.identifier}
                      onClick={() => {
                        setRecipientInput(recipient.identifier);
                        handleRecipientSubmit(recipient.identifier);
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-[hsl(var(--accent))] transition-colors text-left bg-transparent border-none cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                        <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-[hsl(var(--foreground))] block truncate">
                          {recipient.displayName}
                        </span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {recipient.type === 'native' ? 'Native handle' : 'Email'}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action button for manual entry */}
            {recipientInput.trim() && (
              <div className="mt-6">
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => handleRecipientSubmit()}
                  disabled={isResolving}
                >
                  {isResolving ? 'Resolving...' : `Continue with ${selectedEdge?.type === 'native' ? `&${recipientInput.replace(/^&/, '')}` : recipientInput}`}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
}

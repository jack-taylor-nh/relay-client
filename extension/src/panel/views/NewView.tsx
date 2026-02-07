import { useState, useEffect, useRef } from 'preact/hooks';
import { showToast, selectedConversationId, conversations, resolveHandle, edges, sendMessage, loadEdges, loadConversations } from '../state';
import { activeTab } from '../App';
import { ListItemCard } from '../components/ListItemCard';
import { Button } from '../components/Button';
import { getEdgeIcon, getEdgeTypeLabel, EdgeType } from '../utils/edgeHelpers';
import type { Conversation } from '../../types';
import { Box, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import { ChevronLeftIcon, ChevronRightIcon, LinkBreak2Icon } from '@radix-ui/react-icons';

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
      <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box px="4" py="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
          <Heading as="h2" size="5" weight="medium">Start New Conversation</Heading>
          <Text size="2" color="gray" style={{ marginTop: '4px' }}>Choose which edge to send from</Text>
        </Box>

        <Box style={{ flex: 1, overflow: 'auto' }} p="4">
          {(nativeEdges.length > 0 || emailEdges.length > 0) ? (
            <Flex direction="column" gap="4">
              {/* Native Handles */}
              {nativeEdges.length > 0 && (
                <Box>
                  <Heading as="h3" size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '4px' }}>Your Handles</Heading>
                  <Box style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-3)', border: '1px solid var(--gray-6)' }}>
                    {nativeEdges.map((edge) => {
                      const displayAddress = edge.address.startsWith('&') ? edge.address : `&${edge.address}`;
                      return (
                        <ListItemCard
                          key={edge.id}
                          icon={getEdgeIcon('native')}
                          title={displayAddress}
                          tags={edge.metadata?.displayName ? [edge.metadata.displayName] : []}
                          action={{
                            label: 'Select',
                            onClick: () => handleEdgeSelect(edge.id, 'native', displayAddress),
                            variant: 'secondary'
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* Email Aliases */}
              {emailEdges.length > 0 && (
                <Box>
                  <Heading as="h3" size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '4px' }}>Email Aliases</Heading>
                  <Box style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-3)', border: '1px solid var(--gray-6)' }}>
                    {emailEdges.map((edge) => (
                      <ListItemCard
                        key={edge.id}
                        icon={getEdgeIcon('email')}
                        title={edge.address}
                        tags={edge.label ? [edge.label] : []}
                        action={{
                          label: 'Select',
                          onClick: () => handleEdgeSelect(edge.id, 'email', edge.address),
                          variant: 'secondary'
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Flex>
          ) : (
            <Flex direction="column" align="center" justify="center" style={{ padding: '64px 0', textAlign: 'center' }}>
              <LinkBreak2Icon width="48" height="48" color="gray" style={{ opacity: 0.4, marginBottom: '16px' }} />
              <Heading as="h3" size="4" mb="2">No edges yet</Heading>
              <Text size="2" color="gray" mb="5">Create a handle or email alias to start conversations</Text>
              <Button
                variant="primary"
                onClick={() => { activeTab.value = 'edges'; }}
              >
                Go to Edges
              </Button>
            </Flex>
          )}
        </Box>
      </Box>
    );
  }

  // Step 2: Select/Enter Recipient
  if (step === 'selectRecipient') {
    return (
      <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box px="4" py="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
          <button
            class="flex items-center gap-2 text-sm transition-colors mb-2"
            style={{ color: 'var(--gray-11)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            onClick={resetFlow}
          >
            <ChevronLeftIcon width="16" height="16" />
            Back
          </button>
          <Heading as="h2" size="5" weight="medium">Select Recipient</Heading>
          <Text size="2" color="gray" style={{ marginTop: '4px' }}>
            Sending from: <Text weight="medium" style={{ color: 'var(--gray-12)' }}>{selectedEdge?.address}</Text>
          </Text>
        </Box>

        <Box style={{ flex: 1, overflow: 'auto' }} p="4">
          <Box mb="4">
            <div class="relative">
              {selectedEdge?.type === 'native' && (
                <span class="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-sm" style={{ color: 'var(--gray-10)' }}>&</span>
              )}
              <input
                ref={inputRef}
                type="text"
                class={`w-full ${selectedEdge?.type === 'native' ? 'pl-7' : 'pl-3'} pr-3 py-3 text-sm rounded-lg`}
                style={{ 
                  border: '1px solid var(--gray-7)', 
                  backgroundColor: 'var(--gray-2)', 
                  color: 'var(--gray-12)'
                }}
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
              <Text size="1" style={{ color: 'var(--red-11)', marginTop: '8px' }}>{error}</Text>
            )}
          </Box>

          {/* Previous Recipients */}
          {filteredRecipients.length > 0 && (
            <Box>
              <Heading as="h3" size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingLeft: '4px' }}>Recent Conversations</Heading>
              <Box style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-3)', border: '1px solid var(--gray-6)' }}>
                {filteredRecipients.map((recipient) => (
                  <button
                    key={recipient.identifier}
                    onClick={() => {
                      setRecipientInput(recipient.identifier);
                      handleRecipientSubmit(recipient.identifier);
                    }}
                    class="w-full flex items-center gap-3 p-3 transition-colors text-left"
                    style={{ 
                      backgroundColor: 'transparent',
                      borderBottom: '1px solid var(--gray-6)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <span class="text-xl">{recipient.type === 'native' ? '👤' : '✉️'}</span>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="2" weight="medium" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {recipient.displayName}
                      </Text>
                      <Text size="1" color="gray">
                        {recipient.type === 'native' ? 'Native handle' : 'Email'}
                      </Text>
                    </Box>
                    <ChevronRightIcon width="16" height="16" color="gray" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </Box>
            </Box>
          )}

          {/* Action button for manual entry */}
          {recipientInput.trim() && (
            <Box mt="6">
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleRecipientSubmit()}
                disabled={isResolving}
                loading={isResolving}
              >
                {isResolving ? 'Resolving...' : `Continue with ${selectedEdge?.type === 'native' ? `&${recipientInput.replace(/^&/, '')}` : recipientInput}`}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return null;
}

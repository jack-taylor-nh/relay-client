import { edges, createEdge, burnEdge, showToast, loadEdges, sendMessage, edgeTypes } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { ListItemCard } from '../components/ListItemCard';
import { Button } from '../components/Button';
import { Modal, ConfirmModal } from '../components/Modal';
import { AlertCard } from '../components/AlertCard';
import { getEdgeIcon, getEdgeTypeLabel, EdgeType } from '../utils/edgeHelpers';
import { Box, Flex, Heading, Text } from '@radix-ui/themes';
import { PlusIcon } from '@radix-ui/react-icons';

export function EdgesView() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEdgeTypeId, setSelectedEdgeTypeId] = useState<string>('native');
  const [label, setLabel] = useState('');
  const [handleName, setHandleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [disposalModal, setDisposalModal] = useState<{ edgeId: string; edgeType: string; address: string } | null>(null);
  const [manageModal, setManageModal] = useState<{ edgeId: string; edgeType: string; address: string; edge: any } | null>(null);

  const edgeList = edges.value;
  const availableEdgeTypes = edgeTypes.value;
  const selectedEdgeType = availableEdgeTypes.find(t => t.id === selectedEdgeTypeId);

  useEffect(() => {
    loadEdges();
  }, []);

  async function handleCreateHandle() {
    if (!handleName.trim()) {
      showToast('Handle is required');
      return;
    }

    const cleanHandle = handleName.toLowerCase().replace(/^&/, '').trim();
    const handleRegex = /^[a-z][a-z0-9_]{2,23}$/;
    if (!handleRegex.test(cleanHandle)) {
      showToast('Invalid handle format');
      return;
    }

    setLoading(true);
    try {
      const edgeType = selectedEdgeTypeId as 'native' | 'discord';
      const result = await createEdge(
        edgeType,
        undefined, // label not used for handles
        cleanHandle, // customAddress = the handle name
        displayName.trim() || undefined
      );

      if (result.success && result.edge) {
        showToast(`Handle &${cleanHandle} created!`);
        setHandleName('');
        setDisplayName('');
        setShowCreateModal(false);
        // Reload edges to get the new handle
        loadEdges();
      } else {
        showToast(result.error || 'Failed to create handle');
      }
    } catch (error: any) {
      showToast('Failed to create handle');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEdge() {
    // For handle-based types (native, discord), use handleCreateHandle instead
    const edgeType = selectedEdgeTypeId as 'native' | 'email' | 'contact_link' | 'discord';
    const result = await createEdge(edgeType, label || undefined);
    if (result.success) {
      showToast(`Edge created: ${result.edge.address}`);
      setShowCreateModal(false);
      setLabel('');
    } else {
      showToast(`Error: ${result.error}`);
    }
  }

  function openDisposalModal(edgeId: string, edgeType: string, address: string) {
    setDisposalModal({ edgeId, edgeType, address });
  }

  function openManageModal(edgeId: string, edgeType: string, address: string) {
    const rawEdge = edgeList.find(e => e.id === edgeId);
    setManageModal({ edgeId, edgeType, address, edge: rawEdge });
  }

  async function confirmDisposal() {
    if (!disposalModal) return;
    
    const result = await burnEdge(disposalModal.edgeId);
    if (result.success) {
      showToast('Edge disposed permanently');
      loadEdges();
      setDisposalModal(null);
    } else {
      showToast(`Error: ${result.error}`);
    }
  }

  // All edges (native handles + email aliases + discord + contact links + webhooks) come from the edges list
  const allEdges = edgeList.map(e => {
    let mappedType: 'native' | 'email' | 'discord' | 'contact_link' | 'webhook' = 'email';
    if (e.type === 'native') mappedType = 'native';
    else if (e.type === 'discord') mappedType = 'discord';
    else if (e.type === 'contact_link') mappedType = 'contact_link';
    else if (e.type === 'webhook') mappedType = 'webhook';
    
    // For contact links, construct the shareable URL
    let displayAddress = e.address;
    if (e.type === 'contact_link') {
      displayAddress = `link.rlymsg.com/${e.address}`;
    } else if (e.type === 'native' || e.type === 'discord') {
      displayAddress = e.address.startsWith('&') ? e.address : `&${e.address}`;
    } else if (e.type === 'webhook') {
      // For webhooks, display just the edge ID (first 8 chars)
      displayAddress = `Webhook ${e.id.slice(0, 8)}`;
    }
    
    return {
      id: e.id,
      type: mappedType,
      address: displayAddress,
      subtitle: (e.type === 'native' || e.type === 'discord') 
        ? (e.metadata?.displayName || null) 
        : (e.label || null),
      status: e.status,
      messageCount: e.messageCount,
      createdAt: e.createdAt
    };
  });

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex align="center" justify="between" px="4" py="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
        <Heading as="h2" size="5" weight="medium">Edges</Heading>
        <Button
          variant="secondary"
          icon={<PlusIcon width="16" height="16" />}
          onClick={() => setShowCreateModal(true)}
        >
          New Edge
        </Button>
      </Flex>

      <Text size="2" color="gray" px="4" py="3" style={{ backgroundColor: 'var(--gray-2)', borderBottom: '1px solid var(--gray-6)', margin: 0 }}>
        Edges are your communication surfaces. Create handles for native messaging or email aliases.
      </Text>

      <Box style={{ flex: 1, overflow: 'auto' }}>
        {allEdges.length === 0 ? (
          <Flex align="center" justify="center" direction="column" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Text color="gray">No edges yet. Create a handle or email alias to get started!</Text>
          </Flex>
        ) : (
          <Box>
            {allEdges.map(edge => {
              const rawEdge = edgeList.find(e => e.id === edge.id);
              const hasWebhookDocs = edge.type === 'webhook' && rawEdge?.metadata?.webhookUrl && rawEdge?.metadata?.authToken;
              
              return (
                <ListItemCard
                  key={edge.id}
                  icon={getEdgeIcon(edge.type as EdgeType)}
                  title={edge.address}
                  tags={[getEdgeTypeLabel(edge.type as EdgeType)]}
                  action={
                    edge.status === 'active'
                      ? {
                          label: 'Manage',
                          onClick: () => openManageModal(edge.id, edge.type, edge.address),
                          variant: 'secondary'
                        }
                      : undefined
                  }
                />
              );
            })}
          </Box>
        )}
      </Box>

      {/* Create Edge Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Edge"
        size="md"
      >
        <div class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-2">
            {availableEdgeTypes.map(edgeType => (
              <button
                key={edgeType.id}
                onClick={() => setSelectedEdgeTypeId(edgeType.id)}
                class={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all duration-150 ${
                  selectedEdgeTypeId === edgeType.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' 
                    : 'border-[var(--color-border-default)] bg-[var(--color-bg-sunken)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                <span class="text-xl">{getEdgeIcon(edgeType.id as EdgeType)}</span>
                <span class="text-sm font-medium text-[var(--color-text-primary)]">{edgeType.name}</span>
              </button>
            ))}
          </div>

          {selectedEdgeType?.requiresCustomAddress && (selectedEdgeType.id === 'native' || selectedEdgeType.id === 'discord') ? (
            <>
              <div class="flex border border-[var(--color-border-default)] rounded-lg overflow-hidden bg-[var(--color-bg-sunken)]">
                <span class="px-3 py-2.5 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] font-semibold">&</span>
                <input
                  type="text"
                  value={handleName}
                  onInput={(e) => setHandleName((e.target as HTMLInputElement).value)}
                  placeholder="username"
                  pattern="[a-z0-9_\-]{3,32}"
                  maxLength={32}
                  class="flex-1 border-none px-3 py-2.5 text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>

              <input
                type="text"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                placeholder="Display Name (optional)"
                maxLength={50}
                class="w-full px-3 py-2.5 border border-[var(--color-border-default)] rounded-lg text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </>
          ) : (
            <input
              type="text"
              value={label}
              onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
              placeholder="Label (optional)"
              class="w-full px-3 py-2.5 border border-[var(--color-border-default)] rounded-lg text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
          )}

          <div class="flex gap-2 pt-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={loading}
              onClick={(selectedEdgeTypeId === 'native' || selectedEdgeTypeId === 'discord') ? handleCreateHandle : handleCreateEdge}
              disabled={loading}
            >
              {loading ? 'Creating...' : `Create ${selectedEdgeType?.name || 'Edge'}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disposal Confirmation Modal */}
      <ConfirmModal
        isOpen={!!disposalModal}
        onClose={() => setDisposalModal(null)}
        onConfirm={confirmDisposal}
        title="Permanently Dispose Edge"
        confirmLabel="Dispose Edge"
        confirmVariant="danger"
      >
        {disposalModal && (
          <>
            <div class="mb-4 p-4 bg-[var(--color-bg-sunken)] border border-[var(--color-border-default)] rounded-lg">
              <div class="text-sm font-medium text-[var(--color-text-primary)] mb-1">Edge: {disposalModal.address}</div>
              <div class="text-xs text-[var(--color-text-secondary)]">Type: {disposalModal.edgeType}</div>
            </div>

            <div class="mb-4 space-y-2">
              <p class="text-sm text-[var(--color-text-primary)] m-0">This action will:</p>
              <ul class="text-sm text-[var(--color-text-secondary)] space-y-1 ml-5 list-disc">
                <li>Permanently dispose of this edge (cannot be recovered or reused)</li>
                <li>Remove all connection to your Relay identity (untraceable)</li>
                <li>Conversations remain but become read-only</li>
              </ul>
            </div>

            <AlertCard type="error">
              This action is irreversible.
            </AlertCard>
          </>
        )}
      </ConfirmModal>

      {/* Manage Edge Modal */}
      <Modal
        isOpen={!!manageModal}
        onClose={() => setManageModal(null)}
        title="Manage Edge"
        size="md"
      >
        {manageModal && (
          <div class="space-y-4">
            {/* Edge Info */}
            <div class="p-4 bg-[var(--color-bg-sunken)] border border-[var(--color-border-default)] rounded-lg">
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">{getEdgeIcon(manageModal.edgeType as EdgeType)}</span>
                <div class="flex-1">
                  <div class="text-sm font-semibold text-[var(--color-text-primary)]">{manageModal.address}</div>
                  <div class="text-xs text-[var(--color-text-secondary)]">{getEdgeTypeLabel(manageModal.edgeType as EdgeType)}</div>
                </div>
              </div>
              
              {manageModal.edge?.metadata?.displayName && (
                <div class="text-xs text-[var(--color-text-secondary)] mt-2">
                  Display Name: {manageModal.edge.metadata.displayName}
                </div>
              )}
              
              {manageModal.edge?.label && (
                <div class="text-xs text-[var(--color-text-secondary)] mt-2">
                  Label: {manageModal.edge.label}
                </div>
              )}
            </div>

            {/* Actions */}
            <div class="space-y-2">
              <div class="text-sm font-medium text-[var(--color-text-secondary)] mb-2">Actions</div>
              
              {/* Copy Address */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(manageModal.address);
                  showToast('Address copied to clipboard');
                }}
                class="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-hover)] hover:bg-[var(--color-bg-active)] border border-[var(--color-border-default)] transition-colors text-left"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--color-text-secondary)]">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <div class="flex-1">
                  <div class="text-sm font-medium text-[var(--color-text-primary)]">Copy Address</div>
                  <div class="text-xs text-[var(--color-text-secondary)]">Copy edge address to clipboard</div>
                </div>
              </button>

              {/* View Webhook Docs (for webhooks) */}
              {manageModal.edgeType === 'webhook' && manageModal.edge?.metadata?.webhookUrl && (
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      edgeId: manageModal.edgeId,
                      webhookUrl: manageModal.edge.metadata.webhookUrl,
                      authToken: manageModal.edge.metadata.authToken,
                    });
                    chrome.tabs.create({ url: `docs/index.html?${params.toString()}` });
                    setManageModal(null);
                  }}
                  class="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-hover)] hover:bg-[var(--color-bg-active)] border border-[var(--color-border-default)] transition-colors text-left"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--color-accent)]">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <div class="flex-1">
                    <div class="text-sm font-medium text-[var(--color-text-primary)]">View Documentation</div>
                    <div class="text-xs text-[var(--color-text-secondary)]">API docs and integration guide</div>
                  </div>
                </button>
              )}

              {/* Dispose Edge */}
              <button
                onClick={() => {
                  setManageModal(null);
                  setDisposalModal({ 
                    edgeId: manageModal.edgeId, 
                    edgeType: manageModal.edgeType, 
                    address: manageModal.address 
                  });
                }}
                class="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--color-error-subtle)] hover:opacity-90 border border-[var(--color-error)] transition-all text-left"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--color-error)]">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                <div class="flex-1">
                  <div class="text-sm font-medium text-[var(--color-error)]">Dispose Edge</div>
                  <div class="text-xs text-[var(--color-text-secondary)]">Permanently delete this edge</div>
                </div>
              </button>
            </div>

            <div class="pt-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setManageModal(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Box>
  );
}

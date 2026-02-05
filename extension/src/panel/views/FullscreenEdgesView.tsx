import { edges, createEdge, burnEdge, showToast, loadEdges, edgeTypes } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { EdgeCard } from '../components/EdgeCard';

export function FullscreenEdgesView() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEdgeTypeId, setSelectedEdgeTypeId] = useState<string>('native');
  const [label, setLabel] = useState('');
  const [handleName, setHandleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [disposalModal, setDisposalModal] = useState<{ edgeId: string; edgeType: string; address: string } | null>(null);

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
        undefined,
        cleanHandle,
        displayName.trim() || undefined
      );

      if (result.success && result.edge) {
        showToast(`Handle &${cleanHandle} created!`);
        setHandleName('');
        setDisplayName('');
        setShowCreateModal(false);
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
    <div class="h-full flex flex-col bg-[var(--color-bg-sunken)]">
      {/* Full-width Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
        <div>
          <h2 class="text-xl font-semibold text-[var(--color-text-primary)]">Edges</h2>
          <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Edges are your communication surfaces. Create handles for native messaging or email aliases.
          </p>
        </div>
        <button 
          class="px-5 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-lg shadow-sm hover:shadow-md transition-all duration-150"
          onClick={() => setShowCreateModal(true)}
        >
          + New Edge
        </button>
      </div>

      {/* Grid Layout Content */}
      <div class="flex-1 overflow-y-auto p-6">
        {allEdges.length === 0 ? (
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <svg class="w-16 h-16 text-[var(--color-text-tertiary)] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <h3 class="text-xl font-semibold text-[var(--color-text-primary)] mb-2">No edges yet</h3>
            <p class="text-base text-[var(--color-text-secondary)] mb-6 max-w-md">
              Create a handle or email alias to get started!
            </p>
            <button 
              class="px-6 py-3 text-base font-semibold text-[var(--color-text-inverse)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-lg transition-colors"
              onClick={() => setShowCreateModal(true)}
            >
              Create your first edge
            </button>
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {allEdges.map(edge => {
              const rawEdge = edgeList.find(e => e.id === edge.id);
              return (
                <EdgeCard
                  key={edge.id}
                  id={edge.id}
                  type={edge.type}
                  address={edge.address}
                  subtitle={edge.subtitle}
                  status={edge.status}
                  messageCount={edge.messageCount}
                  createdAt={edge.createdAt}
                  onCopy={() => {
                    navigator.clipboard.writeText(edge.address);
                    showToast('Copied!');
                  }}
                  onDispose={() => openDisposalModal(edge.id, edge.type, edge.address)}
                  onViewDocs={edge.type === 'webhook' && rawEdge?.metadata?.webhookUrl && rawEdge?.metadata?.authToken
                    ? () => {
                        const params = new URLSearchParams({
                          edgeId: edge.id,
                          webhookUrl: rawEdge.metadata.webhookUrl,
                          authToken: rawEdge.metadata.authToken,
                        });
                        chrome.tabs.create({ url: `docs/index.html?${params.toString()}` });
                      }
                    : undefined
                  }
                  expandable={true}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div 
          class="fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-[1000] backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            class="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-6 max-w-[440px] w-[90%] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="m-0 mb-5 text-lg font-semibold text-[var(--color-text-primary)]">Create New Edge</h3>
            
            <div class="flex flex-col gap-3">
              <label class="text-sm font-medium text-[var(--color-text-secondary)] mb-1 mt-1">Edge Type</label>
              <div class="flex flex-col gap-2 mb-2">
                {availableEdgeTypes.map(edgeType => (
                  <label 
                    key={edgeType.id}
                    class={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-150 ${
                      selectedEdgeTypeId === edgeType.id
                        ? 'border-slate-600 bg-slate-50' 
                        : 'border-[var(--color-border-default)] bg-[var(--color-bg-sunken)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="edgeType"
                      value={edgeType.id}
                      checked={selectedEdgeTypeId === edgeType.id}
                      onChange={() => setSelectedEdgeTypeId(edgeType.id)}
                      class="mr-3 cursor-pointer w-[18px] h-[18px] flex-shrink-0"
                    />
                    <div class="flex-1">
                      <div class={`text-sm font-semibold mb-0.5 ${selectedEdgeTypeId === edgeType.id ? 'text-slate-700' : 'text-[var(--color-text-primary)]'}`}>
                        {edgeType.icon} {edgeType.name}
                      </div>
                      <div class="text-xs text-[var(--color-text-secondary)]">{edgeType.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedEdgeType?.requiresCustomAddress && (selectedEdgeType.id === 'native' || selectedEdgeType.id === 'discord') ? (
                <>
                  <label class="text-sm font-medium text-[var(--color-text-secondary)] mb-1 mt-1">Handle</label>
                  <div class="flex border border-[var(--color-border-default)] rounded-lg overflow-hidden bg-[var(--color-bg-sunken)]">
                    <span class="px-3 py-2.5 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] font-semibold">&</span>
                    <input
                      type="text"
                      value={handleName}
                      onInput={(e) => setHandleName((e.target as HTMLInputElement).value)}
                      placeholder="username"
                      pattern="[a-z0-9_\-]{3,32}"
                      maxLength={32}
                      class="flex-1 border-none px-3 py-2.5 text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)]"
                    />
                  </div>
                  <small class="text-xs text-[var(--color-text-tertiary)]">3-32 characters, lowercase, alphanumeric, _ or -</small>

                  <label class="text-sm font-medium text-[var(--color-text-secondary)] mb-1 mt-4">Display Name (optional)</label>
                  <input
                    type="text"
                    value={displayName}
                    onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                    placeholder="Your Name"
                    maxLength={50}
                    class="w-full px-3 py-2.5 border border-[var(--color-border-default)] rounded-lg text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)]"
                  />
                </>
              ) : (
                <>
                  <label class="text-sm font-medium text-[var(--color-text-secondary)] mb-1 mt-1">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
                    placeholder="e.g., Amazon, Newsletter"
                    class="w-full px-3 py-2.5 border border-[var(--color-border-default)] rounded-lg text-sm bg-[var(--color-bg-sunken)] text-[var(--color-text-primary)]"
                  />
                </>
              )}

              <div class="flex gap-2 mt-5">
                <button 
                  class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-active)] transition-colors duration-150"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={(selectedEdgeTypeId === 'native' || selectedEdgeTypeId === 'discord') ? handleCreateHandle : handleCreateEdge}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : `Create ${selectedEdgeType?.name || 'Edge'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disposal Confirmation Modal */}
      {disposalModal && (
        <div 
          class="fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-[1000] backdrop-blur-sm"
          onClick={() => setDisposalModal(null)}
        >
          <div 
            class="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-6 max-w-[480px] w-[90%] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="m-0 mb-4 text-lg font-semibold text-red-600">Permanently Dispose Edge</h3>
            
            <div class="mb-5 p-4 bg-[var(--color-bg-sunken)] border border-[var(--color-border-default)] rounded-lg">
              <div class="text-sm font-medium text-[var(--color-text-primary)] mb-1">Edge: {disposalModal.address}</div>
              <div class="text-xs text-[var(--color-text-secondary)]">Type: {disposalModal.edgeType}</div>
            </div>

            <div class="mb-5 space-y-2">
              <p class="text-sm text-[var(--color-text-primary)] m-0">This action will:</p>
              <ul class="text-sm text-[var(--color-text-secondary)] space-y-1 ml-5 list-disc">
                <li>Permanently dispose of this edge (cannot be recovered or reused)</li>
                <li>Remove all connection to your Relay identity (untraceable)</li>
                <li>Conversations remain but become read-only</li>
              </ul>
            </div>

            <div class="p-3 bg-red-50 border border-red-200 rounded-lg mb-5">
              <p class="text-sm text-red-700 font-medium m-0">This action is irreversible.</p>
            </div>

            <div class="flex gap-3">
              <button 
                class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-active)] transition-colors duration-150"
                onClick={() => setDisposalModal(null)}
              >
                Cancel
              </button>
              <button 
                class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-[var(--color-text-inverse)] hover:bg-red-700 transition-colors duration-150"
                onClick={confirmDisposal}
              >
                Dispose Edge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

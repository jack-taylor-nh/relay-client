import { edges, createEdge, burnEdge, showToast, loadEdges, sendMessage, edgeTypes } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { EdgeCard } from '../components/EdgeCard';

export function EdgesView() {
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
    <div class="h-full flex flex-col">
      <div class="flex items-center justify-between px-4 py-4 border-b border-stone-200">
        <h2 class="text-lg font-semibold text-stone-900">Edges</h2>
        <button 
          class="px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-md shadow-sm hover:shadow-md transition-all duration-150 transform hover:-translate-y-0.5"
          onClick={() => setShowCreateModal(true)}
        >
          + New Edge
        </button>
      </div>

      <p class="px-4 py-3 text-sm text-stone-600 bg-white border-b border-stone-200 m-0">
        Edges are your communication surfaces. Create handles for native messaging or email aliases.
      </p>

      <div class="flex-1 overflow-y-auto p-4">
        {allEdges.length === 0 ? (
          <div class="text-center py-10 px-5 text-stone-600">
            <p>No edges yet. Create a handle or email alias to get started!</p>
          </div>
        ) : (
          allEdges.map(edge => {
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
          })
        )}
      </div>

      {showCreateModal && (
        <div 
          class="fixed inset-0 bg-black/75 flex items-center justify-center z-[1000] backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            class="bg-white border border-stone-200 rounded-xl p-6 max-w-[440px] w-[90%] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="m-0 mb-5 text-lg font-semibold text-stone-900">Create New Edge</h3>
            
            <div class="flex flex-col gap-3">
              <label class="text-sm font-medium text-stone-600 mb-1 mt-1">Edge Type</label>
              <div class="flex flex-col gap-2 mb-2">
                {availableEdgeTypes.map(edgeType => (
                  <label 
                    key={edgeType.id}
                    class={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all duration-150 ${
                      selectedEdgeTypeId === edgeType.id
                        ? 'border-slate-600 bg-slate-50' 
                        : 'border-stone-200 bg-stone-50 hover:border-slate-400 hover:bg-stone-100'
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
                      <div class={`text-sm font-semibold mb-0.5 ${selectedEdgeTypeId === edgeType.id ? 'text-slate-700' : 'text-stone-900'}`}>
                        {edgeType.icon} {edgeType.name}
                      </div>
                      <div class="text-xs text-stone-600">{edgeType.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedEdgeType?.requiresCustomAddress && (selectedEdgeType.id === 'native' || selectedEdgeType.id === 'discord') ? (
                <>
                  <label class="text-sm font-medium text-stone-600 mb-1 mt-1">Handle</label>
                  <div class="flex border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
                    <span class="px-3 py-2.5 bg-stone-100 text-stone-600 font-semibold">&</span>
                    <input
                      type="text"
                      value={handleName}
                      onInput={(e) => setHandleName((e.target as HTMLInputElement).value)}
                      placeholder="username"
                      pattern="[a-z0-9_\-]{3,32}"
                      maxLength={32}
                      class="flex-1 border-none px-3 py-2.5 text-sm bg-stone-50 text-stone-900"
                    />
                  </div>
                  <small class="text-xs text-stone-400">3-32 characters, lowercase, alphanumeric, _ or -</small>

                  <label class="text-sm font-medium text-stone-600 mb-1 mt-4">Display Name (optional)</label>
                  <input
                    type="text"
                    value={displayName}
                    onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                    placeholder="Your Name"
                    maxLength={50}
                    class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 text-stone-900"
                  />
                </>
              ) : (
                <>
                  <label class="text-sm font-medium text-stone-600 mb-1 mt-1">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
                    placeholder="e.g., Amazon, Newsletter"
                    class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm bg-stone-50 text-stone-900"
                  />
                </>
              )}

              <div class="flex gap-2 mt-5">
                <button 
                  class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-900 hover:bg-stone-200 transition-colors duration-150"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
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
          class="fixed inset-0 bg-black/75 flex items-center justify-center z-[1000] backdrop-blur-sm"
          onClick={() => setDisposalModal(null)}
        >
          <div 
            class="bg-white border border-stone-200 rounded-xl p-6 max-w-[480px] w-[90%] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="m-0 mb-4 text-lg font-semibold text-red-600">Permanently Dispose Edge</h3>
            
            <div class="mb-5 p-4 bg-stone-50 border border-stone-200 rounded-lg">
              <div class="text-sm font-medium text-stone-900 mb-1">Edge: {disposalModal.address}</div>
              <div class="text-xs text-stone-600">Type: {disposalModal.edgeType}</div>
            </div>

            <div class="mb-5 space-y-2">
              <p class="text-sm text-stone-700 m-0">This action will:</p>
              <ul class="text-sm text-stone-600 space-y-1 ml-5 list-disc">
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
                class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-900 hover:bg-stone-200 transition-colors duration-150"
                onClick={() => setDisposalModal(null)}
              >
                Cancel
              </button>
              <button 
                class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors duration-150"
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

import { edges, createEdge, burnEdge, showToast, loadEdges, edgeTypes } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EdgeCard } from '@/components/relay/EdgeCard';
import { Link, Plus, Copy, FileText, Trash2, AtSign, Mail, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to get edge icon
function getEdgeIcon(type: string) {
  switch (type) {
    case 'native':
    case 'discord':
      return <AtSign className="h-5 w-5" />;
    case 'email':
      return <Mail className="h-5 w-5" />;
    case 'contact_link':
      return <Link className="h-5 w-5" />;
    case 'webhook':
      return <Webhook className="h-5 w-5" />;
    default:
      return <AtSign className="h-5 w-5" />;
  }
}

// Helper to get edge type label
function getEdgeTypeLabel(type: string): string {
  switch (type) {
    case 'native': return 'Native Handle';
    case 'email': return 'Email';
    case 'discord': return 'Discord';
    case 'contact_link': return 'Contact Link';
    case 'webhook': return 'Webhook';
    default: return type;
  }
}

export function FullscreenEdgesView() {
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
    <div className="h-full flex flex-col bg-[hsl(var(--background))]">
      {/* Full-width Header */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Edges</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          Edges are your communication surfaces. Create handles for native messaging or email aliases.
        </p>
      </div>

      {/* Centered Content Container */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex justify-center">
          <div className="w-full max-w-4xl">
            {allEdges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Link className="w-16 h-16 text-[hsl(var(--muted-foreground))] mb-4" strokeWidth={1.5} />
                <h3 className="text-xl font-semibold text-[hsl(var(--foreground))] mb-2">No edges yet</h3>
                <p className="text-base text-[hsl(var(--muted-foreground))] mb-6 max-w-md">
                  Create a handle or email alias to get started!
                </p>
                <Button
                  variant="accent"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create your first edge
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* New Edge Card */}
                <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-1">Create New Edge</h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Add a new handle, email alias, or communication surface</p>
                  </div>
                  <Button
                    variant="accent"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Edge
                  </Button>
                </div>

                {/* Edge List */}
                <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
                  {allEdges.map(edge => (
                    <EdgeCard
                      key={edge.id}
                      id={edge.id}
                      type={edge.type}
                      address={edge.address}
                      label={edge.subtitle || undefined}
                      onManage={() => openManageModal(edge.id, edge.type, edge.address)}
                      onCopy={() => {
                        navigator.clipboard.writeText(edge.address);
                        showToast('Copied to clipboard');
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Create Edge Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open: boolean) => setShowCreateModal(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Edge</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              {availableEdgeTypes.map(edgeType => (
                <button
                  key={edgeType.id}
                  onClick={() => setSelectedEdgeTypeId(edgeType.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all duration-150 bg-transparent",
                    selectedEdgeTypeId === edgeType.id
                      ? 'border-[hsl(var(--ring))] bg-[hsl(var(--accent))]' 
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--ring))] hover:bg-[hsl(var(--muted))]'
                  )}
                >
                  <span className="text-[hsl(var(--muted-foreground))]">{getEdgeIcon(edgeType.id)}</span>
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{edgeType.name}</span>
                </button>
              ))}
            </div>

            {selectedEdgeType?.requiresCustomAddress && (selectedEdgeType.id === 'native' || selectedEdgeType.id === 'discord') ? (
              <>
                <div className="flex border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--muted))]">
                  <span className="px-3 py-2.5 bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] font-semibold">&</span>
                  <input
                    type="text"
                    value={handleName}
                    onInput={(e) => setHandleName((e.target as HTMLInputElement).value)}
                    placeholder="username"
                    pattern="[a-z0-9_\-]{3,32}"
                    maxLength={32}
                    className="flex-1 border-none px-3 py-2.5 text-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] focus:outline-none"
                  />
                </div>

                <input
                  type="text"
                  value={displayName}
                  onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                  placeholder="Display Name (optional)"
                  maxLength={50}
                  className="w-full px-3 py-2.5 border border-[hsl(var(--border))] rounded-lg text-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </>
            ) : (
              <input
                type="text"
                value={label}
                onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
                placeholder="Label (optional)"
                className="w-full px-3 py-2.5 border border-[hsl(var(--border))] rounded-lg text-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={loading}
              onClick={(selectedEdgeTypeId === 'native' || selectedEdgeTypeId === 'discord') ? handleCreateHandle : handleCreateEdge}
            >
              {loading ? 'Creating...' : `Create ${selectedEdgeType?.name || 'Edge'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disposal Confirmation Modal */}
      <Dialog open={!!disposalModal} onOpenChange={(open: boolean) => { if (!open) setDisposalModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Dispose Edge</DialogTitle>
          </DialogHeader>
          {disposalModal && (
            <div className="py-4">
              <div className="mb-4 p-4 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg">
                <div className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">Edge: {disposalModal.address}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Type: {disposalModal.edgeType}</div>
              </div>

              <div className="mb-4 space-y-2">
                <p className="text-sm text-[hsl(var(--foreground))] m-0">This action will:</p>
                <ul className="text-sm text-[hsl(var(--muted-foreground))] space-y-1 ml-5 list-disc">
                  <li>Permanently dispose of this edge (cannot be recovered or reused)</li>
                  <li>Remove all connection to your Relay identity (untraceable)</li>
                  <li>Conversations remain but become read-only</li>
                </ul>
              </div>

              <Alert variant="destructive">
                <AlertDescription>This action is irreversible.</AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalModal(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDisposal}>
              Dispose Edge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Edge Modal */}
      <Dialog open={!!manageModal} onOpenChange={(open: boolean) => { if (!open) setManageModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Edge</DialogTitle>
          </DialogHeader>
          {manageModal && (
            <div className="space-y-4 py-4">
              {/* Edge Info */}
              <div className="p-4 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[hsl(var(--muted-foreground))]">{getEdgeIcon(manageModal.edgeType)}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{manageModal.address}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">{getEdgeTypeLabel(manageModal.edgeType)}</div>
                  </div>
                </div>
                
                {manageModal.edge?.metadata?.displayName && (
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                    Display Name: {manageModal.edge.metadata.displayName}
                  </div>
                )}
                
                {manageModal.edge?.label && (
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                    Label: {manageModal.edge.label}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-[hsl(var(--muted-foreground))] mb-2">Actions</div>
                
                {/* Copy Address */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(manageModal.address);
                    showToast('Address copied to clipboard');
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--accent))] hover:bg-[hsl(var(--muted))] border border-[hsl(var(--border))] transition-colors text-left cursor-pointer"
                >
                  <Copy className="h-[18px] w-[18px] text-[hsl(var(--muted-foreground))]" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[hsl(var(--foreground))]">Copy Address</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">Copy edge address to clipboard</div>
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
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--accent))] hover:bg-[hsl(var(--muted))] border border-[hsl(var(--border))] transition-colors text-left cursor-pointer"
                  >
                    <FileText className="h-[18px] w-[18px] text-[hsl(var(--primary))]" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">View Documentation</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">API docs and integration guide</div>
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
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 hover:opacity-90 border border-[hsl(var(--destructive))] transition-all text-left cursor-pointer"
                >
                  <Trash2 className="h-[18px] w-[18px] text-[hsl(var(--destructive))]" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[hsl(var(--destructive))]">Dispose Edge</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">Permanently delete this edge</div>
                  </div>
                </button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setManageModal(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

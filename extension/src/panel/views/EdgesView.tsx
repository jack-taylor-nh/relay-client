import { edges, createEdge, burnEdge, showToast, loadEdges, sendMessage, edgeTypes } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { Plus, Copy, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { EdgeCard, EdgeList } from '@/components/relay/EdgeCard';
import { cn } from '@/lib/utils';
import type { EdgeType } from '../utils/edgeHelpers';
import { getEdgeTypeLabel } from '../utils/edgeHelpers';

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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-[hsl(var(--border))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Edges</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Edge
        </Button>
      </div>

      <p className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] m-0">
        Edges are your communication surfaces. Create handles for native messaging or email aliases.
      </p>

      <ScrollArea className="flex-1">
        {allEdges.length === 0 ? (
          <div className="text-center py-10 px-5 text-[hsl(var(--muted-foreground))]">
            <p>No edges yet. Create a handle or email alias to get started!</p>
          </div>
        ) : (
          <EdgeList>
            {allEdges.map(edge => {
              const rawEdge = edgeList.find(e => e.id === edge.id);
              return (
                <EdgeCard
                  key={edge.id}
                  id={edge.id}
                  type={edge.type}
                  address={edge.address}
                  label={edge.subtitle || undefined}
                  isActive={edge.status === 'active'}
                  onManage={edge.status === 'active' ? () => openManageModal(edge.id, edge.type, edge.address) : undefined}
                  onCopy={(addr) => {
                    navigator.clipboard.writeText(addr);
                    showToast('Address copied!');
                  }}
                />
              );
            })}
          </EdgeList>
        )}
      </ScrollArea>

      {/* Create Edge Dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Edge</DialogTitle>
            <DialogDescription>
              Select an edge type and configure your new communication surface.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {availableEdgeTypes.map(edgeType => (
                <button
                  key={edgeType.id}
                  onClick={() => setSelectedEdgeTypeId(edgeType.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all duration-150",
                    selectedEdgeTypeId === edgeType.id
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--muted))] hover:border-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                  )}
                >
                  <Badge variant="secondary" className="text-xs">
                    {getEdgeTypeLabel(edgeType.id as EdgeType)}
                  </Badge>
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">{edgeType.name}</span>
                </button>
              ))}
            </div>

            {selectedEdgeType?.requiresCustomAddress && (selectedEdgeType.id === 'native' || selectedEdgeType.id === 'discord') ? (
              <>
                <div className="flex items-center border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--muted))]">
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
              onClick={(selectedEdgeTypeId === 'native' || selectedEdgeTypeId === 'discord') ? handleCreateHandle : handleCreateEdge}
              disabled={loading}
            >
              {loading ? 'Creating...' : `Create ${selectedEdgeType?.name || 'Edge'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disposal Confirmation Dialog */}
      <Dialog open={!!disposalModal} onOpenChange={(open: boolean) => !open && setDisposalModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Dispose Edge</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {disposalModal && (
            <div className="space-y-4">
              <div className="p-4 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg">
                <div className="text-sm font-medium text-[hsl(var(--foreground))] mb-1">Edge: {disposalModal.address}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Type: {disposalModal.edgeType}</div>
              </div>

              <div className="space-y-2">
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

      {/* Manage Edge Dialog */}
      <Dialog open={!!manageModal} onOpenChange={(open: boolean) => !open && setManageModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Edge</DialogTitle>
          </DialogHeader>
          
          {manageModal && (
            <div className="space-y-4">
              {/* Edge Info */}
              <div className="p-4 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant="secondary">
                    {getEdgeTypeLabel(manageModal.edgeType as EdgeType)}
                  </Badge>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{manageModal.address}</div>
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
                <Label className="text-sm font-medium">Actions</Label>
                
                {/* Copy Address */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(manageModal.address);
                    showToast('Address copied to clipboard');
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] border border-[hsl(var(--border))] transition-colors text-left"
                >
                  <Copy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
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
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] border border-[hsl(var(--border))] transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
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
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--destructive)/0.1)] hover:bg-[hsl(var(--destructive)/0.2)] border border-[hsl(var(--destructive))] transition-all text-left"
                >
                  <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
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

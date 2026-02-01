import { edges, createEdge, disableEdge, showToast, isLoading, loadEdges } from '../state';
import { useState, useEffect } from 'preact/hooks';

export function EdgesView() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<'email' | 'contact_link'>('email');
  const [label, setLabel] = useState('');

  const edgeList = edges.value;

  // Load edges on mount
  useEffect(() => {
    loadEdges();
  }, []);

  async function handleCreateEdge() {
    if (selectedType === 'email') {
      const result = await createEdge('email', label || undefined);
      if (result.success) {
        showToast(`Email alias created: ${result.edge.address}`);
        setShowCreateModal(false);
        setLabel('');
      } else {
        showToast(`Error: ${result.error}`);
      }
    }
  }

  async function handleDisable(edgeId: string) {
    if (confirm('Disable this edge? Messages sent to it will be rejected.')) {
      const result = await disableEdge(edgeId);
      if (result.success) {
        showToast('Edge disabled');
      } else {
        showToast(`Error: ${result.error}`);
      }
    }
  }

  function getEdgeIcon(type: string) {
    switch (type) {
      case 'email': return '📧';
      case 'contact_link': return '🔗';
      case 'native': return '💬';
      default: return '📎';
    }
  }

  return (
    <div class="edges-view">
      <div class="edges-header">
        <h2>Edges</h2>
        <button class="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
          + New Edge
        </button>
      </div>

      <p class="text-secondary" style={{ marginBottom: 'var(--space-4)' }}>
        Edges are disposable contact surfaces. Create email aliases, contact links, or bridges to other platforms.
      </p>

      {edgeList.length === 0 && (
        <div class="empty-state">
          <p>No edges yet. Create one to start receiving messages!</p>
        </div>
      )}

      <div class="edges-list">
        {edgeList.map((edge) => (
          <div key={edge.id} class={`edge-card ${edge.status !== 'active' ? 'disabled' : ''}`}>
            <div class="edge-icon">{getEdgeIcon(edge.type)}</div>
            <div class="edge-info">
              <div class="edge-address">{edge.address}</div>
              {edge.label && <div class="edge-label">{edge.label}</div>}
              <div class="edge-meta">
                {edge.type} • {edge.messageCount} messages • {edge.status}
              </div>
            </div>
            {edge.status === 'active' && (
              <button 
                class="btn btn-ghost btn-sm"
                onClick={() => handleDisable(edge.id)}
              >
                Disable
              </button>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div class="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Edge</h3>
            
            <div style={{ marginTop: 'var(--space-4)' }}>
              <label class="form-label">Type</label>
              <select 
                class="form-input"
                value={selectedType}
                onChange={(e) => setSelectedType((e.target as HTMLSelectElement).value as 'email' | 'contact_link')}
              >
                <option value="email">Email Alias</option>
                <option value="contact_link">Contact Link (coming soon)</option>
              </select>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <label class="form-label">Label (optional)</label>
              <input
                type="text"
                class="form-input"
                placeholder="e.g., Newsletter signups"
                value={label}
                onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="modal-actions">
              <button 
                class="btn btn-ghost"
                onClick={() => setShowCreateModal(false)}
                disabled={isLoading.value}
              >
                Cancel
              </button>
              <button 
                class="btn btn-primary"
                onClick={handleCreateEdge}
                disabled={isLoading.value || selectedType !== 'email'}
              >
                {isLoading.value ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .edges-view {
          flex: 1;
          padding: var(--space-4);
          overflow-y: auto;
        }

        .edges-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-3);
        }

        .edges-header h2 {
          margin: 0;
          font-size: 20px;
        }

        .edges-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .edge-card {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: all 0.2s;
        }

        .edge-card:hover {
          border-color: var(--color-border-hover);
        }

        .edge-card.disabled {
          opacity: 0.6;
        }

        .edge-icon {
          font-size: 24px;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-sm);
        }

        .edge-info {
          flex: 1;
        }

        .edge-address {
          font-weight: 500;
          color: var(--color-text-primary);
          margin-bottom: var(--space-1);
        }

        .edge-label {
          font-size: 13px;
          color: var(--color-text-secondary);
          margin-bottom: var(--space-1);
        }

        .edge-meta {
          font-size: 12px;
          color: var(--color-text-tertiary);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: var(--color-bg-primary);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          width: 90%;
          max-width: 400px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .modal h3 {
          margin: 0 0 var(--space-4) 0;
        }

        .modal-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
          margin-top: var(--space-5);
        }
      `}</style>
    </div>
  );
}

import { edges, handles, createEdge, disableEdge, showToast, loadEdges } from '../state';
import { useState, useEffect } from 'preact/hooks';
import { api } from '../../lib/api';

type EdgeTab = 'handles' | 'aliases' | 'links';

export function EdgesView() {
  const [activeTab, setActiveTab] = useState<EdgeTab>('handles');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [label, setLabel] = useState('');
  const [handleName, setHandleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const edgeList = edges.value;
  const handleList = handles.value;

  useEffect(() => {
    loadEdges();
    loadHandles();
  }, []);

  async function loadHandles() {
    try {
      const result = await api.getHandles();
      handles.value = result.handles;
    } catch (error) {
      console.error('Failed to load handles:', error);
    }
  }

  async function handleCreateHandle() {
    if (!handleName.trim()) {
      showToast('Handle is required');
      return;
    }

    const handleRegex = /^[a-z0-9_-]{3,32}$/;
    if (!handleRegex.test(handleName)) {
      showToast('Invalid handle format');
      return;
    }

    setLoading(true);
    try {
      const handle = await api.createHandle(handleName.toLowerCase(), displayName.trim() || undefined);
      handles.value = [...handles.value, handle];
      showToast(`Handle @${handle.handle} created!`);
      setHandleName('');
      setDisplayName('');
      setShowCreateModal(false);
    } catch (error: any) {
      showToast(error.message.includes('already taken') ? 'Handle already taken' : 'Failed to create handle');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEdge() {
    const result = await createEdge('email', label || undefined);
    if (result.success) {
      showToast(`Email alias created: ${result.edge.address}`);
      setShowCreateModal(false);
      setLabel('');
    } else {
      showToast(`Error: ${result.error}`);
    }
  }

  async function handleDisable(edgeId: string) {
    if (confirm('Disable this edge?')) {
      const result = await disableEdge(edgeId);
      if (result.success) showToast('Edge disabled');
      else showToast(`Error: ${result.error}`);
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
        <button class="btn-create" onClick={() => setShowCreateModal(true)}>
          + New
        </button>
      </div>

      <p class="edges-description">
        Edges are your communication surfaces. Create handles for native messaging, email aliases, or contact links.
      </p>

      <div class="edge-tabs">
        <button class={`tab ${activeTab === 'handles' ? 'active' : ''}`} onClick={() => setActiveTab('handles')}>
          Handles ({handleList.length})
        </button>
        <button class={`tab ${activeTab === 'aliases' ? 'active' : ''}`} onClick={() => setActiveTab('aliases')}>
          Email ({edgeList.filter(e => e.type === 'email').length})
        </button>
        <button class={`tab ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>
          Links ({edgeList.filter(e => e.type === 'contact_link').length})
        </button>
      </div>

      {activeTab === 'handles' && (
        <div class="edges-content">
          {handleList.length === 0 ? (
            <div class="empty-state">
              <p>No handles yet. Create one for native Relay-to-Relay messaging!</p>
            </div>
          ) : (
            handleList.map(handle => (
              <div key={handle.id} class="edge-card">
                <div class="edge-main">
                  <div class="edge-info">
                    <div class="edge-title">
                      @{handle.handle}
                      <span class="edge-tag">Native</span>
                    </div>
                    {handle.displayName && <div class="edge-subtitle">{handle.displayName}</div>}
                    <div class="edge-meta">
                      Created {new Date(handle.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div class="edge-actions">
                    <button class="btn-action" onClick={() => {
                      navigator.clipboard.writeText(`@${handle.handle}`);
                      showToast('Copied!');
                    }}>
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'aliases' && (
        <div class="edges-content">
          {edgeList.filter(e => e.type === 'email').length === 0 ? (
            <div class="empty-state">
              <p>No email aliases yet. Create one to get a private @rlymsg.com address!</p>
            </div>
          ) : (
            edgeList.filter(e => e.type === 'email').map(edge => (
              <div key={edge.id} class={`edge-card ${edge.status !== 'active' ? 'disabled' : ''}`}>
                <div class="edge-main">
                  <div class="edge-info">
                    <div class="edge-title">
                      {edge.address}
                      <span class="edge-tag email">Email</span>
                      {edge.status !== 'active' && <span class="edge-tag status-disabled">{edge.status}</span>}
                    </div>
                    {edge.label && <div class="edge-subtitle">{edge.label}</div>}
                    <div class="edge-meta">
                      {edge.messageCount} messages
                    </div>
                  </div>
                  {edge.status === 'active' && (
                    <div class="edge-actions">
                      <button class="btn-action" onClick={() => {
                        navigator.clipboard.writeText(edge.address);
                        showToast('Copied!');
                      }}>
                        Copy
                      </button>
                      <button class="btn-action btn-secondary" onClick={() => handleDisable(edge.id)}>
                        Dispose
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'links' && (
        <div class="edges-content">
          {edgeList.filter(e => e.type === 'contact_link').length === 0 ? (
            <div class="empty-state">
              <p>No contact links yet.</p>
            </div>
          ) : (
            edgeList.filter(e => e.type === 'contact_link').map(edge => (
              <div key={edge.id} class={`edge-card ${edge.status !== 'active' ? 'disabled' : ''}`}>
                <div class="edge-icon">{getEdgeIcon(edge.type)}</div>
                <div class="edge-info">
                  <div class="edge-address">{edge.address}</div>
                  {edge.label && <div class="edge-label">{edge.label}</div>}
                  <div class="edge-meta">
                    {edge.messageCount} messages • {edge.status}
                  </div>
                </div>
                {edge.status === 'active' && (
                  <button class="btn-action btn-danger" onClick={() => handleDisable(edge.id)}>
                    Disable
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {showCreateModal && (
        <div class="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New {activeTab === 'handles' ? 'Handle' : activeTab === 'aliases' ? 'Email Alias' : 'Contact Link'}</h3>
            
            {activeTab === 'handles' ? (
              <div class="form">
                <label class="form-label">Handle</label>
                <div class="handle-input">
                  <span class="prefix">@</span>
                  <input
                    type="text"
                    value={handleName}
                    onInput={(e) => setHandleName((e.target as HTMLInputElement).value)}
                    placeholder="username"
                    pattern="[a-z0-9_-]{3,32}"
                    maxLength={32}
                  />
                </div>
                <small>3-32 characters, lowercase, alphanumeric, _ or -</small>

                <label class="form-label" style="margin-top: 16px;">Display Name (optional)</label>
                <input
                  type="text"
                  class="form-input"
                  value={displayName}
                  onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                  placeholder="Your Name"
                  maxLength={50}
                />

                <div class="modal-actions">
                  <button class="btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button class="btn-primary" onClick={handleCreateHandle} disabled={loading}>
                    {loading ? 'Creating...' : 'Create Handle'}
                  </button>
                </div>
              </div>
            ) : (
              <div class="form">
                <label class="form-label">Label (optional)</label>
                <input
                  type="text"
                  class="form-input"
                  value={label}
                  onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
                  placeholder="e.g., Amazon, Newsletter"
                />

                <div class="modal-actions">
                  <button class="btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button class="btn-primary" onClick={handleCreateEdge}>
                    Create Alias
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .edges-view {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .edges-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .edges-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .btn-create {
          padding: 8px 16px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-create:hover {
          background: var(--primary-hover);
        }

        .edges-description {
          padding: 12px 16px;
          font-size: 13px;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          margin: 0;
        }

        .edge-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          padding: 0 16px;
          background: var(--bg-primary);
        }

        .edge-tabs .tab {
          padding: 12px 16px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .edge-tabs .tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
          font-weight: 500;
        }

        .edges-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .edge-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }

        .edge-card:hover {
          border-color: var(--primary-color);
        }

        .edge-card.disabled {
          opacity: 0.6;
        }

        .edge-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          gap: 16px;
        }

        .edge-info {
          flex: 1;
          min-width: 0;
        }

        .edge-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          word-break: break-all;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .edge-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .edge-meta {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 6px;
        }

        .edge-tag {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .edge-tag {
          background: var(--primary-color);
          color: white;
        }

        .edge-tag.email {
          background: #3b82f6;
          color: white;
        }

        .edge-tag.status-disabled {
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .edge-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .btn-action {
          padding: 8px 14px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .btn-action:hover {
          background: var(--bg-hover);
          border-color: var(--primary-color);
        }

        .btn-action.btn-secondary:hover {
          background: #fee;
          color: #c00;
          border-color: #fcc;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .modal {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 24px;
          max-width: 440px;
          width: 90%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .modal h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .form-input, .handle-input input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .handle-input {
          display: flex;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          overflow: hidden;
          background: var(--bg-secondary);
        }

        .handle-input .prefix {
          padding: 10px 12px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          font-weight: 600;
        }

        .handle-input input {
          border: none;
          flex: 1;
        }

        .modal-actions {
          display: flex;
          gap: 8px;
          margin-top: 20px;
        }

        .btn-primary, .btn-secondary {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-primary {
          background: var(--primary-color);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }

        small {
          font-size: 12px;
          color: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}

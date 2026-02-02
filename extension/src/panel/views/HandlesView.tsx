import { useState } from 'preact/hooks';
import { handles, showToast, sendMessage } from '../state';

export function HandlesView() {
  const [isCreating, setIsCreating] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!newHandle.trim()) {
      showToast('Handle is required');
      return;
    }

    // Validate handle format
    const handleRegex = /^[a-z0-9_\-]{3,32}$/;
    if (!handleRegex.test(newHandle)) {
      showToast('Invalid handle. Use 3-32 lowercase letters, numbers, _ or -');
      return;
    }

    setLoading(true);
    try {
      const result = await sendMessage<{
        success: boolean;
        handle?: any;
        error?: string;
      }>({
        type: 'CREATE_HANDLE',
        payload: {
          handle: newHandle.toLowerCase(),
          displayName: displayName.trim() || undefined,
        },
      });

      if (result.success && result.handle) {
        handles.value = [...handles.value, result.handle];
        showToast(`Handle &${result.handle.handle} created!`);
        
        setNewHandle('');
        setDisplayName('');
        setIsCreating(false);
      } else {
        showToast(result.error || 'Failed to create handle');
      }
    } catch (error: any) {
      showToast('Failed to create handle: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHandles = async () => {
    try {
      const result = await sendMessage<{
        success: boolean;
        handles?: any[];
        error?: string;
      }>({ type: 'GET_HANDLES' });

      if (result.success && result.handles) {
        handles.value = result.handles;
      }
    } catch (error) {
      showToast('Failed to load handles');
    }
  };

  // Load handles on mount
  if (handles.value.length === 0) {
    loadHandles();
  }

  const handleDelete = async (handleId: string, handleName: string) => {
    if (!confirm(`Delete handle &${handleName}? This cannot be undone.`)) {
      return;
    }

    try {
      const result = await sendMessage<{
        success: boolean;
        error?: string;
      }>({
        type: 'DELETE_HANDLE',
        payload: { handleId },
      });

      if (result.success) {
        handles.value = handles.value.filter(h => h.id !== handleId);
        showToast('Handle deleted');
      } else {
        showToast(result.error || 'Failed to delete handle');
      }
    } catch (error: any) {
      showToast('Failed to delete handle');
    }
  };

  return (
    <div className="handles-view">
      <div className="view-header">
        <h2>My Handles</h2>
        <button 
          onClick={() => setIsCreating(!isCreating)}
          className="btn-primary"
        >
          {isCreating ? 'Cancel' : '+ New Handle'}
        </button>
      </div>

      {isCreating && (
        <div className="create-handle-form">
          <div className="form-group">
            <label>Handle</label>
            <div className="handle-input">
              <span className="handle-prefix">&</span>
              <input
                type="text"
                value={newHandle}
                onInput={(e) => setNewHandle((e.target as HTMLInputElement).value)}
                placeholder="username"
                pattern="[a-z0-9_\-]{3,32}"
                maxLength={32}
              />
            </div>
            <small>3-32 characters, lowercase letters, numbers, _ or -</small>
          </div>

          <div className="form-group">
            <label>Display Name (optional)</label>
            <input
              type="text"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              placeholder="Your Name"
              maxLength={50}
            />
          </div>

          <button 
            onClick={handleCreate}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Creating...' : 'Create Handle'}
          </button>
        </div>
      )}

      <div className="handles-list">
        {handles.value.length === 0 && !isCreating && (
          <div className="empty-state">
            <p>No handles yet. Create one to start using native messaging!</p>
            <p className="hint">
              Handles let you send E2EE messages directly to other Relay users
              using &username addresses.
            </p>
          </div>
        )}

        {handles.value.map((handle) => (
          <div key={handle.id} className="handle-card">
            <div className="handle-info">
              <div className="handle-name">&{handle.handle}</div>
              {handle.displayName && (
                <div className="display-name">{handle.displayName}</div>
              )}
              <div className="handle-meta">
                Created {new Date(handle.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="handle-actions">
              <button 
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(`&${handle.handle}`);
                  showToast('Handle copied!');
                }}
              >
                Copy
              </button>
              <button 
                className="btn-danger"
                onClick={() => handleDelete(handle.id, handle.handle)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .handles-view {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .view-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .create-handle-form {
          padding: 16px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .handle-input {
          display: flex;
          align-items: center;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          overflow: hidden;
        }

        .handle-prefix {
          padding: 8px 12px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          font-weight: 600;
        }

        .handle-input input {
          flex: 1;
          border: none;
          padding: 8px 12px;
          font-size: 14px;
        }

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
        }

        .handles-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .empty-state p {
          margin: 8px 0;
        }

        .empty-state .hint {
          font-size: 13px;
          color: var(--text-tertiary);
        }

        .handle-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .handle-info {
          flex: 1;
        }

        .handle-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .display-name {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .handle-meta {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .handle-actions {
          display: flex;
          gap: 8px;
        }

        .btn-primary, .btn-secondary {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
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
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }
      `}</style>
    </div>
  );
}

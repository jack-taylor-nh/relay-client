import { useState } from 'preact/hooks';
import { currentIdentity, aliases, showToast, claimHandle, isLoading, lockWallet } from '../state';
import { formatHandle, type EmailAlias } from '../../types';

function ClaimHandleInline() {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();
  const isValidFormat = /^[a-z][a-z0-9_]{2,23}$/.test(cleanHandle);

  async function handleClaim() {
    if (!isValidFormat) return;
    
    setError(null);
    const result = await claimHandle(cleanHandle);
    
    if (!result.success) {
      setError(result.error || 'Failed to claim handle');
    } else {
      showToast(`Handle &${cleanHandle} claimed!`);
    }
  }

  return (
    <div class="claim-handle-inline">
      <p class="text-secondary">Claim a handle to let others find you on Relay.</p>
      <div class="handle-input-wrapper" style={{ marginTop: 'var(--space-3)' }}>
        <span class="handle-prefix">&amp;</span>
        <input
          type="text"
          class="form-input handle-input"
          placeholder="yourname"
          value={handle}
          onInput={(e) => {
            setHandle((e.target as HTMLInputElement).value);
            setError(null);
          }}
        />
      </div>
      {handle.length > 0 && !isValidFormat && (
        <p class="text-xs hint-error" style={{ marginTop: 'var(--space-1)' }}>
          3-24 chars, starts with letter
        </p>
      )}
      {error && <p class="text-xs hint-error" style={{ marginTop: 'var(--space-1)' }}>{error}</p>}
      <button 
        class="btn btn-primary"
        style={{ marginTop: 'var(--space-3)', width: '100%' }}
        onClick={handleClaim}
        disabled={!isValidFormat || isLoading.value}
      >
        {isLoading.value ? 'Claiming...' : 'Claim Handle'}
      </button>
    </div>
  );
}

function AliasItem({ alias }: { alias: EmailAlias }) {
  const [isExpanded, setIsExpanded] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(alias.address);
    showToast('Alias copied to clipboard');
  }

  function handleToggle() {
    // Toggle alias active state
    const updatedAliases = aliases.value.map(a => 
      a.id === alias.id ? { ...a, isActive: !a.isActive } : a
    );
    aliases.value = updatedAliases;
    showToast(alias.isActive ? 'Alias disabled' : 'Alias enabled');
  }

  function handleDelete() {
    if (confirm(`Delete alias ${alias.address}? This cannot be undone.`)) {
      aliases.value = aliases.value.filter(a => a.id !== alias.id);
      showToast('Alias deleted');
    }
  }

  return (
    <div class={`alias-item card ${isExpanded ? 'expanded' : ''}`}>
      <div class="alias-main" onClick={() => setIsExpanded(!isExpanded)}>
        <div class="alias-info">
          <button 
            class="alias-address"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            title="Click to copy"
          >
            {alias.address}
          </button>
          {alias.label && <span class="alias-label">{alias.label}</span>}
        </div>
        <div class="alias-status-badge">
          <span class={`status-dot ${alias.isActive ? 'active' : 'disabled'}`}></span>
        </div>
      </div>
      
      {isExpanded && (
        <div class="alias-details">
          <div class="alias-stats">
            <span class="stat">
              <strong>{alias.messageCount}</strong> messages
            </span>
            <span class="stat">
              Created {new Date(alias.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div class="alias-actions">
            <button class="btn btn-secondary btn-sm" onClick={handleToggle}>
              {alias.isActive ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-ghost btn-sm danger-text" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WalletView() {
  const identity = currentIdentity.value;
  const aliasList = aliases.value;

  async function handleLockNow() {
    await lockWallet();
    showToast('Wallet locked');
  }

  return (
    <div class="wallet-view">
      {/* Identity Section */}
      <section class="wallet-section">
        <h2 class="section-title">Identity</h2>
        
        <div class="card">
          {identity?.handle ? (
            <div class="identity-row">
              <div>
                <div class="identity-label">Your handle</div>
                <button 
                  class="handle-chip large"
                  onClick={() => {
                    navigator.clipboard.writeText(formatHandle(identity.handle!));
                    showToast('Handle copied');
                  }}
                >
                  {formatHandle(identity.handle)}
                </button>
              </div>
              <div class="identity-meta">
                <span class="text-xs text-tertiary">
                  Fingerprint: {identity.id.slice(0, 12)}...
                </span>
              </div>
            </div>
          ) : (
            <ClaimHandleInline />
          )}
        </div>
      </section>

      {/* Backup Section */}
      <section class="wallet-section">
        <h2 class="section-title">Backup</h2>
        
        <div class="card warning-card">
          <div class="warning-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div class="warning-content">
            <h4>Back up your wallet</h4>
            <p>If you lose access to this browser, you'll lose your identity and messages.</p>
            <button class="btn btn-secondary" onClick={() => showToast('Backup export coming soon')}>
              Export backup
            </button>
          </div>
        </div>
      </section>

      {/* Aliases Section */}
      <section class="wallet-section">
        <div class="section-header">
          <h2 class="section-title">Email aliases</h2>
          <span class="section-count">{aliasList.length}</span>
        </div>
        
        {aliasList.length > 0 ? (
          <div class="alias-list">
            {aliasList.map((alias) => (
              <AliasItem key={alias.id} alias={alias} />
            ))}
          </div>
        ) : (
          <div class="empty-state compact">
            <p>No aliases created yet</p>
          </div>
        )}
      </section>

      {/* Security Section */}
      <section class="wallet-section">
        <h2 class="section-title">Security</h2>
        
        <div class="settings-list">
          <button class="settings-item" onClick={() => showToast('Passphrase change coming soon')}>
            <span>Change passphrase</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button class="settings-item" onClick={() => showToast('Timer settings coming soon')}>
            <span>Auto-lock timer</span>
            <span class="settings-value">5 minutes</span>
          </button>
          <button class="settings-item danger" onClick={handleLockNow}>
            <span>Lock now</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </button>
        </div>
      </section>

      <style>{`
        .wallet-view {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
        }
        
        .wallet-section {
          margin-bottom: var(--space-6);
        }
        
        .section-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }
        
        .section-title {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--space-3);
        }
        
        .section-header .section-title {
          margin-bottom: 0;
        }
        
        .section-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background-color: var(--color-bg-hover);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-full);
        }
        
        .identity-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .identity-label {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-1);
        }
        
        .handle-chip.large {
          font-size: var(--text-sm);
          padding: var(--space-2) var(--space-3);
        }
        
        .warning-card {
          display: flex;
          gap: var(--space-3);
          background-color: #fffbeb;
          border-color: #fcd34d;
        }
        
        .warning-icon {
          flex-shrink: 0;
          color: var(--color-warning);
        }
        
        .warning-icon svg {
          width: 20px;
          height: 20px;
        }
        
        .warning-content h4 {
          font-size: var(--text-sm);
          font-weight: 600;
          margin-bottom: var(--space-1);
        }
        
        .warning-content p {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-3);
        }
        
        .alias-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        
        .alias-item {
          padding: var(--space-3);
        }
        
        .alias-main {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        
        .alias-address {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          color: var(--color-text-primary);
        }
        
        .alias-address:hover {
          color: var(--color-accent);
        }
        
        .alias-label {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background-color: var(--color-bg-hover);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
        }
        
        .alias-meta {
          display: flex;
          gap: var(--space-3);
          font-size: var(--text-xs);
        }
        
        .alias-status {
          font-weight: 500;
        }
        
        .alias-status.active {
          color: var(--color-success);
        }
        
        .alias-status.disabled {
          color: var(--color-text-tertiary);
        }
        
        .alias-count {
          color: var(--color-text-tertiary);
        }
        
        .settings-list {
          display: flex;
          flex-direction: column;
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        
        .settings-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: none;
          border: none;
          border-bottom: 1px solid var(--color-border-subtle);
          cursor: pointer;
          text-align: left;
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          transition: background-color var(--transition-fast);
        }
        
        .settings-item:last-child {
          border-bottom: none;
        }
        
        .settings-item:hover {
          background-color: var(--color-bg-hover);
        }
        
        .settings-item svg {
          width: 16px;
          height: 16px;
          color: var(--color-text-tertiary);
        }
        
        .settings-value {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }
        
        .settings-item.danger {
          color: var(--color-error);
        }
        
        .settings-item.danger svg {
          color: var(--color-error);
        }
        
        .empty-state.compact {
          padding: var(--space-6);
        }
        
        /* Alias Item Expanded Styles */
        .alias-item {
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .alias-item:hover {
          border-color: var(--color-border);
        }
        
        .alias-item .alias-main {
          margin-bottom: 0;
          justify-content: space-between;
        }
        
        .alias-info {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .status-dot.active {
          background-color: var(--color-success);
        }
        
        .status-dot.disabled {
          background-color: var(--color-text-tertiary);
        }
        
        .alias-details {
          margin-top: var(--space-3);
          padding-top: var(--space-3);
          border-top: 1px solid var(--color-border-subtle);
        }
        
        .alias-stats {
          display: flex;
          gap: var(--space-4);
          margin-bottom: var(--space-3);
        }
        
        .alias-stats .stat {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }
        
        .alias-stats .stat strong {
          color: var(--color-text-primary);
        }
        
        .alias-actions {
          display: flex;
          gap: var(--space-2);
        }
        
        .btn-sm {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-xs);
        }
        
        .danger-text {
          color: var(--color-error);
        }
      `}</style>
    </div>
  );
}

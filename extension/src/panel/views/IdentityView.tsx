import { currentIdentity, lockWallet, showToast } from '../state';

export function IdentityView() {
  const identity = currentIdentity.value;

  if (!identity) {
    return (
      <div class="identity-view">
        <div class="empty-state">
          <p>No identity loaded</p>
        </div>
      </div>
    );
  }

  async function handleLock() {
    await lockWallet();
    showToast('Identity locked');
  }

  async function handleCopyPublicKey() {
    if (identity.publicKey) {
      await navigator.clipboard.writeText(identity.publicKey);
      showToast('Public key copied');
    }
  }

  async function handleCopyFingerprint() {
    if (identity.id) {
      await navigator.clipboard.writeText(identity.id);
      showToast('Fingerprint copied');
    }
  }

  return (
    <div class="identity-view">
      <div class="identity-header">
        <h2>Identity</h2>
        <button class="btn-lock" onClick={handleLock}>
          Lock
        </button>
      </div>

      <div class="identity-content">
        <div class="identity-section">
          <h3>Your Identity</h3>
          <p class="section-description">
            Your identity is cryptographically secured. Only you can decrypt your messages.
          </p>

          <div class="identity-card">
            <div class="identity-field">
              <label>Fingerprint</label>
              <div class="field-value">
                <code class="fingerprint">{identity.id}</code>
                <button class="btn-copy" onClick={handleCopyFingerprint} title="Copy">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
              <small>Your unique identity identifier</small>
            </div>

            {identity.publicKey && (
              <div class="identity-field">
                <label>Public Key</label>
                <div class="field-value">
                  <code class="public-key">{identity.publicKey.slice(0, 32)}...</code>
                  <button class="btn-copy" onClick={handleCopyPublicKey} title="Copy">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
                <small>Share this with others to receive encrypted messages</small>
              </div>
            )}

            {identity.handle && (
              <div class="identity-field">
                <label>Primary Handle</label>
                <div class="field-value">
                  <span class="handle">@{identity.handle}</span>
                </div>
                <small>Manage all handles in the Edges tab</small>
              </div>
            )}
          </div>
        </div>

        <div class="identity-section">
          <h3>Security</h3>
          <p class="section-description">
            Your private keys are encrypted and stored locally. Lock your identity when not in use.
          </p>

          <div class="security-info">
            <div class="info-item">
              <div class="info-icon">🔒</div>
              <div>
                <div class="info-title">End-to-End Encrypted</div>
                <div class="info-text">Only you can read your messages</div>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">🔑</div>
              <div>
                <div class="info-title">Zero-Knowledge</div>
                <div class="info-text">Server never sees your keys or plaintext</div>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">🛡️</div>
              <div>
                <div class="info-title">Client-Side Encryption</div>
                <div class="info-text">All encryption happens in your browser</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .identity-view {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
        }

        .identity-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .identity-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .btn-lock {
          padding: 8px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .btn-lock:hover {
          background: var(--bg-hover);
        }

        .identity-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .identity-section {
          margin-bottom: 32px;
        }

        .identity-section h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .section-description {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .identity-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 16px;
        }

        .identity-field {
          margin-bottom: 20px;
        }

        .identity-field:last-child {
          margin-bottom: 0;
        }

        .identity-field label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .field-value {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .field-value code {
          flex: 1;
          font-family: 'SF Mono', Monaco, 'Courier New', monospace;
          font-size: 12px;
          padding: 8px 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }

        .field-value .handle {
          font-size: 15px;
          font-weight: 600;
          color: var(--primary-color);
        }

        .btn-copy {
          padding: 6px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .btn-copy:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .identity-field small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .security-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .info-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .info-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .info-text {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

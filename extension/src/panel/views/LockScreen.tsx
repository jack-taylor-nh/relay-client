import { useState } from 'preact/hooks';
import { unlockIdentity, isLoading, currentIdentity } from '../state';

export function LockScreen() {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    if (!passphrase) return;

    setError(null);
    const result = await unlockIdentity(passphrase);
    
    if (!result.success) {
      setError(result.error || 'Invalid passphrase');
      setPassphrase('');
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  }

  return (
    <div class="lock-screen">
      <div class="lock-content">
        <div class="lock-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="20" width="32" height="24" rx="4" stroke="var(--text-secondary)" stroke-width="2" />
            <path
              d="M16 20V14C16 9.58172 19.5817 6 24 6C28.4183 6 32 9.58172 32 14V20"
              stroke="var(--text-secondary)"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle cx="24" cy="32" r="3" fill="var(--text-secondary)" />
          </svg>
        </div>

        <h1 class="lock-title">Relay is Locked</h1>
        
        {currentIdentity.value?.handle && (
          <p class="lock-handle">&amp;{currentIdentity.value.handle}</p>
        )}

        <div class="form-group">
          <div class="input-wrapper">
            <input
              type={showPassphrase ? 'text' : 'password'}
              class="form-input"
              placeholder="Enter passphrase"
              value={passphrase}
              onInput={(e) => {
                setPassphrase((e.target as HTMLInputElement).value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              type="button"
              class="input-toggle"
              onClick={() => setShowPassphrase(!showPassphrase)}
            >
              {showPassphrase ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {error && <div class="error-message">{error}</div>}

        <button
          class="btn btn-primary btn-lg"
          onClick={handleUnlock}
          disabled={!passphrase || isLoading.value}
        >
          {isLoading.value ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}

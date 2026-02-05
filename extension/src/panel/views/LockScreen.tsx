import { useState } from 'preact/hooks';
import { unlockIdentity, logoutIdentity, isLoading, currentIdentity } from '../state';
import { Button } from '../components/Button';

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function LockScreen() {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleUnlock() {
    if (!passphrase) return;

    setError(null);
    const result = await unlockIdentity(passphrase);
    
    if (!result.success) {
      setError(result.error || 'Invalid passphrase');
      setPassphrase('');
    }
  }

  async function handleLogout() {
    await logoutIdentity();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  }

  return (
    <div class="flex items-center justify-center min-h-screen bg-[var(--color-bg-sunken)] px-4">
      <div class="w-full max-w-sm flex flex-col items-center">
        <div class="mb-6 text-[var(--color-text-tertiary)]">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="20" width="32" height="24" rx="4" stroke="currentColor" stroke-width="2" />
            <path
              d="M16 20V14C16 9.58172 19.5817 6 24 6C28.4183 6 32 9.58172 32 14V20"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle cx="24" cy="32" r="3" fill="currentColor" />
          </svg>
        </div>

        <h1 class="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">Relay is Locked</h1>
        
        {currentIdentity.value?.handle && (
          <p class="text-sm text-[var(--color-accent)] font-medium mb-6">&{currentIdentity.value.handle}</p>
        )}

        <div class="w-full mb-4">
          <div class="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              class="w-full px-4 py-3 pr-12 border border-[var(--color-border-default)] rounded-lg text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
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
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              onClick={() => setShowPassphrase(!showPassphrase)}
            >
              {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {error && <div class="w-full px-4 py-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleUnlock}
          disabled={!passphrase || isLoading.value}
          loading={isLoading.value}
        >
          Unlock
        </Button>

        {/* Logout / Switch Identity */}
        <div class="mt-8 pt-6 border-t border-[var(--color-border-default)] w-full">
          {!showLogoutConfirm ? (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => setShowLogoutConfirm(true)}
            >
              Login to a different identity
            </Button>
          ) : (
            <div class="space-y-2">
              <p class="text-xs text-[var(--color-text-secondary)] text-center mb-3">
                This will clear your current identity from this browser. Make sure you have your backup passphrase.
              </p>
              <div class="flex gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleLogout}
                  className="flex-1"
                >
                  Logout
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

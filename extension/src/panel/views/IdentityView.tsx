import { currentIdentity, lockWallet, showToast } from '../state';

export function IdentityView() {
  const identity = currentIdentity.value;

  if (!identity) {
    return (
      <div class="h-full flex flex-col bg-[var(--color-bg-sunken)]">
        <div class="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
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
    if (identity?.publicKey) {
      await navigator.clipboard.writeText(identity.publicKey);
      showToast('Public key copied');
    }
  }

  async function handleCopyFingerprint() {
    if (identity?.id) {
      await navigator.clipboard.writeText(identity.id);
      showToast('Fingerprint copied');
    }
  }

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg-sunken)]">
      <div class="flex items-center justify-between px-4 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
        <h2 class="text-lg font-semibold text-[var(--color-text-primary)] m-0">Identity</h2>
        <button 
          class="px-4 py-2 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-active)] transition-all duration-200 cursor-pointer"
          onClick={handleLock}
        >
          Lock
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <div class="mb-8">
          <h3 class="text-base font-semibold text-[var(--color-text-primary)] m-0 mb-2">Your Identity</h3>
          <p class="text-sm text-[var(--color-text-secondary)] m-0 mb-4">
            Your identity is cryptographically secured. Only you can decrypt your messages.
          </p>

          <div class="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4">
            <div class="mb-5">
              <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wider">Fingerprint</label>
              <div class="flex items-center gap-2">
                <code class="flex-1 font-mono text-xs px-3 py-2 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text-primary)]">
                  {identity.id}
                </code>
                <button 
                  class="p-1.5 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)] transition-all duration-200 flex-shrink-0"
                  onClick={handleCopyFingerprint}
                  title="Copy"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
              <small class="block mt-1 text-xs text-[var(--color-text-tertiary)]">Your unique identity identifier</small>
            </div>

            {identity.publicKey && (
              <div class="mb-5">
                <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wider">Public Key</label>
                <div class="flex items-center gap-2">
                  <code class="flex-1 font-mono text-xs px-3 py-2 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text-primary)]">
                    {identity.publicKey.slice(0, 32)}...
                  </code>
                  <button 
                    class="p-1.5 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded cursor-pointer text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)] transition-all duration-200 flex-shrink-0"
                    onClick={handleCopyPublicKey}
                    title="Copy"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
                <small class="block mt-1 text-xs text-[var(--color-text-tertiary)]">Share this with others to receive encrypted messages</small>
              </div>
            )}

            {identity.handle && (
              <div class="mb-0">
                <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wider">Primary Handle</label>
                <div class="flex items-center gap-2">
                  <span class="text-base font-semibold text-slate-700">&{identity.handle}</span>
                </div>
                <small class="block mt-1 text-xs text-[var(--color-text-tertiary)]">Manage all handles in the Edges tab</small>
              </div>
            )}
          </div>
        </div>

        {/* Security highlights - same as onboarding complete screen */}
        <div class="w-full bg-gradient-to-br from-slate-50 to-sky-50 border border-slate-200 rounded-xl p-5 mb-6">
          <h3 class="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Your privacy, by design
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex items-start gap-3">
              <span class="text-emerald-600 mt-0.5">✓</span>
              <div>
                <strong class="text-slate-800">Zero-knowledge architecture</strong>
                <p class="text-slate-600 text-xs mt-0.5">We can't read your messages — ever. All encryption happens on your device.</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-emerald-600 mt-0.5">✓</span>
              <div>
                <strong class="text-slate-800">Disposable edges</strong>
                <p class="text-slate-600 text-xs mt-0.5">Every handle and email alias is isolated. Burn one, keep the rest.</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-emerald-600 mt-0.5">✓</span>
              <div>
                <strong class="text-slate-800">You own your identity</strong>
                <p class="text-slate-600 text-xs mt-0.5">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

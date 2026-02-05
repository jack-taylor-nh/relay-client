import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '../components/Button';

export function FullscreenIdentityView() {
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

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg-sunken)]">
      {/* Full-width Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
        <div>
          <h2 class="text-xl font-semibold text-[var(--color-text-primary)] m-0">Identity</h2>
          <p class="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Your cryptographic identity is secured locally on your device.
          </p>
        </div>
        <Button variant="secondary" onClick={handleLock}>
          Lock Identity
        </Button>
      </div>

      {/* Two-column Grid Layout */}
      <div class="flex-1 overflow-y-auto p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Your Identity */}
          <div class="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-xl p-6">
            <h3 class="text-lg font-semibold text-[var(--color-text-primary)] m-0 mb-2">Your Identity</h3>
            <p class="text-sm text-[var(--color-text-secondary)] m-0 mb-5">
              Your identity is cryptographically secured. Only you can decrypt your messages.
            </p>

            <CopyableField
              label="Fingerprint"
              value={identity.id}
              helperText="Your unique identity identifier"
              onCopy={() => showToast('Fingerprint copied')}
              className="mb-5"
            />

            {identity.publicKey && (
              <CopyableField
                label="Public Key"
                value={identity.publicKey}
                helperText="Share this with others to receive encrypted messages"
                onCopy={() => showToast('Public key copied')}
                className="mb-5"
              />
            )}

            {/* Primary Handle */}
            {identity.handle && (
              <div>
                <label class="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5 uppercase tracking-wider">Primary Handle</label>
                <div class="flex items-center gap-2">
                  <span class="text-lg font-semibold text-slate-700">&{identity.handle}</span>
                </div>
                <small class="block mt-1.5 text-xs text-[var(--color-text-tertiary)]">Manage all handles in the Edges tab</small>
              </div>
            )}
          </div>

          {/* Right Column - Privacy by Design */}
          <div class="bg-gradient-to-br from-slate-50 to-sky-50 border border-slate-200 rounded-xl p-6">
            <h3 class="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Your privacy, by design
            </h3>
            
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <strong class="text-base text-slate-800 block mb-1">Zero-knowledge architecture</strong>
                  <p class="text-sm text-slate-600 m-0">We can't read your messages — ever. All encryption happens on your device.</p>
                </div>
              </div>
              
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <strong class="text-base text-slate-800 block mb-1">Disposable edges</strong>
                  <p class="text-sm text-slate-600 m-0">Every handle and email alias is isolated. Burn one, keep the rest.</p>
                </div>
              </div>
              
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg class="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <strong class="text-base text-slate-800 block mb-1">You own your identity</strong>
                  <p class="text-sm text-slate-600 m-0">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</p>
                </div>
              </div>
            </div>

            {/* Security badge */}
            <div class="mt-6 pt-4 border-t border-slate-200">
              <div class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span>End-to-end encrypted with X25519 + AES-GCM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

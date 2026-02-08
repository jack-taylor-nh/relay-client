import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Check, Lock } from 'lucide-react';

export function FullscreenIdentityView() {
  const identity = currentIdentity.value;

  if (!identity) {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--background))]">
        <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
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
    <div className="h-full flex flex-col bg-[hsl(var(--background))]">
      {/* Full-width Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div>
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))] m-0">Identity</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Your cryptographic identity is secured locally on your device.
          </p>
        </div>
        <Button variant="outline" onClick={handleLock}>
          Lock Identity
        </Button>
      </div>

      {/* Two-column Grid Layout */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Your Identity */}
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] m-0 mb-2">Your Identity</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] m-0 mb-5">
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
                  <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5 uppercase tracking-wider">Primary Handle</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-[hsl(var(--foreground))]">&{identity.handle}</span>
                  </div>
                  <small className="block mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">Manage all handles in the Edges tab</small>
                </div>
              )}
            </div>

            {/* Right Column - Privacy by Design */}
            <div className="bg-[hsl(var(--accent))] border border-[hsl(var(--border))] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Your privacy, by design
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <strong className="text-base text-[hsl(var(--foreground))] block mb-1">Zero-knowledge architecture</strong>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] m-0">We can't read your messages — ever. All encryption happens on your device.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <strong className="text-base text-[hsl(var(--foreground))] block mb-1">Disposable edges</strong>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] m-0">Every handle and email alias is isolated. Burn one, keep the rest.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <strong className="text-base text-[hsl(var(--foreground))] block mb-1">You own your identity</strong>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] m-0">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</p>
                  </div>
                </div>
              </div>

              {/* Security badge */}
              <div className="mt-6 pt-4 border-t border-[hsl(var(--border))]">
                <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                  <Lock className="h-4 w-4" />
                  <span>End-to-end encrypted with X25519 + AES-GCM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

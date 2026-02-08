import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Check } from 'lucide-react';

export function IdentityView() {
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
      <div className="flex items-center justify-between px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] m-0">Identity</h2>
        <Button variant="outline" onClick={handleLock}>
          Lock
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="mb-8">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] m-0 mb-2">Your Identity</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] m-0 mb-4">
              Your identity is cryptographically secured. Only you can decrypt your messages.
            </p>

            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
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

              {identity.handle && (
                <div className="mb-0">
                  <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5 uppercase tracking-wider">Primary Handle</label>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-[hsl(var(--foreground))]">&{identity.handle}</span>
                  </div>
                  <small className="block mt-1 text-xs text-[hsl(var(--muted-foreground))]">Manage all handles in the Edges tab</small>
                </div>
              )}
            </div>
          </div>

          {/* Security highlights - same as onboarding complete screen */}
          <div className="w-full bg-[hsl(var(--accent))] border border-[hsl(var(--border))] rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Your privacy, by design
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="text-[hsl(var(--foreground))]">Zero-knowledge architecture</strong>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs mt-0.5">We can't read your messages — ever. All encryption happens on your device.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="text-[hsl(var(--foreground))]">Disposable edges</strong>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs mt-0.5">Every handle and email alias is isolated. Burn one, keep the rest.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="text-[hsl(var(--foreground))]">You own your identity</strong>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs mt-0.5">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

import { useState } from 'preact/hooks';
import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Check, Download, ChevronLeft, Sparkles } from 'lucide-react';
import { ExportIdentityView } from './ExportIdentityView';
import { AssetsView } from './AssetsView';

type SubView = 'main' | 'export' | 'assets';

export function IdentityView() {
  const identity = currentIdentity.value;
  const [subView, setSubView] = useState<SubView>('main');

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

  // Show export subview
  if (subView === 'export') {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--background))]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Button variant="ghost" size="sm" onClick={() => setSubView('main')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] m-0 flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Identity
          </h2>
        </div>
        <ExportIdentityView />
      </div>
    );
  }

  // Show assets subview
  if (subView === 'assets') {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--background))]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Button variant="ghost" size="sm" onClick={() => setSubView('main')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] m-0 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Assets & Entitlements
          </h2>
        </div>
        <AssetsView />
      </div>
    );
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
                    <span className="text-base font-semibold text-[hsl(var(--foreground))]">@{identity.handle}</span>
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

          {/* Assets & Redemption */}
          <div>
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] m-0 mb-3">Assets & Features</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
              Redeem codes for premium features, AI credits, and subscriptions.
            </p>

            <button
              onClick={() => setSubView('assets')}
              className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 text-left hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer w-full mb-4"
            >
              <div className="flex items-start gap-3">
                <div className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg p-2 flex-shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] m-0 mb-1">Manage Assets</h4>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] m-0">
                    Redeem codes and view your features, credits, and subscriptions
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Export Identity */}
          <div>
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] m-0 mb-3">Backup & Export</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
              Create an encrypted backup of your identity to move it to another device or save it securely.
            </p>

            <button
              onClick={() => setSubView('export')}
              className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 text-left hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer w-full"
            >
              <div className="flex items-start gap-3">
                <div className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-lg p-2 flex-shrink-0">
                  <Download className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] m-0 mb-1">Export Identity</h4>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] m-0">
                    Create an encrypted backup of your identity, edges, conversations, and assets
                  </p>
                </div>
              </div>
            </button>

            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3 italic">
              To import an identity, lock Relay and select "Import Identity from Backup" on the login screen.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

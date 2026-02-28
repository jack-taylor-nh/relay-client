import { useState } from 'preact/hooks';
import { unlockIdentity, logoutIdentity, isLoading, currentIdentity } from '../state';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Eye, EyeOff, Upload } from 'lucide-react';
import { ImportIdentityView } from './ImportIdentityView';

export function LockScreen() {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showImport, setShowImport] = useState(false);

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

  // Show import identity view
  if (showImport) {
    return (
      <div className="flex flex-col min-h-screen bg-[hsl(var(--background))]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
            ← Back to Login
          </Button>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] m-0 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Identity
          </h2>
        </div>
        <ImportIdentityView />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-6 text-[hsl(var(--muted-foreground))]">
          <Lock className="h-12 w-12" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))] mb-2">Relay is Locked</h1>
        
        {currentIdentity.value?.handle && (
          <p className="text-sm text-[hsl(var(--primary))] font-medium mb-6">&{currentIdentity.value.handle}</p>
        )}

        <div className="w-full mb-4">
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              className="w-full px-4 py-3 pr-12 border border-[hsl(var(--border))] rounded-lg text-sm bg-[hsl(var(--card))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent"
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              onClick={() => setShowPassphrase(!showPassphrase)}
            >
              {showPassphrase ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="w-full mb-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <Button
          variant="accent"
          className="w-full"
          onClick={handleUnlock}
          disabled={!passphrase || isLoading.value}
        >
          {isLoading.value ? 'Unlocking...' : 'Unlock'}
        </Button>

        {/* Logout / Switch Identity */}
        <div className="mt-8 pt-6 border-t border-[hsl(var(--border))] w-full">
          {!showLogoutConfirm ? (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowLogoutConfirm(true)}
            >
              Login to a different identity
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center mb-3">
                This will clear your current identity from this browser. Make sure you have your backup passphrase.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Import Identity */}
        <div className="mt-4 w-full">
          <Button
            variant="ghost"
            className="w-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            onClick={() => setShowImport(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Identity from Backup
          </Button>
        </div>
      </div>
    </div>
  );
}

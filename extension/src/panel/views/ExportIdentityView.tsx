import { useState } from 'preact/hooks';
import { currentIdentity, showToast, sendMessage } from '../state';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCard } from '../components/AlertCard';
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ExportReason = 'backup' | 'migration' | 'multi-device' | 'other';

export function ExportIdentityView() {
  const identity = currentIdentity.value;

  // State
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includeAssets, setIncludeAssets] = useState(true);
  const [reason, setReason] = useState<ExportReason>('backup');
  const [passphrase, setPassphrase] = useState('');
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSize, setExportSize] = useState<string | null>(null);

  // Estimate export size on mount/option change
  useState(() => {
    estimateSize();
  });

  async function estimateSize() {
    try {
      const result = await sendMessage<{ success: boolean; size?: number; formatted?: string }>({
        type: 'ESTIMATE_EXPORT_SIZE',
        payload: { includeMessages, includeAssets }
      });
      if (result.success && result.formatted) {
        setExportSize(result.formatted);
      }
    } catch (err) {
      console.warn('Failed to estimate export size:', err);
    }
  }

  async function handleExport() {
    if (!passphrase.trim()) {
      showToast('Please enter your passphrase');
      return;
    }

    if (reason === 'multi-device' && !acknowledgedWarning) {
      showToast('Please acknowledge the multi-device warning');
      return;
    }

    setIsExporting(true);
    try {
      const result = await sendMessage<{ success: boolean; error?: string; filename?: string }>({
        type: 'EXPORT_IDENTITY',
        payload: {
          passphrase,
          includeMessages,
          includeAssets,
          reason
        }
      });

      if (result.success) {
        showToast(`Identity exported: ${result.filename}`);
        // Clear passphrase
        setPassphrase('');
        setAcknowledgedWarning(false);
      } else {
        showToast(result.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Failed to export identity');
    } finally {
      setIsExporting(false);
    }
  }

  if (!identity) {
    return (
      <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
        <p>No identity loaded</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-5 space-y-6">
          {/* Export reason */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
              What are you exporting for?
            </label>
            <select
              value={reason}
              onChange={(e) => setReason((e.target as HTMLSelectElement).value as ExportReason)}
              className="w-full h-10 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <option value="backup">Secure backup</option>
              <option value="migration">Migrating to new platform</option>
              <option value="multi-device">Using on multiple devices</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Multi-device warning */}
          {reason === 'multi-device' && (
            <AlertCard type="warning" title="Multi-Device Warning">
              <div className="space-y-3 text-sm">
                <p className="text-[hsl(var(--foreground))]">
                  <strong>Using the same identity on multiple devices simultaneously can cause ratchet conflicts.</strong>
                </p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  Each device maintains its own Double Ratchet state. If both devices receive/send messages out of sync, 
                  the ratchet chains will diverge and messages may fail to decrypt.
                </p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  <strong>Recommended:</strong> Use one device at a time, or export/import frequently to keep states synchronized.
                </p>
                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgedWarning}
                    onChange={(e) => setAcknowledgedWarning((e.target as HTMLInputElement).checked)}
                    className="w-4 h-4 rounded border-[hsl(var(--border)]] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                  />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    I understand the risks of multi-device usage
                  </span>
                </label>
              </div>
            </AlertCard>
          )}

          {/* Export options */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] m-0">Export Options</h3>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMessages}
                onChange={(e) => {
                  setIncludeMessages((e.target as HTMLInputElement).checked);
                  estimateSize();
                }}
                className="w-4 h-4 mt-0.5 rounded border-[hsl(var(--border)]] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
              />
              <div>
                <div className="text-sm font-medium text-[hsl(var(--foreground))]">Include message history</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  Export all cached messages and conversation metadata
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAssets}
                onChange={(e) => {
                  setIncludeAssets((e.target as HTMLInputElement).checked);
                  estimateSize();
                }}
                className="w-4 h-4 mt-0.5 rounded border-[hsl(var(--border)]] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
              />
              <div>
                <div className="text-sm font-medium text-[hsl(var(--foreground))]">Include owned assets</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  Export purchased features and consumable credits
                </div>
              </div>
            </label>

            {exportSize && (
              <div className="pt-2 border-t border-[hsl(var(--border))]">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  Estimated export size: <strong className="text-[hsl(var(--foreground))]">{exportSize}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Security info */}
          <AlertCard type="info">
            <div className="space-y-2 text-sm">
              <p className="text-[hsl(var(--foreground))] m-0">
                <strong>Your export will be encrypted with your passphrase.</strong>
              </p>
              <ul className="text-[hsl(var(--muted-foreground))] space-y-1 ml-4 my-2">
                <li className="list-disc">Uses PBKDF2 (100,000 iterations) + NaCl secretbox</li>
                <li className="list-disc">Contains your identity keys and all edge keys</li>
                <li className="list-disc">Includes Double Ratchet states for all conversations</li>
                <li className="list-disc">Bridge edges (local-llm, relay-ai) are excluded</li>
              </ul>
              <p className="text-[hsl(var(--muted-foreground))] m-0">
                <strong>Keep your export file and passphrase secure.</strong> Anyone with both can access your identity.
              </p>
            </div>
          </AlertCard>

          {/* Passphrase confirmation */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
              Confirm your passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
              placeholder="Enter your identity passphrase"
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5">
              This is the passphrase you created when setting up your identity.
            </p>
          </div>

          {/* Export button */}
          <Button
            onClick={handleExport}
            disabled={isExporting || !passphrase.trim()}
            className="w-full"
            size="lg"
          >
            {isExporting ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export Identity
              </>
            )}
          </Button>
        </div>
    </ScrollArea>
  );
}

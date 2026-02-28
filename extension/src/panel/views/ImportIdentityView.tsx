import { useState } from 'preact/hooks';
import { checkIdentityState, showToast, sendMessage } from '../state';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCard } from '../components/AlertCard';
import { Upload, AlertTriangle, FileWarning, CheckCircle2 } from 'lucide-react';

interface ImportPreview {
  version: number;
  exportedAt: string;
  fingerprint: string;
  platform: string;
  edgeCount: number;
  conversationCount: number;
  messageCount: number;
  hasAssets: boolean;
  assetCount?: number;
}

interface ConflictInfo {
  type: 'fingerprint' | 'none';
  currentFingerprint?: string;
  importFingerprint?: string;
}

type ConflictStrategy = 'abort' | 'replace';

export function ImportIdentityView() {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('abort');
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return;

    // Validate file extension (accept both .relay and .json for compatibility)
    if (!selectedFile.name.endsWith('.relay') && !selectedFile.name.endsWith('.json')) {
      setError('Invalid file type. Please select a .relay or .json export file.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setPreview(null);
    setConflict(null);
  }

  async function handleValidate() {
    if (!file || !passphrase.trim()) {
      showToast('Please select a file and enter your passphrase');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const fileText = await file.text();
      const exportData = JSON.parse(fileText);

      const result = await sendMessage<{
        success: boolean;
        preview?: ImportPreview;
        conflict?: ConflictInfo;
        error?: string;
      }>({
        type: 'VALIDATE_IMPORT',
        payload: { exportData, passphrase }
      });

      if (result.success && result.preview) {
        setPreview(result.preview);
        setConflict(result.conflict || { type: 'none' });
      } else {
        setError(result.error || 'Failed to validate import file');
        setPreview(null);
        setConflict(null);
      }
    } catch (err) {
      console.error('Validation failed:', err);
      setError('Invalid export file or incorrect passphrase');
      setPreview(null);
      setConflict(null);
    } finally {
      setIsValidating(false);
    }
  }

  async function handleImport() {
    if (!file || !passphrase.trim() || !preview) {
      showToast('Please validate the import first');
      return;
    }

    if (conflict?.type === 'fingerprint' && strategy === 'abort') {
      showToast('Cannot import: fingerprint conflict. Choose "Replace" to continue.');
      return;
    }

    setIsImporting(true);
    try {
      const fileText = await file.text();
      const exportData = JSON.parse(fileText);

      const result = await sendMessage<{
        success: boolean;
        error?: string;
      }>({
        type: 'IMPORT_IDENTITY',
        payload: {
          exportData,
          passphrase,
          strategy: conflict?.type === 'fingerprint' ? strategy : 'replace'
        }
      });

      if (result.success) {
        showToast('Identity imported successfully! Please unlock.');
        // Clear state
        setFile(null);
        setPassphrase('');
        setPreview(null);
        setConflict(null);
        setStrategy('abort');
        // Refresh app state (will show locked screen)
        await checkIdentityState();
      } else {
        setError(result.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError('Failed to import identity');
    } finally {
      setIsImporting(false);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer?.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-5 space-y-6">
        {/* Critical warning */}
        <AlertCard type="warning" title="Critical Warning">
          <div className="space-y-2 text-sm">
            <p className="text-[hsl(var(--foreground))] m-0">
              <strong>Importing will replace your current identity.</strong>
              </p>
              <p className="text-[hsl(var(--muted-foreground))] m-0">
                All existing edges, conversations, and keys on this device will be deleted. 
                Make sure you have a backup before proceeding.
              </p>
            </div>
          </AlertCard>

          {/* File upload area */}
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
              Select export file
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging 
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5' 
                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]'
                }
              `}
            >
              <input
                type="file"
                accept=".relay,.json"
                onChange={(e) => handleFileSelect((e.target as HTMLInputElement).files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-[hsl(var(--muted-foreground))]" />
                {file ? (
                  <>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">{file.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      Drop your .relay file here or click to browse
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Only .relay export files are supported
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Passphrase input */}
          {file && (
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                Enter passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
                placeholder="Your identity passphrase"
                className="flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5">
                Use the passphrase from when this identity was originally created.
              </p>
              <Button
                onClick={handleValidate}
                disabled={isValidating || !passphrase.trim()}
                variant="outline"
                className="w-full mt-3"
              >
                {isValidating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Validating...
                  </>
                ) : (
                  'Validate Import'
                )}
              </Button>
            </div>
          )}

          {/* Error display */}
          {error && (
            <AlertCard type="error">
              <p className="text-sm text-[hsl(var(--foreground))] m-0">{error}</p>
            </AlertCard>
          )}

          {/* Preview */}
          {preview && (
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] m-0">
                  Import Preview
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Fingerprint
                  </div>
                  <div className="font-mono text-xs text-[hsl(var(--foreground))] truncate">
                    {preview.fingerprint.slice(0, 16)}...
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Exported
                  </div>
                  <div className="text-xs text-[hsl(var(--foreground))]">
                    {new Date(preview.exportedAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Platform
                  </div>
                  <div className="text-xs text-[hsl(var(--foreground))]">
                    {preview.platform}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Edges
                  </div>
                  <div className="text-xs text-[hsl(var(--foreground))]">
                    {preview.edgeCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Conversations
                  </div>
                  <div className="text-xs text-[hsl(var(--foreground))]">
                    {preview.conversationCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                    Messages
                  </div>
                  <div className="text-xs text-[hsl(var(--foreground))]">
                    {preview.messageCount}
                  </div>
                </div>
                {preview.hasAssets && (
                  <div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-0.5">
                      Assets
                    </div>
                    <div className="text-xs text-[hsl(var(--foreground))]">
                      {preview.assetCount || 0}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conflict resolution */}
          {conflict && conflict.type === 'fingerprint' && (
            <AlertCard type="warning" title="Fingerprint Conflict">
              <div className="space-y-3">
                <p className="text-sm text-[hsl(var(--foreground))] m-0">
                  You already have a different identity on this device.
                </p>
                <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                  <div>
                    <strong>Current:</strong>{' '}
                    <span className="font-mono">{conflict.currentFingerprint?.slice(0, 24)}...</span>
                  </div>
                  <div>
                    <strong>Import:</strong>{' '}
                    <span className="font-mono">{conflict.importFingerprint?.slice(0, 24)}...</span>
                  </div>
                </div>
                <div className="pt-2 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value="abort"
                      checked={strategy === 'abort'}
                      onChange={(e) => setStrategy((e.target as HTMLInputElement).value as ConflictStrategy)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                        Abort import
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        Keep your current identity, cancel import
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      value="replace"
                      checked={strategy === 'replace'}
                      onChange={(e) => setStrategy((e.target as HTMLInputElement).value as ConflictStrategy)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                        Replace current identity
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        Delete current and import new identity (destructive)
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </AlertCard>
          )}

          {/* Import button */}
          {preview && (
            <Button
              onClick={handleImport}
              disabled={isImporting || (conflict?.type === 'fingerprint' && strategy === 'abort')}
              className="w-full"
              size="lg"
              variant={strategy === 'replace' ? 'destructive' : 'default'}
            >
              {isImporting ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {strategy === 'replace' ? 'Replace & Import' : 'Import Identity'}
                </>
              )}
            </Button>
          )}

          {/* Post-import notice */}
          {preview && (
            <AlertCard type="info">
              <p className="text-sm text-[hsl(var(--foreground))] m-0">
                <strong>After import:</strong> Your identity will be locked. You'll need to unlock it with your passphrase to continue.
              </p>
            </AlertCard>
          )}
        </div>
    </ScrollArea>
  );
}

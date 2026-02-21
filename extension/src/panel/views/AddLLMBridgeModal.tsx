import { useState } from 'preact/hooks';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, BrainCircuit, Check } from 'lucide-react';

interface AddLLMBridgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddLLMBridgeModal({ open, onOpenChange, onSuccess }: AddLLMBridgeModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeMetadata, setBridgeMetadata] = useState<{
    name: string;
    description?: string;
    availableModels?: string[];
  } | null>(null);

  async function handleValidate() {
    if (!apiKey.trim()) {
      setError('Please enter a Relay LLM API Key');
      return;
    }

    // Basic ULID format validation
    if (apiKey.length !== 26 || !/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(apiKey)) {
      setError('Invalid API Key format. Should be 26 characters.');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // TODO: Call background to validate the bridge edge ID and fetch metadata
      // For now, simulate validation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock metadata - will be fetched from bridge in real implementation
      setBridgeMetadata({
        name: 'My LLM Bridge',
        description: 'Coding assistant powered by Qwen2.5-Coder',
        availableModels: ['qwen2.5-coder:7b', 'llama3.2:3b'],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to connect to bridge. Verify the API Key is correct.');
      setBridgeMetadata(null);
    } finally {
      setIsValidating(false);
    }
  }

  async function handleCreate() {
    if (!bridgeMetadata) return;

    setIsCreating(true);
    setError(null);

    try {
      console.log('[AddLLMBridgeModal] Creating local-llm edge with:', {
        type: 'local-llm',
        label: customLabel.trim() || bridgeMetadata.name,
        customAddress: apiKey,
        apiKeyLength: apiKey.length,
      });
      
      // Create local-llm edge with the bridge edge ID as customAddress
      const { createEdge } = await import('../state');
      const result = await createEdge(
        'local-llm',
        customLabel.trim() || bridgeMetadata.name,
        apiKey, // customAddress = the bridge edge ID
        undefined
      );

      console.log('[AddLLMBridgeModal] Create edge result:', result);

      if (result.success) {
        console.log('[AddLLMBridgeModal] ✅ Edge created successfully:', result.edge);
        onSuccess();
        onOpenChange(false);
        // Reset form
        setApiKey('');
        setCustomLabel('');
        setBridgeMetadata(null);
      } else {
        console.error('[AddLLMBridgeModal] ❌ Failed to create edge:', result.error);
        setError(result.error || 'Failed to add LLM bridge');
      }
    } catch (err: any) {
      console.error('[AddLLMBridgeModal] ❌ Exception creating edge:', err);
      setError(err.message || 'Failed to add LLM bridge');
    } finally {
      setIsCreating(false);
    }
  }

  function handleClose() {
    if (!isValidating && !isCreating) {
      onOpenChange(false);
      setApiKey('');
      setCustomLabel('');
      setBridgeMetadata(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5" />
            Add LLM Bridge
          </DialogTitle>
          <DialogDescription>
            Connect to a Relay LLM Bridge to chat with locally-hosted AI models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="api-key">Relay LLM API Key</Label>
            <input
              id="api-key"
              type="text"
              placeholder="01KHWEZ5B9NX6D1A8Q6QKTV5PB"
              value={apiKey}
              onInput={(e) => setApiKey((e.target as HTMLInputElement).value.trim())}
              disabled={isValidating || isCreating || !!bridgeMetadata}
              className="flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Get this 26-character key from the bridge operator or your Relay Station desktop app.
            </p>
          </div>

          {/* Validation Error */}
          {error && !bridgeMetadata && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Bridge Metadata (after validation) */}
          {bridgeMetadata && (
            <div className="border rounded-lg p-4 bg-muted space-y-3">
              <div className="flex items-start gap-2">
                <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm mb-1">Connected to {bridgeMetadata.name}</p>
                  {bridgeMetadata.description && (
                    <p className="text-xs text-muted-foreground mb-2">{bridgeMetadata.description}</p>
                  )}
                  {bridgeMetadata.availableModels && bridgeMetadata.availableModels.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Available models:</p>
                      <div className="flex flex-wrap gap-1">
                        {bridgeMetadata.availableModels.slice(0, 3).map(model => (
                          <span key={model} className="text-[10px] px-2 py-0.5 bg-background border rounded">
                            {model}
                          </span>
                        ))}
                        {bridgeMetadata.availableModels.length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 text-muted-foreground">
                            +{bridgeMetadata.availableModels.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional custom label */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="custom-label" className="text-xs">
                  Custom Label (optional)
                </Label>
                <input
                  id="custom-label"
                  type="text"
                  placeholder={bridgeMetadata.name}
                  value={customLabel}
                  onInput={(e) => setCustomLabel((e.target as HTMLInputElement).value)}
                  disabled={isCreating}
                  className="flex h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isValidating || isCreating}
          >
            Cancel
          </Button>

          {!bridgeMetadata ? (
            <Button
              onClick={handleValidate}
              disabled={isValidating || !apiKey.trim()}
            >
              {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCreating ? 'Adding...' : 'Add Bridge'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'preact/hooks';
import { currentIdentity, showToast, sendMessage } from '../state';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AlertCard } from '../components/AlertCard';
import { Sparkles, Check, Gift } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  type: 'feature' | 'consumable' | 'subscription';
  status: 'active' | 'expired' | 'consumed';
  acquiredAt: string;
  expiresAt?: string;
  quantity?: number;
  remainingQuantity?: number;
}

interface AssetState {
  permanent: any[];
  consumable: any[];
}

interface Entitlement {
  feature: string;
  enabled: boolean;
  source: string;
  expiresAt?: string;
}

export function AssetsView() {
  const identity = currentIdentity.value;

  // State
  const [assetState, setAssetState] = useState<AssetState>({ permanent: [], consumable: [] });
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [redemptionCode, setRedemptionCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    setIsLoading(true);
    try {
      const [assetsResult, entitlementsResult] = await Promise.all([
        sendMessage<{ success: boolean; assets?: AssetState }>({ type: 'GET_ASSETS' }),
        sendMessage<{ success: boolean; entitlements?: Entitlement[] }>({ type: 'GET_ENTITLEMENTS' })
      ]);

      if (assetsResult.success && assetsResult.assets) {
        setAssetState(assetsResult.assets);
      }
      if (entitlementsResult.success && entitlementsResult.entitlements) {
        setEntitlements(entitlementsResult.entitlements);
      }
    } catch (err) {
      console.error('Failed to load assets:', err);
      showToast('Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRedeem() {
    if (!redemptionCode.trim()) {
      showToast('Please enter a redemption code');
      return;
    }

    setIsRedeeming(true);
    try {
      const result = await sendMessage<{
        success: boolean;
        asset?: Asset;
        error?: string;
      }>({
        type: 'REDEEM_ASSET_CODE',
        payload: { code: redemptionCode.trim() }
      });

      if (result.success && result.asset) {
        showToast(`Redeemed: ${result.asset.name}`);
        setRedemptionCode('');
        // Reload assets
        await loadAssets();
      } else {
        showToast(result.error || 'Redemption failed');
      }
    } catch (err) {
      console.error('Redemption failed:', err);
      showToast('Failed to redeem code');
    } finally {
      setIsRedeeming(false);
    }
  }

  async function checkEntitlement(feature: string): Promise<boolean> {
    try {
      const result = await sendMessage<{ enabled: boolean }>({
        type: 'CHECK_ENTITLEMENT',
        payload: { feature }
      });
      return result.enabled;
    } catch {
      return false;
    }
  }

  if (!identity) {
    return (
      <div className="h-full flex flex-col bg-[hsl(var(--background))]">
        <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
          <p>No identity loaded</p>
        </div>
      </div>
    );
  }

  // Combine permanent and consumable assets
  const permanentAssets = assetState.permanent || [];
  const consumableAssets = assetState.consumable || [];
  const hasAnyAssets = permanentAssets.length > 0 || consumableAssets.length > 0 || entitlements.length > 0;

  return (
    <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          {/* Redemption card */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] m-0 mb-3 flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Redeem Code
            </h3>
            <div className="flex gap-2">
              <input
                value={redemptionCode}
                onInput={(e) => setRedemptionCode((e.target as HTMLInputElement).value)}
                placeholder="Enter redemption code"
                className="flex-1 h-10 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
              />
              <Button
                onClick={handleRedeem}
                disabled={isRedeeming || !redemptionCode.trim()}
                variant="default"
              >
                {isRedeeming ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  'Redeem'
                )}
              </Button>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              Redeem codes for features, credits, or subscriptions. Asset redemption is identity-blind for privacy.
            </p>
          </div>

          {/* Privacy info */}
          <AlertCard type="info">
            <div className="text-sm">
              <p className="text-[hsl(var(--foreground))] m-0 mb-2">
                <strong>Privacy by design:</strong> Asset redemption uses HMAC receipt keys.
              </p>
              <p className="text-[hsl(var(--muted-foreground))] m-0">
                The server tracks redemptions to prevent double-spending but cannot link purchases to your identity.
              </p>
            </div>
          </AlertCard>

          {/* Active entitlements */}
          {entitlements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Active Entitlements
              </h3>
              <div className="space-y-2">
                {entitlements.map((ent) => (
                  <div
                    key={ent.feature}
                    className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                        {ent.feature}
                      </div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                        Source: {ent.source}
                        {ent.expiresAt && ` • Expires ${new Date(ent.expiresAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <Badge variant={ent.enabled ? 'default' : 'secondary'}>
                      {ent.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permanent assets */}
          {permanentAssets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">
                Permanent Assets
              </h3>
              <div className="space-y-2">
                {permanentAssets.map((asset: any) => (
                  <div
                    key={asset.id}
                    className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {asset.type}
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          Features: {asset.metadata?.features?.join(', ') || 'N/A'}
                        </div>
                      </div>
                      <Badge variant="default">
                        <Check className="h-3 w-3 mr-1" />
                        Owned
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consumable credits */}
          {consumableAssets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">
                Consumable Assets
              </h3>
              <div className="space-y-2">
                {consumableAssets.map((asset: any) => {
                  const balance = asset.balance ?? 0;
                  
                  return (
                    <div
                      key={asset.id}
                      className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {asset.type}
                          </div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                            Balance: {balance}
                          </div>
                        </div>
                        <Badge variant="default">{balance}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}



          {/* Empty state */}
          {!isLoading && !hasAnyAssets && (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 mx-auto text-[hsl(var(--muted-foreground))] mb-4" />
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
                No assets yet
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Redeem a code above to get started
              </p>
            </div>
          )}

          {/* Purchase link */}
          <div className="text-center">
            <Button variant="link" asChild>
              <a href="https://userelay.org/store" target="_blank" rel="noopener noreferrer">
                Purchase more assets →
              </a>
            </Button>
          </div>
        </div>
      </ScrollArea>
  );
}

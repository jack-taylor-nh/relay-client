/**
 * Asset Management Implementation
 * 
 * Handles redemption, entitlement checks, and consumable credit management
 */

import type {
  AssetState,
  PermanentAsset,
  ConsumableAsset,
  AssetUsageRecord
} from './schema.js';
import { createEmptyAssetState } from './schema.js';
import type { IdentityStorage } from '../identity/storage-interface.js';

/**
 * Asset redemption response from server
 */
export interface AssetRedemptionResponse {
  success: boolean;
  asset: {
    id: string;
    type: 'permanent' | 'consumable';
    assetType: string;
    value: number | null;
    metadata: {
      displayName: string;
      description: string;
      features?: string[];
      unit?: string;
    };
  };
  error?: string;
}

/**
 * API client interface for asset redemption
 */
export interface AssetAPIClient {
  redeemCode(
    code: string,
    identityFingerprint: string,
    signature: string
  ): Promise<AssetRedemptionResponse>;
}

/**
 * Asset Manager
 * 
 * Provides high-level asset management operations
 */
export class AssetManager {
  constructor(
    private storage: IdentityStorage,
    private apiClient: AssetAPIClient
  ) {}

  /**
   * Redeem an asset code
   * 
   * Calls server API to validate and redeem, then stores locally
   */
  async redeemCode(
    code: string,
    identityFingerprint: string,
    signature: string
  ): Promise<PermanentAsset | ConsumableAsset> {
    const response = await this.apiClient.redeemCode(
      code,
      identityFingerprint,
      signature
    );

    if (!response.success) {
      throw new Error(response.error || 'Redemption failed');
    }

    // Get current assets
    const currentAssets = await this.storage.getAssets();

    const redeemedAt = new Date().toISOString();

    // Create asset based on type
    if (response.asset.type === 'permanent') {
      const asset: PermanentAsset = {
        id: response.asset.id,
        type: response.asset.assetType,
        grantedAt: redeemedAt,
        redemptionCode: code,
        redeemedAt,
        metadata: {
          displayName: response.asset.metadata.displayName,
          description: response.asset.metadata.description,
          features: response.asset.metadata.features || []
        }
      };

      currentAssets.permanent.push(asset);
      await this.storage.setAssets(currentAssets);

      return asset;
    } else {
      const asset: ConsumableAsset = {
        id: response.asset.id,
        type: response.asset.assetType,
        balance: response.asset.value || 0,
        initialBalance: response.asset.value || 0,
        grantedAt: redeemedAt,
        redemptionCode: code,
        redeemedAt,
        metadata: {
          displayName: response.asset.metadata.displayName,
          description: response.asset.metadata.description,
          unit: response.asset.metadata.unit || 'credits'
        },
        usageHistory: []
      };

      currentAssets.consumable.push(asset);
      await this.storage.setAssets(currentAssets);

      return asset;
    }
  }

  /**
   * Check if user has a specific entitlement
   */
  async checkEntitlement(feature: string): Promise<boolean> {
    const assets = await this.storage.getAssets();

    for (const asset of assets.permanent) {
      if (asset.metadata.features.includes(feature)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get total balance for a consumable asset type
   */
  async getBalance(assetType: string): Promise<number> {
    const assets = await this.storage.getAssets();

    let totalBalance = 0;
    for (const asset of assets.consumable) {
      if (asset.type === assetType) {
        totalBalance += asset.balance;
      }
    }

    return totalBalance;
  }

  /**
   * Consume credits from a consumable asset
   * 
   * @param assetType - Type of asset to consume from
   * @param amount - Amount to consume
   * @param reason - Reason for consumption (for tracking)
   */
  async consumeCredits(
    assetType: string,
    amount: number,
    reason: string
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const assets = await this.storage.getAssets();

    // Find consumable assets of this type with balance
    const consumableAssets = assets.consumable.filter(
      a => a.type === assetType && a.balance > 0
    );

    if (consumableAssets.length === 0) {
      throw new Error(`No ${assetType} credits available`);
    }

    // Calculate total available
    const totalAvailable = consumableAssets.reduce((sum, a) => sum + a.balance, 0);

    if (totalAvailable < amount) {
      throw new Error(
        `Insufficient ${assetType} credits. Need ${amount}, have ${totalAvailable}`
      );
    }

    // Consume from oldest assets first (FIFO)
    consumableAssets.sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));

    let remainingToConsume = amount;
    const timestamp = new Date().toISOString();

    for (const asset of consumableAssets) {
      if (remainingToConsume <= 0) break;

      const consumeFromThis = Math.min(asset.balance, remainingToConsume);

      asset.balance -= consumeFromThis;
      asset.usageHistory.push({
        timestamp,
        amount: consumeFromThis,
        reason
      });

      remainingToConsume -= consumeFromThis;
    }

    // Save updated assets
    await this.storage.setAssets(assets);
  }

  /**
   * Get all assets
   */
  async getAssets(): Promise<AssetState> {
    return await this.storage.getAssets();
  }

  /**
   * Get all permanent entitlements
   */
  async getPermanentAssets(): Promise<PermanentAsset[]> {
    const assets = await this.storage.getAssets();
    return assets.permanent;
  }

  /**
   * Get all consumable assets
   */
  async getConsumableAssets(): Promise<ConsumableAsset[]> {
    const assets = await this.storage.getAssets();
    return assets.consumable;
  }

  /**
   * Get features unlocked by any permanent assets
   */
  async getUnlockedFeatures(): Promise<string[]> {
    const assets = await this.storage.getAssets();

    const features = new Set<string>();
    for (const asset of assets.permanent) {
      for (const feature of asset.metadata.features) {
        features.add(feature);
      }
    }

    return Array.from(features);
  }

  /**
   * Get usage summary for a consumable asset type
   */
  async getUsageSummary(assetType: string): Promise<{
    totalGranted: number;
    totalConsumed: number;
    currentBalance: number;
    assetCount: number;
  }> {
    const assets = await this.storage.getAssets();

    const relevantAssets = assets.consumable.filter(a => a.type === assetType);

    const totalGranted = relevantAssets.reduce((sum, a) => sum + a.initialBalance, 0);
    const currentBalance = relevantAssets.reduce((sum, a) => sum + a.balance, 0);
    const totalConsumed = totalGranted - currentBalance;

    return {
      totalGranted,
      totalConsumed,
      currentBalance,
      assetCount: relevantAssets.length
    };
  }
}

/**
 * Helper functions for asset management
 */

/**
 * Check if sufficient balance exists (without consuming)
 */
export async function hasSufficientBalance(
  storage: IdentityStorage,
  assetType: string,
  requiredAmount: number
): Promise<boolean> {
  const assets = await storage.getAssets();

  const totalBalance = assets.consumable
    .filter(a => a.type === assetType)
    .reduce((sum, a) => sum + a.balance, 0);

  return totalBalance >= requiredAmount;
}

/**
 * Get all features unlocked across all permanent assets
 */
export async function getAllUnlockedFeatures(
  storage: IdentityStorage
): Promise<Set<string>> {
  const assets = await storage.getAssets();

  const features = new Set<string>();
  for (const asset of assets.permanent) {
    for (const feature of asset.metadata.features) {
      features.add(feature);
    }
  }

  return features;
}

/**
 * Format balance for display
 */
export function formatBalance(amount: number, unit: string): string {
  return `${amount.toLocaleString()} ${unit}`;
}

/**
 * Get display name for asset type
 */
export function getAssetTypeDisplayName(assetType: string): string {
  const displayNames: Record<string, string> = {
    'pro_tier': 'Pro Tier',
    'beta_access': 'Beta Access',
    'ai_tokens': 'AI Tokens',
    'api_credits': 'API Credits'
  };

  return displayNames[assetType] || assetType;
}

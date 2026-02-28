/**
 * Asset Management Schema
 * 
 * Defines permanent entitlements and consumable credits
 * for local feature gating without server-side identity linkage
 */

/**
 * Base asset properties
 */
export interface BaseAsset {
  id: string;                // ULID - locally generated
  type: string;              // Asset type identifier
  grantedAt: string;         // ISO-8601 timestamp
  redemptionCode: string;    // Original code (for support)
  redeemedAt: string;        // ISO-8601 timestamp
}

/**
 * Permanent entitlement (e.g., Pro tier, beta access)
 */
export interface PermanentAsset extends BaseAsset {
  metadata: {
    displayName: string;     // User-friendly name
    description: string;     // What this grants
    features: string[];      // Feature flags this unlocks
  };
}

/**
 * Consumable asset (e.g., AI tokens)
 */
export interface ConsumableAsset extends BaseAsset {
  balance: number;           // Remaining amount
  initialBalance: number;    // Original amount
  metadata: {
    displayName: string;
    description: string;
    unit: string;            // 'tokens', 'requests', etc.
  };
  usageHistory: AssetUsageRecord[];
}

/**
 * Usage record for consumable assets
 */
export interface AssetUsageRecord {
  timestamp: string;         // ISO-8601
  amount: number;            // Amount consumed
  reason: string;            // Feature that consumed (e.g., 'ai_message')
}

/**
 * Complete asset state
 */
export interface AssetState {
  permanent: PermanentAsset[];
  consumable: ConsumableAsset[];
}

/**
 * Known permanent asset types
 */
export const PERMANENT_ASSET_TYPES = {
  PRO_TIER: 'pro_tier',
  BETA_ACCESS: 'beta_access',
  FEATURE_UNLOCK: 'feature_unlock'
} as const;

/**
 * Known consumable asset types
 */
export const CONSUMABLE_ASSET_TYPES = {
  AI_TOKENS: 'ai_tokens',
  API_CREDITS: 'api_credits'
} as const;

/**
 * Known feature flags that can be unlocked
 */
export const FEATURE_FLAGS = {
  AI_ACCESS: 'ai_access',
  ADVANCED_SEARCH: 'advanced_search',
  CUSTOM_THEMES: 'custom_themes',
  PRIORITY_SUPPORT: 'priority_support'
} as const;

/**
 * Empty asset state
 */
export function createEmptyAssetState(): AssetState {
  return {
    permanent: [],
    consumable: []
  };
}

/**
 * Check if asset state has any assets
 */
export function hasAnyAssets(state: AssetState): boolean {
  return state.permanent.length > 0 || state.consumable.length > 0;
}

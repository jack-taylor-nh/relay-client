/**
 * Relay Identity Export Format Schema
 * Version 2 - Comprehensive identity portability
 * 
 * This format enables complete identity migration across platforms
 * (extension, mobile, web, desktop) while maintaining E2EE security.
 */

import type { SerializedRatchetState } from '../crypto/ratchet.js';
import type { EdgeType } from '../types/messages.js';
import type { PermanentAsset, ConsumableAsset, AssetUsageRecord } from '../assets/schema.js';

/**
 * Platform identifiers for export source tracking
 */
export type Platform = 'extension' | 'mobile' | 'web' | 'desktop';

/**
 * Edge status states
 */
export type EdgeStatus = 'active' | 'disabled';

/**
 * Export reason for tracking and analytics
 */
export type ExportReason = 'migration' | 'backup' | 'manual';

/**
 * Asset entitlement types
 */
export type AssetType = 'permanent' | 'consumable';

/**
 * Top-level export container with encrypted payload
 */
export interface RelayIdentityExport {
  version: 2;
  type: 'relay-identity-export';
  exportedAt: string; // ISO-8601 timestamp
  exportedFrom: Platform;
  
  // Encrypted payload using NaCl secretbox
  encrypted: {
    nonce: string;      // base64 - 24 bytes
    salt: string;       // base64 - 32 bytes for PBKDF2
    ciphertext: string; // base64 - encrypted IdentityExportPayload
  };
}

/**
 * Decrypted payload containing all identity data
 */
export interface IdentityExportPayload {
  identity: ExportedIdentity;
  edges: ExportedEdge[];
  ratchetStates: ExportedRatchetState[];
  messageCache: ExportedMessageCache;
  assets: ExportedAssets;
  metadata: ExportMetadata;
}

/**
 * Identity core data
 */
export interface ExportedIdentity {
  fingerprint: string;      // 32-char hex
  publicKey: string;        // base64 Ed25519 public key
  encryptedSecretKey: {
    ciphertext: string;     // base64
    nonce: string;          // base64
    salt: string;           // base64
  };
  handle: string | null;    // @username if claimed
  createdAt: string;        // ISO-8601
}

/**
 * Edge (contact surface) with encryption keys
 */
export interface ExportedEdge {
  id: string;               // ULID
  type: EdgeType;
  address: string;          // Handle, email, URL, etc.
  label: string | null;     // User-assigned label
  x25519Keys: {
    publicKey: string;      // base64
    secretKey: string;      // base64
  };
  createdAt: string;        // ISO-8601
  status: EdgeStatus;
}

/**
 * Double Ratchet state for a conversation
 */
export interface ExportedRatchetState {
  conversationId: string;   // ULID
  edgeId: string;           // Which edge owns this conversation
  counterpartyInfo: {
    edgeId: string;         // Counterparty's edge ID
    x25519PublicKey: string; // base64
  };
  state: SerializedRatchetState; // From core/crypto/ratchet.ts
  lastActivityAt: string;   // ISO-8601
}

/**
 * Encrypted message cache
 */
export interface ExportedMessageCache {
  encrypted: boolean;       // Always true
  encryptionKey: string;    // base64 - derived storage key
  messages: Record<string, EncryptedConversationCache>; // conversationId -> cache
}

/**
 * Per-conversation encrypted message cache
 */
export interface EncryptedConversationCache {
  ciphertext: string;       // base64 - encrypted message array
  nonce: string;            // base64
}

/**
 * Asset entitlements (permanent and consumable)
 */
export interface ExportedAssets {
  permanent: PermanentAsset[];
  consumable: ConsumableAsset[];
}

/**
 * Export metadata for tracking and validation
 */
export interface ExportMetadata {
  totalConversations: number;
  totalMessages: number;
  totalEdges: number;
  exportReason: ExportReason | null;
}

/**
 * Legacy v1 backup format (for migration support)
 */
export interface RelayIdentityBackupV1 {
  version: 1;
  type: 'relay-identity-backup';
  createdAt: string;
  identity: {
    fingerprint: string;
    publicKey: string;
  };
  passphrase: string;       // WARNING: Plaintext passphrase!
  instructions: string[];
}

/**
 * Type guard for v1 backup format
 */
export function isV1Backup(data: unknown): data is RelayIdentityBackupV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    data.version === 1 &&
    'type' in data &&
    data.type === 'relay-identity-backup'
  );
}

/**
 * Type guard for v2 export format
 */
export function isV2Export(data: unknown): data is RelayIdentityExport {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    data.version === 2 &&
    'type' in data &&
    data.type === 'relay-identity-export'
  );
}

/**
 * Validate export structure (pre-decryption)
 */
export function validateExportStructure(data: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Export data must be an object');
    return { valid: false, errors };
  }
  
  if (!isV2Export(data) && !isV1Backup(data)) {
    errors.push('Invalid or unsupported export version');
  }
  
  if (isV2Export(data)) {
    if (!data.encrypted || typeof data.encrypted !== 'object') {
      errors.push('Missing encrypted payload');
    } else {
      if (!data.encrypted.nonce) errors.push('Missing encryption nonce');
      if (!data.encrypted.salt) errors.push('Missing encryption salt');
      if (!data.encrypted.ciphertext) errors.push('Missing ciphertext');
    }
    
    if (!data.exportedAt) errors.push('Missing export timestamp');
    if (!data.exportedFrom) errors.push('Missing platform identifier');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

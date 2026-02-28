/**
 * Identity Import Implementation
 * 
 * Handles identity import with decryption and validation
 */

import nacl from 'tweetnacl';
import type {
  RelayIdentityExport,
  RelayIdentityBackupV1,
  IdentityExportPayload
} from './export-schema.js';
import { isV1Backup, isV2Export, validateExportStructure } from './export-schema.js';
import type { IdentityStorage, ExtendedIdentityStorage } from './storage-interface.js';
import { validatePlatformCompatibility, detectPlatform } from './platform.js';

/**
 * Import options
 */
export interface ImportOptions {
  conflictStrategy?: 'abort' | 'replace';  // Default: 'abort'
  verifyOnly?: boolean;                     // Default: false - decrypt but don't write
}

/**
 * Conflict detection result
 */
export interface ConflictReport {
  hasConflict: boolean;
  existingFingerprint?: string;
  importingFingerprint?: string;
  message?: string;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  fingerprint?: string;           // Imported identity fingerprint
  conflicts?: ConflictReport;
  warnings?: string[];
  error?: string;
  metadata?: {
    conversationsImported: number;
    edgesImported: number;
    messagesImported: number;
    assetsImported: number;
  };
}

/**
 * Main import function
 * 
 * @param exportData - Parsed export file
 * @param passphrase - User's passphrase for decryption
 * @param storage - Platform-specific storage implementation
 * @param options - Import options
 */
export async function importIdentity(
  exportData: RelayIdentityExport | RelayIdentityBackupV1 | unknown,
  passphrase: string,
  storage: IdentityStorage,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const {
    conflictStrategy = 'abort',
    verifyOnly = false
  } = options;
  
  // Validate export structure
  const validation = validateExportStructure(exportData);
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid export file: ${validation.errors.join(', ')}`
    };
  }
  
  // Handle v1 backup migration
  if (isV1Backup(exportData)) {
    return await importV1Backup(exportData, storage, { verifyOnly, conflictStrategy });
  }
  
  // Handle v2 export
  if (!isV2Export(exportData)) {
    return {
      success: false,
      error: 'Unsupported export format'
    };
  }
  
  // Check platform compatibility
  const currentPlatform = detectPlatform();
  const compatibility = validatePlatformCompatibility(
    exportData.exportedFrom,
    currentPlatform
  );
  
  const warnings: string[] = [];
  for (const warning of compatibility.warnings) {
    warnings.push(warning.message);
  }
  
  if (!compatibility.compatible) {
    return {
      success: false,
      error: 'Incompatible platform',
      warnings
    };
  }
  
  // Decrypt payload
  let payload: IdentityExportPayload;
  try {
    payload = await decryptPayload(exportData.encrypted, passphrase);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Decryption failed'
    };
  }
  
  // Validate decrypted payload
  const payloadValidation = validatePayload(payload);
  if (!payloadValidation.valid) {
    return {
      success: false,
      error: `Invalid payload: ${payloadValidation.errors.join(', ')}`
    };
  }
  
  // Check for conflicts
  const existingIdentity = await storage.getIdentity();
  if (existingIdentity) {
    const conflicts: ConflictReport = {
      hasConflict: true,
      existingFingerprint: existingIdentity.fingerprint,
      importingFingerprint: payload.identity.fingerprint,
      message: existingIdentity.fingerprint === payload.identity.fingerprint
        ? 'Same identity already exists'
        : 'Different identity already exists'
    };
    
    if (conflictStrategy === 'abort') {
      return {
        success: false,
        conflicts,
        warnings,
        error: 'Identity already exists. Choose "replace" to overwrite.'
      };
    }
    
    // Strategy is 'replace' - will clear existing identity
    warnings.push('Existing identity will be replaced');
  }
  
  // If verify only, stop here
  if (verifyOnly) {
    return {
      success: true,
      fingerprint: payload.identity.fingerprint,
      warnings,
      metadata: {
        conversationsImported: payload.ratchetStates.length,
        edgesImported: payload.edges.length,
        messagesImported: Object.keys(payload.messageCache.messages).length,
        assetsImported: payload.assets.permanent.length + payload.assets.consumable.length
      }
    };
  }
  
  // Clear existing identity if replacing
  if (existingIdentity && conflictStrategy === 'replace') {
    await storage.clearAll();
  }
  
  // Import identity data
  await importPayload(payload, storage);
  
  return {
    success: true,
    fingerprint: payload.identity.fingerprint,
    warnings,
    metadata: {
      conversationsImported: payload.ratchetStates.length,
      edgesImported: payload.edges.length,
      messagesImported: Object.keys(payload.messageCache.messages).length,
      assetsImported: payload.assets.permanent.length + payload.assets.consumable.length
    }
  };
}

/**
 * Decrypt export payload
 * 
 * @param encrypted - Encrypted export payload
 * @param passphrase - User's passphrase
 * @returns Decrypted identity export payload
 */
export async function decryptPayload(
  encrypted: RelayIdentityExport['encrypted'],
  passphrase: string
): Promise<IdentityExportPayload> {
  // Decode base64
  const nonce = base64Decode(encrypted.nonce);
  const salt = base64Decode(encrypted.salt);
  const ciphertext = base64Decode(encrypted.ciphertext);
  
  // Derive key using PBKDF2
  const key = await deriveKey(passphrase, salt);
  
  // Decrypt with NaCl secretbox
  const decrypted = nacl.secretbox.open(ciphertext, nonce, key);
  
  if (!decrypted) {
    throw new Error('Decryption failed. Incorrect passphrase or corrupted file.');
  }
  
  // Parse JSON
  const payloadJson = new TextDecoder().decode(decrypted);
  const payload = JSON.parse(payloadJson) as IdentityExportPayload;
  
  return payload;
}

/**
 * Derive encryption key from passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Validate decrypted payload structure
 */
function validatePayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be an object');
    return { valid: false, errors };
  }
  
  const p = payload as Partial<IdentityExportPayload>;
  
  if (!p.identity) errors.push('Missing identity');
  if (!p.edges) errors.push('Missing edges');
  if (!p.ratchetStates) errors.push('Missing ratchet states');
  if (!p.messageCache) errors.push('Missing message cache');
  if (!p.assets) errors.push('Missing assets');
  if (!p.metadata) errors.push('Missing metadata');
  
  // Validate identity
  if (p.identity) {
    if (!p.identity.fingerprint) errors.push('Missing identity fingerprint');
    if (!p.identity.publicKey) errors.push('Missing identity public key');
    if (!p.identity.encryptedSecretKey) errors.push('Missing encrypted secret key');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Import payload data to storage
 */
async function importPayload(
  payload: IdentityExportPayload,
  storage: IdentityStorage
): Promise<void> {
  // Import identity
  await storage.setIdentity({
    fingerprint: payload.identity.fingerprint,
    publicKey: payload.identity.publicKey,
    encryptedSecretKey: payload.identity.encryptedSecretKey,
    handle: payload.identity.handle,
    createdAt: payload.identity.createdAt
  });
  
  // Import edges
  for (const edge of payload.edges) {
    // Store edge metadata
    await storage.setEdge({
      id: edge.id,
      type: edge.type,
      address: edge.address,
      label: edge.label,
      status: edge.status,
      createdAt: edge.createdAt
    });
    
    // Store edge keys
    await storage.setEdgeKeys(edge.id, {
      publicKey: edge.x25519Keys.publicKey,
      secretKey: edge.x25519Keys.secretKey
    });
  }
  
  // Import ratchet states
  for (const ratchetState of payload.ratchetStates) {
    await storage.setRatchetState(
      ratchetState.conversationId,
      ratchetState.state
    );
    
    // Store conversation metadata if supported
    const extendedStorage = storage as ExtendedIdentityStorage;
    if (typeof extendedStorage.getConversationInfo === 'function') {
      // Platform will need to handle conversation info separately
      // This is stored alongside ratchet states
    }
  }
  
  // Import message cache
  if (payload.messageCache.encryptionKey) {
    await storage.setMessageCache({
      encryptionKey: payload.messageCache.encryptionKey,
      conversations: payload.messageCache.messages
    });
  }
  
  // Import assets
  await storage.setAssets({
    permanent: payload.assets.permanent,
    consumable: payload.assets.consumable
  });
}

/**
 * Import v1 backup (legacy format)
 * 
 * V1 backups only contain identity + passphrase (plaintext!)
 * No edges, ratchets, or messages can be migrated
 */
async function importV1Backup(
  backup: RelayIdentityBackupV1,
  storage: IdentityStorage,
  options: { verifyOnly?: boolean; conflictStrategy?: 'abort' | 'replace' }
): Promise<ImportResult> {
  const { verifyOnly = false, conflictStrategy = 'abort' } = options;
  
  const warnings: string[] = [];
  warnings.push('Importing v1 backup format - only identity can be restored');
  warnings.push('Edges and conversation history cannot be automatically migrated');
  warnings.push('You will need to manually recreate edges');
  
  // Check for conflicts
  const existingIdentity = await storage.getIdentity();
  if (existingIdentity) {
    if (conflictStrategy === 'abort') {
      return {
        success: false,
        conflicts: {
          hasConflict: true,
          existingFingerprint: existingIdentity.fingerprint,
          importingFingerprint: backup.identity.fingerprint,
          message: 'Identity already exists'
        },
        warnings,
        error: 'Identity already exists. Choose "replace" to overwrite.'
      };
    }
    warnings.push('Existing identity will be replaced');
  }
  
  if (verifyOnly) {
    return {
      success: true,
      fingerprint: backup.identity.fingerprint,
      warnings
    };
  }
  
  // Clear existing if replacing
  if (existingIdentity && conflictStrategy === 'replace') {
    await storage.clearAll();
  }
  
  // V1 backup has plaintext passphrase - need to re-encrypt secret key
  // But v1 doesn't have the secret key! Only fingerprint + public key
  // This is a limitation of v1 backup format
  
  warnings.push('V1 backup does not contain secret key - identity cannot function');
  warnings.push('This appears to be an incomplete backup. Please use a complete v2 export.');
  
  return {
    success: false,
    warnings,
    error: 'V1 backup format is incomplete and cannot be imported. Please export using the new format.'
  };
}

/**
 * Base64 decode to Uint8Array
 */
function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

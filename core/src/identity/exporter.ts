/**
 * Identity Export Implementation
 * 
 * Handles complete identity export with encryption
 */

import nacl from 'tweetnacl';
import type {
  RelayIdentityExport,
  IdentityExportPayload,
  ExportedIdentity,
  ExportedEdge,
  ExportedRatchetState,
  ExportedMessageCache,
  ExportedAssets,
  ExportMetadata,
  ExportReason
} from './export-schema.js';
import type { IdentityStorage, ExtendedIdentityStorage } from './storage-interface.js';
import { detectPlatform } from './platform.js';

/**
 * Export options
 */
export interface ExportOptions {
  includeMessages?: boolean;    // Default: true
  includeAssets?: boolean;      // Default: true
  exportReason?: ExportReason;  // Default: 'manual'
}

/**
 * Export result with metadata
 */
export interface ExportResult {
  export: RelayIdentityExport;
  metadata: {
    totalSize: number;          // Approximate size in bytes
    conversationCount: number;
    messageCount: number;
    edgeCount: number;
  };
}

/**
 * Main export function
 * 
 * @param storage - Platform-specific storage implementation
 * @param passphrase - User's passphrase for export encryption
 * @param options - Export options
 */
export async function exportIdentity(
  storage: IdentityStorage,
  passphrase: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const {
    includeMessages = true,
    includeAssets = true,
    exportReason = 'manual'
  } = options;
  
  // Validate passphrase
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  
  try {
    // Collect identity data
    console.log('[Export] Collecting identity...');
    const identity = await storage.getIdentity();
    if (!identity) {
      throw new Error('No identity found to export');
    }
    
    // Collect edges
    console.log('[Export] Collecting edges...');
    const edges = await collectEdges(storage);
    console.log(`[Export] Collected ${edges.length} edges`);
    
    // Collect ratchet states
    console.log('[Export] Collecting ratchet states...');
    const ratchetStates = await collectRatchetStates(storage);
    console.log(`[Export] Collected ${ratchetStates.length} ratchet states`);
    
    // Collect message cache (if requested)
    console.log('[Export] Collecting message cache...');
    const messageCache = includeMessages
      ? await collectMessageCache(storage)
      : { encrypted: true, encryptionKey: '', messages: {} };
    console.log(`[Export] Message cache has ${Object.keys(messageCache.messages).length} conversations`);
    
    // Collect assets (if requested)
    console.log('[Export] Collecting assets...');
    const assets = includeAssets
      ? await storage.getAssets()
      : { permanent: [], consumable: [] };
    console.log(`[Export] Collected ${assets.permanent.length} permanent and ${assets.consumable.length} consumable assets`);
    console.log(`[Export] Collected ${assets.permanent.length} permanent and ${assets.consumable.length} consumable assets`);
  
    // Build metadata
    console.log('[Export] Building metadata...');
    const metadata: ExportMetadata = {
      totalConversations: ratchetStates.length,
      totalMessages: includeMessages ? Object.keys(messageCache.messages).length : 0,
      totalEdges: edges.length,
      exportReason
    };
    
    // Build export payload
    console.log('[Export] Building payload...');
    const payload: IdentityExportPayload = {
      identity: {
        fingerprint: identity.fingerprint,
        publicKey: identity.publicKey,
        encryptedSecretKey: identity.encryptedSecretKey,
        handle: identity.handle,
        createdAt: identity.createdAt
      },
      edges,
      ratchetStates,
      messageCache,
      assets: {
        permanent: assets.permanent.map(a => ({
          id: a.id,
          type: a.type,
          grantedAt: a.grantedAt,
          redemptionCode: a.redemptionCode,
          redeemedAt: a.redeemedAt,
          metadata: { ...a.metadata }
        })),
        consumable: assets.consumable.map(a => ({
          id: a.id,
          type: a.type,
          balance: a.balance,
          initialBalance: a.initialBalance,
          grantedAt: a.grantedAt,
          redemptionCode: a.redemptionCode,
          redeemedAt: a.redeemedAt,
          metadata: { ...a.metadata },
          usageHistory: a.usageHistory.map(h => ({ ...h }))
        }))
      },
      metadata
    };
    
    // Encrypt payload
    console.log('[Export] Encrypting payload...');
    const encrypted = await encryptPayload(payload, passphrase);
    
    //Build export container
    console.log('[Export] Building export container...');
    const exportData: RelayIdentityExport = {
      version: 2,
      type: 'relay-identity-export',
      exportedAt: new Date().toISOString(),
      exportedFrom: detectPlatform(),
      encrypted
    };
    
    // Calculate approximate size
    console.log('[Export] Calculating size...');
    const exportJson = JSON.stringify(exportData);
    const totalSize = new TextEncoder().encode(exportJson).length;
    
    console.log('[Export] Export complete!');
    return {
      export: exportData,
      metadata: {
        totalSize,
        conversationCount: metadata.totalConversations,
        messageCount: metadata.totalMessages,
        edgeCount: metadata.totalEdges
      }
    };
  } catch (error) {
    console.error('[Export] Error during export:', error);
    throw error;
  }
}

/**
 * Collect all edges with their encryption keys
 */
async function collectEdges(storage: IdentityStorage): Promise<ExportedEdge[]> {
  const edges = await storage.getEdges();
  const exportedEdges: ExportedEdge[] = [];
  
  for (const edge of edges) {
    const keys = await storage.getEdgeKeys(edge.id);
    
    if (!keys) {
      console.warn(`Edge ${edge.id} missing encryption keys, skipping`);
      continue;
    }
    
    // Exclude bridge edges (operator-related, not user identity)
    if (edge.type === 'local-llm' || edge.type === 'relay-ai') {
      console.info(`Skipping bridge edge ${edge.id} (type: ${edge.type})`);
      continue;
    }
    
    exportedEdges.push({
      id: edge.id,
      type: edge.type,
      address: edge.address,
      label: edge.label,
      x25519Keys: {
        publicKey: keys.publicKey,
        secretKey: keys.secretKey
      },
      createdAt: edge.createdAt,
      status: edge.status
    });
  }
  
  return exportedEdges;
}

/**
 * Collect all ratchet states with conversation metadata
 */
async function collectRatchetStates(
  storage: IdentityStorage
): Promise<ExportedRatchetState[]> {
  const ratchetStates = await storage.getAllRatchetStates();
  const exportedStates: ExportedRatchetState[] = [];
  
  // Check if storage supports extended conversation info
  const extendedStorage = storage as ExtendedIdentityStorage;
  const hasConversationInfo = typeof extendedStorage.getConversationInfo === 'function';
  
  for (const [conversationId, state] of ratchetStates) {
    // Try to get conversation metadata
    let conversationInfo = null;
    if (hasConversationInfo) {
      conversationInfo = await extendedStorage.getConversationInfo(conversationId);
    }
    
    // If no conversation info available, create minimal entry
    // (expected for older conversations created before metadata tracking)
    if (!conversationInfo) {
      exportedStates.push({
        conversationId,
        edgeId: '',
        counterpartyInfo: {
          edgeId: '',
          x25519PublicKey: ''
        },
        state,
        lastActivityAt: new Date().toISOString()
      });
      continue;
    }
    
    exportedStates.push({
      conversationId,
      edgeId: conversationInfo.edgeId,
      counterpartyInfo: {
        edgeId: conversationInfo.counterpartyEdgeId,
        x25519PublicKey: conversationInfo.counterpartyX25519PublicKey
      },
      state,
      lastActivityAt: conversationInfo.lastActivityAt
    });
  }
  
  return exportedStates;
}

/**
 * Collect encrypted message cache
 */
async function collectMessageCache(
  storage: IdentityStorage
): Promise<ExportedMessageCache> {
  const cache = await storage.getMessageCache();
  
  if (!cache) {
    return {
      encrypted: true,
      encryptionKey: '',
      messages: {}
    };
  }
  
  return {
    encrypted: true,
    encryptionKey: cache.encryptionKey,
    messages: cache.conversations
  };
}

/**
 * Encrypt export payload using passphrase
 * 
 * Uses PBKDF2 for key derivation and NaCl secretbox for encryption
 */
async function encryptPayload(
  payload: IdentityExportPayload,
  passphrase: string
): Promise<RelayIdentityExport['encrypted']> {
  // Serialize payload in chunks to avoid stack overflow with large datasets
  let payloadJson: string;
  try {
    console.log('[Export] Serializing identity and edges...');
    // Serialize the smaller parts first
    const parts = {
      identity: JSON.stringify(payload.identity),
      metadata: JSON.stringify(payload.metadata),
      messageCache: JSON.stringify(payload.messageCache),
      assets: JSON.stringify(payload.assets),
    };
    
    console.log('[Export] Serializing edges...');
    const edgesJson = JSON.stringify(payload.edges);
    
    console.log('[Export] Serializing ratchet states...');
    // Serialize ratchet states in smaller batches to avoid stack overflow
    const ratchetBatchSize = 10;
    const serializedRatchets: string[] = [];
    for (let i = 0; i < payload.ratchetStates.length; i += ratchetBatchSize) {
      const batch = payload.ratchetStates.slice(i, i + ratchetBatchSize);
      serializedRatchets.push(...batch.map(r => JSON.stringify(r)));
    }
    
    // Manually construct the JSON to avoid deep recursion
    payloadJson = `{` +
      `"identity":${parts.identity},` +
      `"edges":${edgesJson},` +
      `"ratchetStates":[${serializedRatchets.join(',')}],` +
      `"messageCache":${parts.messageCache},` +
      `"assets":${parts.assets},` +
      `"metadata":${parts.metadata}` +
      `}`;
      
    console.log('[Export] Serialization complete, payload size:', payloadJson.length);
  } catch (error) {
    console.error('[Export] JSON serialization failed:', error);
    throw new Error(`Failed to serialize export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const payloadBytes = new TextEncoder().encode(payloadJson);
  
  // Generate random salt for PBKDF2
  const salt = nacl.randomBytes(32);
  
  // Derive encryption key using PBKDF2
  const key = await deriveKey(passphrase, salt);
  
  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  // Encrypt with NaCl secretbox (XSalsa20-Poly1305)
  const ciphertext = nacl.secretbox(payloadBytes, nonce, key);
  
  return {
    nonce: base64Encode(nonce),
    salt: base64Encode(salt),
    ciphertext: base64Encode(ciphertext)
  };
}

/**
 * Derive encryption key from passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  
  // Import passphrase as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,  // 100k iterations
      hash: 'SHA-256'
    },
    keyMaterial,
    256  // 32 bytes for NaCl secretbox
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Estimate export size before actually exporting
 */
export async function estimateExportSize(
  storage: IdentityStorage,
  options: ExportOptions = {}
): Promise<number> {
  const { includeMessages = true } = options;
  
  const edges = await storage.getEdges();
  const ratchetStates = await storage.getAllRatchetStates();
  const messageCache = includeMessages ? await storage.getMessageCache() : null;
  
  // Rough estimates:
  // - Identity: ~500 bytes
  // - Edge: ~300 bytes each
  // - Ratchet state: ~1KB each
  // - Message cache: ~500 bytes per conversation
  
  let estimatedSize = 500; // Identity
  estimatedSize += edges.length * 300;
  estimatedSize += ratchetStates.size * 1024;
  
  if (messageCache) {
    estimatedSize += Object.keys(messageCache.conversations).length * 500;
  }
  
  // Add 25% overhead for encryption and JSON formatting
  return Math.ceil(estimatedSize * 1.25);
}

/**
 * Base64 encode Uint8Array
 * Processes in chunks to avoid stack overflow with large arrays
 */
function base64Encode(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }
  
  return btoa(chunks.join(''));
}

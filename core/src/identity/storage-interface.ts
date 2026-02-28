/**
 * Platform-agnostic storage interface for identity data
 * 
 * Implementations:
 * - Extension: chrome.storage.local wrapper
 * - Mobile: AsyncStorage wrapper (React Native)
 * - Web: IndexedDB wrapper
 * - Desktop: localStorage or Electron store wrapper
 */

import type { SerializedRatchetState } from '../crypto/ratchet.js';
import type { EdgeType } from '../types/messages.js';
import type { AssetState } from '../assets/schema.js';

/**
 * Stored identity structure
 */
export interface StoredIdentity {
  fingerprint: string;
  publicKey: string;        // base64 Ed25519
  encryptedSecretKey: {
    ciphertext: string;
    nonce: string;
    salt: string;
  };
  handle: string | null;
  createdAt: string;
}

/**
 * Edge encryption keys (X25519)
 */
export interface EdgeKeys {
  publicKey: string;        // base64
  secretKey: string;        // base64
}

/**
 * Edge metadata
 */
export interface StoredEdge {
  id: string;               // ULID
  type: EdgeType;
  address: string;
  label: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
}

/**
 * Message cache structure
 */
export interface MessageCache {
  encryptionKey: string;    // base64 - derived storage key
  conversations: Record<string, EncryptedConversationMessages>;
}

/**
 * Encrypted messages for a conversation
 */
export interface EncryptedConversationMessages {
  ciphertext: string;       // base64
  nonce: string;            // base64
}

/**
 * Platform-agnostic storage interface
 * All methods are async to support various storage backends
 */
export interface IdentityStorage {
  // ===== Identity =====
  
  /**
   * Get stored identity
   */
  getIdentity(): Promise<StoredIdentity | null>;
  
  /**
   * Store identity
   */
  setIdentity(identity: StoredIdentity): Promise<void>;
  
  /**
   * Remove identity
   */
  removeIdentity(): Promise<void>;
  
  // ===== Edges =====
  
  /**
   * Get all edges metadata
   */
  getEdges(): Promise<StoredEdge[]>;
  
  /**
   * Get edge metadata by ID
   */
  getEdge(edgeId: string): Promise<StoredEdge | null>;
  
  /**
   * Store edge metadata
   */
  setEdge(edge: StoredEdge): Promise<void>;
  
  /**
   * Get edge encryption keys
   */
  getEdgeKeys(edgeId: string): Promise<EdgeKeys | null>;
  
  /**
   * Store edge encryption keys
   */
  setEdgeKeys(edgeId: string, keys: EdgeKeys): Promise<void>;
  
  /**
   * Get all edge keys (for export)
   */
  getAllEdgeKeys(): Promise<Map<string, EdgeKeys>>;
  
  // ===== Ratchet States =====
  
  /**
   * Get ratchet state for a conversation
   */
  getRatchetState(conversationId: string): Promise<SerializedRatchetState | null>;
  
  /**
   * Store ratchet state
   */
  setRatchetState(conversationId: string, state: SerializedRatchetState): Promise<void>;
  
  /**
   * Get all ratchet states (for export)
   */
  getAllRatchetStates(): Promise<Map<string, SerializedRatchetState>>;
  
  /**
   * Remove ratchet state
   */
  removeRatchetState(conversationId: string): Promise<void>;
  
  // ===== Message Cache =====
  
  /**
   * Get encrypted message cache
   */
  getMessageCache(): Promise<MessageCache | null>;
  
  /**
   * Store encrypted message cache
   */
  setMessageCache(cache: MessageCache): Promise<void>;
  
  /**
   * Get messages for a specific conversation
   */
  getConversationMessages(conversationId: string): Promise<EncryptedConversationMessages | null>;
  
  /**
   * Store messages for a specific conversation
   */
  setConversationMessages(conversationId: string, messages: EncryptedConversationMessages): Promise<void>;
  
  // ===== Assets =====
  
  /**
   * Get asset entitlements
   */
  getAssets(): Promise<AssetState>;
  
  /**
   * Store asset entitlements
   */
  setAssets(assets: AssetState): Promise<void>;
  
  // ===== Utility =====
  
  /**
   * Clear all identity-related data
   * Use with caution - irreversible!
   */
  clearAll(): Promise<void>;
}

/**
 * Conversation info for ratchet state export
 */
export interface ConversationInfo {
  conversationId: string;
  edgeId: string;
  counterpartyEdgeId: string;
  counterpartyX25519PublicKey: string;
  lastActivityAt: string;
}

/**
 * Extended storage interface with conversation metadata
 * Some platforms may need to store additional metadata
 */
export interface ExtendedIdentityStorage extends IdentityStorage {
  /**
   * Get conversation metadata (for pairing with ratchet states)
   */
  getConversationInfo(conversationId: string): Promise<ConversationInfo | null>;
  
  /**
   * Get all conversation metadata
   */
  getAllConversations(): Promise<ConversationInfo[]>;
}

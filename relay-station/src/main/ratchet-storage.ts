/**
 * Ratchet State Storage for Desktop App
 * 
 * Manages persistent storage of Double Ratchet states for conversations
 * Uses electron-store for secure local storage
 */

import Store from 'electron-store';
import { 
  type RatchetState, 
  serializeRatchetState, 
  deserializeRatchetState,
  RatchetInitBob
} from '@relay/core';
import nacl from 'tweetnacl';

interface RatchetStoreSchema {
  ratchetStates: Record<string, string>; // conversationId -> serialized RatchetState
}

/**
 * Ratchet storage using electron-store
 */
export class RatchetStorage {
  private store: Store<RatchetStoreSchema>;

  constructor() {
    this.store = new Store<RatchetStoreSchema>({
      name: 'ratchet-states',
      defaults: {
        ratchetStates: {},
      },
    });
  }

  /**
   * Load ratchet state for a conversation
   */
  async load(conversationId: string): Promise<RatchetState | null> {
    try {
      const states = this.store.get('ratchetStates', {});
      const serialized = states[conversationId];
      
      if (!serialized) {
        return null;
      }

      return deserializeRatchetState(serialized);
    } catch (error) {
      console.error('[RatchetStorage] Failed to load state:', conversationId, error);
      return null;
    }
  }

  /**
   * Save ratchet state for a conversation
   */
  async save(conversationId: string, state: RatchetState): Promise<void> {
    try {
      const states = this.store.get('ratchetStates', {});
      const serialized = serializeRatchetState(state);
      
      states[conversationId] = serialized;
      this.store.set('ratchetStates', states);
      
      console.log('[RatchetStorage] Saved state for conversation:', conversationId);
    } catch (error) {
      console.error('[RatchetStorage] Failed to save state:', conversationId, error);
      throw error;
    }
  }

  /**
   * Initialize ratchet state as Bob (receiver)
   * 
   * @param conversationId - Conversation ID
   * @param bridgeX25519KeyPair - Bridge's X25519 keypair { publicKey, secretKey }
   * @param senderX25519PublicKey - Sender's (counterparty) X25519 public key
   */
  async initializeAsBob(
    conversationId: string,
    bridgeX25519KeyPair: { publicKey: Uint8Array; secretKey: Uint8Array },
    senderX25519PublicKey: Uint8Array
  ): Promise<RatchetState> {
    try {
      // Check if state already exists
      const existing = await this.load(conversationId);
      if (existing) {
        console.log('[RatchetStorage] Using existing ratchet state for:', conversationId);
        return existing;
      }

      // Derive shared secret from DH(bridge's secret key, sender's public key)
      // Uses nacl.box.before which computes the shared secret for a keypair
      const sharedSecret = nacl.box.before(
        senderX25519PublicKey,
        bridgeX25519KeyPair.secretKey
      );

      console.log('[RatchetStorage] Derived shared secret', {
        sharedSecretLength: sharedSecret.length,
        bridgePublicKeyLength: bridgeX25519KeyPair.publicKey.length,
        senderPublicKeyLength: senderX25519PublicKey.length,
      });

      // Initialize as Bob (receiver)
      const state = RatchetInitBob(sharedSecret, bridgeX25519KeyPair);

      // Save initial state
      await this.save(conversationId, state);

      console.log('[RatchetStorage] Initialized new ratchet state as Bob:', conversationId);
      return state;
    } catch (error) {
      console.error('[RatchetStorage] Failed to initialize state:', conversationId, error);
      throw error;
    }
  }

  /**
   * Delete ratchet state for a conversation
   */
  async delete(conversationId: string): Promise<void> {
    try {
      const states = this.store.get('ratchetStates', {});
      delete states[conversationId];
      this.store.set('ratchetStates', states);
      
      console.log('[RatchetStorage] Deleted state for conversation:', conversationId);
    } catch (error) {
      console.error('[RatchetStorage] Failed to delete state:', conversationId, error);
    }
  }

  /**
   * Get all stored conversation IDs
   */
  async listConversations(): Promise<string[]> {
    try {
      const states = this.store.get('ratchetStates', {});
      return Object.keys(states);
    } catch (error) {
      console.error('[RatchetStorage] Failed to list conversations:', error);
      return [];
    }
  }

  /**
   * Clear all ratchet states (for testing/debugging)
   */
  async clearAll(): Promise<void> {
    try {
      this.store.set('ratchetStates', {});
      console.log('[RatchetStorage] Cleared all ratchet states');
    } catch (error) {
      console.error('[RatchetStorage] Failed to clear states:', error);
    }
  }
}

/**
 * Singleton instance
 */
export const ratchetStorage = new RatchetStorage();

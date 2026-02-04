/**
 * Unified Messaging Module
 * 
 * ONE method to send messages across ALL conversation types.
 * Uses Double Ratchet encryption for everything.
 */

import nacl from 'tweetnacl';
import {
  RatchetInitAlice,
  RatchetInitBob,
  RatchetEncrypt,
  RatchetDecrypt,
  serializeRatchetState,
  deserializeRatchetState,
  type RatchetState,
  type EncryptedRatchetMessage,
} from '../crypto/ratchet.js';
import { toBase64 } from '../utils/encoding.js';
import type { MessageEnvelope, Conversation, MessageResult } from '../types/messages.js';

/**
 * Generate a unique message ID (timestamp + random)
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`.toUpperCase();
}

// =============================================================================
// Ratchet State Management
// =============================================================================

/**
 * Get or initialize ratchet state for a conversation
 */
export async function getRatchetState(
  conversation: Conversation,
  myEdgeSecretKey: Uint8Array,
  counterpartyEdgePublicKey: Uint8Array,
  storage: RatchetStorage
): Promise<RatchetState> {
  // Try to load existing state
  const existingState = await storage.load(conversation.id);
  if (existingState) {
    return deserializeRatchetState(existingState);
  }
  
  // Initialize new ratchet
  // Use edge-to-edge DH as shared secret
  const sharedSecret = deriveSharedSecret(myEdgeSecretKey, counterpartyEdgePublicKey);
  
  console.log('[getRatchetState] Initializing new ratchet:', {
    conversationId: conversation.id,
    myEdgePubKey: toBase64(derivePublicKey(myEdgeSecretKey)),
    counterpartyPubKey: toBase64(counterpartyEdgePublicKey),
    sharedSecret: toBase64(sharedSecret),
    isInitiator: conversation.is_initiator,
  });
  
  // Determine if we're Alice (initiator) or Bob (responder)
  // If is_initiator is explicitly set, use that; otherwise use edge ID comparison
  const weAreAlice = conversation.is_initiator !== undefined 
    ? conversation.is_initiator 
    : conversation.my_edge_id > (conversation.counterparty_edge_id || '');
  
  if (weAreAlice) {
    return RatchetInitAlice(sharedSecret, counterpartyEdgePublicKey);
  } else {
    // For Bob, we need our own keypair
    const myEdgeKeypair = {
      publicKey: derivePublicKey(myEdgeSecretKey),
      secretKey: myEdgeSecretKey,
    };
    return RatchetInitBob(sharedSecret, myEdgeKeypair);
  }
}

/**
 * Save ratchet state
 */
export async function saveRatchetState(
  conversationId: string,
  state: RatchetState,
  storage: RatchetStorage
): Promise<void> {
  const serialized = serializeRatchetState(state);
  await storage.save(conversationId, serialized);
}

/**
 * Derive shared secret from edge keypairs (X25519 DH)
 */
function deriveSharedSecret(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  // Use nacl.box.before to compute shared secret
  return nacl.box.before(theirPublicKey, mySecretKey);
}

/**
 * Derive public key from secret key
 */
function derivePublicKey(secretKey: Uint8Array): Uint8Array {
  const keypair = nacl.box.keyPair.fromSecretKey(secretKey);
  return keypair.publicKey;
}

// =============================================================================
// Unified Send Message
// =============================================================================

/**
 * Send a message in ANY conversation type
 * Uses Double Ratchet for all messages, regardless of security level
 */
export async function sendMessage(
  conversation: Conversation,
  content: string,
  contentType: string = 'text/plain',
  myEdgeSecretKey: Uint8Array,
  counterpartyEdgePublicKey: Uint8Array,
  storage: RatchetStorage
): Promise<{ envelope: MessageEnvelope; newState: RatchetState }> {
  
  // 1. Get or initialize ratchet state
  const ratchetState = await getRatchetState(
    conversation,
    myEdgeSecretKey,
    counterpartyEdgePublicKey,
    storage
  );
  
  // 2. Encrypt content with Double Ratchet
  const { message, newState } = RatchetEncrypt(ratchetState, content);
  
  // 3. Build message envelope
  const envelope: MessageEnvelope = {
    protocol_version: '1.0',
    message_id: generateMessageId(),
    conversation_id: conversation.id,
    edge_id: conversation.my_edge_id,
    origin: conversation.origin,
    security_level: conversation.security_level,
    payload: {
      content_type: contentType,
      ratchet: message,
    },
    created_at: new Date().toISOString(),
  };
  
  // 4. Save updated ratchet state
  await saveRatchetState(conversation.id, newState, storage);
  
  return { envelope, newState };
}

// =============================================================================
// Unified Receive Message
// =============================================================================

/**
 * Decrypt a received message from ANY conversation type
 */
export async function receiveMessage(
  envelope: MessageEnvelope,
  conversation: Conversation,
  myEdgeSecretKey: Uint8Array,
  counterpartyEdgePublicKey: Uint8Array,
  storage: RatchetStorage
): Promise<{ plaintext: string; newState: RatchetState } | null> {
  
  console.log('[receiveMessage] Starting decryption:', {
    messageId: envelope.message_id,
    conversationId: conversation.id,
    myEdgeId: conversation.my_edge_id,
    counterpartyEdgeId: conversation.counterparty_edge_id,
    isInitiator: conversation.is_initiator,
    mySecretKeyLen: myEdgeSecretKey?.length,
    counterpartyPubKeyLen: counterpartyEdgePublicKey?.length,
    counterpartyPubKeyB64: counterpartyEdgePublicKey ? toBase64(counterpartyEdgePublicKey) : null,
  });
  
  // 1. Get ratchet state
  const ratchetState = await getRatchetState(
    conversation,
    myEdgeSecretKey,
    counterpartyEdgePublicKey,
    storage
  );
  
  console.log('[receiveMessage] Ratchet state:', {
    hasState: !!ratchetState,
    DHsPublicKey: ratchetState?.DHs?.publicKey ? toBase64(ratchetState.DHs.publicKey) : null,
    DHr: ratchetState?.DHr ? toBase64(ratchetState.DHr) : null,
    CKs: ratchetState?.CKs ? 'present' : null,
    CKr: ratchetState?.CKr ? 'present' : null,
    Ns: ratchetState?.Ns,
    Nr: ratchetState?.Nr,
  });
  
  console.log('[receiveMessage] Message ratchet payload:', {
    dh: envelope.payload.ratchet.dh,
    pn: envelope.payload.ratchet.pn,
    n: envelope.payload.ratchet.n,
    ciphertextLen: envelope.payload.ratchet.ciphertext?.length,
  });
  
  // 2. Decrypt with Double Ratchet
  const result = RatchetDecrypt(ratchetState, envelope.payload.ratchet);
  
  if (!result) {
    console.error('Failed to decrypt message:', envelope.message_id);
    return null;
  }
  
  // 3. Save updated ratchet state
  await saveRatchetState(conversation.id, result.newState, storage);
  
  return result;
}

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * Storage interface for ratchet states
 * Implementation varies by platform (extension storage, file system, etc.)
 */
export interface RatchetStorage {
  load(conversationId: string): Promise<string | null>;
  save(conversationId: string, serializedState: string): Promise<void>;
}

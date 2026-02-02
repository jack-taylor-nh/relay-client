/**
 * Unified Message Protocol
 * 
 * ALL messages in Relay use the same envelope structure and Double Ratchet encryption,
 * regardless of origin (native, email, Discord, etc.).
 * 
 * The security_level field determines WHERE decryption happens:
 * - e2ee: Decrypted only by recipient client (true end-to-end encryption)
 * - gateway_secured: Decrypted by gateway worker, then bridged to external system
 * 
 * This maintains zero-knowledge on the main server for ALL message types.
 */

import type { EncryptedRatchetMessage } from '../crypto/ratchet.js';

// =============================================================================
// Message Envelope (Protocol v1.0)
// =============================================================================

export interface MessageEnvelope {
  /** Protocol version */
  protocol_version: '1.0';
  
  /** Unique message ID (ULID) */
  message_id: string;
  
  /** Conversation this message belongs to */
  conversation_id: string;
  
  /** Edge ID message is sent through */
  edge_id: string;
  
  /** Origin type (edge type) */
  origin: EdgeType;
  
  /** Security level - determines decryption point */
  security_level: 'e2ee' | 'gateway_secured';
  
  /** Message payload (always encrypted with Double Ratchet) */
  payload: MessagePayload;
  
  /** Timestamp */
  created_at: string;
  
  /** Ed25519 signature over envelope (optional but recommended) */
  signature?: string;
}

export interface MessagePayload {
  /** Content MIME type */
  content_type: string;
  
  /** Double Ratchet encrypted content */
  ratchet: EncryptedRatchetMessage;
}

export type EdgeType = 
  | 'native' 
  | 'email' 
  | 'contact_link' 
  | 'discord' 
  | 'sms' 
  | 'telegram' 
  | 'slack' 
  | 'other';

export type SecurityLevel = 'e2ee' | 'gateway_secured';

// =============================================================================
// Conversation Metadata
// =============================================================================

export interface Conversation {
  id: string;
  origin: EdgeType;
  security_level: SecurityLevel;
  my_edge_id: string;
  counterparty_edge_id?: string;
  ratchet_state?: any; // RatchetState from @relay/core
}

// =============================================================================
// Message Result
// =============================================================================

export interface MessageResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

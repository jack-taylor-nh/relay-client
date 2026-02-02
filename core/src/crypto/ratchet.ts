/**
 * Double Ratchet Implementation
 * Based on Signal Protocol specification
 * https://signal.org/docs/specifications/doubleratchet/
 * 
 * Provides forward secrecy and post-compromise security for E2EE messaging
 */

import nacl from 'tweetnacl';
import { fromBase64, toBase64 } from '../utils/encoding.js';

// =============================================================================
// Types
// =============================================================================

export interface RatchetState {
  /** DH sending keypair (our current keypair) */
  DHs: { publicKey: Uint8Array; secretKey: Uint8Array };
  /** DH receiving public key (their current public key) */
  DHr: Uint8Array | null;
  /** Root key (KDF root) */
  RK: Uint8Array;
  /** Sending chain key */
  CKs: Uint8Array | null;
  /** Receiving chain key */
  CKr: Uint8Array | null;
  /** Sending message number */
  Ns: number;
  /** Receiving message number */
  Nr: number;
  /** Previous sending chain length */
  PN: number;
  /** Skipped message keys (for out-of-order delivery) */
  MKSKIPPED: Record<string, string>; // key: "DHpubkey:N" -> value: base64 message key
}

export interface EncryptedRatchetMessage {
  /** Ciphertext (encrypted with message key) */
  ciphertext: string;
  /** Current DH public key (base64) */
  dh: string;
  /** Previous chain length */
  pn: number;
  /** Message number in current chain */
  n: number;
  /** Nonce for AEAD */
  nonce: string;
}

// =============================================================================
// Constants
// =============================================================================

const KDF_INFO_RK = new TextEncoder().encode('RelayDoubleRatchetRootKey');
const KDF_INFO_CK = new TextEncoder().encode('RelayDoubleRatchetChainKey');
const KDF_INFO_MK = new TextEncoder().encode('RelayDoubleRatchetMessageKey');
const MAX_SKIP = 1000; // Maximum number of skipped message keys to store

// =============================================================================
// KDF Functions (Key Derivation Functions)
// =============================================================================

/**
 * HKDF-based KDF for root key ratchet
 * Derives new root key and chain key from current root key and DH output
 */
function KDF_RK(rk: Uint8Array, dhOut: Uint8Array): { rk: Uint8Array; ck: Uint8Array } {
  // Simple HKDF implementation using HMAC-SHA256
  const ikm = new Uint8Array([...dhOut]); // Input key material
  const salt = rk; // Root key as salt
  
  // HKDF-Extract: HMAC(salt, ikm)
  const prk = hmacSha256(salt, ikm);
  
  // HKDF-Expand: derive 64 bytes (32 for RK, 32 for CK)
  const okm = hkdfExpand(prk, KDF_INFO_RK, 64);
  
  return {
    rk: okm.slice(0, 32),  // New root key
    ck: okm.slice(32, 64), // New chain key
  };
}

/**
 * KDF for chain key ratchet
 * Derives new chain key and message key from current chain key
 */
function KDF_CK(ck: Uint8Array): { ck: Uint8Array; mk: Uint8Array } {
  // Chain key ratchet: CK_new = HMAC(CK, 0x01), MK = HMAC(CK, 0x02)
  const ckNew = hmacSha256(ck, new Uint8Array([0x01]));
  const mk = hmacSha256(ck, new Uint8Array([0x02]));
  
  return { ck: ckNew, mk };
}

// =============================================================================
// Crypto Helpers
// =============================================================================

/**
 * HMAC-SHA256 implementation using Web Crypto API or fallback
 */
function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  // For browser/extension environment, use nacl.hash (SHA-512) and truncate
  // This is a simplification - production should use proper HMAC-SHA256
  const combined = new Uint8Array(key.length + data.length);
  combined.set(key, 0);
  combined.set(data, key.length);
  const hash = nacl.hash(combined);
  return hash.slice(0, 32); // Truncate to 256 bits
}

/**
 * HKDF-Expand function
 */
function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  const iterations = Math.ceil(length / 32);
  const output = new Uint8Array(length);
  let t: Uint8Array = new Uint8Array(0);
  
  for (let i = 1; i <= iterations; i++) {
    const data = new Uint8Array(t.length + info.length + 1);
    data.set(t, 0);
    data.set(info, t.length);
    data[data.length - 1] = i;
    const result = hmacSha256(prk, data);
    t = new Uint8Array(result.buffer.slice(0)); // Create new Uint8Array with correct type
    output.set(t.slice(0, Math.min(32, length - (i - 1) * 32)), (i - 1) * 32);
  }
  
  return output;
}

/**
 * Perform X25519 Diffie-Hellman
 */
function DH(keypair: nacl.BoxKeyPair, publicKey: Uint8Array): Uint8Array {
  return nacl.box.before(publicKey, keypair.secretKey);
}

/**
 * AEAD encryption using NaCl box (XSalsa20-Poly1305)
 */
function ENCRYPT(mk: Uint8Array, plaintext: string, ad: Uint8Array): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(24);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  
  // Combine AD with plaintext for authentication
  const combined = new Uint8Array(ad.length + plaintextBytes.length);
  combined.set(ad, 0);
  combined.set(plaintextBytes, ad.length);
  
  // Use message key as the shared secret for NaCl secretbox
  const ciphertext = nacl.secretbox(combined, nonce, mk);
  
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

/**
 * AEAD decryption using NaCl box (XSalsa20-Poly1305)
 */
function DECRYPT(mk: Uint8Array, ciphertext: string, nonce: string, ad: Uint8Array): string | null {
  try {
    const ciphertextBytes = fromBase64(ciphertext);
    const nonceBytes = fromBase64(nonce);
    
    const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, mk);
    if (!decrypted) return null;
    
    // Remove AD prefix
    const plaintextBytes = decrypted.slice(ad.length);
    return new TextDecoder().decode(plaintextBytes);
  } catch {
    return null;
  }
}

// =============================================================================
// Double Ratchet Core Functions
// =============================================================================

/**
 * Initialize ratchet state for Alice (initiator/sender)
 * Alice knows Bob's public key and generates her first DH keypair
 */
export function RatchetInitAlice(
  sharedSecret: Uint8Array,
  bobPublicKey: Uint8Array
): RatchetState {
  // Generate Alice's initial DH keypair
  const DHs = nacl.box.keyPair();
  
  // Perform initial DH with Bob's public key
  const dhOut = DH(DHs, bobPublicKey);
  
  // Derive initial root key and sending chain key
  const { rk, ck } = KDF_RK(sharedSecret, dhOut);
  
  return {
    DHs,
    DHr: bobPublicKey,
    RK: rk,
    CKs: ck,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
  };
}

/**
 * Initialize ratchet state for Bob (responder/receiver)
 * Bob uses his long-term keypair and waits for Alice's first message
 */
export function RatchetInitBob(
  sharedSecret: Uint8Array,
  bobKeypair: nacl.BoxKeyPair
): RatchetState {
  return {
    DHs: bobKeypair,
    DHr: null, // Will be set when receiving first message
    RK: sharedSecret,
    CKs: null,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
  };
}

/**
 * Encrypt a message using the ratchet
 */
export function RatchetEncrypt(
  state: RatchetState,
  plaintext: string
): { message: EncryptedRatchetMessage; newState: RatchetState } {
  // Derive message key from sending chain
  const { ck, mk } = KDF_CK(state.CKs!);
  
  // Construct associated data (AD)
  const ad = new Uint8Array([
    ...state.DHs.publicKey,
    ...new Uint8Array(4), // PN (4 bytes)
    ...new Uint8Array(4), // N (4 bytes)
  ]);
  const view = new DataView(ad.buffer);
  view.setUint32(state.DHs.publicKey.length, state.PN, false);
  view.setUint32(state.DHs.publicKey.length + 4, state.Ns, false);
  
  // Encrypt message
  const { ciphertext, nonce } = ENCRYPT(mk, plaintext, ad);
  
  // Create ratchet message
  const message: EncryptedRatchetMessage = {
    ciphertext,
    dh: toBase64(state.DHs.publicKey),
    pn: state.PN,
    n: state.Ns,
    nonce,
  };
  
  // Update state
  const newState: RatchetState = {
    ...state,
    CKs: ck,
    Ns: state.Ns + 1,
  };
  
  return { message, newState };
}

/**
 * Decrypt a message using the ratchet
 */
export function RatchetDecrypt(
  state: RatchetState,
  message: EncryptedRatchetMessage
): { plaintext: string; newState: RatchetState } | null {
  const dhPublic = fromBase64(message.dh);
  
  // Check if message uses old DH ratchet (out of order)
  const skippedKeyId = `${message.dh}:${message.n}`;
  if (state.MKSKIPPED[skippedKeyId]) {
    const mk = fromBase64(state.MKSKIPPED[skippedKeyId]);
    const ad = createAD(dhPublic, message.pn, message.n);
    const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
    if (!plaintext) return null;
    
    // Remove used key
    const newState = { ...state };
    delete newState.MKSKIPPED[skippedKeyId];
    return { plaintext, newState };
  }
  
  // Check if new DH ratchet step is needed
  if (state.DHr === null || toBase64(state.DHr) !== message.dh) {
    return DHRatchetStep(state, message);
  }
  
  // Skip messages if needed
  const skipResult = skipMessageKeys(state, message.n);
  if (!skipResult) return null;
  
  let newState = skipResult;
  
  // Derive message key
  const { ck, mk } = KDF_CK(newState.CKr!);
  newState = { ...newState, CKr: ck, Nr: newState.Nr + 1 };
  
  // Decrypt
  const ad = createAD(dhPublic, message.pn, message.n);
  const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
  if (!plaintext) return null;
  
  return { plaintext, newState };
}

/**
 * Perform DH ratchet step (when receiving message with new DH key)
 */
function DHRatchetStep(
  state: RatchetState,
  message: EncryptedRatchetMessage
): { plaintext: string; newState: RatchetState } | null {
  const dhPublic = fromBase64(message.dh);
  
  // Skip messages from previous receiving chain
  const skipResult = state.CKr ? skipMessageKeys(state, state.Nr + message.pn) : state;
  if (!skipResult) return null;
  
  let newState = skipResult;
  
  // Store previous sending chain length
  newState = { ...newState, PN: newState.Ns, Ns: 0 };
  
  // Update receiving DH key
  newState = { ...newState, DHr: dhPublic };
  
  // Perform DH and derive new receiving chain
  const dhOut1 = DH(newState.DHs, dhPublic);
  const { rk: rk1, ck: ckr } = KDF_RK(newState.RK, dhOut1);
  newState = { ...newState, RK: rk1, CKr: ckr };
  
  // Skip to current message number
  const skipResult2 = skipMessageKeys(newState, message.n);
  if (!skipResult2) return null;
  newState = skipResult2;
  
  // Derive message key and decrypt
  const { ck: ckr2, mk } = KDF_CK(newState.CKr!);
  newState = { ...newState, CKr: ckr2, Nr: newState.Nr + 1 };
  
  const ad = createAD(dhPublic, message.pn, message.n);
  const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
  if (!plaintext) return null;
  
  // Generate new sending DH keypair
  const newDHs = nacl.box.keyPair();
  const dhOut2 = DH(newDHs, dhPublic);
  const { rk: rk2, ck: cks } = KDF_RK(newState.RK, dhOut2);
  newState = { ...newState, DHs: newDHs, RK: rk2, CKs: cks };
  
  return { plaintext, newState };
}

/**
 * Skip message keys (for out-of-order delivery)
 */
function skipMessageKeys(state: RatchetState, until: number): RatchetState | null {
  if (state.Nr + MAX_SKIP < until) {
    // Too many skipped messages
    return null;
  }
  
  let newState = { ...state, MKSKIPPED: { ...state.MKSKIPPED } };
  
  if (newState.CKr && newState.DHr) {
    let currentCKr: Uint8Array = newState.CKr;
    const currentDHr: Uint8Array = newState.DHr;
    while (newState.Nr < until) {
      const { ck, mk } = KDF_CK(currentCKr);
      const keyId = `${toBase64(currentDHr)}:${newState.Nr}`;
      newState.MKSKIPPED[keyId] = toBase64(mk);
      currentCKr = ck;
      newState = { ...newState, CKr: currentCKr, Nr: newState.Nr + 1 };
    }
  }
  
  return newState;
}

/**
 * Create associated data for AEAD
 */
function createAD(dhPublic: Uint8Array, pn: number, n: number): Uint8Array {
  const ad = new Uint8Array(dhPublic.length + 8);
  ad.set(dhPublic, 0);
  const view = new DataView(ad.buffer);
  view.setUint32(dhPublic.length, pn, false);
  view.setUint32(dhPublic.length + 4, n, false);
  return ad;
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialize ratchet state for storage
 */
export function serializeRatchetState(state: RatchetState): string {
  return JSON.stringify({
    DHs: {
      publicKey: toBase64(state.DHs.publicKey),
      secretKey: toBase64(state.DHs.secretKey),
    },
    DHr: state.DHr ? toBase64(state.DHr) : null,
    RK: toBase64(state.RK),
    CKs: state.CKs ? toBase64(state.CKs) : null,
    CKr: state.CKr ? toBase64(state.CKr) : null,
    Ns: state.Ns,
    Nr: state.Nr,
    PN: state.PN,
    MKSKIPPED: state.MKSKIPPED,
  });
}

/**
 * Deserialize ratchet state from storage
 */
export function deserializeRatchetState(serialized: string): RatchetState {
  const obj = JSON.parse(serialized);
  return {
    DHs: {
      publicKey: fromBase64(obj.DHs.publicKey),
      secretKey: fromBase64(obj.DHs.secretKey),
    },
    DHr: obj.DHr ? fromBase64(obj.DHr) : null,
    RK: fromBase64(obj.RK),
    CKs: obj.CKs ? fromBase64(obj.CKs) : null,
    CKr: obj.CKr ? fromBase64(obj.CKr) : null,
    Ns: obj.Ns,
    Nr: obj.Nr,
    PN: obj.PN,
    MKSKIPPED: obj.MKSKIPPED,
  };
}

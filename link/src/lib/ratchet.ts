/**
 * Double Ratchet Implementation for Contact Link
 * 
 * Adapted from relay-client/core for the standalone link frontend.
 * Uses tweetnacl for X25519 key exchange and XSalsa20-Poly1305 encryption.
 */

import nacl from 'tweetnacl';

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
  MKSKIPPED: Record<string, string>;
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
// Base64 Encoding/Decoding
// =============================================================================

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// =============================================================================
// Constants
// =============================================================================

const KDF_INFO_RK = new TextEncoder().encode('RelayDoubleRatchetRootKey');
const MAX_SKIP = 1000;

// =============================================================================
// KDF Functions
// =============================================================================

/**
 * HMAC-SHA256 using tweetnacl's hash (SHA-512) truncated
 */
function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const combined = new Uint8Array(key.length + data.length);
  combined.set(key, 0);
  combined.set(data, key.length);
  const hash = nacl.hash(combined);
  return hash.slice(0, 32);
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
    t = new Uint8Array(result.buffer.slice(0));
    output.set(t.slice(0, Math.min(32, length - (i - 1) * 32)), (i - 1) * 32);
  }
  
  return output;
}

/**
 * KDF for root key ratchet
 */
function KDF_RK(rk: Uint8Array, dhOut: Uint8Array): { rk: Uint8Array; ck: Uint8Array } {
  const ikm = new Uint8Array([...dhOut]);
  const salt = rk;
  const prk = hmacSha256(salt, ikm);
  const okm = hkdfExpand(prk, KDF_INFO_RK, 64);
  
  return {
    rk: okm.slice(0, 32),
    ck: okm.slice(32, 64),
  };
}

/**
 * KDF for chain key ratchet
 */
function KDF_CK(ck: Uint8Array): { ck: Uint8Array; mk: Uint8Array } {
  const ckNew = hmacSha256(ck, new Uint8Array([0x01]));
  const mk = hmacSha256(ck, new Uint8Array([0x02]));
  return { ck: ckNew, mk };
}

// =============================================================================
// Crypto Helpers
// =============================================================================

function DH(keypair: nacl.BoxKeyPair, publicKey: Uint8Array): Uint8Array {
  return nacl.box.before(publicKey, keypair.secretKey);
}

function ENCRYPT(mk: Uint8Array, plaintext: string, ad: Uint8Array): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(24);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  
  const combined = new Uint8Array(ad.length + plaintextBytes.length);
  combined.set(ad, 0);
  combined.set(plaintextBytes, ad.length);
  
  const ciphertext = nacl.secretbox(combined, nonce, mk);
  
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

function DECRYPT(mk: Uint8Array, ciphertext: string, nonce: string, ad: Uint8Array): string | null {
  try {
    const ciphertextBytes = fromBase64(ciphertext);
    const nonceBytes = fromBase64(nonce);
    
    const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, mk);
    if (!decrypted) return null;
    
    const plaintextBytes = decrypted.slice(ad.length);
    return new TextDecoder().decode(plaintextBytes);
  } catch {
    return null;
  }
}

function createAD(dhPublic: Uint8Array, pn: number, n: number): Uint8Array {
  const ad = new Uint8Array(dhPublic.length + 8);
  ad.set(dhPublic, 0);
  const view = new DataView(ad.buffer);
  view.setUint32(dhPublic.length, pn, false);
  view.setUint32(dhPublic.length + 4, n, false);
  return ad;
}

// =============================================================================
// Double Ratchet Core Functions
// =============================================================================

/**
 * Initialize ratchet state for the visitor (Alice role - initiator)
 * 
 * The shared secret is derived from DH between the visitor's deterministic keypair
 * and the edge's public key. This matches what the extension computes.
 * 
 * @param visitorKeypair - Visitor's deterministic X25519 keypair (derived from seed + linkId)
 * @param edgePublicKey - The edge owner's X25519 public key
 */
export function RatchetInitVisitor(
  visitorKeypair: nacl.BoxKeyPair,
  edgePublicKey: Uint8Array
): RatchetState {
  // Compute shared secret via DH - this matches what the extension computes
  const sharedSecret = DH(visitorKeypair, edgePublicKey);
  
  console.log('[RatchetInitVisitor] Debug:', {
    visitorPubKey: toBase64(visitorKeypair.publicKey),
    edgePubKey: toBase64(edgePublicKey),
    sharedSecret: toBase64(sharedSecret),
  });
  
  // Generate ephemeral DH keypair for the ratchet (Alice's first ratchet key)
  const DHs = nacl.box.keyPair();
  const dhOut = DH(DHs, edgePublicKey);
  const { rk, ck } = KDF_RK(sharedSecret, dhOut);
  
  console.log('[RatchetInitVisitor] Ratchet initialized:', {
    DHsPubKey: toBase64(DHs.publicKey),
    dhOut: toBase64(dhOut),
    RK: toBase64(rk),
    CKs: toBase64(ck),
  });
  
  return {
    DHs,
    DHr: edgePublicKey,
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
 * Encrypt a message
 */
export function RatchetEncrypt(
  state: RatchetState,
  plaintext: string
): { message: EncryptedRatchetMessage; newState: RatchetState } {
  const { ck, mk } = KDF_CK(state.CKs!);
  
  const ad = new Uint8Array(state.DHs.publicKey.length + 8);
  ad.set(state.DHs.publicKey, 0);
  const view = new DataView(ad.buffer);
  view.setUint32(state.DHs.publicKey.length, state.PN, false);
  view.setUint32(state.DHs.publicKey.length + 4, state.Ns, false);
  
  const { ciphertext, nonce } = ENCRYPT(mk, plaintext, ad);
  
  const message: EncryptedRatchetMessage = {
    ciphertext,
    dh: toBase64(state.DHs.publicKey),
    pn: state.PN,
    n: state.Ns,
    nonce,
  };
  
  const newState: RatchetState = {
    ...state,
    CKs: ck,
    Ns: state.Ns + 1,
  };
  
  return { message, newState };
}

/**
 * Decrypt a message
 */
export function RatchetDecrypt(
  state: RatchetState,
  message: EncryptedRatchetMessage
): { plaintext: string; newState: RatchetState } | null {
  const dhPublic = fromBase64(message.dh);
  
  // Check skipped messages
  const skippedKeyId = `${message.dh}:${message.n}`;
  if (state.MKSKIPPED[skippedKeyId]) {
    const mk = fromBase64(state.MKSKIPPED[skippedKeyId]);
    const ad = createAD(dhPublic, message.pn, message.n);
    const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
    if (!plaintext) return null;
    
    const newState = { ...state };
    delete newState.MKSKIPPED[skippedKeyId];
    return { plaintext, newState };
  }
  
  // Check if DH ratchet step is needed
  if (state.DHr === null || toBase64(state.DHr) !== message.dh) {
    return DHRatchetStep(state, message);
  }
  
  // Skip messages if needed
  const skipResult = skipMessageKeys(state, message.n);
  if (!skipResult) return null;
  
  let newState = skipResult;
  
  const { ck, mk } = KDF_CK(newState.CKr!);
  newState = { ...newState, CKr: ck, Nr: newState.Nr + 1 };
  
  const ad = createAD(dhPublic, message.pn, message.n);
  const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
  if (!plaintext) return null;
  
  return { plaintext, newState };
}

function DHRatchetStep(
  state: RatchetState,
  message: EncryptedRatchetMessage
): { plaintext: string; newState: RatchetState } | null {
  const dhPublic = fromBase64(message.dh);
  
  const skipResult = state.CKr ? skipMessageKeys(state, state.Nr + message.pn) : state;
  if (!skipResult) return null;
  
  let newState = skipResult;
  newState = { ...newState, PN: newState.Ns, Ns: 0 };
  newState = { ...newState, DHr: dhPublic };
  
  const dhOut1 = DH(newState.DHs, dhPublic);
  const { rk: rk1, ck: ckr } = KDF_RK(newState.RK, dhOut1);
  newState = { ...newState, RK: rk1, CKr: ckr };
  
  const skipResult2 = skipMessageKeys(newState, message.n);
  if (!skipResult2) return null;
  newState = skipResult2;
  
  const { ck: ckr2, mk } = KDF_CK(newState.CKr!);
  newState = { ...newState, CKr: ckr2, Nr: newState.Nr + 1 };
  
  const ad = createAD(dhPublic, message.pn, message.n);
  const plaintext = DECRYPT(mk, message.ciphertext, message.nonce, ad);
  if (!plaintext) return null;
  
  const newDHs = nacl.box.keyPair();
  const dhOut2 = DH(newDHs, dhPublic);
  const { rk: rk2, ck: cks } = KDF_RK(newState.RK, dhOut2);
  newState = { ...newState, DHs: newDHs, RK: rk2, CKs: cks };
  
  return { plaintext, newState };
}

function skipMessageKeys(state: RatchetState, until: number): RatchetState | null {
  if (state.Nr + MAX_SKIP < until) return null;
  
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

// =============================================================================
// Serialization
// =============================================================================

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

/**
 * Crypto utilities for the extension
 * Uses TweetNaCl for Ed25519 signing and X25519 key exchange
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedBundle {
  ciphertext: string;
  nonce: string;
  salt: string;
}

// ============================================
// Key Generation
// ============================================

/**
 * Generate a new Ed25519 signing keypair
 */
export function generateSigningKeyPair(): KeyPair {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

/**
 * Derive X25519 encryption keypair from Ed25519 signing keypair
 * @deprecated Use generateEdgeKeyPair() for new edges - derived keys are linkable!
 */
export function deriveEncryptionKeyPair(signingSecretKey: Uint8Array): KeyPair {
  // Extract the seed (first 32 bytes of the 64-byte secret key)
  const seed = signingSecretKey.slice(0, 32);
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

/**
 * Generate a random X25519 keypair for edge-level encryption
 * Each edge gets a unique, unlinkable keypair
 */
export function generateEdgeKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
  };
}

/**
 * Compute fingerprint of a public key (first 16 bytes of hash, hex encoded)
 */
export function computeFingerprint(publicKey: Uint8Array): string {
  const hash = nacl.hash(publicKey);
  const fingerprint = hash.slice(0, 16);
  return Array.from(fingerprint)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// Key Storage (Encryption at Rest)
// ============================================

/**
 * Derive an encryption key from a passphrase using PBKDF2-like approach
 * Note: For production, use a proper KDF. This is simplified for browser compatibility.
 */
async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  
  // Use SubtleCrypto for PBKDF2
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
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256 // 32 bytes
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Encrypt a secret key for storage using a passphrase
 */
export async function encryptSecretKey(
  secretKey: Uint8Array,
  passphrase: string
): Promise<EncryptedBundle> {
  // Generate random salt and nonce
  const salt = nacl.randomBytes(32);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  // Derive encryption key from passphrase
  const encryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
  
  // Encrypt the secret key
  const ciphertext = nacl.secretbox(secretKey, nonce, encryptionKey);
  
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    salt: encodeBase64(salt),
  };
}

/**
 * Decrypt a secret key from storage using a passphrase
 */
export async function decryptSecretKey(
  bundle: EncryptedBundle,
  passphrase: string
): Promise<Uint8Array | null> {
  try {
    const ciphertext = decodeBase64(bundle.ciphertext);
    const nonce = decodeBase64(bundle.nonce);
    const salt = decodeBase64(bundle.salt);
    
    // Derive encryption key from passphrase
    const encryptionKey = await deriveKeyFromPassphrase(passphrase, salt);
    
    // Decrypt
    const secretKey = nacl.secretbox.open(ciphertext, nonce, encryptionKey);
    
    return secretKey || null;
  } catch {
    return null;
  }
}

// ============================================
// Signing
// ============================================

/**
 * Sign a message with Ed25519 secret key
 */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

/**
 * Verify an Ed25519 signature
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Sign a string message and return base64 signature
 */
export function signString(message: string, secretKey: Uint8Array): string {
  const messageBytes = decodeUTF8(message);
  const signature = sign(messageBytes, secretKey);
  return encodeBase64(signature);
}

// ============================================
// Encryption (for Native Chat)
// ============================================

/**
 * Encrypt a message for a recipient using their X25519 public key
 * Uses ephemeral key exchange for forward secrecy per-message
 */
export function encryptMessage(
  plaintext: string,
  recipientPubkey: Uint8Array,
  _senderPrivateKey: Uint8Array
): { ciphertext: string; ephemeralPubkey: string; nonce: string } {
  // Generate ephemeral keypair for this message
  const ephemeralKp = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt using crypto_box (X25519 + XSalsa20-Poly1305)
  const plaintextBytes = decodeUTF8(plaintext);
  const ciphertext = nacl.box(
    plaintextBytes,
    nonce,
    recipientPubkey,
    ephemeralKp.secretKey
  );
  
  return {
    ciphertext: encodeBase64(ciphertext),
    ephemeralPubkey: encodeBase64(ephemeralKp.publicKey),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a message from a sender
 */
export function decryptMessage(
  ciphertextBase64: string,
  nonceBase64: string,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): string | null {
  try {
    const ciphertext = decodeBase64(ciphertextBase64);
    const nonce = decodeBase64(nonceBase64);
    
    const plaintext = nacl.box.open(
      ciphertext,
      nonce,
      senderPublicKey,
      recipientSecretKey
    );
    
    return plaintext ? encodeUTF8(plaintext) : null;
  } catch {
    return null;
  }
}

// ============================================
// Utilities
// ============================================

/**
 * Decrypt email address that was encrypted with sealed box pattern
 * Used to decrypt sender's email address from the server for replies
 * 
 * @param encryptedPackage - JSON string with ephemeralPubkey, nonce, ciphertext
 * @param recipientSecretKey - Identity's X25519 secret key (derived from signing key)
 * @returns Decrypted email address
 */
export function decryptEmail(
  encryptedPackage: string,
  recipientSecretKey: Uint8Array
): string {
  const pkg = JSON.parse(encryptedPackage);
  const ephemeralPubkey = decodeBase64(pkg.ephemeralPubkey);
  const nonce = decodeBase64(pkg.nonce);
  const ciphertext = decodeBase64(pkg.ciphertext);
  
  const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPubkey, recipientSecretKey);
  
  if (!decrypted) {
    throw new Error('Failed to decrypt email address');
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt a plaintext string for a recipient's public key
 * Returns: ephemeralPubkey:nonce:ciphertext (all base64, colon-separated)
 * Used to encrypt recipient email for worker
 */
export function encryptForRecipient(
  plaintext: string,
  recipientPublicKeyBase64: string
): string {
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  
  const ciphertext = nacl.box(
    plaintextBytes,
    nonce,
    recipientPublicKey,
    ephemeralKeyPair.secretKey
  );
  
  // Return as colon-separated base64 string
  return `${encodeBase64(ephemeralKeyPair.publicKey)}:${encodeBase64(nonce)}:${encodeBase64(ciphertext)}`;
}

/**
 * Generate a random nonce for auth challenges
 */
export function generateNonce(): string {
  const bytes = nacl.randomBytes(32);
  return encodeBase64(bytes);
}

// ============================================
// Local Storage Encryption
// ============================================

// Fixed salt for storage key derivation (deterministic from passphrase)
// This is safe because we're deriving from a high-entropy passphrase
const STORAGE_KEY_CONTEXT = 'relay-local-message-storage-v1';

/**
 * Derive a storage encryption key from identity secret key
 * Used to encrypt messages at rest in chrome.storage.local
 */
export function deriveStorageKey(identitySecretKey: Uint8Array): Uint8Array {
  // Use HKDF-like derivation: hash(secret || context)
  const context = new TextEncoder().encode(STORAGE_KEY_CONTEXT);
  const combined = new Uint8Array(identitySecretKey.length + context.length);
  combined.set(identitySecretKey, 0);
  combined.set(context, identitySecretKey.length);
  
  // Hash to get 32-byte key
  const hash = nacl.hash(combined);
  return hash.slice(0, 32);
}

/**
 * Encrypt a message for local storage
 */
export function encryptForStorage(
  plaintext: string,
  storageKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = nacl.secretbox(plaintextBytes, nonce, storageKey);
  
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a message from local storage
 */
export function decryptFromStorage(
  ciphertext: string,
  nonce: string,
  storageKey: Uint8Array
): string | null {
  try {
    const ciphertextBytes = decodeBase64(ciphertext);
    const nonceBytes = decodeBase64(nonce);
    
    const plaintextBytes = nacl.secretbox.open(ciphertextBytes, nonceBytes, storageKey);
    if (!plaintextBytes) return null;
    
    return new TextDecoder().decode(plaintextBytes);
  } catch {
    return null;
  }
}

/**
 * Encode bytes to base64
 */
export function toBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

/**
 * Decode base64 to bytes
 */
export function fromBase64(base64: string): Uint8Array {
  return decodeBase64(base64);
}

/**
 * Generate a simple ID
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}${random}`;
}

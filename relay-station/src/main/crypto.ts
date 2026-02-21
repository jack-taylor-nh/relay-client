/**
 * Cryptography Utilities
 * 
 * Uses TweetNaCl for X25519 (encryption) and Ed25519 (signatures)
 * Matches Relay protocol crypto scheme
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil;

/**
 * Generate X25519 keypair for encryption
 */
export function generateX25519Keypair(): {
  publicKey: string;
  privateKey: string;
} {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keypair.publicKey),
    privateKey: encodeBase64(keypair.secretKey),
  };
}

/**
 * Generate Ed25519 keypair for signing
 */
export function generateEd25519Keypair(): {
  publicKey: string;
  privateKey: string;
} {
  const keypair = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(keypair.publicKey),
    privateKey: encodeBase64(keypair.secretKey),
  };
}

/**
 * Encrypt a message using NaCl Box (X25519 + XSalsa20-Poly1305)
 * 
 * @param plaintext - Message to encrypt
 * @param recipientPublicKey - Recipient's X25519 public key (base64)
 * @returns Encrypted payload with ephemeral key and nonce
 */
export function encrypt(
  plaintext: string,
  recipientPublicKey: string
): {
  ciphertext: string;
  ephemeralPublicKey: string;
  nonce: string;
} {
  // Generate ephemeral keypair for this message
  const ephemeralKeypair = nacl.box.keyPair();

  // Generate random nonce
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Decode recipient's public key
  const recipientPubKey = decodeBase64(recipientPublicKey);

  // Encrypt message
  const messageBytes = decodeUTF8(plaintext);
  const ciphertextBytes = nacl.box(
    messageBytes,
    nonce,
    recipientPubKey,
    ephemeralKeypair.secretKey
  );

  if (!ciphertextBytes) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext: encodeBase64(ciphertextBytes),
    ephemeralPublicKey: encodeBase64(ephemeralKeypair.publicKey),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a message using NaCl Box
 * 
 * @param ciphertext - Encrypted message (base64)
 * @param ephemeralPublicKey - Sender's ephemeral public key (base64)
 * @param nonce - Nonce used for encryption (base64)
 * @param recipientPrivateKey - Our private key (base64)
 * @returns Decrypted plaintext
 */
export function decrypt(
  ciphertext: string,
  ephemeralPublicKey: string,
  nonce: string,
  recipientPrivateKey: string
): string {
  // Decode all inputs
  const ciphertextBytes = decodeBase64(ciphertext);
  const ephemeralPubKey = decodeBase64(ephemeralPublicKey);
  const nonceBytes = decodeBase64(nonce);
  const privateKey = decodeBase64(recipientPrivateKey);

  // Decrypt
  const plaintextBytes = nacl.box.open(
    ciphertextBytes,
    nonceBytes,
    ephemeralPubKey,
    privateKey
  );

  if (!plaintextBytes) {
    throw new Error('Decryption failed - invalid ciphertext or keys');
  }

  return encodeUTF8(plaintextBytes);
}

/**
 * Sign a message using Ed25519
 * 
 * @param message - Message to sign
 * @param privateKey - Ed25519 private key (base64)
 * @returns Signature (base64)
 */
export function sign(message: string, privateKey: string): string {
  const messageBytes = decodeUTF8(message);
  const privateKeyBytes = decodeBase64(privateKey);

  const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
  return encodeBase64(signature);
}

/**
 * Verify a signature using Ed25519
 * 
 * @param message - Original message
 * @param signature - Signature to verify (base64)
 * @param publicKey - Ed25519 public key (base64)
 * @returns True if signature is valid
 */
export function verify(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const messageBytes = decodeUTF8(message);
    const signatureBytes = decodeBase64(signature);
    const publicKeyBytes = decodeBase64(publicKey);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    return false;
  }
}

/**
 * Hash a string using SHA-256 (via NaCl)
 * 
 * @param input - String to hash
 * @returns Hash (hex string)
 */
export function hash(input: string): string {
  const inputBytes = decodeUTF8(input);
  const hashBytes = nacl.hash(inputBytes);
  return bytesToHex(hashBytes);
}

/**
 * Utility: Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Utility: Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Generate a cryptographically secure random string
 * 
 * @param length - Number of random bytes to generate
 * @returns Random string (base64)
 */
export function randomString(length: number = 32): string {
  const bytes = nacl.randomBytes(length);
  return encodeBase64(bytes);
}

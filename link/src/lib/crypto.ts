/**
 * Crypto utilities for Contact Link visitors
 * 
 * Key derivation from seed phrase + linkId to create deterministic keypairs
 * and state encryption keys using tweetnacl.
 */

import nacl from 'tweetnacl';

/**
 * Derive a deterministic shared secret and keypair from seed + linkId
 * 
 * Uses Web Crypto PBKDF2 for key stretching, then generates
 * a deterministic X25519 keypair using the derived seed.
 */
export async function deriveVisitorKeys(seedPhrase: string, linkId: string): Promise<{
  keypair: nacl.BoxKeyPair;
  sharedSecret: Uint8Array;
  stateEncryptionKey: Uint8Array;
  publicKeyBase64: string;
}> {
  const encoder = new TextEncoder();
  
  // Create deterministic seed using PBKDF2
  const pinBytes = encoder.encode(seedPhrase);
  const saltBytes = encoder.encode(`relay-contact-v1:${linkId}`);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive 96 bytes: 32 for keypair seed, 32 for shared secret, 32 for state encryption
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    768 // 96 bytes
  );
  
  const derivedBytes = new Uint8Array(derivedBits);
  const keypairSeed = derivedBytes.slice(0, 32);
  const sharedSecret = derivedBytes.slice(32, 64);
  const stateEncryptionKey = derivedBytes.slice(64, 96);
  
  // Generate deterministic X25519 keypair from seed
  // nacl.box.keyPair.fromSecretKey expects a 32-byte seed
  const keypair = nacl.box.keyPair.fromSecretKey(keypairSeed);
  
  const publicKeyBase64 = btoa(String.fromCharCode(...keypair.publicKey));
  
  return {
    keypair,
    sharedSecret,
    stateEncryptionKey,
    publicKeyBase64,
  };
}

/**
 * Encrypt ratchet state with AES-GCM using derived key
 */
export async function encryptState(
  data: string,
  key: Uint8Array
): Promise<string> {
  // Import the raw key for AES-GCM
  // Cast to ArrayBuffer to satisfy TypeScript's strict type checking
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    dataBytes
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ratchet state with AES-GCM
 */
export async function decryptState(
  encryptedData: string,
  key: Uint8Array
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Derive a deterministic public key identifier from seed + linkId
 * This is used to identify/lookup existing sessions
 */
export async function derivePublicKeyId(seedPhrase: string, linkId: string): Promise<string> {
  const { publicKeyBase64 } = await deriveVisitorKeys(seedPhrase, linkId);
  return publicKeyBase64;
}

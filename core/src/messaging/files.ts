/**
 * File encryption and upload utilities
 * Uses Double Ratchet message keys for file encryption
 */

import nacl from 'tweetnacl';
import { toBase64, fromBase64 } from '../utils/encoding.js';
import type { RatchetState } from '../crypto/ratchet.js';
import { RatchetEncrypt, RatchetDecrypt } from '../crypto/ratchet.js';

// =============================================================================
// Types
// =============================================================================

export interface EncryptedFile {
  /** Encrypted file data */
  ciphertext: Uint8Array;
  /** Nonce for decryption */
  nonce: string;
  /** File encryption key (encrypted with ratchet) */
  encryptedKey: string;
  /** Original MIME type */
  mimeType: string;
  /** Original filename (optional, encrypted) */
  encryptedFilename?: string;
}

export interface FileMetadata {
  id: string;
  conversationId: string;
  messageId?: string;
  mimeType: string;
  sizeBytes: number;
  cdnUrl?: string;
  createdAt: string;
}

// =============================================================================
// File Encryption
// =============================================================================

/**
 * Encrypt a file with a random key, then encrypt the key with the ratchet
 */
export function encryptFile(
  fileData: Uint8Array,
  mimeType: string,
  filename: string | undefined,
  ratchetState: RatchetState
): { encrypted: EncryptedFile; newState: RatchetState } {
  // Generate random file encryption key (32 bytes for XSalsa20)
  const fileKey = nacl.randomBytes(32);
  
  // Generate random nonce
  const nonce = nacl.randomBytes(24);
  
  // Encrypt file with symmetric key
  const ciphertext = nacl.secretbox(fileData, nonce, fileKey);
  
  // Encrypt the file key with the ratchet
  const { message: encryptedKeyMessage, newState } = RatchetEncrypt(
    ratchetState,
    toBase64(fileKey)
  );
  
  // Encrypt filename if provided
  let encryptedFilename: string | undefined;
  if (filename) {
    const filenameNonce = nacl.randomBytes(24);
    const filenameEncrypted = nacl.secretbox(
      new TextEncoder().encode(filename),
      filenameNonce,
      fileKey
    );
    encryptedFilename = JSON.stringify({
      c: toBase64(filenameEncrypted),
      n: toBase64(filenameNonce),
    });
  }
  
  return {
    encrypted: {
      ciphertext,
      nonce: toBase64(nonce),
      encryptedKey: JSON.stringify(encryptedKeyMessage),
      mimeType,
      encryptedFilename,
    },
    newState,
  };
}

/**
 * Decrypt a file by first decrypting the key with the ratchet
 */
export function decryptFile(
  encrypted: EncryptedFile,
  ratchetState: RatchetState
): { fileData: Uint8Array; filename: string | null; newState: RatchetState } | null {
  try {
    // Decrypt the file key using the ratchet
    const encryptedKeyMessage = JSON.parse(encrypted.encryptedKey);
    const decryptResult = RatchetDecrypt(ratchetState, encryptedKeyMessage);
    
    if (!decryptResult) {
      console.error('Failed to decrypt file key');
      return null;
    }
    
    const { plaintext: fileKeyBase64, newState } = decryptResult;
    const fileKey = fromBase64(fileKeyBase64);
    
    // Decrypt the file data
    const nonce = fromBase64(encrypted.nonce);
    const decryptedFile = nacl.secretbox.open(encrypted.ciphertext, nonce, fileKey);
    
    if (!decryptedFile) {
      console.error('Failed to decrypt file data');
      return null;
    }
    
    // Decrypt filename if present
    let filename: string | null = null;
    if (encrypted.encryptedFilename) {
      try {
        const filenameData = JSON.parse(encrypted.encryptedFilename);
        const filenameNonce = fromBase64(filenameData.n);
        const filenameCiphertext = fromBase64(filenameData.c);
        const decryptedFilename = nacl.secretbox.open(
          filenameCiphertext,
          filenameNonce,
          fileKey
        );
        if (decryptedFilename) {
          filename = new TextDecoder().decode(decryptedFilename);
        }
      } catch (err) {
        console.warn('Failed to decrypt filename:', err);
      }
    }
    
    return {
      fileData: decryptedFile,
      filename,
      newState,
    };
  } catch (error) {
    console.error('File decryption error:', error);
    return null;
  }
}

// =============================================================================
// File Upload API
// =============================================================================

/**
 * Upload an encrypted file to the server
 */
export async function uploadFile(
  encryptedFile: EncryptedFile,
  conversationId: string,
  messageId: string | undefined,
  apiUrl: string,
  authToken: string
): Promise<FileMetadata> {
  const formData = new FormData();
  
  // Add encrypted file as blob
  const blob = new Blob([encryptedFile.ciphertext.buffer as ArrayBuffer], {
    type: 'application/octet-stream',
  });
  formData.append('file', blob);
  
  // Add metadata
  formData.append('conversation_id', conversationId);
  if (messageId) {
    formData.append('message_id', messageId);
  }
  formData.append('mime_type', encryptedFile.mimeType);
  if (encryptedFile.encryptedFilename) {
    formData.append('encrypted_filename', encryptedFile.encryptedFilename);
  }
  
  const response = await fetch(`${apiUrl}/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`File upload failed: ${error}`);
  }
  
  return response.json();
}

/**
 * Download an encrypted file from the server
 */
export async function downloadFile(
  fileId: string,
  apiUrl: string,
  authToken: string
): Promise<Uint8Array> {
  const response = await fetch(`${apiUrl}/v1/files/${fileId}/download`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`File download failed: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  fileId: string,
  apiUrl: string,
  authToken: string
): Promise<FileMetadata> {
  const response = await fetch(`${apiUrl}/v1/files/${fileId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get file metadata: ${response.statusText}`);
  }
  
  return response.json();
}

// =============================================================================
// File Message Format
// =============================================================================

/**
 * Create a file message content with encrypted key
 */
export function createFileMessage(
  fileId: string,
  encryptedFile: EncryptedFile,
  originalFilename?: string
): string {
  const fileData = {
    fileId,
    mimeType: encryptedFile.mimeType,
    nonce: encryptedFile.nonce,
    encryptedKey: encryptedFile.encryptedKey,
    encryptedFilename: encryptedFile.encryptedFilename,
    // Store original filename for UI (not encrypted)
    ...(originalFilename && { originalFilename }),
  };
  
  return `[FILE:${JSON.stringify(fileData)}]`;
}

/**
 * Parse a file message and extract file data
 */
export function parseFileMessage(content: string): {
  fileId: string;
  mimeType: string;
  nonce: string;
  encryptedKey: string;
  encryptedFilename?: string;
  originalFilename?: string;
} | null {
  const match = content.match(/^\[FILE:(.*)\]$/);
  if (!match) return null;
  
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Check if a message is a file message
 */
export function isFileMessage(content: string): boolean {
  return content.startsWith('[FILE:');
}

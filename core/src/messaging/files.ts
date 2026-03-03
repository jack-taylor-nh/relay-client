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
  /** File encryption key (encrypted with conversation key) */
  encryptedKey: string;
  /** Original MIME type */
  mimeType: string;
  /** Original filename (optional, encrypted) */
  encryptedFilename?: string;
  /** Root key snapshot (base64) - used to derive file encryption key */
  rkSnapshot?: string;
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

export interface FileUploadResponse {
  success: boolean;
  file: {
    id: string;
    conversation_id: string;
    message_id?: string;
    mime_type: string;
    size_bytes: number;
    cdn_url?: string;
    created_at: string;
  };
}

// =============================================================================
// File Encryption
// =============================================================================

/**
 * Encrypt a file with a random key, then encrypt the key with a conversation-derived key
 * This allows both sender and receiver to decrypt files without issues
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
  
  // Derive a file-specific key from the conversation root key
  // This allows both parties to decrypt files without advancing the ratchet
  const fileKdfInfo = new TextEncoder().encode('RelayFileKey');
  const conversationFileKey = nacl.hash(new Uint8Array([...ratchetState.RK, ...fileKdfInfo])).slice(0, 32);
  
  // Encrypt the file key with the conversation file key
  const fileKeyNonce = nacl.randomBytes(24);
  const encryptedFileKey = nacl.secretbox(
    fileKey,
    fileKeyNonce,
    conversationFileKey
  );
  
  // Store encrypted file key as JSON with nonce
  const encryptedKeyMessage = JSON.stringify({
    c: toBase64(encryptedFileKey),
    n: toBase64(fileKeyNonce),
  });
  
  // Store RK snapshot so we can decrypt even if ratchet has advanced
  const rkSnapshot = toBase64(ratchetState.RK);
  
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
      encryptedKey: encryptedKeyMessage,
      mimeType,
      encryptedFilename,
      rkSnapshot, // Include RK snapshot for decryption
    },
    newState: ratchetState, // Don't advance ratchet for file operations
  };
}

/**
 * Decrypt a file by first decrypting the key with the conversation-derived key
 * Also supports legacy ratchet-based encryption for backward compatibility
 */
export function decryptFile(
  encrypted: EncryptedFile,
  ratchetState: RatchetState
): { fileData: Uint8Array; filename: string | null; newState: RatchetState } | null {
  try {
    const encryptedKeyData = JSON.parse(encrypted.encryptedKey);
    let fileKey: Uint8Array;
    let newState = ratchetState;
    
    // Check if this is old ratchet-based encryption (has 'dh' property)
    if ('dh' in encryptedKeyData) {
      console.log('Detected legacy ratchet-based file encryption, using RatchetDecrypt');
      // Legacy format: decrypt with ratchet
      const decryptResult = RatchetDecrypt(ratchetState, encryptedKeyData);
      
      if (!decryptResult) {
        console.error('Failed to decrypt file key (legacy ratchet format)');
        return null;
      }
      
      const { plaintext: fileKeyBase64, newState: updatedState } = decryptResult;
      fileKey = fromBase64(fileKeyBase64);
      newState = updatedState;
    } else {
      // New format: decrypt with conversation-derived key
      const fileKdfInfo = new TextEncoder().encode('RelayFileKey');
      
      // Use RK snapshot from file metadata if available, otherwise use current RK
      const rkToUse = encrypted.rkSnapshot 
        ? fromBase64(encrypted.rkSnapshot)
        : ratchetState.RK;
      
      const conversationFileKey = nacl.hash(new Uint8Array([...rkToUse, ...fileKdfInfo])).slice(0, 32);
      
      const fileKeyNonce = fromBase64(encryptedKeyData.n);
      const encryptedFileKey = fromBase64(encryptedKeyData.c);
      
      const decryptedKey = nacl.secretbox.open(
        encryptedFileKey,
        fileKeyNonce,
        conversationFileKey
      );
      
      if (!decryptedKey) {
        console.error('Failed to decrypt file key');
        return null;
      }
      
      fileKey = decryptedKey;
    }
    
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
      newState, // Use newState (updated for legacy, unchanged for new format)
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
): Promise<FileUploadResponse> {
  const formData = new FormData();
  
  // Add encrypted file as blob
  // IMPORTANT: Create a new ArrayBuffer with only the exact bytes we need
  // to avoid uploading extra bytes if the Uint8Array is a view into a larger ArrayBuffer
  const exactBuffer = encryptedFile.ciphertext.buffer.slice(
    encryptedFile.ciphertext.byteOffset,
    encryptedFile.ciphertext.byteOffset + encryptedFile.ciphertext.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([exactBuffer], {
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
    rkSnapshot: encryptedFile.rkSnapshot, // Include RK snapshot
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
  rkSnapshot?: string;
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

/**
 * Parse a combined message that may contain both a file message and text
 * Returns the file data and any remaining text content
 */
export function parseCombinedMessage(content: string): {
  fileData: {
    fileId: string;
    mimeType: string;
    nonce: string;
    encryptedKey: string;
    encryptedFilename?: string;
    originalFilename?: string;
    rkSnapshot?: string;
  } | null;
  textContent: string;
} {
  // Match [FILE:{...}] anywhere in the content
  const match = content.match(/^\[FILE:(.*?)\](.*)$/s);
  
  if (!match) {
    return { fileData: null, textContent: content };
  }
  
  try {
    const fileData = JSON.parse(match[1]);
    const textContent = match[2]; // Everything after the file message
    return { fileData, textContent };
  } catch {
    return { fileData: null, textContent: content };
  }
}

/**
 * Relay Background Service Worker
 * 
 * Handles:
 * - Crypto operations (keypair generation, signing, encryption)
 * - Secure storage management
 * - API communication
 * - Session state
 */

import {
  generateSigningKeyPair,
  computeFingerprint,
  encryptSecretKey,
  decryptSecretKey,
  signString,
  toBase64,
  fromBase64,
  deriveEncryptionKeyPair,
  generateEdgeKeyPair,
  encryptMessage,
  decryptMessage,
  decryptEmail,
  type EncryptedBundle,
} from '../lib/crypto';
import { sendMessage as sendUnifiedMessage, receiveMessage as receiveUnifiedMessage, type Conversation as RatchetConversation, type SecurityLevel, type EdgeType } from '@relay/core';
import { ratchetStorage } from '../lib/storage';

// ============================================
// Types
// ============================================

interface StoredIdentity {
  publicKey: string;
  fingerprint: string;
  encryptedSecretKey: EncryptedBundle;
  handle: string | null;
  createdAt: string;
}

interface UnlockedIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  fingerprint: string;
  handle: string | null;
}

interface SessionState {
  token: string | null;
  expiresAt: number | null;
}

// ============================================
// State
// ============================================

let unlockedIdentity: UnlockedIdentity | null = null;
let session: SessionState = { token: null, expiresAt: null };

// Auto-lock timer
let lockTimer: ReturnType<typeof setTimeout> | null = null;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function resetLockTimer() {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    lock();
    notifyPanel({ type: 'LOCKED' });
  }, LOCK_TIMEOUT_MS);
}

// ============================================
// Chrome Extension Setup
// ============================================

// Open side panel on extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handling from panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      console.error('Background error:', error);
      sendResponse({ error: error.message });
    });
  return true; // Indicates async response
});

// Notify panel of state changes
function notifyPanel(message: object) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel might not be open
  });
}

// ============================================
// Message Handlers
// ============================================

type MessageType =
  | { type: 'GET_STATE' }
  | { type: 'CREATE_IDENTITY'; payload: { passphrase: string } }
  | { type: 'UNLOCK'; payload: { passphrase: string } }
  | { type: 'LOCK' }
  | { type: 'LOGOUT' }
  | { type: 'CLAIM_HANDLE'; payload: { handle: string } }
  | { type: 'GET_HANDLES' }
  | { type: 'CREATE_HANDLE'; payload: { handle: string; displayName?: string } }
  | { type: 'DELETE_HANDLE'; payload: { handleId: string } }
  | { type: 'SIGN_MESSAGE'; payload: { message: string } }
  | { type: 'GET_PUBLIC_KEY' }
  | { type: 'GET_AUTH_TOKEN' }
  | { type: 'RESOLVE_HANDLE'; payload: { handle: string } }
  | { type: 'GET_CONVERSATIONS' }
  | { type: 'GET_MESSAGES'; payload: { conversationId: string; cursor?: string } }
  | { type: 'SEND_MESSAGE'; payload: { recipientIdentityId: string; recipientPublicKey: string; content: string; conversationId?: string } }
  | { type: 'SEND_NATIVE_MESSAGE'; payload: { recipientHandle: string; senderHandle: string; content: string } }
  | { type: 'SEND_EMAIL'; payload: { conversationId: string; content: string } }
  | { type: 'SEND_TO_EDGE'; payload: { myEdgeId: string; recipientEdgeId: string; recipientX25519PublicKey: string; content: string; conversationId?: string; origin?: 'native' | 'email' | 'contact_link' | 'bridge' } }
  | { type: 'CREATE_EDGE'; payload: { type: 'native' | 'email' | 'contact_link'; label?: string; customAddress?: string; displayName?: string } }
  | { type: 'GET_EDGE_TYPES' }
  | { type: 'GET_EDGES' }
  | { type: 'BURN_EDGE'; payload: { edgeId: string } }
  | { type: 'GET_ALIASES' }
  | { type: 'CREATE_ALIAS'; payload: { label?: string } };

async function handleMessage(message: MessageType): Promise<unknown> {
  // Reset lock timer on activity
  if (unlockedIdentity) {
    resetLockTimer();
  }

  switch (message.type) {
    case 'GET_STATE':
      return getState();

    case 'CREATE_IDENTITY':
      return createIdentity(message.payload.passphrase);

    case 'UNLOCK':
      return unlock(message.payload.passphrase);

    case 'LOCK':
      return lock();

    case 'LOGOUT':
      return logout();

    case 'CLAIM_HANDLE':
      return claimHandle(message.payload.handle);

    case 'GET_HANDLES':
      return getHandles();

    case 'CREATE_HANDLE':
      return createHandle(message.payload.handle, message.payload.displayName);

    case 'DELETE_HANDLE':
      return deleteHandle(message.payload.handleId);

    case 'SIGN_MESSAGE':
      return signMessage(message.payload.message);

    case 'GET_PUBLIC_KEY':
      return getPublicKey();

    case 'GET_AUTH_TOKEN':
      const token = await getAuthToken();
      return token ? { token } : { error: 'Failed to get auth token' };

    case 'RESOLVE_HANDLE':
      return resolveHandle(message.payload.handle);

    case 'GET_CONVERSATIONS':
      return getConversations();

    case 'GET_MESSAGES':
      return getMessages(message.payload.conversationId, message.payload.cursor);

    case 'SEND_MESSAGE':
      // DEPRECATED: Use SEND_TO_EDGE for new code
      return sendMessage(message.payload);

    case 'SEND_NATIVE_MESSAGE':
      // DEPRECATED: Use SEND_TO_EDGE for new code
      return sendNativeMessage(message.payload.recipientHandle, message.payload.senderHandle, message.payload.content);

    case 'SEND_EMAIL':
      // DEPRECATED: Use SEND_TO_EDGE for new code (email goes via bridge edge)
      return sendEmail(message.payload.conversationId, message.payload.content);

    case 'SEND_TO_EDGE':
      // UNIFIED: Single function for all edge-to-edge messaging
      return sendToEdge(
        message.payload.myEdgeId,
        message.payload.recipientEdgeId,
        message.payload.recipientX25519PublicKey,
        message.payload.content,
        message.payload.conversationId,
        message.payload.origin
      );

    case 'CREATE_EDGE':
      return createEdge(message.payload.type, message.payload.label, message.payload.customAddress, message.payload.displayName);

    case 'GET_EDGE_TYPES':
      return getEdgeTypes();

    case 'GET_EDGES':
      return getEdges();

    case 'BURN_EDGE':
      return burnEdge(message.payload.edgeId);

    case 'GET_ALIASES':
      // Aliases are now edges - redirect to getEdges
      return getEdges();

    case 'CREATE_ALIAS':
      // Aliases are now edges - redirect to createEdge with email type
      return createEdge('email', message.payload.label);

    default:
      throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
  }
}

// ============================================
// State Management
// ============================================

async function getState(): Promise<{
  exists: boolean;
  unlocked: boolean;
  handle: string | null;
  fingerprint: string | null;
}> {
  const stored = await getStoredIdentity();
  
  return {
    exists: stored !== null,
    unlocked: unlockedIdentity !== null,
    handle: unlockedIdentity?.handle ?? stored?.handle ?? null,
    fingerprint: unlockedIdentity?.fingerprint ?? stored?.fingerprint ?? null,
  };
}

async function getStoredIdentity(): Promise<StoredIdentity | null> {
  const result = await chrome.storage.local.get(['identity']);
  return result.identity || null;
}

// ============================================
// Identity Operations
// ============================================

let isCreatingIdentity = false;

async function createIdentity(passphrase: string): Promise<{
  success: boolean;
  fingerprint: string;
  publicKey: string;
}> {
  // Prevent duplicate creation attempts
  if (isCreatingIdentity) {
    throw new Error('Identity creation already in progress');
  }

  // Check if identity already exists
  const existing = await getStoredIdentity();
  if (existing) {
    throw new Error('Identity already exists');
  }

  isCreatingIdentity = true;

  try {
    // Generate new keypair
    const keyPair = generateSigningKeyPair();
  const fingerprint = computeFingerprint(keyPair.publicKey);
  const publicKeyBase64 = toBase64(keyPair.publicKey);

  // Encrypt secret key with passphrase
  const encryptedSecretKey = await encryptSecretKey(keyPair.secretKey, passphrase);

  // Store identity locally
  const identity: StoredIdentity = {
    publicKey: publicKeyBase64,
    fingerprint,
    encryptedSecretKey,
    handle: null,
    createdAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({ identity });

  // Set as unlocked
  unlockedIdentity = {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    fingerprint,
    handle: null,
  };

  resetLockTimer();

  // Register identity with API
  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-register:${nonce}`;
    const signature = signString(messageToSign, keyPair.secretKey);

    const res = await fetch(`${apiUrl}/v1/identity/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: publicKeyBase64,
        nonce,
        signature,
      }),
    });

    if (!res.ok) {
      console.warn('Failed to register identity with API, will retry on next unlock');
    }
  } catch (error) {
    console.warn('API registration failed:', error);
    // Continue anyway - local identity is created
  }

  onUnlock(); // Start background polling

  return {
    success: true,
    fingerprint,
    publicKey: publicKeyBase64,
  };
} finally {
    isCreatingIdentity = false;
  }
}

async function unlock(passphrase: string): Promise<{ success: boolean; error?: string }> {
  const stored = await getStoredIdentity();
  
  if (!stored) {
    return { success: false, error: 'No identity found' };
  }

  // Decrypt secret key
  const secretKey = await decryptSecretKey(stored.encryptedSecretKey, passphrase);
  
  if (!secretKey) {
    return { success: false, error: 'Invalid passphrase' };
  }

  // Decode public key
  const publicKey = fromBase64(stored.publicKey);

  // Set as unlocked
  unlockedIdentity = {
    publicKey,
    secretKey,
    fingerprint: stored.fingerprint,
    handle: stored.handle,
  };

  resetLockTimer();
  onUnlock(); // Start background polling

  return { success: true };
}

function lock(): { success: boolean } {
  if (unlockedIdentity?.secretKey) {
    // Zero out secret key in memory
    unlockedIdentity.secretKey.fill(0);
  }
  
  unlockedIdentity = null;
  session = { token: null, expiresAt: null };
  
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
  
  onLock(); // Stop background polling

  return { success: true };
}

async function logout(): Promise<{ success: boolean }> {
  // First lock to clear memory
  lock();
  
  // Clear all stored data
  await chrome.storage.local.remove([
    'identity',
    'edgeKeys',
    'session',
  ]);
  
  return { success: true };
}

// ============================================
// Handle Operations
// ============================================

async function claimHandle(handle: string): Promise<{
  success: boolean;
  handle?: string;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  // Clean handle
  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();

  // Validate handle format
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(cleanHandle)) {
    return {
      success: false,
      error: 'Handle must be 3-24 characters, start with a letter, and contain only letters, numbers, and underscores',
    };
  }

  try {
    // Get API base URL
    const apiUrl = await getApiUrl();

    // Step 1: Request nonce
    const nonceRes = await fetch(`${apiUrl}/v1/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityId: unlockedIdentity.fingerprint }),
    });

    if (!nonceRes.ok) {
      const err = await nonceRes.json();
      return { success: false, error: err.message || 'Failed to get nonce' };
    }

    const { nonce } = await nonceRes.json();

    // Step 2: Sign the claim message
    const messageToSign = `relay-claim:${cleanHandle}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    // Step 3: Claim handle
    const claimRes = await fetch(`${apiUrl}/v1/handle/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: cleanHandle,
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
      }),
    });

    if (!claimRes.ok) {
      const err = await claimRes.json();
      return { success: false, error: err.message || 'Failed to claim handle' };
    }

    // Update stored identity with handle
    const stored = await getStoredIdentity();
    if (stored) {
      stored.handle = cleanHandle;
      await chrome.storage.local.set({ identity: stored });
    }

    // Update unlocked identity
    unlockedIdentity.handle = cleanHandle;

    return { success: true, handle: cleanHandle };
  } catch (error) {
    console.error('Claim handle error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

async function getHandles(): Promise<{
  success: boolean;
  handles?: any[];
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    const res = await fetch(`${apiUrl}/v1/handles`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to fetch handles' };
    }
    
    const data = await res.json();
    return { success: true, handles: data.handles };
  } catch (error) {
    console.error('Get handles error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function createHandle(handle: string, displayName?: string): Promise<{
  success: boolean;
  handle?: any;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    // Generate random X25519 keypair for this edge (unique, unlinkable)
    const edgeEncryptionKeys = generateEdgeKeyPair();
    const edgeX25519PublicKey = toBase64(edgeEncryptionKeys.publicKey);
    
    console.log('Creating handle with unique edge encryption key:', {
      handle,
      hasEdgeKey: !!edgeX25519PublicKey,
    });
    
    const res = await fetch(`${apiUrl}/v1/handles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        handle, 
        displayName,
        x25519PublicKey: edgeX25519PublicKey,
      }),
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to create handle' };
    }
    
    const data = await res.json();
    
    // Store edge keypair locally for this handle
    const edgeId = data.nativeEdge?.id;
    if (edgeId) {
      const edgeKeyEntry = {
        [edgeId]: {
          publicKey: toBase64(edgeEncryptionKeys.publicKey),
          secretKey: toBase64(edgeEncryptionKeys.secretKey),
          address: handle,  // Store handle for lookup
          type: 'native',
          createdAt: new Date().toISOString(),
        },
      };
      
      // Merge with existing edge keys
      const storage = await chrome.storage.local.get(['edgeKeys']);
      const existingKeys = storage.edgeKeys || {};
      await chrome.storage.local.set({
        edgeKeys: { ...existingKeys, ...edgeKeyEntry },
      });
      
      console.log('Stored edge keypair for handle:', handle, 'edgeId:', edgeId);
    }
    
    return { success: true, handle: data };
  } catch (error) {
    console.error('Create handle error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function deleteHandle(handleId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    const res = await fetch(`${apiUrl}/v1/handles/${handleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to delete handle' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Delete handle error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Signing
// ============================================

async function signMessage(message: string): Promise<{ signature: string } | { error: string }> {
  if (!unlockedIdentity) {
    return { error: 'Wallet is locked' };
  }

  const signature = signString(message, unlockedIdentity.secretKey);
  return { signature };
}

async function getPublicKey(): Promise<{ publicKey: string } | { error: string }> {
  if (!unlockedIdentity) {
    return { error: 'Wallet is locked' };
  }

  return { publicKey: toBase64(unlockedIdentity.publicKey) };
}

// ============================================
// API Configuration
// ============================================

async function getApiUrl(): Promise<string> {
  const result = await chrome.storage.local.get(['apiUrl']);
  return result.apiUrl || 'https://api.rlymsg.com';
}

// Simple helper for encrypting strings to base64 recipient public keys
function encryptForRecipient(plaintext: string, recipientPublicKeyBase64: string): string {
  const recipientPubKey = fromBase64(recipientPublicKeyBase64);
  const encrypted = encryptMessage(plaintext, recipientPubKey, new Uint8Array(32));
  return JSON.stringify(encrypted);
}

// ============================================
// Authentication
// ============================================

async function getAuthToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (session.token && session.expiresAt && session.expiresAt > Date.now()) {
    return session.token;
  }

  if (!unlockedIdentity) {
    return null;
  }

  try {
    const apiUrl = await getApiUrl();
    const fingerprint = unlockedIdentity.fingerprint;
    const publicKey = toBase64(unlockedIdentity.publicKey);

    // Step 1: Request nonce
    const nonceRes = await fetch(`${apiUrl}/v1/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityId: fingerprint }),
    });

    if (!nonceRes.ok) {
      console.error('Failed to get auth nonce');
      return null;
    }

    const { nonce } = await nonceRes.json();

    // Step 2: Sign nonce
    const messageToSign = `relay-auth:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    // Step 3: Verify signature and get token
    const verifyRes = await fetch(`${apiUrl}/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey, nonce, signature }),
    });

    if (!verifyRes.ok) {
      console.error('Failed to verify signature');
      return null;
    }

    const { token, expiresAt } = await verifyRes.json();

    // Cache token
    session.token = token;
    session.expiresAt = new Date(expiresAt).getTime();

    return token;
  } catch (error) {
    console.error('Auth token error:', error);
    return null;
  }
}

// Clear session on lock
function clearSession() {
  session.token = null;
  session.expiresAt = null;
}

// ============================================
// Edge Resolution (Unified)
// ============================================

interface ResolvedEdge {
  edgeId: string;
  type: string;
  status: string;
  securityLevel: string;
  x25519PublicKey: string;
  displayName?: string | null;
}

/**
 * Unified edge resolution - resolves any edge type to its encryption key
 * Phase 5: Also handles bridge edges with fallback to worker endpoint
 * Returns ONLY edge data - no identity information
 */
async function resolveEdge(
  type: 'native' | 'email' | 'contact_link' | 'bridge',
  address: string
): Promise<{
  success: boolean;
  edge?: ResolvedEdge;
  error?: string;
}> {
  try {
    const apiUrl = await getApiUrl();
    
    const res = await fetch(`${apiUrl}/v1/edge/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, address: address.toLowerCase() }),
    });
    
    // Handle bridge redirect (307) - fallback to worker endpoint
    if (res.status === 307 && type === 'bridge') {
      const data = await res.json();
      if (data.workerUrl) {
        console.log('[resolveEdge] Bridge redirect to worker:', data.workerUrl);
        // Fetch directly from worker
        const workerRes = await fetch(data.workerUrl);
        if (workerRes.ok) {
          const workerData = await workerRes.json();
          return {
            success: true,
            edge: {
              edgeId: `RELAY_${address.toUpperCase()}_BRIDGE`,
              type: 'bridge',
              status: 'active',
              securityLevel: 'gateway_secured',
              x25519PublicKey: workerData.publicKey,
              displayName: `${address.charAt(0).toUpperCase() + address.slice(1)} Bridge`,
            },
          };
        }
      }
      return { success: false, error: 'Failed to resolve bridge from worker' };
    }
    
    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, error: `${type} edge not found: ${address}` };
      }
      if (res.status === 410) {
        return { success: false, error: 'Edge is no longer active' };
      }
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to resolve edge' };
    }
    
    const data = await res.json();
    
    return {
      success: true,
      edge: {
        edgeId: data.edgeId,
        type: data.type,
        status: data.status,
        securityLevel: data.securityLevel,
        x25519PublicKey: data.x25519PublicKey,
        displayName: data.displayName,
      },
    };
  } catch (error) {
    console.error('Resolve edge error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Handle Resolution (Legacy wrapper)
// ============================================

/**
 * @deprecated Use resolveEdge('native', handle) instead
 */
async function resolveHandle(handle: string): Promise<{
  success: boolean;
  handle?: string;
  x25519PublicKey?: string;
  edgeId?: string;
  displayName?: string;
  error?: string;
}> {
  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();
  
  // Use unified edge resolution
  const result = await resolveEdge('native', cleanHandle);
  
  if (!result.success || !result.edge) {
    return { success: false, error: result.error };
  }
  
  return {
    success: true,
    handle: cleanHandle,
    x25519PublicKey: result.edge.x25519PublicKey,
    edgeId: result.edge.edgeId,
    displayName: result.edge.displayName || undefined,
  };
}

// ============================================
// Conversations
// ============================================

async function getConversations(): Promise<{
  success: boolean;
  conversations?: Array<{
    id: string;
    origin: string;
    securityLevel: string;
    channelLabel?: string;
    edge?: {
      id: string;
      type: string;
      address: string;
      label?: string;
      status: string;
    };
    myEdgeId?: string;  // Phase 4: My edge ID for this conversation
    counterparty?: {
      identityId?: string;
      externalId?: string;
      displayName?: string;
      handle?: string;          // Phase 4: Counterparty handle
      edgeId?: string;          // Phase 4: Counterparty edge ID
      x25519PublicKey?: string; // Phase 4: Counterparty encryption key
    };
    lastActivityAt: string;
    createdAt: string;
  }>;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    const res = await fetch(`${apiUrl}/v1/conversations`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to fetch conversations' };
    }
    
    const data = await res.json();
    return { success: true, conversations: data.conversations };
  } catch (error) {
    console.error('Get conversations error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function getMessages(
  conversationId: string, 
  cursor?: string
): Promise<{
  success: boolean;
  securityLevel?: string;
  messages?: Array<{
    id: string;
    senderIdentityId?: string;
    senderExternalId?: string;
    content: string;
    createdAt: string;
    isMine: boolean;
  }>;
  cursor?: string | null;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    
    const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to fetch messages' };
    }
    
    const data = await res.json();
    
    // Get conversation details to determine edge info for ratchet decryption
    // This is needed for Double Ratchet messages to get the counterparty's edge public key
    let conversationDetails: {
      myEdgeId?: string;
      counterpartyEdgeId?: string;
      counterpartyX25519Key?: string;
    } | null = null;
    
    // Check if any message needs ratchet decryption (has ratchetPn/ratchetN defined)
    const needsRatchetInfo = data.messages.some((msg: any) => 
      msg.ratchetPn !== null && msg.ratchetPn !== undefined
    );
    
    if (needsRatchetInfo) {
      // Fetch conversation details to get edge info
      try {
        const convRes = await fetch(`${apiUrl}/v1/conversations`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          const conv = convData.conversations?.find((c: any) => c.id === conversationId);
          console.log('[DEBUG] Conversation for decryption:', {
            conversationId,
            conv: conv ? {
              id: conv.id,
              origin: conv.origin,
              counterparty: conv.counterparty,
              edge: conv.edge,
            } : null,
          });
          if (conv) {
            conversationDetails = {
              myEdgeId: conv.edge?.id,
              counterpartyEdgeId: conv.counterparty?.edgeId,
              // Server now returns x25519PublicKey directly in counterparty
              counterpartyX25519Key: conv.counterparty?.x25519PublicKey,
            };
            
            console.log('[DEBUG] Extracted conversation details:', conversationDetails);
            
            // Fallback: If no x25519 key in response and we have a handle, resolve it
            if (!conversationDetails.counterpartyX25519Key && conv.counterparty?.handle) {
              console.log('[DEBUG] Falling back to edge resolution for:', conv.counterparty.handle);
              const resolved = await resolveEdge('native', conv.counterparty.handle);
              if (resolved.success && resolved.edge) {
                conversationDetails.counterpartyX25519Key = resolved.edge.x25519PublicKey;
                conversationDetails.counterpartyEdgeId = resolved.edge.edgeId;
                console.log('[DEBUG] Resolved via edge:', { handle: conv.counterparty.handle, hasKey: !!resolved.edge.x25519PublicKey });
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to fetch conversation details for ratchet:', e);
      }
    }
    
    // Get my edge keys
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const edgeKeys = storage.edgeKeys || {};
    
    // Process messages based on security level
    const processedMessages = await Promise.all(
      data.messages.map(async (msg: {
        id: string;
        conversationId: string;
        edgeId?: string;
        senderIdentityId?: string;
        senderExternalId?: string;
        ciphertext?: string;
        ephemeralPubkey?: string;
        nonce?: string;
        ratchetPn?: number;
        ratchetN?: number;
        encryptedContent?: string;
        plaintextContent?: string;
        origin?: string;
        securityLevel?: string;
        createdAt: string;
      }) => {
        const isMine = msg.senderIdentityId === unlockedIdentity!.fingerprint;
        
        let content: string;
        
        // Check if this is a Double Ratchet message
        const isRatchetMessage = msg.ratchetPn !== null && msg.ratchetPn !== undefined;
        
        if (isRatchetMessage && msg.ciphertext && msg.ephemeralPubkey && msg.nonce) {
          try {
            // Double Ratchet decryption
            // Find our edge key for this conversation
            let myEdgeSecretKey: Uint8Array | null = null;
            let counterpartyEdgePublicKey: Uint8Array | null = null;
            
            // Get my edge key
            for (const [edgeId, keys] of Object.entries(edgeKeys)) {
              myEdgeSecretKey = fromBase64((keys as any).secretKey);
              break; // Use first key for now (TODO: match by conversation edge)
            }
            
            // Get counterparty edge public key
            if (conversationDetails?.counterpartyX25519Key) {
              counterpartyEdgePublicKey = fromBase64(conversationDetails.counterpartyX25519Key);
            }
            
            if (myEdgeSecretKey && counterpartyEdgePublicKey) {
              // Build conversation object for ratchet
              const conversation: RatchetConversation = {
                id: conversationId,
                origin: (msg.origin || 'native') as EdgeType,
                security_level: (msg.securityLevel || 'e2ee') as SecurityLevel,
                my_edge_id: conversationDetails?.myEdgeId || '',
                counterparty_edge_id: conversationDetails?.counterpartyEdgeId || '',
              };
              
              // Build the message envelope
              const envelope = {
                protocol_version: '1.0' as const,
                message_id: msg.id,
                conversation_id: conversationId,
                edge_id: msg.edgeId || '',
                origin: (msg.origin || 'native') as EdgeType,
                security_level: (msg.securityLevel || 'e2ee') as 'e2ee' | 'gateway_secured',
                payload: {
                  content_type: 'text/plain',
                  ratchet: {
                    ciphertext: msg.ciphertext,
                    dh: msg.ephemeralPubkey,
                    pn: msg.ratchetPn || 0,
                    n: msg.ratchetN || 0,
                    nonce: msg.nonce,
                  },
                },
                created_at: msg.createdAt,
              };
              
              // Decrypt using unified messaging
              const result = await receiveUnifiedMessage(
                envelope,
                conversation,
                myEdgeSecretKey,
                counterpartyEdgePublicKey,
                ratchetStorage
              );
              
              if (result) {
                content = result.plaintext;
                console.log('Decrypted ratchet message:', msg.id);
              } else {
                console.error('Ratchet decryption returned null for message:', msg.id);
                content = '[Unable to decrypt ratchet]';
              }
            } else {
              console.error('Missing keys for ratchet decryption:', {
                hasMyKey: !!myEdgeSecretKey,
                hasCounterpartyKey: !!counterpartyEdgePublicKey,
              });
              content = '[Unable to decrypt - missing edge key]';
            }
          } catch (error) {
            console.error('Ratchet decryption error for message:', msg.id, error);
            content = '[Unable to decrypt ratchet]';
          }
        } else if (msg.ciphertext && msg.ephemeralPubkey && msg.nonce) {
          // Legacy NaCl box decryption (for older messages)
          try {
            const myEncryptionKeys = deriveEncryptionKeyPair(unlockedIdentity!.secretKey);
            
            const decrypted = decryptMessage(
              msg.ciphertext,
              msg.nonce,
              fromBase64(msg.ephemeralPubkey),
              myEncryptionKeys.secretKey
            );
            
            if (decrypted) {
              content = decrypted;
              console.log('Decrypted legacy message:', msg.id);
            } else {
              console.error('Failed to decrypt legacy message:', msg.id);
              content = '[Unable to decrypt message]';
            }
          } catch (error) {
            console.error('Legacy decryption error for message:', msg.id, error);
            content = '[Unable to decrypt]';
          }
        } else if (msg.encryptedContent) {
          // Decrypt encrypted email payload from worker (zero-knowledge)
          const encryptionKeyPair = deriveEncryptionKeyPair(unlockedIdentity!.secretKey);
          const decryptedJson = decryptEmail(msg.encryptedContent, encryptionKeyPair.secretKey);
          
          try {
            const emailData = JSON.parse(decryptedJson);
            const from = emailData.fromName || emailData.from || 'Unknown Sender';
            const subject = emailData.subject || '(no subject)';
            const body = emailData.textBody || emailData.htmlBody || '(empty message)';
            content = `From: ${from}\nSubject: ${subject}\n\n${body}`;
          } catch (error) {
            console.error('Failed to parse decrypted email:', error);
            content = '[Unable to decrypt email]';
          }
        } else if (msg.plaintextContent) {
          // DEPRECATED: Gateway secured message - plaintext
          content = msg.plaintextContent;
        } else {
          content = '[No content]';
        }
        
        return {
          id: msg.id,
          senderIdentityId: msg.senderIdentityId,
          senderExternalId: msg.senderExternalId,
          content,
          createdAt: msg.createdAt,
          isMine,
        };
      })
    );
    
    return { 
      success: true, 
      securityLevel: data.securityLevel,
      messages: processedMessages,
      cursor: data.cursor,
    };
  } catch (error) {
    console.error('Get messages error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * @deprecated Use sendToEdge() instead - this uses identity-based addressing
 * which leaks linkability. Kept for backwards compatibility.
 */
async function sendMessage(payload: {
  recipientIdentityId: string;
  recipientPublicKey: string;
  content: string;
  conversationId?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  conversationId?: string;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    // Derive encryption keypair
    const encryptionKeyPair = deriveEncryptionKeyPair(unlockedIdentity.secretKey);
    const recipientPubKey = fromBase64(payload.recipientPublicKey);
    
    // Encrypt the message
    const { ciphertext, nonce } = encryptMessage(
      payload.content,
      recipientPubKey,
      encryptionKeyPair.secretKey
    );
    
    // Sign the message envelope
    const messageToSign = `relay-msg:${ciphertext}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);
    
    const requestBody = {
      ciphertext,
      nonce,
      ephemeralPubkey: toBase64(encryptionKeyPair.publicKey),
      signature,
    };
    
    let res: Response;
    
    if (payload.conversationId) {
      // Send to existing conversation
      res = await fetch(`${apiUrl}/v1/conversations/${payload.conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });
    } else {
      // Start new conversation
      res = await fetch(`${apiUrl}/v1/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...requestBody,
          recipientIdentityId: payload.recipientIdentityId,
        }),
      });
    }
    
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to send message' };
    }
    
    const data = await res.json();
    return {
      success: true,
      messageId: data.id || data.messageId,
      conversationId: data.conversationId || payload.conversationId,
    };
  } catch (error) {
    console.error('Send message error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * @deprecated Use sendToEdge() with email bridge edge instead.
 * This will be migrated to use unified bridge-as-edge pattern.
 */
async function sendEmail(
  conversationId: string,
  content: string
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      return { success: false, error: 'Failed to authenticate' };
    }
    
    // Step 1: Get encrypted recipient email from API
    const prepRes = await fetch(`${apiUrl}/v1/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        content,
      }),
    });
    
    if (!prepRes.ok) {
      const err = await prepRes.json();
      return { success: false, error: err.message || 'Failed to prepare email' };
    }
    
    const prepData = await prepRes.json() as {
      requiresMessageDecryption: boolean;
      edgeAddress: string;
      replySubject: string;
      inReplyTo?: string;
    };
    
    // Step 2: Get first message to extract sender's email
    const messagesRes = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!messagesRes.ok) {
      return { success: false, error: 'Failed to load conversation messages' };
    }
    
    const messagesData = await messagesRes.json();
    if (!messagesData.messages || messagesData.messages.length === 0) {
      return { success: false, error: 'No messages in conversation' };
    }
    
    // Get the first (oldest) message which is from the external sender
    const firstMessage = messagesData.messages[messagesData.messages.length - 1];
    
    if (!firstMessage.encryptedContent) {
      return { success: false, error: 'First message has no encrypted content' };
    }
    
    // Decrypt the first message to extract sender's email
    const encryptionKeys = deriveEncryptionKeyPair(unlockedIdentity.secretKey);
    let recipientEmail: string;
    
    try {
      const emailData = JSON.parse(decryptEmail(firstMessage.encryptedContent, encryptionKeys.secretKey));
      recipientEmail = emailData.from;
      
      if (!recipientEmail) {
        return { success: false, error: 'Could not extract sender email from message' };
      }
    } catch (decryptError) {
      console.error('Message decryption error:', decryptError);
      return { success: false, error: 'Failed to decrypt first message' };
    }
    
    // Step 3: Get email bridge's public key for encryption
    // Phase 5: Use unified edge resolution instead of direct worker fetch
    const bridgeResolved = await resolveEdge('bridge', 'email');
    
    // Worker URL for email sending
    const workerUrl = 'https://relay-email-worker.taylor-d-jack.workers.dev';
    
    let workerPublicKey: string;
    if (bridgeResolved.success && bridgeResolved.edge?.x25519PublicKey) {
      // Bridge is registered in database
      workerPublicKey = bridgeResolved.edge.x25519PublicKey;
      console.log('[sendEmail] Resolved bridge from database');
    } else {
      // Fallback: Fetch from worker directly (legacy)
      console.log('[sendEmail] Falling back to worker endpoint for bridge key');
      const workerKeyRes = await fetch(`${workerUrl}/public-key`);
      if (!workerKeyRes.ok) {
        const errorText = await workerKeyRes.text();
        return { success: false, error: `Failed to get worker public key: ${errorText}` };
      }
      const workerKeyData = await workerKeyRes.json();
      workerPublicKey = workerKeyData.publicKey;
    }
    
    // Step 4: Encrypt recipient for worker (zero-knowledge!)
    const encryptedRecipient = encryptForRecipient(recipientEmail, workerPublicKey);
    
    // Step 5: Send via worker (MailChannels) - NO user token!
    const workerRes = await fetch(`${workerUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        encryptedRecipient,  // Encrypted for worker's key
        edgeAddress: prepData.edgeAddress,
        subject: prepData.replySubject,
        content,
        inReplyTo: prepData.inReplyTo,
      }),
    });
    
    if (!workerRes.ok) {
      const errorText = await workerRes.text();
      return { success: false, error: `Worker send failed: ${errorText}` };
    }
    
    const workerData = await workerRes.json();
    
    // Step 6: Encrypt message content for storage (zero-knowledge!)
    // Use identity's public key to encrypt (same as incoming messages)
    const identityPublicKeyBase64 = toBase64(encryptionKeys.publicKey);
    const encryptedContent = encryptForRecipient(content, identityPublicKeyBase64);
    
    // Step 7: Record encrypted message in database via API
    const recordRes = await fetch(`${apiUrl}/v1/email/record-sent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        encryptedContent,  // Encrypted content, not plaintext!
      }),
    });
    
    if (!recordRes.ok) {
      console.warn('Failed to record sent message in database');
      // Don't fail the send operation if recording fails
    }
    
    return {
      success: true,
      messageId: workerData.messageId,
    };
  } catch (error) {
    console.error('Send email error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

// ============================================
// Native Messaging
// ============================================

// Prevent duplicate sends
const pendingNativeSends = new Set<string>();
// Track recent sends with timestamps to prevent rapid duplicates
const recentNativeSends = new Map<string, number>();
const SEND_COOLDOWN_MS = 2000; // 2 second cooldown for same content

/**
 * @deprecated Use sendToEdge() instead - this function resolves handle internally.
 * New code should resolve the edge first, then call sendToEdge directly.
 */
async function sendNativeMessage(
  recipientHandle: string,
  senderHandle: string,
  content: string
): Promise<{
  success: boolean;
  conversationId?: string;
  messageId?: string;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  // Create a unique key for this send to prevent duplicates
  const sendKey = `${recipientHandle}:${senderHandle}:${content.slice(0, 50)}`;
  
  // Check if this exact send is already in progress
  if (pendingNativeSends.has(sendKey)) {
    console.warn('Duplicate send detected (in-flight), ignoring:', sendKey);
    return { success: false, error: 'Duplicate send - already in progress' };
  }
  
  // Check if this exact send was done recently
  const lastSendTime = recentNativeSends.get(sendKey);
  if (lastSendTime && (Date.now() - lastSendTime) < SEND_COOLDOWN_MS) {
    console.warn('Duplicate send detected (cooldown), ignoring:', sendKey);
    return { success: false, error: 'Duplicate send - please wait' };
  }
  
  pendingNativeSends.add(sendKey);
  recentNativeSends.set(sendKey, Date.now());

  try {
    const apiUrl = await getApiUrl();
    
    // 1. Resolve recipient edge to get their edge public key and edge ID
    const resolved = await resolveEdge('native', recipientHandle);
    if (!resolved.success || !resolved.edge) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: resolved.error || 'Recipient handle not found' };
    }
    
    const recipientEdgeId = resolved.edge.edgeId;
    const recipientX25519PublicKey = resolved.edge.x25519PublicKey;
    
    if (!recipientX25519PublicKey) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: 'Recipient has no encryption key' };
    }
    
    console.log('Resolved recipient edge:', {
      handle: recipientHandle,
      edgeId: recipientEdgeId,
      hasX25519Key: !!recipientX25519PublicKey,
    });

    // 2. Get my edge keys for this handle
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const edgeKeys = storage.edgeKeys || {};
    
    // Find my edge ID for this handle
    let myEdgeId: string | null = null;
    let myEdgeSecretKey: Uint8Array | null = null;
    
    // Match by handle (address)
    for (const [edgeId, keys] of Object.entries(edgeKeys)) {
      const keyData = keys as { address?: string; secretKey: string; type?: string };
      if (keyData.address === senderHandle && keyData.type === 'native') {
        myEdgeId = edgeId;
        myEdgeSecretKey = fromBase64(keyData.secretKey);
        console.log('Found matching edge for handle:', senderHandle, 'edgeId:', edgeId);
        break;
      }
    }
    
    // Fallback: use first native edge if no exact match (for backwards compat)
    if (!myEdgeId) {
      for (const [edgeId, keys] of Object.entries(edgeKeys)) {
        const keyData = keys as { address?: string; secretKey: string; type?: string };
        if (keyData.type === 'native' || !keyData.type) {
          myEdgeId = edgeId;
          myEdgeSecretKey = fromBase64(keyData.secretKey);
          console.warn('Using fallback edge (no exact match for handle):', senderHandle, 'using edgeId:', edgeId);
          break;
        }
      }
    }
    
    if (!myEdgeId || !myEdgeSecretKey) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: 'No edge keys found. Please recreate your handle.' };
    }

    // 3. Get or create conversation
    const token = await getAuthToken();
    if (!token) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: 'Authentication failed' };
    }
    
    // Find existing conversation or create new one
    const conversationsRes = await fetch(`${apiUrl}/v1/conversations`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    let conversationId: string | null = null;
    
    if (conversationsRes.ok) {
      const convData = await conversationsRes.json();
      // Find conversation with this recipient (TODO: proper matching)
      const existingConv = convData.conversations?.find((c: any) => 
        c.origin === 'native' && c.counterpartyHandle === recipientHandle
      );
      conversationId = existingConv?.id || null;
    }

    // 4. Build conversation object for unified messaging
    const isNewConversation = !conversationId;
    const conversation: RatchetConversation = {
      id: conversationId || crypto.randomUUID(), // Will be replaced by server for new conversations
      origin: 'native' as EdgeType,
      security_level: 'e2ee' as SecurityLevel,
      my_edge_id: myEdgeId,
      counterparty_edge_id: recipientEdgeId,
      is_initiator: isNewConversation, // We're the initiator if starting a new conversation
      ratchet_state: null, // Will be loaded from storage
    };

    // 5. Use unified sendMessage with Double Ratchet
    const { envelope } = await sendUnifiedMessage(
      conversation,
      content,
      'text/plain',
      myEdgeSecretKey,
      fromBase64(recipientX25519PublicKey),
      ratchetStorage
    );

    // 6. Flatten ratchet message into server's expected format
    const ratchetMsg = envelope.payload.ratchet;
    const serverPayload = {
      // For new conversations, use recipient_handle instead of conversation_id
      ...(conversationId ? { conversation_id: conversationId } : { recipient_handle: recipientHandle }),
      edge_id: myEdgeId,
      origin: 'native',
      security_level: 'e2ee',
      payload: {
        content_type: envelope.payload.content_type || 'text/plain',
        ciphertext: ratchetMsg.ciphertext,
        ephemeral_pubkey: ratchetMsg.dh, // DH public key serves as ephemeral key
        nonce: ratchetMsg.nonce,
        // Ratchet-specific fields
        dh: ratchetMsg.dh,
        pn: ratchetMsg.pn,
        n: ratchetMsg.n,
      },
      // Sign the ciphertext for verification
      signature: signString(`relay-msg:${recipientHandle}:${ratchetMsg.nonce}`, unlockedIdentity.secretKey),
    };

    // 7. Send to server via unified endpoint
    const res = await fetch(`${apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(serverPayload),
    });

    if (!res.ok) {
      pendingNativeSends.delete(sendKey);
      const err = await res.json();
      return { success: false, error: err.error || 'Failed to send message' };
    }

    const data = await res.json();
    
    // If this was a new conversation, update the ratchet storage key to use the server's conversation_id
    if (!conversationId && data.conversation_id) {
      // Move ratchet state from temp ID to real ID
      const tempId = conversation.id;
      const realId = data.conversation_id;
      const tempState = await ratchetStorage.load(tempId);
      if (tempState) {
        await ratchetStorage.save(realId, tempState);
        // Note: We leave the temp state for now as chrome.storage.local doesn't have a delete API
      }
    }
    
    // Clear pending send lock
    pendingNativeSends.delete(sendKey);
    
    return {
      success: true,
      conversationId: data.conversation_id,
      messageId: data.message_id,
    };
  } catch (error) {
    // Clear pending send lock on error
    pendingNativeSends.delete(sendKey);
    console.error('Send native message error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Unified Edge-to-Edge Messaging (Phase 4)
// ============================================

/**
 * UNIFIED SEND TO EDGE
 * 
 * Single function for sending messages to ANY edge type.
 * Uses Double Ratchet encryption for all channels.
 * 
 * @param myEdgeId - The sender's edge ID
 * @param recipientEdgeId - The recipient's edge ID
 * @param content - Message content
 * @param conversationId - Optional existing conversation ID
 * @param origin - Edge type (defaults to 'native')
 */
async function sendToEdge(
  myEdgeId: string,
  recipientEdgeId: string,
  recipientX25519PublicKey: string,
  content: string,
  conversationId?: string,
  origin: 'native' | 'email' | 'contact_link' | 'bridge' = 'native'
): Promise<{
  success: boolean;
  conversationId?: string;
  messageId?: string;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  // Duplicate send prevention
  const sendKey = `${myEdgeId}:${recipientEdgeId}:${content.slice(0, 50)}`;
  const lastSendTime = recentNativeSends.get(sendKey);
  if (lastSendTime && (Date.now() - lastSendTime) < SEND_COOLDOWN_MS) {
    console.warn('[sendToEdge] Duplicate send detected (cooldown), ignoring');
    return { success: false, error: 'Duplicate send - please wait' };
  }
  if (pendingNativeSends.has(sendKey)) {
    console.warn('[sendToEdge] Duplicate send detected (in-flight), ignoring');
    return { success: false, error: 'Duplicate send - already in progress' };
  }
  
  pendingNativeSends.add(sendKey);
  recentNativeSends.set(sendKey, Date.now());

  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: 'Authentication failed' };
    }

    // 1. Get my edge secret key
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const edgeKeys = storage.edgeKeys || {};
    const myEdgeData = edgeKeys[myEdgeId] as { secretKey: string } | undefined;
    
    if (!myEdgeData?.secretKey) {
      pendingNativeSends.delete(sendKey);
      return { success: false, error: 'No edge key found for your edge' };
    }
    
    const myEdgeSecretKey = fromBase64(myEdgeData.secretKey);
    const recipientPubKey = fromBase64(recipientX25519PublicKey);

    // 2. Build conversation object for ratchet
    const isNewConversation = !conversationId;
    const conversation: RatchetConversation = {
      id: conversationId || crypto.randomUUID(), // Temp ID for new, replaced by server
      origin: origin as EdgeType,
      security_level: 'e2ee' as SecurityLevel,
      my_edge_id: myEdgeId,
      counterparty_edge_id: recipientEdgeId,
      is_initiator: isNewConversation,
      ratchet_state: null,
    };

    // 3. Encrypt with Double Ratchet
    const { envelope } = await sendUnifiedMessage(
      conversation,
      content,
      'text/plain',
      myEdgeSecretKey,
      recipientPubKey,
      ratchetStorage
    );

    // 4. Build server payload
    const ratchetMsg = envelope.payload.ratchet;
    const serverPayload = {
      conversation_id: conversationId || undefined,
      recipient_edge_id: recipientEdgeId,
      edge_id: myEdgeId,
      origin,
      security_level: 'e2ee',
      payload: {
        content_type: envelope.payload.content_type || 'text/plain',
        ciphertext: ratchetMsg.ciphertext,
        ephemeral_pubkey: ratchetMsg.dh,
        nonce: ratchetMsg.nonce,
        dh: ratchetMsg.dh,
        pn: ratchetMsg.pn,
        n: ratchetMsg.n,
      },
      signature: signString(`relay-msg:${recipientEdgeId}:${ratchetMsg.nonce}`, unlockedIdentity.secretKey),
    };

    // 5. Send to unified endpoint
    const res = await fetch(`${apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(serverPayload),
    });

    if (!res.ok) {
      pendingNativeSends.delete(sendKey);
      const err = await res.json();
      return { success: false, error: err.error || 'Failed to send message' };
    }

    const data = await res.json();

    // 6. Update ratchet storage key if new conversation
    if (isNewConversation && data.conversation_id) {
      const tempId = conversation.id;
      const realId = data.conversation_id;
      const tempState = await ratchetStorage.load(tempId);
      if (tempState) {
        await ratchetStorage.save(realId, tempState);
      }
    }

    pendingNativeSends.delete(sendKey);
    
    console.log('[sendToEdge] Message sent:', {
      myEdgeId,
      recipientEdgeId,
      conversationId: data.conversation_id,
      messageId: data.message_id,
    });

    return {
      success: true,
      conversationId: data.conversation_id,
      messageId: data.message_id,
    };
  } catch (error) {
    pendingNativeSends.delete(sendKey);
    console.error('[sendToEdge] Error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Edge Management
// ============================================

async function createEdge(
  type: 'native' | 'email' | 'contact_link',
  label?: string,
  customAddress?: string,
  displayName?: string
): Promise<{
  success: boolean;
  edge?: {
    id: string;
    type: string;
    address: string;
    label: string | null;
    status: string;
    securityLevel: string;
  };
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-create-edge:${type}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    // Generate random X25519 keypair for this edge (unique, unlinkable)
    const encryptionKeys = generateEdgeKeyPair();

    const res = await fetch(`${apiUrl}/v1/edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        publicKey: toBase64(unlockedIdentity.publicKey),
        x25519PublicKey: toBase64(encryptionKeys.publicKey),
        nonce,
        signature,
        label,
        customAddress,
        displayName,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to create edge' };
    }

    const edge = await res.json();
    
    // Store edge keypair locally for encryption
    if (edge.id) {
      const edgeKeyEntry = {
        [edge.id]: {
          publicKey: toBase64(encryptionKeys.publicKey),
          secretKey: toBase64(encryptionKeys.secretKey),
          address: edge.address || customAddress,  // Store address for lookup
          type: type,
          createdAt: new Date().toISOString(),
        },
      };
      
      const storage = await chrome.storage.local.get(['edgeKeys']);
      const existingKeys = storage.edgeKeys || {};
      await chrome.storage.local.set({
        edgeKeys: { ...existingKeys, ...edgeKeyEntry },
      });
      
      console.log('Stored edge keypair for edge:', edge.id, 'address:', edge.address);
    }
    
    return { success: true, edge };
  } catch (error) {
    console.error('Create edge error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function getEdgeTypes(): Promise<{
  success: boolean;
  types?: any[];
  error?: string;
}> {
  try {
    const apiUrl = await getApiUrl();
    const res = await fetch(`${apiUrl}/v1/edge/types`);

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to fetch edge types' };
    }

    const data = await res.json();
    return { success: true, types: data.types };
  } catch (error) {
    console.error('Get edge types error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Ensure edge has X25519 key (migration for old edges)
 */
async function ensureEdgeHasX25519(edgeId: string, edgeAddress?: string, edgeType?: string): Promise<boolean> {
  if (!unlockedIdentity) return false;

  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-update-edge:${edgeId}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);
    
    // Generate random X25519 keypair for this edge (unique, unlinkable)
    const encryptionKeys = generateEdgeKeyPair();

    const res = await fetch(`${apiUrl}/v1/edge/${edgeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
        x25519PublicKey: toBase64(encryptionKeys.publicKey),
      }),
    });

    if (!res.ok) {
      console.error('Failed to update edge X25519:', await res.text());
      return false;
    }
    
    // Store edge keypair locally for encryption
    // Preserve existing edge data if present
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const existingKeys = storage.edgeKeys || {};
    const existingEdgeData = existingKeys[edgeId] || {};
    
    const edgeKeyEntry = {
      [edgeId]: {
        ...existingEdgeData,  // Preserve existing address/type if present
        publicKey: toBase64(encryptionKeys.publicKey),
        secretKey: toBase64(encryptionKeys.secretKey),
        address: edgeAddress || existingEdgeData.address,
        type: edgeType || existingEdgeData.type,
        updatedAt: new Date().toISOString(),
      },
    };
    
    await chrome.storage.local.set({
      edgeKeys: { ...existingKeys, ...edgeKeyEntry },
    });
    
    console.log(`Updated edge ${edgeId} with unique X25519 key`);
    return true;
  } catch (error) {
    console.error('Error updating edge X25519:', error);
    return false;
  }
}

async function getEdges(): Promise<{
  success: boolean;
  edges?: Array<{
    id: string;
    type: string;
    address: string;
    label: string | null;
    status: string;
    securityLevel: string;
    messageCount: number;
    hasX25519?: boolean;
    createdAt: string;
    lastActivityAt: string | null;
  }>;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-list-edges:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    const res = await fetch(`${apiUrl}/v1/edges`, {
      headers: {
        'X-Relay-PublicKey': toBase64(unlockedIdentity.publicKey),
        'X-Relay-Signature': signature,
        'X-Relay-Nonce': nonce,
      },
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to fetch edges' };
    }

    const data = await res.json();
    
    // Migrate edges missing X25519 key (one-time migration for old edges)
    const edgesNeedingMigration = data.edges.filter(
      (e: { hasX25519?: boolean; status: string }) => !e.hasX25519 && e.status === 'active'
    );
    
    if (edgesNeedingMigration.length > 0) {
      console.log(`[Edge Migration] ${edgesNeedingMigration.length} edges need X25519 key migration`);
      
      for (const edge of edgesNeedingMigration) {
        await ensureEdgeHasX25519(edge.id, edge.address, edge.type);
      }
    }
    
    return { success: true, edges: data.edges };
  } catch (error) {
    console.error('Get edges error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function burnEdge(edgeId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-burn-edge:${edgeId}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    console.log('[DEBUG] Burning edge:');
    console.log('  edgeId:', edgeId);
    console.log('  nonce:', nonce);
    console.log('  messageToSign:', messageToSign);
    console.log('  publicKey (base64):', toBase64(unlockedIdentity.publicKey));
    console.log('  signature (base64):', signature);

    const res = await fetch(`${apiUrl}/v1/edge/${edgeId}/burn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to burn edge' };
    }

    return { success: true };
  } catch (error) {
    console.error('Burn edge error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Background Polling
// ============================================

const POLL_INTERVAL_MS = 15 * 1000; // 15 seconds
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastPollTime = 0;

async function startPolling() {
  if (pollTimer) return; // Already polling
  
  console.log('Starting background poll...');
  pollTimer = setInterval(async () => {
    if (!unlockedIdentity) {
      stopPolling();
      return;
    }
    
    await pollForNewMessages();
  }, POLL_INTERVAL_MS);
  
  // Also poll immediately
  await pollForNewMessages();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollForNewMessages() {
  if (!unlockedIdentity) return;
  
  try {
    const apiUrl = await getApiUrl();
    const token = await getAuthToken();
    
    if (!token) return;
    
    // Fetch conversations with activity since last poll
    const since = lastPollTime > 0 
      ? new Date(lastPollTime).toISOString() 
      : undefined;
    
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    
    const res = await fetch(`${apiUrl}/v1/conversations?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!res.ok) return;
    
    const data = await res.json();
    lastPollTime = Date.now();
    
    // Check for new messages
    if (data.conversations && data.conversations.length > 0) {
      // Notify panel of updates
      notifyPanel({ 
        type: 'NEW_MESSAGES',
        conversations: data.conversations,
      });
      
      // Show notification for new messages
      const hasNewMessages = data.conversations.some((c: { lastActivityAt: string }) => 
        new Date(c.lastActivityAt).getTime() > lastPollTime - POLL_INTERVAL_MS
      );
      
      if (hasNewMessages) {
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
      }
    }
  } catch (error) {
    console.error('Poll error:', error);
  }
}

// Start polling when unlocked
function onUnlock() {
  startPolling();
  // Clear badge
  chrome.action.setBadgeText({ text: '' });
}

// Stop polling when locked
function onLock() {
  stopPolling();
  lastPollTime = 0;
}

// ============================================
// Initialization
// ============================================

// Enable side panel to open on action click (Chrome MV3)
try {
  // @ts-ignore - sidePanel API may not be in all type definitions
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
} catch (e) {
  console.log('Side panel behavior setup skipped');
}

console.log('Relay background service worker started');

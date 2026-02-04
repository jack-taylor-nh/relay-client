/**
 * Relay Background Service Worker
 * 
 * Handles:
 * - Crypto operations (keypair generation, signing, encryption)
 * - Secure storage management
 * - API communication
 * - Session state
 */

import nacl from 'tweetnacl';
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
  deriveStorageKey,
  encryptForStorage,
  decryptFromStorage,
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

// Encrypted message cache entry (stored in chrome.storage.local)
interface EncryptedCacheEntry {
  ciphertext: string;
  nonce: string;
}

// ============================================
// State
// ============================================

let unlockedIdentity: UnlockedIdentity | null = null;
let session: SessionState = { token: null, expiresAt: null };

// Storage encryption key (derived from identity on unlock)
let storageKey: Uint8Array | null = null;

// In-memory cache for decrypted messages (fast access, lost on reload)
// This is populated from encrypted chrome.storage.local on demand
const decryptedMessageCache: Map<string, string> = new Map();

// Auto-lock configuration
const LOCK_ALARM_NAME = 'relay-auto-lock';
const LOCK_TIMEOUT_MINUTES = 30; // 30 minutes of inactivity

// Session state key (stored in chrome.storage.session to survive service worker restarts)
const SESSION_STATE_KEY = 'unlockedSession';

interface SessionPersistence {
  secretKeyBase64: string;
  publicKeyBase64: string;
  fingerprint: string;
  handle: string | null;
  unlockedAt: number;
}

/**
 * Reset the auto-lock timer using chrome.alarms (survives service worker restarts)
 */
async function resetLockTimer(): Promise<void> {
  // Clear existing alarm
  await chrome.alarms.clear(LOCK_ALARM_NAME);
  
  // Create new alarm
  await chrome.alarms.create(LOCK_ALARM_NAME, {
    delayInMinutes: LOCK_TIMEOUT_MINUTES,
  });
  
  console.log(`[AutoLock] Timer reset - will lock in ${LOCK_TIMEOUT_MINUTES} minutes`);
}

/**
 * Handle auto-lock alarm
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === LOCK_ALARM_NAME) {
    console.log('[AutoLock] Timer expired, locking...');
    await lockAndClearSession();
    notifyPanel({ type: 'LOCKED' });
  }
});

/**
 * Persist unlocked state to session storage (survives service worker restarts)
 */
async function persistSessionState(): Promise<void> {
  if (!unlockedIdentity) return;
  
  const sessionData: SessionPersistence = {
    secretKeyBase64: toBase64(unlockedIdentity.secretKey),
    publicKeyBase64: toBase64(unlockedIdentity.publicKey),
    fingerprint: unlockedIdentity.fingerprint,
    handle: unlockedIdentity.handle,
    unlockedAt: Date.now(),
  };
  
  await chrome.storage.session.set({ [SESSION_STATE_KEY]: sessionData });
  console.log('[Session] Persisted unlocked state to session storage');
}

/**
 * Restore unlocked state from session storage (on service worker restart)
 */
async function restoreSessionState(): Promise<boolean> {
  try {
    const result = await chrome.storage.session.get(SESSION_STATE_KEY);
    const sessionData = result[SESSION_STATE_KEY] as SessionPersistence | undefined;
    
    if (!sessionData) {
      console.log('[Session] No persisted session found');
      return false;
    }
    
    // Restore unlocked identity
    unlockedIdentity = {
      secretKey: fromBase64(sessionData.secretKeyBase64),
      publicKey: fromBase64(sessionData.publicKeyBase64),
      fingerprint: sessionData.fingerprint,
      handle: sessionData.handle,
    };
    
    // Derive storage key
    storageKey = deriveStorageKey(unlockedIdentity.secretKey);
    
    console.log('[Session] Restored unlocked state from session storage');
    
    // Restart polling
    onUnlock();
    
    return true;
  } catch (error) {
    console.error('[Session] Failed to restore session:', error);
    return false;
  }
}

/**
 * Clear session state (on lock or logout)
 */
async function clearSessionState(): Promise<void> {
  await chrome.storage.session.remove(SESSION_STATE_KEY);
  await chrome.alarms.clear(LOCK_ALARM_NAME);
  console.log('[Session] Cleared session state');
}

/**
 * Lock and clear session (internal use)
 */
async function lockAndClearSession(): Promise<void> {
  // Zero out secrets in memory
  if (unlockedIdentity?.secretKey) {
    unlockedIdentity.secretKey.fill(0);
  }
  if (storageKey) {
    storageKey.fill(0);
    storageKey = null;
  }
  
  decryptedMessageCache.clear();
  unlockedIdentity = null;
  session = { token: null, expiresAt: null };
  
  await clearSessionState();
  onLock();
}

// ============================================
// Encrypted Message Cache (Persistent Storage)
// ============================================

const MESSAGE_CACHE_KEY = 'encryptedMessageCache';

/**
 * Save a decrypted message to encrypted persistent storage
 */
async function saveMessageToCache(messageId: string, plaintext: string): Promise<void> {
  if (!storageKey) {
    console.warn('[MessageCache] Cannot save - no storage key (wallet locked)');
    return;
  }
  
  // Encrypt the plaintext
  const encrypted = encryptForStorage(plaintext, storageKey);
  
  // Load existing cache
  const storage = await chrome.storage.local.get([MESSAGE_CACHE_KEY]);
  const cache: Record<string, EncryptedCacheEntry> = storage[MESSAGE_CACHE_KEY] || {};
  
  // Add new entry
  cache[messageId] = encrypted;
  
  // Save back
  await chrome.storage.local.set({ [MESSAGE_CACHE_KEY]: cache });
  
  // Also keep in memory
  decryptedMessageCache.set(messageId, plaintext);
}

/**
 * Load a message from encrypted persistent storage
 */
async function loadMessageFromCache(messageId: string): Promise<string | null> {
  // Check memory cache first
  if (decryptedMessageCache.has(messageId)) {
    return decryptedMessageCache.get(messageId)!;
  }
  
  if (!storageKey) {
    return null;
  }
  
  // Check persistent storage
  const storage = await chrome.storage.local.get([MESSAGE_CACHE_KEY]);
  const cache: Record<string, EncryptedCacheEntry> = storage[MESSAGE_CACHE_KEY] || {};
  
  const entry = cache[messageId];
  if (!entry) {
    return null;
  }
  
  // Decrypt
  const plaintext = decryptFromStorage(entry.ciphertext, entry.nonce, storageKey);
  if (plaintext) {
    // Populate memory cache
    decryptedMessageCache.set(messageId, plaintext);
  }
  
  return plaintext;
}

/**
 * Batch load messages from encrypted persistent storage
 * Returns map of messageId -> plaintext for found messages
 */
async function loadMessagesFromCache(messageIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  if (!storageKey) {
    return result;
  }
  
  // Check memory cache first
  const notInMemory: string[] = [];
  for (const id of messageIds) {
    if (decryptedMessageCache.has(id)) {
      result.set(id, decryptedMessageCache.get(id)!);
    } else {
      notInMemory.push(id);
    }
  }
  
  if (notInMemory.length === 0) {
    return result;
  }
  
  // Load from persistent storage
  const storage = await chrome.storage.local.get([MESSAGE_CACHE_KEY]);
  const cache: Record<string, EncryptedCacheEntry> = storage[MESSAGE_CACHE_KEY] || {};
  
  for (const id of notInMemory) {
    const entry = cache[id];
    if (entry) {
      const plaintext = decryptFromStorage(entry.ciphertext, entry.nonce, storageKey);
      if (plaintext) {
        result.set(id, plaintext);
        decryptedMessageCache.set(id, plaintext); // Populate memory cache
      }
    }
  }
  
  return result;
}

// ============================================
// Encrypted Edge Metadata (Zero-Knowledge Storage)
// ============================================

/**
 * Encrypt metadata (label, displayName) using edge's secret key
 * Server stores opaque encrypted blob - cannot read contents
 */
function encryptEdgeMetadata(
  data: { label?: string; displayName?: string },
  edgeSecretKey: Uint8Array
): { encryptedLabel?: string; encryptedMetadata?: string } {
  const result: { encryptedLabel?: string; encryptedMetadata?: string } = {};
  
  // Derive symmetric key from edge secret key
  const encryptionKey = nacl.hash(edgeSecretKey).slice(0, nacl.secretbox.keyLength);
  
  // Encrypt label if provided
  if (data.label) {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(
      new TextEncoder().encode(data.label),
      nonce,
      encryptionKey
    );
    // Format: base64(nonce):base64(ciphertext)
    result.encryptedLabel = `${toBase64(nonce)}:${toBase64(ciphertext)}`;
  }
  
  // Encrypt metadata (displayName, etc.) if provided
  if (data.displayName) {
    const metadata = { displayName: data.displayName };
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(
      new TextEncoder().encode(JSON.stringify(metadata)),
      nonce,
      encryptionKey
    );
    result.encryptedMetadata = `${toBase64(nonce)}:${toBase64(ciphertext)}`;
  }
  
  return result;
}

/**
 * Decrypt metadata using edge's secret key
 */
function decryptEdgeMetadata(
  encryptedLabel: string | null | undefined,
  encryptedMetadata: string | null | undefined,
  edgeSecretKey: Uint8Array
): { label?: string; displayName?: string } {
  const result: { label?: string; displayName?: string } = {};
  
  // Derive symmetric key from edge secret key
  const encryptionKey = nacl.hash(edgeSecretKey).slice(0, nacl.secretbox.keyLength);
  
  // Decrypt label
  if (encryptedLabel && encryptedLabel.includes(':')) {
    try {
      const [nonceB64, ciphertextB64] = encryptedLabel.split(':');
      const nonce = fromBase64(nonceB64);
      const ciphertext = fromBase64(ciphertextB64);
      const plaintext = nacl.secretbox.open(ciphertext, nonce, encryptionKey);
      if (plaintext) {
        result.label = new TextDecoder().decode(plaintext);
      }
    } catch (e) {
      console.warn('Failed to decrypt edge label:', e);
    }
  }
  
  // Decrypt metadata
  if (encryptedMetadata && encryptedMetadata.includes(':')) {
    try {
      const [nonceB64, ciphertextB64] = encryptedMetadata.split(':');
      const nonce = fromBase64(nonceB64);
      const ciphertext = fromBase64(ciphertextB64);
      const plaintext = nacl.secretbox.open(ciphertext, nonce, encryptionKey);
      if (plaintext) {
        const metadata = JSON.parse(new TextDecoder().decode(plaintext));
        result.displayName = metadata.displayName;
      }
    } catch (e) {
      console.warn('Failed to decrypt edge metadata:', e);
    }
  }
  
  return result;
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
  | { type: 'SEND_DISCORD'; payload: { conversationId: string; content: string } }
  | { type: 'SEND_TO_EDGE'; payload: { myEdgeId: string; recipientEdgeId: string; recipientX25519PublicKey: string; content: string; conversationId?: string; origin?: 'native' | 'email' | 'contact_link' | 'discord' | 'bridge' } }
  | { type: 'CREATE_EDGE'; payload: { type: 'native' | 'email' | 'contact_link' | 'discord' | 'webhook'; label?: string; customAddress?: string; displayName?: string } }
  | { type: 'GET_EDGE_TYPES' }
  | { type: 'GET_EDGES' }
  | { type: 'BURN_EDGE'; payload: { edgeId: string } }
  | { type: 'GET_ALIASES' }
  | { type: 'CREATE_ALIAS'; payload: { label?: string } }
  // Notification system
  | { type: 'GET_NOTIFICATION_PREFS' }
  | { type: 'SET_NOTIFICATION_PREFS'; payload: { enabled?: boolean; showDesktopNotifications?: boolean; showBadgeCount?: boolean; playSound?: boolean } }
  | { type: 'MARK_CONVERSATION_SEEN'; payload: { conversationId: string } }
  | { type: 'GET_UNREAD_COUNT' }
  | { type: 'GET_LAST_SEEN_STATE' }
  | { type: 'GET_STORED_CONVERSATIONS' }
  | { type: 'PANEL_OPENED' }
  | { type: 'PANEL_CLOSED' }
  | { type: 'FORCE_POLL' };

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

    case 'SEND_DISCORD':
      return sendDiscord(message.payload.conversationId, message.payload.content);

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

    // ============================================
    // Notification Preferences
    // ============================================
    
    case 'GET_NOTIFICATION_PREFS':
      return getNotificationPrefs();

    case 'SET_NOTIFICATION_PREFS':
      await setNotificationPrefs(message.payload);
      return { success: true };

    case 'MARK_CONVERSATION_SEEN':
      await markConversationSeen(message.payload.conversationId);
      return { success: true };

    case 'GET_UNREAD_COUNT':
      const storedConvs = await getStoredConversations();
      const unreadConvCount = storedConvs.filter(c => c.isUnread).length;
      return { 
        count: unreadConvCount,
        lastCheck: (await getLastSeenState()).globalLastCheck,
      };

    case 'GET_LAST_SEEN_STATE':
      return getLastSeenState();

    case 'GET_STORED_CONVERSATIONS':
      return { 
        success: true, 
        conversations: await getStoredConversations(),
      };

    case 'PANEL_OPENED':
      await updatePollingFrequency(true);
      return { success: true };

    case 'PANEL_CLOSED':
      await updatePollingFrequency(false);
      return { success: true };

    case 'FORCE_POLL':
      await pollForNewMessages();
      return { success: true };

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

  // Persist session state (survives service worker restarts)
  await persistSessionState();
  await resetLockTimer();
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

  // Derive storage encryption key for local message cache
  storageKey = deriveStorageKey(secretKey);
  console.log('[unlock] Derived storage encryption key');

  // Persist session state (survives service worker restarts)
  await persistSessionState();
  
  await resetLockTimer();
  onUnlock(); // Start background polling
  
  // Get auth token first (needed for SSE connection)
  const token = await getAuthToken();
  
  // Connect to real-time SSE stream (only if we have a valid token)
  if (token) {
    connectSSE().catch(err => {
      console.error('[SSE] Failed to connect on unlock:', err);
      // Continue with polling fallback
    });
  } else {
    console.warn('[SSE] No auth token available, falling back to polling only');
  }

  return { success: true };
}

async function lock(): Promise<{ success: boolean }> {
  await lockAndClearSession();
  disconnectSSE(); // Stop SSE connection
  return { success: true };
}

async function logout(): Promise<{ success: boolean }> {
  // First lock to clear memory and session
  await lock();
  
  // Clear all stored data including encrypted message cache
  await chrome.storage.local.remove([
    'identity',
    'edgeKeys',
    'session',
    MESSAGE_CACHE_KEY,
    'lastSeenState',
    'notificationPrefs',
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
    
    // Encrypt displayName using edge's secret key (zero-knowledge storage)
    const encrypted = encryptEdgeMetadata(
      { displayName },
      edgeEncryptionKeys.secretKey
    );
    
    console.log('Creating handle with unique edge encryption key:', {
      handle,
      hasEdgeKey: !!edgeX25519PublicKey,
      hasEncryptedMetadata: !!encrypted.encryptedMetadata,
    });
    
    const res = await fetch(`${apiUrl}/v1/handles`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        handle, 
        // Send encrypted metadata instead of plaintext
        encryptedMetadata: encrypted.encryptedMetadata,
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
          // Store plaintext locally (only encrypted on server)
          displayName: displayName,
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
// Returns colon-separated format: ephemeralPubkey:nonce:ciphertext (all base64)
// Used for email worker API which expects this format
function encryptForRecipient(plaintext: string, recipientPublicKeyBase64: string): string {
  const recipientPubKey = fromBase64(recipientPublicKeyBase64);
  const encrypted = encryptMessage(plaintext, recipientPubKey, new Uint8Array(32));
  // Return as colon-separated base64 string (format expected by email worker)
  return `${encrypted.ephemeralPubkey}:${encrypted.nonce}:${encrypted.ciphertext}`;
}

// Encrypt for storage - returns JSON format for decryptEmail compatibility
// Used for storing sent email content in database
function encryptForEmailStorage(plaintext: string, recipientPublicKeyBase64: string): string {
  const recipientPubKey = fromBase64(recipientPublicKeyBase64);
  const encrypted = encryptMessage(plaintext, recipientPubKey, new Uint8Array(32));
  // Return as JSON (format expected by decryptEmail)
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
    encryptedMetadata?: string;
    decryptedCounterpartyName?: string;  // Decrypted from encryptedMetadata
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
    lastMessageId?: string;  // For message preview lookup
    lastMessageWasMine?: boolean;  // For filtering sent vs received notifications
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
    
    // Decrypt encryptedMetadata for each conversation that has it
    const conversationsWithDecryptedMetadata = await Promise.all(
      data.conversations.map(async (conv: any) => {
        // If there's no encrypted metadata or it's a native conversation, skip decryption
        if (!conv.encryptedMetadata || conv.origin === 'native') {
          return conv;
        }
        
        // Look up the edge's secret key to decrypt the metadata
        const edgeId = conv.myEdgeId || conv.edge?.id;
        if (!edgeId) {
          return conv;
        }
        
        // Get edge keys from local storage
        const stored = await chrome.storage.local.get(['edgeKeys']);
        const edgeKeys = stored.edgeKeys || {};
        const edgeKeyEntry = edgeKeys[edgeId];
        
        if (!edgeKeyEntry?.secretKey) {
          console.log(`[getConversations] No secret key found for edge ${edgeId}`);
          return conv;
        }
        
        try {
          const edgeSecretKey = fromBase64(edgeKeyEntry.secretKey);
          
          // The encryptedMetadata is a NaCl box JSON package (same format as encrypted messages)
          // Format: { ephemeralPubkey, nonce, ciphertext }
          const pkg = JSON.parse(conv.encryptedMetadata);
          const ephemeralPubkey = fromBase64(pkg.ephemeralPubkey);
          const nonce = fromBase64(pkg.nonce);
          const ciphertext = fromBase64(pkg.ciphertext);
          
          const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPubkey, edgeSecretKey);
          
          if (decrypted) {
            const metadata = JSON.parse(new TextDecoder().decode(decrypted));
            // The metadata contains { counterpartyDisplayName, platform }
            return {
              ...conv,
              decryptedCounterpartyName: metadata.counterpartyDisplayName,
              counterparty: {
                ...conv.counterparty,
                displayName: metadata.counterpartyDisplayName,
              },
            };
          }
        } catch (e) {
          console.warn(`[getConversations] Failed to decrypt metadata for conversation ${conv.id}:`, e);
        }
        
        return conv;
      })
    );
    
    return { success: true, conversations: conversationsWithDecryptedMetadata };
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
    senderEdgeId?: string;  // Sender identified by edge, not identity
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
    
    // Get conversation details for edge info (needed for ratchet and email decryption)
    let conversationDetails: {
      myEdgeId?: string;
      counterpartyEdgeId?: string;
      counterpartyX25519Key?: string;
      origin?: string;
      counterpartyEmail?: string;
      counterpartyDisplayName?: string;
    } | null = null;
    
    // Check if any message needs ratchet decryption (has ratchetPn/ratchetN defined)
    const needsRatchetInfo = data.messages.some((msg: any) => 
      msg.ratchetPn !== null && msg.ratchetPn !== undefined
    );
    
    // Check if any message has encryptedContent (email messages)
    const hasEncryptedContent = data.messages.some((msg: any) => msg.encryptedContent);
    
    // Fetch conversation details if needed for decryption
    if (needsRatchetInfo || hasEncryptedContent) {
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
              myEdgeId: conv.myEdgeId || conv.edge?.id,  // Prefer myEdgeId, fallback to edge.id
              counterpartyEdgeId: conv.counterparty?.edgeId || conv.counterparty?.externalId || undefined,
              // Server now returns x25519PublicKey directly in counterparty
              counterpartyX25519Key: conv.counterparty?.x25519PublicKey,
              origin: conv.origin,
              counterpartyEmail: conv.counterparty?.email,
              counterpartyDisplayName: conv.counterparty?.displayName,
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
        console.warn('Failed to fetch conversation details for decryption:', e);
      }
    }
    
    // Get my edge keys
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const edgeKeys = storage.edgeKeys || {};
    
    // Build set of my edge IDs for quick lookup
    const myEdgeIds = new Set(Object.keys(edgeKeys));
    
    // Pre-load cached messages from encrypted storage
    const messageIds = data.messages.map((m: { id: string }) => m.id);
    const cachedMessages = await loadMessagesFromCache(messageIds);
    console.log(`[getMessages] Loaded ${cachedMessages.size}/${messageIds.length} messages from encrypted cache`);
    
    // Process messages based on security level
    const processedMessages = await Promise.all(
      data.messages.map(async (msg: {
        id: string;
        conversationId: string;
        edgeId?: string;
        senderEdgeId?: string;  // Server now sends edge ID, not identity ID
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
        // Determine if this is my message:
        // - If senderExternalId exists, it's from an external sender (NOT mine)
        // - Otherwise, check if senderEdgeId is one of my edges
        const isMine = msg.senderExternalId 
          ? false  // External sender = not mine
          : (msg.senderEdgeId ? myEdgeIds.has(msg.senderEdgeId) : false);
        
        let content: string;
        
        // Check encrypted cache first - Double Ratchet messages can only be decrypted once
        const cachedContent = cachedMessages.get(msg.id);
        if (cachedContent) {
          content = cachedContent;
          console.log('[getMessages] Using encrypted cache for message:', msg.id);
        }
        // Check if this is a Double Ratchet message
        else if (msg.ratchetPn !== null && msg.ratchetPn !== undefined && 
                 msg.ciphertext && msg.ephemeralPubkey && msg.nonce) {
          // Own messages - try server-stored plaintext first
          if (isMine && msg.plaintextContent) {
            content = msg.plaintextContent;
            // Save to encrypted cache for persistence
            await saveMessageToCache(msg.id, content);
            console.log('[getMessages] Using server plaintext for sent message:', msg.id);
          } else if (isMine) {
            // No cache, no server plaintext - we can't decrypt our own message
            content = '[Message sent - content not cached locally]';
            console.log('[getMessages] Cannot decrypt own message (not in cache):', msg.id);
          } else {
            // Received message - decrypt with Double Ratchet
            try {
              // Double Ratchet decryption
              // Find our edge key for this conversation
              let myEdgeSecretKey: Uint8Array | null = null;
              let counterpartyEdgePublicKey: Uint8Array | null = null;
              
              // Get my edge key - use the CORRECT edge for this conversation
              const myEdgeId = conversationDetails?.myEdgeId;
              if (myEdgeId && edgeKeys[myEdgeId]) {
                myEdgeSecretKey = fromBase64((edgeKeys[myEdgeId] as any).secretKey);
                console.log('[getMessages] Using edge key for edge:', myEdgeId);
              } else {
                // Fallback: try to find any matching edge (shouldn't happen)
                console.warn('[getMessages] Edge key not found for myEdgeId:', myEdgeId, 'available:', Object.keys(edgeKeys));
                for (const [edgeId, keys] of Object.entries(edgeKeys)) {
                  myEdgeSecretKey = fromBase64((keys as any).secretKey);
                  console.log('[getMessages] Falling back to first available edge:', edgeId);
                  break;
                }
              }
              
              // Get counterparty edge public key
              if (conversationDetails?.counterpartyX25519Key) {
                counterpartyEdgePublicKey = fromBase64(conversationDetails.counterpartyX25519Key);
              }
              
              if (myEdgeSecretKey && counterpartyEdgePublicKey) {
                // Debug: verify the public key matches
                const myEdgeKeypair = nacl.box.keyPair.fromSecretKey(myEdgeSecretKey);
                const myDerivedPubKey = toBase64(myEdgeKeypair.publicKey);
                console.log('[getMessages] My edge public key derived from secret:', myDerivedPubKey);
                console.log('[getMessages] Counterparty should have encrypted to this key');
                
                // Build conversation object for ratchet
                const conversation: RatchetConversation = {
                  id: conversationId,
                  origin: (msg.origin || 'native') as EdgeType,
                  security_level: (msg.securityLevel || 'e2ee') as SecurityLevel,
                  my_edge_id: conversationDetails?.myEdgeId || '',
                  counterparty_edge_id: conversationDetails?.counterpartyEdgeId || '',
                  is_initiator: false, // Receiver is never the initiator
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
                  // Save to encrypted persistent storage - Double Ratchet can only decrypt once!
                  await saveMessageToCache(msg.id, content);
                  console.log('Decrypted and saved to encrypted cache:', msg.id);
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
          // Email worker encrypts to the edge's X25519 public key, not identity key
          try {
            // Get my edge's secret key for this conversation
            let myEdgeSecretKey: Uint8Array | null = null;
            
            if (conversationDetails?.myEdgeId) {
              const edgeKeyData = edgeKeys[conversationDetails.myEdgeId] as { secretKey: string } | undefined;
              if (edgeKeyData) {
                myEdgeSecretKey = fromBase64(edgeKeyData.secretKey);
                console.log('[getMessages] Using edge key for email decryption:', conversationDetails.myEdgeId);
              }
            }
            
            // Fallback: try any edge key (for older conversations)
            if (!myEdgeSecretKey) {
              for (const [edgeId, keys] of Object.entries(edgeKeys)) {
                myEdgeSecretKey = fromBase64((keys as { secretKey: string }).secretKey);
                console.log('[getMessages] Fallback: trying edge key:', edgeId);
                break;
              }
            }
            
            if (!myEdgeSecretKey) {
              // Last resort: try identity-derived key (for legacy messages)
              console.log('[getMessages] Fallback: trying identity-derived key');
              const encryptionKeyPair = deriveEncryptionKeyPair(unlockedIdentity!.secretKey);
              myEdgeSecretKey = encryptionKeyPair.secretKey;
            }
            
            // Detect and handle different encrypted content formats
            let decryptedContent: string;
            const encContent = msg.encryptedContent;
            
            if (encContent.startsWith('{')) {
              // JSON format: {ciphertext, ephemeralPubkey, nonce}
              decryptedContent = decryptEmail(encContent, myEdgeSecretKey);
            } else if (encContent.includes(':') && encContent.split(':').length === 3) {
              // Legacy colon-separated format: ephemeralPubkey:nonce:ciphertext
              const parts = encContent.split(':');
              const ephemeralPubkey = fromBase64(parts[0]);
              const nonce = fromBase64(parts[1]);
              const ciphertext = fromBase64(parts[2]);
              
              const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPubkey, myEdgeSecretKey);
              if (!decrypted) {
                throw new Error('Failed to decrypt colon-separated format');
              }
              decryptedContent = new TextDecoder().decode(decrypted);
            } else {
              // Unknown format - might be raw text or corrupted
              console.warn('[getMessages] Unknown encrypted content format for:', msg.id);
              content = '[Unable to decrypt - unknown format]';
              return {
                id: msg.id,
                senderEdgeId: msg.senderEdgeId,
                senderExternalId: msg.senderExternalId,
                content,
                createdAt: msg.createdAt,
                isMine,
              };
            }
            
            // Try to parse as email structure (incoming emails from worker)
            // or Discord structure, or use as plain content (sent replies)
            try {
              const bridgeData = JSON.parse(decryptedContent);
              
              if (bridgeData.from || bridgeData.textBody || bridgeData.subject) {
                // It's a structured email payload
                const from = bridgeData.fromName || bridgeData.from || 'Unknown Sender';
                const subject = bridgeData.subject || '(no subject)';
                const body = bridgeData.textBody || bridgeData.htmlBody || '(empty message)';
                content = `From: ${from}\nSubject: ${subject}\n\n${body}`;
              } else if (bridgeData.content && bridgeData.senderDisplayName) {
                // It's a Discord message payload
                content = bridgeData.content;
                // Note: senderDisplayName can be used for conversation header display
              } else if (bridgeData.content) {
                // Simple content field (Discord or other bridge)
                content = bridgeData.content;
              } else {
                // JSON but not recognized structure - show as content
                content = decryptedContent;
              }
            } catch {
              // Not JSON - it's just the plain message content (sent reply)
              content = decryptedContent;
            }
            
            // Save to encrypted cache
            await saveMessageToCache(msg.id, content);
            console.log('[getMessages] Decrypted email and cached:', msg.id);
          } catch (error) {
            console.error('Failed to decrypt email:', msg.id, error);
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
          senderEdgeId: msg.senderEdgeId,
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
    
    // Get conversation details to find my edge for this conversation
    const convRes = await fetch(`${apiUrl}/v1/conversations`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    let myEdgeId: string | undefined;
    if (convRes.ok) {
      const convData = await convRes.json();
      const conv = convData.conversations?.find((c: any) => c.id === conversationId);
      myEdgeId = conv?.edge?.id;
      console.log('[sendEmail] Found edge for conversation:', myEdgeId);
    }
    
    // Get edge keys to decrypt the first message
    const storage = await chrome.storage.local.get(['edgeKeys']);
    const edgeKeys = storage.edgeKeys || {};
    
    // Decrypt the first message to extract sender's email
    // Email messages are encrypted to the edge's X25519 key, not identity key
    let recipientEmail: string;
    
    try {
      let decryptionKey: Uint8Array | null = null;
      
      // Try edge key first (correct for new messages)
      if (myEdgeId && edgeKeys[myEdgeId]) {
        decryptionKey = fromBase64((edgeKeys[myEdgeId] as { secretKey: string }).secretKey);
        console.log('[sendEmail] Using edge key for decryption:', myEdgeId);
      }
      
      // Fallback: try any edge key
      if (!decryptionKey) {
        for (const [edgeId, keys] of Object.entries(edgeKeys)) {
          decryptionKey = fromBase64((keys as { secretKey: string }).secretKey);
          console.log('[sendEmail] Fallback: trying edge key:', edgeId);
          break;
        }
      }
      
      // Last resort: try identity-derived key (for legacy messages)
      if (!decryptionKey) {
        console.log('[sendEmail] Fallback: trying identity-derived key');
        const encryptionKeys = deriveEncryptionKeyPair(unlockedIdentity.secretKey);
        decryptionKey = encryptionKeys.secretKey;
      }
      
      const emailData = JSON.parse(decryptEmail(firstMessage.encryptedContent, decryptionKey));
      recipientEmail = emailData.from;
      
      if (!recipientEmail) {
        return { success: false, error: 'Could not extract sender email from message' };
      }
      console.log('[sendEmail] Extracted recipient email:', recipientEmail);
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
    // Use the edge's public key to encrypt (same as incoming messages)
    let storagePublicKey: string;
    if (myEdgeId && edgeKeys[myEdgeId]) {
      // Use edge public key for consistency
      const edgeKeyData = edgeKeys[myEdgeId] as { publicKey: string };
      storagePublicKey = edgeKeyData.publicKey;
    } else {
      // Fallback to identity-derived key
      const identityEncryptionKeys = deriveEncryptionKeyPair(unlockedIdentity!.secretKey);
      storagePublicKey = toBase64(identityEncryptionKeys.publicKey);
    }
    // Use JSON format for storage (compatible with decryptEmail)
    const encryptedContent = encryptForEmailStorage(content, storagePublicKey);
    
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

/**
 * Send a Discord reply via the server's discord/send endpoint
 */
async function sendDiscord(
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

    console.log('[sendDiscord] Sending reply to conversation:', conversationId);

    // Call the server's discord send endpoint
    // The server handles looking up the encrypted Discord ID and forwarding to the worker
    const res = await fetch(`${apiUrl}/v1/discord/send`, {
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

    if (!res.ok) {
      const err = await res.json();
      console.error('[sendDiscord] Server error:', err);
      return { success: false, error: err.message || 'Failed to send Discord message' };
    }

    const data = await res.json();
    console.log('[sendDiscord] Message sent:', data);
    
    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (error) {
    console.error('Send Discord error:', error);
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
      x25519PublicKey: recipientX25519PublicKey, // Log actual key for debugging
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
    
    // Save the sent message to encrypted cache so we can display it later
    if (data.message_id) {
      await saveMessageToCache(data.message_id, content);
      console.log('[sendNativeMessage] Saved sent message to encrypted cache:', data.message_id);
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
  origin: 'native' | 'email' | 'contact_link' | 'discord' | 'bridge' = 'native'
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

    // 7. Save the sent message to encrypted persistent storage
    if (data.message_id) {
      await saveMessageToCache(data.message_id, content);
      console.log('[sendToEdge] Saved sent message to encrypted cache:', data.message_id);
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
  type: 'native' | 'email' | 'contact_link' | 'discord' | 'webhook',
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
    webhookUrl?: string;
    authToken?: string;
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
    
    // For webhook edges, generate authToken
    let authToken: string | undefined;
    if (type === 'webhook') {
      // Generate cryptographically secure token
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      authToken = 'wh_' + Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    
    // Encrypt label and displayName using edge's secret key (zero-knowledge storage)
    const encrypted = encryptEdgeMetadata(
      { label, displayName },
      encryptionKeys.secretKey
    );

    const res = await fetch(`${apiUrl}/v1/edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        publicKey: toBase64(unlockedIdentity.publicKey),
        x25519PublicKey: toBase64(encryptionKeys.publicKey),
        nonce,
        signature,
        // Send encrypted label/metadata instead of plaintext
        encryptedLabel: encrypted.encryptedLabel,
        encryptedMetadata: encrypted.encryptedMetadata,
        customAddress,
        authToken, // For webhook edges only
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
          // Store plaintext locally (only encrypted on server)
          label: label,
          displayName: displayName,
          authToken: authToken, // For webhook edges
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
    
    // For webhook edges, construct webhook URL and store metadata locally
    if (type === 'webhook' && edge.id && authToken) {
      const webhookWorkerUrl = 'https://webhook.rlymsg.com';
      const webhookUrl = `${webhookWorkerUrl}/w/${edge.id}`;
      edge.webhookUrl = webhookUrl;
      edge.authToken = authToken;
      
      // Store webhook metadata locally for persistence
      const { webhookMetadata = {} } = await chrome.storage.local.get('webhookMetadata');
      webhookMetadata[edge.id] = { webhookUrl, authToken };
      await chrome.storage.local.set({ webhookMetadata });
      
      console.log('Stored webhook metadata for edge:', edge.id);
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
    
    // Get local edge keys for decryption
    const storage = await chrome.storage.local.get(['edgeKeys', 'webhookMetadata']);
    const edgeKeys = storage.edgeKeys || {};
    const webhookMetadata = storage.webhookMetadata || {};
    
    // Decrypt label/metadata for each edge using local keys
    const decryptedEdges = data.edges.map((edge: any) => {
      const localKeys = edgeKeys[edge.id];
      
      // If we have local keys, decrypt the metadata
      if (localKeys?.secretKey) {
        const secretKey = fromBase64(localKeys.secretKey);
        const decrypted = decryptEdgeMetadata(
          edge.encryptedLabel,
          edge.encryptedMetadata,
          secretKey
        );
        
        // Build base edge with decrypted data
        const decryptedEdge = {
          ...edge,
          // Use decrypted values, fall back to local cache, then server values
          label: decrypted.label || localKeys.label || edge.label,
          displayName: decrypted.displayName || localKeys.displayName,
        };
        
        // For webhook edges, merge in locally stored metadata (webhookUrl, authToken)
        // This provides immediate access even before server deployment
        if (edge.type === 'webhook' && webhookMetadata[edge.id]) {
          decryptedEdge.metadata = {
            ...edge.metadata,
            ...webhookMetadata[edge.id],
          };
        }
        
        return decryptedEdge;
      }
      
      // No local keys - edge might be from before encryption or different device
      // Still merge webhook metadata if available
      if (edge.type === 'webhook' && webhookMetadata[edge.id]) {
        return {
          ...edge,
          metadata: {
            ...edge.metadata,
            ...webhookMetadata[edge.id],
          },
        };
      }
      
      return edge;
    });
    
    // Migrate edges missing X25519 key (one-time migration for old edges)
    const edgesNeedingMigration = decryptedEdges.filter(
      (e: { hasX25519?: boolean; status: string }) => !e.hasX25519 && e.status === 'active'
    );
    
    if (edgesNeedingMigration.length > 0) {
      console.log(`[Edge Migration] ${edgesNeedingMigration.length} edges need X25519 key migration`);
      
      for (const edge of edgesNeedingMigration) {
        await ensureEdgeHasX25519(edge.id, edge.address, edge.type);
      }
    }
    
    return { success: true, edges: decryptedEdges };
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
// Notification & Polling System (chrome.alarms)
// ============================================

const POLL_ALARM_NAME = 'relay-poll';
const POLL_INTERVAL_BACKGROUND_SECONDS = 300; // 5min fallback (SSE is primary)
const POLL_INTERVAL_ACTIVE_SECONDS = 60;      // 1min fallback (SSE is primary)

// Track if panel is currently active
let panelIsActive = false;

// ============================================
// Real-time SSE Connection
// ============================================

let sseConnected = false;
let sseRetryCount = 0;
const SSE_MAX_RETRY = 5;
const SSE_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

/**
 * Connect to SSE stream for real-time updates
 * Falls back to polling if connection fails
 */
async function connectSSE(): Promise<void> {
  if (!unlockedIdentity || !session.token) {
    console.log('[SSE] Not unlocked or no session token, skipping SSE');
    return;
  }

  const apiUrl = await getApiUrl();
  const streamUrl = `${apiUrl}/v1/stream`;

  console.log('[SSE] Connecting to real-time stream...');

  try {
    const response = await fetch(streamUrl, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body for SSE stream');
    }

    sseConnected = true;
    sseRetryCount = 0;
    console.log('[SSE] Connected successfully');

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (sseConnected && unlockedIdentity) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('[SSE] Stream ended');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6).trim();
        } else if (line.trim() === '' && eventType && eventData) {
          // Complete event received
          await handleSSEEvent(eventType, eventData);
          eventType = '';
          eventData = '';
        }
      }
    }
  } catch (error) {
    console.error('[SSE] Connection error:', error);
  } finally {
    sseConnected = false;
    
    // Retry with exponential backoff
    if (sseRetryCount < SSE_MAX_RETRY && unlockedIdentity) {
      const delay = SSE_RETRY_DELAYS[Math.min(sseRetryCount, SSE_RETRY_DELAYS.length - 1)];
      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${sseRetryCount + 1}/${SSE_MAX_RETRY})`);
      sseRetryCount++;
      
      setTimeout(() => {
        if (unlockedIdentity) {
          connectSSE();
        }
      }, delay);
    } else {
      console.log('[SSE] Max retries reached or wallet locked, falling back to polling only');
    }
  }
}

/**
 * Handle SSE events from server
 */
async function handleSSEEvent(type: string, dataStr: string): Promise<void> {
  try {
    if (type === 'connected') {
      console.log('[SSE] Connection confirmed');
      return;
    }

    if (type === 'conversation_update') {
      const data = JSON.parse(dataStr);
      console.log('[SSE] Conversation update:', data);
      
      // Trigger immediate poll to fetch new messages (mark as SSE-triggered)
      await pollForNewMessages(true);
    }
  } catch (error) {
    console.error('[SSE] Failed to handle event:', error);
  }
}

/**
 * Disconnect SSE stream
 */
function disconnectSSE(): void {
  sseConnected = false;
  sseRetryCount = 0;
  console.log('[SSE] Disconnected');
}

// Notification preferences (stored in chrome.storage.local)
interface NotificationPrefs {
  enabled: boolean;
  showDesktopNotifications: boolean;
  showBadgeCount: boolean;
  playSound: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  showDesktopNotifications: true,
  showBadgeCount: true,
  playSound: true,
};

// Processed conversation for storage (matches what panel expects)
interface ProcessedConversation {
  id: string;
  type: 'native' | 'email' | 'contact_endpoint' | 'discord';
  securityLevel: 'e2ee' | 'gateway_secured';
  participants: string[];
  counterpartyName: string;
  lastMessagePreview: string;
  lastMessageId?: string;  // For looking up cached decrypted content
  lastMessageWasMine?: boolean;  // For filtering sent vs received notifications
  lastActivityAt: string;
  createdAt: string;
  unreadCount: number;
  isUnread: boolean;
  myEdgeId?: string;
  counterpartyEdgeId?: string;
  counterpartyX25519PublicKey?: string;
  edgeAddress?: string;
}

// Track last seen activity per conversation (stored in chrome.storage.local)
interface LastSeenState {
  conversations: Record<string, string>; // conversationId -> lastSeenAt ISO string
  globalLastCheck: string; // Last time we checked for new messages
}

async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const storage = await chrome.storage.local.get(['notificationPrefs']);
  return storage.notificationPrefs || DEFAULT_NOTIFICATION_PREFS;
}

async function setNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<void> {
  const current = await getNotificationPrefs();
  await chrome.storage.local.set({ 
    notificationPrefs: { ...current, ...prefs } 
  });
}

async function getLastSeenState(): Promise<LastSeenState> {
  const storage = await chrome.storage.local.get(['lastSeenState']);
  return storage.lastSeenState || { 
    conversations: {}, 
    globalLastCheck: new Date(0).toISOString() 
  };
}

async function setLastSeenState(state: LastSeenState): Promise<void> {
  await chrome.storage.local.set({ lastSeenState: state });
}

// Get stored processed conversations
async function getStoredConversations(): Promise<ProcessedConversation[]> {
  const storage = await chrome.storage.local.get(['processedConversations']);
  return storage.processedConversations || [];
}

// Store processed conversations
async function setStoredConversations(conversations: ProcessedConversation[]): Promise<void> {
  await chrome.storage.local.set({ processedConversations: conversations });
}

async function markConversationSeen(conversationId: string): Promise<void> {
  const state = await getLastSeenState();
  state.conversations[conversationId] = new Date().toISOString();
  await setLastSeenState(state);
  
  // Update stored conversations to reflect seen status
  const storedConversations = await getStoredConversations();
  const updatedConversations = storedConversations.map(c => 
    c.id === conversationId ? { ...c, isUnread: false, unreadCount: 0 } : c
  );
  await setStoredConversations(updatedConversations);
  
  // Recalculate badge
  await updateBadgeCount();
}

async function startAlarmPolling(): Promise<void> {
  // Clear any existing alarm
  await chrome.alarms.clear(POLL_ALARM_NAME);
  
  // Use appropriate interval based on panel state
  const intervalMinutes = panelIsActive 
    ? POLL_INTERVAL_ACTIVE_SECONDS / 60 
    : POLL_INTERVAL_BACKGROUND_SECONDS / 60;
  
  // Create recurring alarm
  await chrome.alarms.create(POLL_ALARM_NAME, {
    periodInMinutes: intervalMinutes,
    delayInMinutes: 0.1, // Start almost immediately (6 seconds)
  });
  
  console.log(`[Notifications] Alarm polling started (${panelIsActive ? 'active' : 'background'} mode: ${intervalMinutes * 60}s)`);
  
  // Also poll immediately
  await pollForNewMessages();
}

// Update polling frequency when panel opens/closes
async function updatePollingFrequency(isActive: boolean): Promise<void> {
  panelIsActive = isActive;
  console.log(`[Notifications] Panel ${isActive ? 'opened' : 'closed'}, updating poll frequency`);
  await startAlarmPolling();
}

async function stopAlarmPolling(): Promise<void> {
  await chrome.alarms.clear(POLL_ALARM_NAME);
  console.log('[Notifications] Alarm polling stopped');
}

// Handle alarm events (service worker wakes up for this)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    console.log('[Notifications] Alarm fired, checking for messages...');
    await pollForNewMessages();
  }
});

async function pollForNewMessages(sseTriggered: boolean = false): Promise<void> {
  // Check if we're unlocked
  if (!unlockedIdentity) {
    console.log('[Notifications] Wallet locked, skipping poll');
    return;
  }
  
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled) {
    console.log('[Notifications] Notifications disabled, skipping poll');
    return;
  }
  
  try {
    // Use getConversations() for full processing (including metadata decryption)
    const convResult = await getConversations();
    
    if (!convResult.success || !convResult.conversations) {
      console.log('[Notifications] Failed to fetch conversations:', convResult.error);
      return;
    }
    
    const rawConversations = convResult.conversations;
    
    // Get last seen state for unread calculation
    const lastSeenState = await getLastSeenState();
    const lastSeenConversations = lastSeenState.conversations || {};
    
    // Save previous check time BEFORE updating (for notification filtering)
    const previousGlobalCheck = lastSeenState.globalLastCheck 
      ? new Date(lastSeenState.globalLastCheck).getTime() 
      : 0;
    
    // Batch load cached message previews for conversations that have lastMessageId
    const lastMessageIds = rawConversations
      .map(c => c.lastMessageId)
      .filter((id): id is string => !!id);
    const cachedPreviews = lastMessageIds.length > 0 
      ? await loadMessagesFromCache(lastMessageIds)
      : new Map<string, string>();
    
    // Process conversations with same logic as panel's loadConversations
    const processedConversations: ProcessedConversation[] = rawConversations.map(conv => {
      // Determine conversation type
      let type: 'native' | 'email' | 'contact_endpoint' | 'discord' = 'native';
      if (conv.origin === 'email_inbound' || conv.origin === 'email') type = 'email';
      else if (conv.origin === 'contact_link_inbound' || conv.origin === 'contact_link') type = 'contact_endpoint';
      else if (conv.origin === 'discord') type = 'discord';

      // Build counterparty name - prioritize decrypted metadata from bridge conversations
      let counterpartyName = 'Unknown';
      
      if (conv.decryptedCounterpartyName) {
        counterpartyName = conv.decryptedCounterpartyName;
      } else if (conv.counterparty?.handle) {
        counterpartyName = conv.counterparty.handle.startsWith('&') 
          ? conv.counterparty.handle 
          : `&${conv.counterparty.handle}`;
      } else if (conv.counterparty?.displayName) {
        counterpartyName = conv.counterparty.displayName;
      } else if (conv.edge?.address && (conv.origin === 'email' || conv.origin === 'email_inbound' || conv.origin === 'discord')) {
        const bridgeLabel = conv.origin === 'discord' ? 'Discord' : 'Email';
        counterpartyName = `${bridgeLabel} Contact`;
      } else if (conv.edge?.address && conv.origin !== 'native') {
        counterpartyName = `Contact via ${conv.edge.address.split('@')[0]}`;
      }

      // Calculate if conversation is unread
      const lastSeenAt = lastSeenConversations[conv.id];
      const lastActivityTime = new Date(conv.lastActivityAt).getTime();
      const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const isUnread = lastActivityTime > lastSeenTime;

      // Determine message preview:
      // 1. If we have cached decrypted content for lastMessageId -> show truncated preview
      // 2. If unread but not cached -> "New message" 
      // 3. If read but not cached -> empty (user hasn't opened this yet)
      let lastMessagePreview = '';
      if (conv.lastMessageId && cachedPreviews.has(conv.lastMessageId)) {
        const fullContent = cachedPreviews.get(conv.lastMessageId)!;
        // Truncate to ~50 chars for preview
        lastMessagePreview = fullContent.length > 50 
          ? fullContent.substring(0, 50) + '...' 
          : fullContent;
      } else if (isUnread) {
        lastMessagePreview = 'New message';
      }

      return {
        id: conv.id,
        type,
        securityLevel: conv.securityLevel as 'e2ee' | 'gateway_secured',
        participants: [conv.counterparty?.identityId || conv.counterparty?.externalId || 'unknown'],
        counterpartyName,
        lastMessagePreview,
        lastMessageId: conv.lastMessageId,
        lastMessageWasMine: conv.lastMessageWasMine,
        lastActivityAt: conv.lastActivityAt,
        createdAt: conv.createdAt,
        unreadCount: isUnread ? 1 : 0,
        isUnread,
        myEdgeId: conv.myEdgeId ?? conv.edge?.id,
        // For contact_link visitors, use externalId as their "edge" identifier
        counterpartyEdgeId: conv.counterparty?.edgeId ?? (conv.origin === 'contact_link' ? conv.counterparty?.externalId : undefined),
        // For contact_link, externalId IS the x25519 public key (NOT for gateway_secured where it's an email/discord ID)
        counterpartyX25519PublicKey: conv.counterparty?.x25519PublicKey ?? (conv.origin === 'contact_link' ? conv.counterparty?.externalId : undefined),
        edgeAddress: conv.edge?.address,
      };
    });
    
    // Store processed conversations to chrome.storage
    await setStoredConversations(processedConversations);
    
    // Count unread for badge and notifications
    const unreadConversations = processedConversations.filter(c => c.isUnread);
    
    // Update global last check time (but NOT individual conversation times - that's only when opened)
    lastSeenState.globalLastCheck = new Date().toISOString();
    await setLastSeenState(lastSeenState);
    
    // Update badge count
    if (prefs.showBadgeCount) {
      await updateBadgeCount(unreadConversations.length);
    }
    
    // Handle notifications for new messages
    // If panel is open: play sound only (user is actively viewing)
    // If panel is closed: show desktop notification only (alert user)
    // Only notify for RECEIVED messages (not ones we sent)
    console.log('[Notifications] Poll completed:', {
      sseTriggered,
      unreadCount: unreadConversations.length,
      unreadDetails: unreadConversations.map(c => ({
        id: c.id,
        counterpartyName: c.counterpartyName,
        lastMessageWasMine: c.lastMessageWasMine,
      })),
      panelIsActive,
      playSound: prefs.playSound,
      showDesktopNotifications: prefs.showDesktopNotifications,
    });
    
    if (unreadConversations.length > 0) {
      // Only notify for messages that arrived since our PREVIOUS check
      // AND were not sent by us (lastMessageWasMine === false)
      // UNLESS this was SSE-triggered (then always notify for unread messages)
      const recentMessages = sseTriggered
        ? unreadConversations.filter(c => c.lastMessageWasMine !== true)
        : previousGlobalCheck > 0
          ? unreadConversations.filter(c => {
              const msgTime = new Date(c.lastActivityAt).getTime();
              return msgTime > previousGlobalCheck && c.lastMessageWasMine !== true;
            })
          : [];
      
      console.log('[Notifications] Recent messages:', {
        total: recentMessages.length,
        conversations: recentMessages.map(c => ({
          id: c.id,
          counterpartyName: c.counterpartyName,
          lastMessageWasMine: c.lastMessageWasMine,
        })),
      });
      
      if (recentMessages.length > 0) {
        if (panelIsActive) {
          // Panel is open - play sound only (no desktop notification)
          if (prefs.playSound) {
            console.log('[Notifications] Panel open, playing sound for', recentMessages.length, 'new messages');
            await playNotificationSound();
          } else {
            console.log('[Notifications] Panel open but playSound is disabled');
          }
        } else {
          // Panel is closed - show desktop notification only (no sound)
          if (prefs.showDesktopNotifications) {
            console.log('[Notifications] Panel closed, showing desktop notification for', recentMessages.length, 'new messages');
            await showNewMessageNotification(recentMessages.map(c => ({
              conversationId: c.id,
              counterpartyName: c.counterpartyName,
              lastActivityAt: c.lastActivityAt,
            })));
          }
        }
      }
    }
    
    // Notify panel if open (send processed conversations)
    notifyPanel({ 
      type: 'CONVERSATIONS_UPDATED',
      conversations: processedConversations,
      unreadCount: unreadConversations.length,
    });
    
    console.log(`[Notifications] Poll complete: ${unreadConversations.length} unread conversations`);
  } catch (error) {
    console.error('[Notifications] Poll error:', error);
  }
}

async function updateBadgeCount(count?: number): Promise<void> {
  const prefs = await getNotificationPrefs();
  
  if (!prefs.showBadgeCount) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  
  // If count not provided, calculate from state
  if (count === undefined) {
    // We'd need to recalculate - for now just clear
    // This is called when marking a conversation as seen
    count = 0; // Will be updated on next poll
  }
  
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#0ea5e9' }); // sky-500
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Play notification sound using offscreen document (service workers can't play audio directly)
async function playNotificationSound(): Promise<void> {
  try {
    // Create offscreen document if needed (for playing audio in background)
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Play notification sound for new messages',
      });
    }
    
    // Send message to offscreen document to play sound
    await chrome.runtime.sendMessage({ 
      type: 'PLAY_NOTIFICATION_SOUND',
      target: 'offscreen' 
    });
    
    console.log('[Notifications] Sound played successfully');
  } catch (error) {
    console.error('[Notifications] Failed to play sound:', error);
  }
}

async function showNewMessageNotification(
  messages: Array<{ conversationId: string; counterpartyName: string; lastActivityAt: string }>
): Promise<void> {
  try {
    const iconUrl = chrome.runtime.getURL('icons/icon-128.png');
    console.log('[Notifications] Creating notification with iconUrl:', iconUrl);
    
    if (messages.length === 1) {
      // Single message notification
      const msg = messages[0];
      const notificationId = `relay-msg-${msg.conversationId}`;
      
      console.log('[Notifications] Creating single notification:', { 
        notificationId, 
        title: 'New message',
        message: `From ${msg.counterpartyName}`,
      });
      
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl,
        title: 'New message',
        message: `From ${msg.counterpartyName}`,
        priority: 2,
        silent: false,
      }, (createdId) => {
        if (chrome.runtime.lastError) {
          console.error('[Notifications] chrome.notifications.create error:', chrome.runtime.lastError.message);
        } else {
          console.log('[Notifications] Notification created successfully:', createdId);
        }
      });
    } else {
      // Multiple messages notification
      const notificationId = `relay-msgs-${Date.now()}`;
      
      console.log('[Notifications] Creating multi notification:', { 
        notificationId,
        title: 'New messages',
        message: `${messages.length} unread conversations`,
      });
      
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl,
        title: 'New messages',
        message: `${messages.length} unread conversations`,
        priority: 2,
        silent: false,
      }, (createdId) => {
        if (chrome.runtime.lastError) {
          console.error('[Notifications] chrome.notifications.create error:', chrome.runtime.lastError.message);
        } else {
          console.log('[Notifications] Notification created successfully:', createdId);
        }
      });
    }
  } catch (error) {
    console.error('[Notifications] Failed to show notification:', error);
  }
}

// Handle notification click - open panel in popup window
chrome.notifications.onClicked.addListener(async (notificationId) => {
  console.log('[Notifications] Notification clicked:', notificationId);
  
  // Clear the notification
  await chrome.notifications.clear(notificationId);
  
  // Open the panel as a popup window (workaround since sidePanel.open requires user gesture)
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('panel/index.html'),
      type: 'popup',
      width: 400,
      height: 600,
      focused: true,
    });
  } catch (error) {
    console.error('[Notifications] Failed to open panel window:', error);
  }
});

// Start polling when unlocked
function onUnlock() {
  startAlarmPolling();
  // Clear badge initially
  chrome.action.setBadgeText({ text: '' });
}

// Stop polling when locked
function onLock() {
  stopAlarmPolling();
  chrome.action.setBadgeText({ text: '' });
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

// Restore session state on service worker startup
(async () => {
  console.log('Relay background service worker started');
  
  const restored = await restoreSessionState();
  if (restored) {
    console.log('[Init] Session restored - Relay is unlocked');
    // Reset the lock timer since we just woke up
    await resetLockTimer();
  } else {
    console.log('[Init] No active session - Relay is locked');
  }
})();

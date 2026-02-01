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
  encryptMessage,
  decryptMessage,
  type EncryptedBundle,
} from '../lib/crypto';

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
  | { type: 'CLAIM_HANDLE'; payload: { handle: string } }
  | { type: 'SIGN_MESSAGE'; payload: { message: string } }
  | { type: 'GET_PUBLIC_KEY' }
  | { type: 'RESOLVE_HANDLE'; payload: { handle: string } }
  | { type: 'GET_CONVERSATIONS' }
  | { type: 'GET_MESSAGES'; payload: { conversationId: string; cursor?: string } }
  | { type: 'SEND_MESSAGE'; payload: { recipientIdentityId: string; recipientPublicKey: string; content: string; conversationId?: string } }
  | { type: 'CREATE_EDGE'; payload: { type: 'email' | 'contact_link'; label?: string } }
  | { type: 'GET_EDGES' }
  | { type: 'DISABLE_EDGE'; payload: { edgeId: string } };

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

    case 'CLAIM_HANDLE':
      return claimHandle(message.payload.handle);

    case 'SIGN_MESSAGE':
      return signMessage(message.payload.message);

    case 'GET_PUBLIC_KEY':
      return getPublicKey();

    case 'RESOLVE_HANDLE':
      return resolveHandle(message.payload.handle);

    case 'GET_CONVERSATIONS':
      return getConversations();

    case 'GET_MESSAGES':
      return getMessages(message.payload.conversationId, message.payload.cursor);

    case 'SEND_MESSAGE':
      return sendMessage(message.payload);

    case 'CREATE_EDGE':
      return createEdge(message.payload.type, message.payload.label);

    case 'GET_EDGES':
      return getEdges();

    case 'DISABLE_EDGE':
      return disableEdge(message.payload.edgeId);

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

async function createIdentity(passphrase: string): Promise<{
  success: boolean;
  fingerprint: string;
  publicKey: string;
}> {
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
  return result.apiUrl || 'http://localhost:3000';
}

// Suppress unused variable warning for session (will be used in M2)
void session;

// ============================================
// Handle Resolution
// ============================================

async function resolveHandle(handle: string): Promise<{
  success: boolean;
  handle?: string;
  publicKey?: string;
  identityId?: string;
  error?: string;
}> {
  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();
  
  try {
    const apiUrl = await getApiUrl();
    const res = await fetch(`${apiUrl}/v1/handle/resolve?handle=${encodeURIComponent(cleanHandle)}`);
    
    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, error: 'Handle not found' };
      }
      if (res.status === 410) {
        return { success: false, error: 'Handle is no longer active' };
      }
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to resolve handle' };
    }
    
    const data = await res.json();
    return {
      success: true,
      handle: data.handle,
      publicKey: data.publicKey,
      identityId: data.identityId,
    };
  } catch (error) {
    console.error('Resolve handle error:', error);
    return { success: false, error: 'Network error' };
  }
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
      type: string;
      address: string;
      label?: string;
      status: string;
    };
    counterparty?: {
      identityId?: string;
      externalId?: string;
      displayName?: string;
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
    
    // Process messages based on security level
    const processedMessages = await Promise.all(
      data.messages.map(async (msg: {
        id: string;
        senderIdentityId?: string;
        senderExternalId?: string;
        ciphertext?: string;
        ephemeralPubkey?: string;
        nonce?: string;
        plaintextContent?: string;
        createdAt: string;
      }) => {
        const isMine = msg.senderIdentityId === unlockedIdentity!.fingerprint;
        
        let content: string;
        
        if (data.securityLevel === 'e2ee' && msg.ciphertext && msg.nonce && msg.ephemeralPubkey) {
          // Decrypt E2EE message
          const encryptionKeyPair = deriveEncryptionKeyPair(unlockedIdentity!.secretKey);
          const senderPubKey = fromBase64(msg.ephemeralPubkey);
          const decrypted = decryptMessage(
            msg.ciphertext,
            msg.nonce,
            senderPubKey,
            encryptionKeyPair.secretKey
          );
          content = decrypted || '[Unable to decrypt]';
        } else if (msg.plaintextContent) {
          // Gateway secured message - content is plaintext
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

// ============================================
// Edge Management
// ============================================

async function createEdge(
  type: 'email' | 'contact_link',
  label?: string
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

    const res = await fetch(`${apiUrl}/v1/edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
        label,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to create edge' };
    }

    const edge = await res.json();
    return { success: true, edge };
  } catch (error) {
    console.error('Create edge error:', error);
    return { success: false, error: 'Network error' };
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
    return { success: true, edges: data.edges };
  } catch (error) {
    console.error('Get edges error:', error);
    return { success: false, error: 'Network error' };
  }
}

async function disableEdge(edgeId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!unlockedIdentity) {
    return { success: false, error: 'Wallet is locked' };
  }

  try {
    const apiUrl = await getApiUrl();
    const nonce = crypto.randomUUID();
    const messageToSign = `relay-disable-edge:${edgeId}:${nonce}`;
    const signature = signString(messageToSign, unlockedIdentity.secretKey);

    const res = await fetch(`${apiUrl}/v1/edge/${edgeId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to disable edge' };
    }

    return { success: true };
  } catch (error) {
    console.error('Disable edge error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// Authentication
// ============================================

async function getAuthToken(): Promise<string | null> {
  if (!unlockedIdentity) return null;
  
  // Check if we have a valid session
  if (session.token && session.expiresAt && session.expiresAt > Date.now()) {
    return session.token;
  }
  
  try {
    const apiUrl = await getApiUrl();
    
    // Request nonce
    const nonceRes = await fetch(`${apiUrl}/v1/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityId: unlockedIdentity.fingerprint }),
    });
    
    if (!nonceRes.ok) return null;
    const { nonce } = await nonceRes.json();
    
    // Sign the nonce
    const signature = signString(`relay-auth:${nonce}`, unlockedIdentity.secretKey);
    
    // Verify and get token
    const verifyRes = await fetch(`${apiUrl}/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: toBase64(unlockedIdentity.publicKey),
        nonce,
        signature,
      }),
    });
    
    if (!verifyRes.ok) return null;
    
    const { token, expiresAt } = await verifyRes.json();
    session = { 
      token, 
      expiresAt: new Date(expiresAt).getTime() 
    };
    
    return token;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// ============================================
// Background Polling
// ============================================

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
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

console.log('Relay background service worker started');

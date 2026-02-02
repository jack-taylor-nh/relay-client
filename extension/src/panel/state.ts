import { signal, computed } from '@preact/signals';
import type { Conversation, Identity, EmailAlias } from '../types';

// ============================================
// Rate Limiter - Prevents API spam when switching tabs
// ============================================

const apiCallTimestamps = new Map<string, number>();
const MIN_CALL_INTERVAL_MS = 2000; // Minimum 2 seconds between same API calls

function shouldThrottle(apiKey: string): boolean {
  const lastCall = apiCallTimestamps.get(apiKey);
  const now = Date.now();
  
  if (lastCall && (now - lastCall) < MIN_CALL_INTERVAL_MS) {
    console.log(`[Rate Limiter] Throttling ${apiKey}, called ${now - lastCall}ms ago`);
    return true;
  }
  
  apiCallTimestamps.set(apiKey, now);
  return false;
}

// ============================================
// App State
// ============================================

// Identity state
export type AppState = 
  | 'loading'           // Initial load, checking if identity exists
  | 'onboarding'        // No identity, show onboarding flow
  | 'locked'            // Identity exists but locked
  | 'unlocked';         // Ready to use

export const appState = signal<AppState>('loading');
export const currentIdentity = signal<Identity | null>(null);

// Onboarding step
export type OnboardingStep = 
  | 'welcome'
  | 'create-passphrase'
  | 'backup-identity'
  | 'create-edge'
  | 'complete';

export const onboardingStep = signal<OnboardingStep>('welcome');

// Derived state
export const isUnlocked = computed(() => appState.value === 'unlocked');
export const isOnboarding = computed(() => appState.value === 'onboarding');

// Temporary passphrase storage for backup screen (cleared after backup)
export const pendingPassphrase = signal<string | null>(null);

// ============================================
// Conversations, Edges & Messages
// ============================================

// Edge Type Definitions (fetched from server)
export interface EdgeTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  addressFormat: string;
  securityLevel: 'e2ee' | 'gateway_secured';
  requiresCustomAddress: boolean;
  addressPlaceholder?: string;
  enabled: boolean;
}

export const edgeTypes = signal<EdgeTypeDefinition[]>([]);

export const conversations = signal<Conversation[]>([]);
export const selectedConversationId = signal<string | null>(null);
export const aliases = signal<EmailAlias[]>([]); // Legacy - will be replaced by edges
export const handles = signal<Array<{
  id: string;
  handle: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  nativeEdgeId: string | null;
}>>([]);
export const edges = signal<Array<{
  id: string;
  type: string;
  address: string;
  label: string | null;
  status: string;
  securityLevel: string;
  messageCount: number;
  metadata?: any; // Includes handle/displayName for native edges
  createdAt: string;
  lastActivityAt: string | null;
}>>([]);

// ============================================
// UI State
// ============================================

export const isLoading = signal(false);
export const isRefreshing = signal(false);
export const toastMessage = signal<string | null>(null);

// Show toast
export function showToast(message: string, duration = 3000) {
  toastMessage.value = message;
  setTimeout(() => {
    toastMessage.value = null;
  }, duration);
}

// ============================================
// Background Worker Communication
// ============================================

export async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export async function checkIdentityState() {
  try {
    const state = await sendMessage<{
      exists: boolean;
      unlocked: boolean;
      handle: string | null;
      fingerprint: string | null;
    }>({ type: 'GET_STATE' });

    // Check if user has completed onboarding (persisted flag)
    const storage = await chrome.storage.local.get(['onboardingCompleted']);
    const hasCompletedOnboarding = storage.onboardingCompleted === true;

    if (!state.exists) {
      appState.value = 'onboarding';
      onboardingStep.value = 'welcome';
    } else if (!state.unlocked) {
      appState.value = 'locked';
      // Set partial identity info
      if (state.fingerprint) {
        currentIdentity.value = {
          id: state.fingerprint,
          publicKey: '',
          homeServer: 'userelay.org',
          handle: state.handle,
          createdAt: '',
        };
      }
    } else {
      appState.value = 'unlocked';
      if (state.fingerprint) {
        currentIdentity.value = {
          id: state.fingerprint,
          publicKey: '',
          homeServer: 'userelay.org',
          handle: state.handle,
          createdAt: '',
        };
      }
      // Only force to create-edge if user hasn't completed onboarding yet
      if (!state.handle && !hasCompletedOnboarding) {
        appState.value = 'onboarding';
        onboardingStep.value = 'create-edge';
      }
    }
  } catch (error) {
    console.error('Failed to check identity state:', error);
    appState.value = 'onboarding';
  }
}

/**
 * Load available edge types from server (dynamic configuration)
 */
export async function loadEdgeTypes() {
  try {
    const result = await sendMessage<{
      success: boolean;
      types?: EdgeTypeDefinition[];
      error?: string;
    }>({ type: 'GET_EDGE_TYPES' });

    if (result.success && result.types) {
      edgeTypes.value = result.types;
    }
  } catch (error) {
    console.error('Failed to load edge types:', error);
  }
}

export async function createIdentity(passphrase: string): Promise<{ success: boolean; error?: string }> {
  isLoading.value = true;
  try {
    const result = await sendMessage<{
      success: boolean;
      fingerprint?: string;
      publicKey?: string;
      error?: string;
    }>({ type: 'CREATE_IDENTITY', payload: { passphrase } });

    if (result.success && result.fingerprint) {
      currentIdentity.value = {
        id: result.fingerprint,
        publicKey: result.publicKey || '',
        homeServer: 'userelay.org',
        handle: null,
        createdAt: new Date().toISOString(),
      };
      // Store passphrase temporarily for backup screen
      pendingPassphrase.value = passphrase;
      onboardingStep.value = 'backup-identity';
      return { success: true };
    }
    return { success: false, error: result.error || 'Failed to create identity' };
  } catch (error) {
    console.error('Create identity error:', error);
    return { success: false, error: 'Failed to create identity' };
  } finally {
    isLoading.value = false;
  }
}

export async function unlockIdentity(passphrase: string): Promise<{ success: boolean; error?: string }> {
  isLoading.value = true;
  try {
    const result = await sendMessage<{
      success: boolean;
      error?: string;
    }>({ type: 'UNLOCK', payload: { passphrase } });

    if (result.success) {
      await checkIdentityState();
      return { success: true };
    }
    return { success: false, error: result.error || 'Invalid passphrase' };
  } catch (error) {
    console.error('Unlock error:', error);
    return { success: false, error: 'Failed to unlock' };
  } finally {
    isLoading.value = false;
  }
}

export async function lockWallet(): Promise<void> {
  await sendMessage({ type: 'LOCK' });
  appState.value = 'locked';
  conversations.value = [];
  selectedConversationId.value = null;
}

export async function logoutIdentity(): Promise<void> {
  await sendMessage({ type: 'LOGOUT' });
  // Clear all local state
  appState.value = 'onboarding';
  onboardingStep.value = 'welcome';
  currentIdentity.value = null;
  conversations.value = [];
  selectedConversationId.value = null;
  aliases.value = [];
  handles.value = [];
  edges.value = [];
}

export async function claimHandle(handle: string): Promise<{ success: boolean; error?: string }> {
  isLoading.value = true;
  try {
    const result = await sendMessage<{
      success: boolean;
      handle?: string;
      error?: string;
    }>({ type: 'CLAIM_HANDLE', payload: { handle } });

    if (result.success && result.handle) {
      if (currentIdentity.value) {
        currentIdentity.value = {
          ...currentIdentity.value,
          handle: result.handle,
        };
      }
      onboardingStep.value = 'complete';
      return { success: true };
    }
    return { success: false, error: result.error || 'Failed to claim handle' };
  } catch (error) {
    console.error('Claim handle error:', error);
    return { success: false, error: 'Failed to claim handle' };
  } finally {
    isLoading.value = false;
  }
}

export function completeOnboarding() {
  // Persist that onboarding is complete
  chrome.storage.local.set({ onboardingCompleted: true });
  appState.value = 'unlocked';
  onboardingStep.value = 'welcome';
  loadData(); // Load real data from API
}

// ============================================
// Data Loading
// ============================================

export async function loadData() {
  isLoading.value = true;
  
  try {
    // Load conversations
    const convResult = await sendMessage<{
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
          handle?: string;
        };
        lastActivityAt: string;
        createdAt: string;
      }>;
    }>({ type: 'GET_CONVERSATIONS' });

    if (convResult.success && convResult.conversations) {
      conversations.value = convResult.conversations.map(conv => {
        // Determine conversation type from origin
        let type: 'native' | 'email' | 'contact_endpoint' = 'native';
        if (conv.origin === 'email_inbound') type = 'email';
        else if (conv.origin === 'contact_link_inbound') type = 'contact_endpoint';

        // Build counterparty name
        let counterpartyName = 'Unknown';
        if (conv.counterparty?.handle) {
          // For native conversations, show handle with & prefix
          counterpartyName = conv.counterparty.handle.startsWith('&') 
            ? conv.counterparty.handle 
            : `&${conv.counterparty.handle}`;
        } else if (conv.counterparty?.displayName) {
          counterpartyName = conv.counterparty.displayName;
        } else if (conv.edge?.address) {
          // For email/contact endpoints without display name, use edge address
          counterpartyName = `Contact via ${conv.edge.address.split('@')[0]}`;
        }
        // Note: Don't show externalId - it's encrypted data

        return {
          id: conv.id,
          type,
          securityLevel: conv.securityLevel as 'e2ee' | 'gateway_secured',
          participants: [conv.counterparty?.identityId || conv.counterparty?.externalId || 'unknown'],
          counterpartyName,
          lastMessagePreview: '', // TODO: Fetch last message
          lastActivityAt: conv.lastActivityAt,
          createdAt: conv.createdAt,
          unreadCount: 0, // TODO: Track unread
        };
      });
    }

    // Load aliases
    const aliasResult = await sendMessage<{
      success: boolean;
      aliases?: Array<{
        id: string;
        address: string;
        label: string | null;
        isActive: boolean;
        messageCount: number;
      }>;
    }>({ type: 'GET_ALIASES' });

    if (aliasResult.success && aliasResult.aliases) {
      aliases.value = aliasResult.aliases.map(alias => ({
        id: alias.id,
        address: alias.address,
        label: alias.label,
        isActive: alias.isActive,
        createdAt: '', // Not provided by API
        messageCount: alias.messageCount,
      }));
    }
  } catch (error) {
    console.error('Failed to load data:', error);
  } finally {
    isLoading.value = false;
  }
}

export async function sendNewMessage(
  recipientFingerprint: string,
  recipientPublicKey: string,
  content: string,
  conversationId?: string
): Promise<{
  success: boolean;
  messageId?: string;
  conversationId?: string;
  error?: string;
}> {
  return sendMessage({
    type: 'SEND_MESSAGE',
    payload: { recipientFingerprint, recipientPublicKey, content, conversationId }
  });
}

export async function createAlias(label?: string): Promise<{
  success: boolean;
  alias?: { id: string; address: string; label: string | null };
  error?: string;
}> {
  return sendMessage({ type: 'CREATE_ALIAS', payload: { label } });
}

// ============================================
// Mock Data (fallback for development)
// ============================================

export function loadMockData() {
  conversations.value = [
    {
      id: '01hq8k3x0001',
      type: 'native',
      securityLevel: 'e2ee',
      participants: ['fp_abc123', 'fp_xyz789'],
      counterpartyName: 'alice',
      lastMessagePreview: 'Hey, did you get the files I sent?',
      lastActivityAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      unreadCount: 1,
    },
    {
      id: '01hq8k3x0002',
      type: 'email',
      securityLevel: 'gateway_secured',
      participants: ['newsletter@example.com'],
      counterpartyName: 'Weekly Digest',
      lastMessagePreview: 'Your weekly summary is ready...',
      lastActivityAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      unreadCount: 0,
    },
    {
      id: '01hq8k3x0003',
      type: 'contact_endpoint',
      securityLevel: 'gateway_secured',
      participants: ['anonymous'],
      counterpartyName: 'Contact Form',
      lastMessagePreview: 'Hi, I found your work interesting...',
      lastActivityAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      unreadCount: 0,
    },
  ];

  aliases.value = [
    {
      id: 'alias_001',
      address: 'news8k3x@relay.sh',
      label: 'Newsletters',
      isActive: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      messageCount: 47,
    },
    {
      id: 'alias_002',
      address: 'shop2m4n@relay.sh',
      label: 'Shopping',
      isActive: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
      messageCount: 12,
    },
  ];
}

// ============================================
// Listen for background messages
// ============================================

// ============================================
// Edge Management
// ============================================

export async function createEdge(
  type: 'native' | 'email' | 'contact_link', 
  label?: string,
  customAddress?: string,
  displayName?: string
): Promise<{ success: boolean; edge?: any; error?: string }> {
  isLoading.value = true;
  try {
    const result = await sendMessage<{
      success: boolean;
      edge?: any;
      error?: string;
    }>({ type: 'CREATE_EDGE', payload: { type, label, customAddress, displayName } });

    if (result.success && result.edge) {
      // Add to local state
      edges.value = [...edges.value, result.edge];
      return { success: true, edge: result.edge };
    }
    return { success: false, error: result.error || 'Failed to create edge' };
  } catch (error) {
    console.error('Create edge error:', error);
    return { success: false, error: 'Failed to create edge' };
  } finally {
    isLoading.value = false;
  }
}

export async function loadEdges(): Promise<void> {
  if (shouldThrottle('GET_EDGES')) return;
  
  try {
    const result = await sendMessage<{
      success: boolean;
      edges?: any[];
      error?: string;
    }>({ type: 'GET_EDGES' });

    if (result.success && result.edges) {
      edges.value = result.edges;
    }
  } catch (error) {
    console.error('Load edges error:', error);
  }
}

export async function loadConversations(): Promise<void> {
  if (shouldThrottle('GET_CONVERSATIONS')) return;
  
  isRefreshing.value = true;
  try {
    const convResult = await sendMessage<{
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
          handle?: string;
        };
        lastActivityAt: string;
        createdAt: string;
      }>;
    }>({ type: 'GET_CONVERSATIONS' });

    if (convResult.success && convResult.conversations) {
      conversations.value = convResult.conversations.map(conv => {
        let type: 'native' | 'email' | 'contact_endpoint' = 'native';
        if (conv.origin === 'email_inbound') type = 'email';
        else if (conv.origin === 'contact_link_inbound') type = 'contact_endpoint';

        let counterpartyName = 'Unknown';
        if (conv.counterparty?.handle) {
          counterpartyName = conv.counterparty.handle.startsWith('&') 
            ? conv.counterparty.handle 
            : `&${conv.counterparty.handle}`;
        } else if (conv.counterparty?.displayName) {
          counterpartyName = conv.counterparty.displayName;
        } else if (conv.edge?.address) {
          counterpartyName = `Contact via ${conv.edge.address.split('@')[0]}`;
        }

        return {
          id: conv.id,
          type,
          securityLevel: conv.securityLevel as 'e2ee' | 'gateway_secured',
          participants: [conv.counterparty?.identityId || conv.counterparty?.externalId || 'unknown'],
          counterpartyName,
          lastMessagePreview: conv.channelLabel || 'No messages yet',
          lastActivityAt: conv.lastActivityAt,
          createdAt: conv.createdAt,
          unreadCount: 0,
        };
      });
    }
  } catch (error) {
    console.error('Load conversations error:', error);
  } finally {
    isRefreshing.value = false;
  }
}

export async function resolveHandle(handle: string): Promise<{
  success: boolean;
  handle?: string;
  publicKey?: string;
  fingerprint?: string;
  x25519PublicKey?: string;
  edgeId?: string;
  error?: string;
}> {
  return sendMessage({ type: 'RESOLVE_HANDLE', payload: { handle } });
}

export async function burnEdge(edgeId: string): Promise<{ success: boolean; error?: string }> {
  isLoading.value = true;
  try {
    const result = await sendMessage<{
      success: boolean;
      error?: string;
    }>({ type: 'BURN_EDGE', payload: { edgeId } });

    if (result.success) {
      // Update local state - mark as burned
      edges.value = edges.value.map(e => 
        e.id === edgeId ? { ...e, status: 'burned' as const } : e
      );
      return { success: true };
    }
    return { success: false, error: result.error || 'Failed to burn edge' };
  } catch (error) {
    console.error('Burn edge error:', error);
    return { success: false, error: 'Failed to burn edge' };
  } finally {
    isLoading.value = false;
  }
}

// ============================================
// Runtime Listeners
// ============================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'LOCKED') {
    appState.value = 'locked';
    showToast('Session locked due to inactivity');
  }
  
  if (message.type === 'NEW_MESSAGES' && message.conversations) {
    // Refresh conversations to show new messages
    loadData();
  }
});

// ============================================
// Initialize
// ============================================

// Check identity state on load
checkIdentityState();

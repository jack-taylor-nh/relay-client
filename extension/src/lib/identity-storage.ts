/**
 * Chrome Storage Adapter for Identity Export/Import
 * 
 * Implements IdentityStorage interface for browser extension
 * Maps chrome.storage.local to platform-agnostic storage API
 */

import type {
  IdentityStorage,
  ExtendedIdentityStorage,
  StoredIdentity,
  StoredEdge,
  EdgeKeys,
  MessageCache,
  AssetState,
  ConversationInfo,
  EdgeType,
  SerializedRatchetState,
} from '@relay/core';

/**
 * Chrome extension-specific types (from background/index.ts)
 */
interface ProcessedConversation {
  id: string;
  type: EdgeType;
  securityLevel: 'e2ee' | 'gateway_secured';
  participants: string[];
  counterpartyName: string;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
  myEdgeId?: string;
  counterpartyEdgeId?: string;
  counterpartyX25519PublicKey?: string;
  edgeAddress?: string;
}

/**
 * Chrome Storage implementation of IdentityStorage
 * 
 * Storage keys used:
 * - 'identity' - StoredIdentity
 * - 'edgeKeys' - Record<edgeId, EdgeKeys>
 * - 'ratchet:{conversationId}' - Serialized ratchet state
 * - 'encryptedMessageCache' - Encrypted message cache (unified with background/index.ts)
 * - 'processedConversations' - ProcessedConversation[]
 * - 'assets' - AssetState
 */
export class ChromeIdentityStorage implements ExtendedIdentityStorage {
  // ===== Identity =====

  async getIdentity(): Promise<StoredIdentity | null> {
    const result = await chrome.storage.local.get(['identity']);
    return result.identity || null;
  }

  async setIdentity(identity: StoredIdentity): Promise<void> {
    await chrome.storage.local.set({ identity });
  }

  async removeIdentity(): Promise<void> {
    await chrome.storage.local.remove(['identity']);
  }

  // ===== Edges =====

  async getEdges(): Promise<StoredEdge[]> {
    // Build edges from processedConversations (which have edge metadata)
    const { processedConversations = [] } = await chrome.storage.local.get(['processedConversations']);
    const conversations = processedConversations as ProcessedConversation[];

    // Get edge keys to find all edges
    const { edgeKeys = {} } = await chrome.storage.local.get(['edgeKeys']);

    // Build unique edge list
    const edgeMap = new Map<string, StoredEdge>();

    for (const conv of conversations) {
      if (conv.myEdgeId && edgeKeys[conv.myEdgeId]) {
        if (!edgeMap.has(conv.myEdgeId)) {
          edgeMap.set(conv.myEdgeId, {
            id: conv.myEdgeId,
            type: conv.type,
            address: conv.edgeAddress || '',
            label: null, // Extension doesn't store edge labels currently
            status: 'active',
            createdAt: conv.createdAt
          });
        }
      }
    }

    // Also check edgeKeys for any edges not in conversations
    for (const edgeId of Object.keys(edgeKeys)) {
      if (!edgeMap.has(edgeId)) {
        // Edge exists but no conversation metadata - create minimal entry
        edgeMap.set(edgeId, {
          id: edgeId,
          type: 'native', // Default type
          address: '',
          label: null,
          status: 'active',
          createdAt: new Date().toISOString() // Unknown creation time
        });
      }
    }

    return Array.from(edgeMap.values());
  }

  async getEdge(edgeId: string): Promise<StoredEdge | null> {
    const edges = await this.getEdges();
    return edges.find(e => e.id === edgeId) || null;
  }

  async setEdge(edge: StoredEdge): Promise<void> {
    // Edge metadata is stored in processedConversations
    // For now, just ensure the edge exists in edgeKeys
    // Full edge management would require updating processedConversations
    
    // This is primarily used during import to restore edge metadata
    // The extension will rebuild processedConversations from server sync
  }

  async getEdgeKeys(edgeId: string): Promise<EdgeKeys | null> {
    const { edgeKeys = {} } = await chrome.storage.local.get(['edgeKeys']);
    return edgeKeys[edgeId] || null;
  }

  async setEdgeKeys(edgeId: string, keys: EdgeKeys): Promise<void> {
    const { edgeKeys = {} } = await chrome.storage.local.get(['edgeKeys']);
    edgeKeys[edgeId] = keys;
    await chrome.storage.local.set({ edgeKeys });
  }

  async getAllEdgeKeys(): Promise<Map<string, EdgeKeys>> {
    const { edgeKeys = {} } = await chrome.storage.local.get(['edgeKeys']);
    return new Map(Object.entries(edgeKeys));
  }

  // ===== Ratchet States =====

  async getRatchetState(conversationId: string): Promise<SerializedRatchetState | null> {
    const key = `ratchet:${conversationId}`;
    const result = await chrome.storage.local.get([key]);
    const serialized = result[key];
    
    if (!serialized) return null;
    
    // Parse if it's stored as string
    if (typeof serialized === 'string') {
      return JSON.parse(serialized);
    }
    
    return serialized;
  }

  async setRatchetState(conversationId: string, state: SerializedRatchetState): Promise<void> {
    const key = `ratchet:${conversationId}`;
    // Store as JSON string for consistency with existing storage
    await chrome.storage.local.set({ [key]: JSON.stringify(state) });
  }

  async getAllRatchetStates(): Promise<Map<string, SerializedRatchetState>> {
    // Get all keys from chrome.storage.local
    const allData = await chrome.storage.local.get(null);
    const ratchetStates = new Map<string, SerializedRatchetState>();

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('ratchet:')) {
        const conversationId = key.substring(8); // Remove 'ratchet:' prefix
        
        // Parse if stored as string
        const state = typeof value === 'string' ? JSON.parse(value) : value;
        ratchetStates.set(conversationId, state);
      }
    }

    return ratchetStates;
  }

  async removeRatchetState(conversationId: string): Promise<void> {
    const key = `ratchet:${conversationId}`;
    await chrome.storage.local.remove([key]);
  }

  // ===== Message Cache =====

  async getMessageCache(): Promise<MessageCache | null> {
    // Try new unified key first
    const { 'encryptedMessageCache': cache } = await chrome.storage.local.get(['encryptedMessageCache']);
    
    if (cache) {
      return {
        encryptionKey: '', // Will be derived from identity on unlock
        conversations: cache
      };
    }
    
    // Migration: Check legacy key for backwards compatibility
    const { 'relay-message-cache': legacyCache } = await chrome.storage.local.get(['relay-message-cache']);
    if (legacyCache) {
      console.log('[Storage Migration] Found legacy message cache, migrating to unified key...');
      // Migrate to new key
      await chrome.storage.local.set({ 'encryptedMessageCache': legacyCache });
      // Remove old key
      await chrome.storage.local.remove(['relay-message-cache']);
      console.log('[Storage Migration] Message cache migrated successfully');
      
      return {
        encryptionKey: '',
        conversations: legacyCache
      };
    }
    
    return null;
  }

  async setMessageCache(cache: MessageCache): Promise<void> {
    // Use unified storage key (matches background/index.ts MESSAGE_CACHE_KEY)
    await chrome.storage.local.set({ 
      'encryptedMessageCache': cache.conversations 
    });
  }

  async getConversationMessages(conversationId: string): Promise<{ ciphertext: string; nonce: string } | null> {
    const cache = await this.getMessageCache();
    if (!cache) return null;
    
    return cache.conversations[conversationId] || null;
  }

  async setConversationMessages(
    conversationId: string, 
    messages: { ciphertext: string; nonce: string }
  ): Promise<void> {
    const cache = await this.getMessageCache() || { encryptionKey: '', conversations: {} };
    cache.conversations[conversationId] = messages;
    await this.setMessageCache(cache);
  }

  // ===== Assets =====

  async getAssets(): Promise<AssetState> {
    const { assets } = await chrome.storage.local.get(['assets']);
    
    if (!assets) {
      return { permanent: [], consumable: [] };
    }
    
    return assets;
  }

  async setAssets(assets: AssetState): Promise<void> {
    await chrome.storage.local.set({ assets });
  }

  // ===== Extended: Conversation Info =====

  async getConversationInfo(conversationId: string): Promise<ConversationInfo | null> {
    const { processedConversations = [] } = await chrome.storage.local.get(['processedConversations']);
    const conversations = processedConversations as ProcessedConversation[];
    
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !conv.myEdgeId || !conv.counterpartyEdgeId || !conv.counterpartyX25519PublicKey) {
      return null;
    }

    return {
      conversationId: conv.id,
      edgeId: conv.myEdgeId,
      counterpartyEdgeId: conv.counterpartyEdgeId,
      counterpartyX25519PublicKey: conv.counterpartyX25519PublicKey,
      lastActivityAt: conv.lastActivityAt
    };
  }

  async getAllConversations(): Promise<ConversationInfo[]> {
    const { processedConversations = [] } = await chrome.storage.local.get(['processedConversations']);
    const conversations = processedConversations as ProcessedConversation[];

    return conversations
      .filter(c => c.myEdgeId && c.counterpartyEdgeId && c.counterpartyX25519PublicKey)
      .map(c => ({
        conversationId: c.id,
        edgeId: c.myEdgeId!,
        counterpartyEdgeId: c.counterpartyEdgeId!,
        counterpartyX25519PublicKey: c.counterpartyX25519PublicKey!,
        lastActivityAt: c.lastActivityAt
      }));
  }

  // ===== Utility =====

  async clearAll(): Promise<void> {
    // Get all keys
    const allData = await chrome.storage.local.get(null);
    const keysToRemove: string[] = [];

    // Collect all identity-related keys
    for (const key of Object.keys(allData)) {
      if (
        key === 'identity' ||
        key === 'edgeKeys' ||
        key.startsWith('ratchet:') ||
        key === 'relay-message-cache' ||
        key === 'processedConversations' ||
        key === 'assets' ||
        key === 'lastSeenState'
      ) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    // Also clear session storage
    await chrome.storage.session.clear();
  }
}

/**
 * Singleton instance for use throughout extension
 */
export const chromeIdentityStorage = new ChromeIdentityStorage();

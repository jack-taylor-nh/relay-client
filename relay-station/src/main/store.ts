/**
 * Configuration Store
 * 
 * Manages persistent storage of app config and edge settings
 * Uses electron-store with encryption
 */

import Store from 'electron-store';
import type { AppConfig, EdgeConfig, LLMProvider, BridgeEdge } from '../shared/types';
import { DEFAULT_CONTEXT_WINDOW_SIZE, DEFAULT_SYSTEM_PROMPT } from '../shared/constants';

// Schema for type safety
const schema = {
  bridgeEdge: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: { type: 'string' },
      ed25519PrivateKey: { type: 'string' },
      ed25519PublicKey: { type: 'string' },
      x25519PrivateKey: { type: 'string' },
      x25519PublicKey: { type: 'string' },
      authToken: { type: 'string' },
      createdAt: { type: 'string' },
    },
  },
  edges: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        authToken: { type: 'string' },
        x25519PrivateKey: { type: 'string' },
        x25519PublicKey: { type: 'string' },
        label: { type: 'string' },
        systemPrompt: { type: 'string' },
        model: { type: 'string' },
        contextWindowSize: { type: 'number' },
        active: { type: 'boolean' },
        createdAt: { type: 'string' },
      },
    },
    default: [],
  },
  activeLLM: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      baseUrl: { type: 'string' },
      available: { type: 'boolean' },
      models: { type: 'array' },
      defaultModel: { type: 'string' },
    },
  },
  customLLMs: {
    type: 'array',
    default: [],
  },
  autoLaunch: {
    type: 'boolean',
    default: true,
  },
  notifications: {
    type: 'boolean',
    default: true,
  },
  autoReconnect: {
    type: 'boolean',
    default: true,
  },
  defaultModel: {
    type: 'string',
    default: '',
  },
  systemPrompt: {
    type: 'string',
    default: '',
  },
  availableModels: {
    type: 'array',
    items: {
      type: 'string',
    },
  },
  rateLimit: {
    type: 'object',
  },
  accessControl: {
    type: 'string',
    enum: ['public', 'private', 'hidden'],
    default: 'public',
  },
  streamResponses: {
    type: 'boolean',
    default: true,
  },
  chunkSize: {
    type: 'number',
    default: 10,
  },
  maxChunkDelayMs: {
    type: 'number',
    default: 100,
  },
  apiKeys: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        key: { type: 'string' },
        createdAt: { type: 'number' },
        lastUsed: { type: 'number' },
        requestCount: { type: 'number' },
        tokensUsed: { type: 'number' },
        rateLimit: {
          type: 'object',
          properties: {
            requestsPerHour: { type: 'number' },
            tokensPerDay: { type: 'number' },
          },
        },
      },
    },
    default: [],
  },
  // DEPRECATED: Legacy edge ID whitelist (kept for backward compatibility)
  authorizedUsers: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        addedAt: { type: 'number' },
        lastSeen: { type: 'number' },
        requestCount: { type: 'number' },
      },
    },
    default: [],
  },
} as const;

class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store({
      schema: schema as any,
      encryptionKey: 'relay-llm-bridge-encryption-key', // TODO: Generate per-machine key
      clearInvalidConfig: true,
    });
  }

  /**
   * Get entire config
   */
  getConfig(): AppConfig {
    return {
      bridgeEdge: this.store.get('bridgeEdge'),
      edges: this.store.get('edges', []),
      activeLLM: this.store.get('activeLLM'),
      customLLMs: this.store.get('customLLMs', []),
      autoLaunch: this.store.get('autoLaunch', true),
      notifications: this.store.get('notifications', true),
      autoReconnect: this.store.get('autoReconnect', true),
      defaultModel: this.store.get('defaultModel'),
      systemPrompt: this.store.get('systemPrompt'),
      availableModels: this.store.get('availableModels'),
      rateLimit: this.store.get('rateLimit'),
      accessControl: this.store.get('accessControl', 'public'),
      apiKeys: this.store.get('apiKeys', []),
      authorizedUsers: this.store.get('authorizedUsers', []),
    };
  }

  /**
   * Get the bridge's own edge
   */
  getBridgeEdge(): BridgeEdge | undefined {
    return this.store.get('bridgeEdge');
  }

  /**
   * Set the bridge's own edge
   */
  setBridgeEdge(edge: BridgeEdge): void {
    this.store.set('bridgeEdge', edge);
  }

  /**
   * Clear the bridge's own edge
   */
  clearBridgeEdge(): void {
    this.store.delete('bridgeEdge');
  }

  /**
   * Update config (partial)
   */
  updateConfig(updates: Partial<AppConfig>): void {
    Object.entries(updates).forEach(([key, value]) => {
      // Skip undefined values to avoid electron-store validation issues
      if (value !== undefined) {
        this.store.set(key as keyof AppConfig, value);
        console.log(`[ConfigStore] Set ${key}:`, typeof value === 'string' ? value.substring(0, 50) + '...' : value);
      }
    });
  }

  /**
   * Get all edges (with normalized aliases)
   */
  getEdges(): EdgeConfig[] {
    const edges = this.store.get('edges', []);
    
    // Add aliases for backward/forward compatibility
    return edges.map(edge => ({
      ...edge,
      edgeId: edge.id,
      token: edge.authToken,
      privateKey: edge.x25519PrivateKey,
      modelName: edge.model,
      enabled: edge.active,
    }));
  }

  /**
   * Get specific edge by ID (with normalized aliases)
   */
  getEdge(edgeId: string): EdgeConfig | undefined {
    const edges = this.getEdges();
    return edges.find((e) => e.id === edgeId);
  }

  /**
   * Add new edge
   */
  addEdge(edge: EdgeConfig): void {
    const edges = this.getEdges();
    
    // Check if edge already exists
    const existingIndex = edges.findIndex((e) => e.id === edge.id);
    if (existingIndex !== -1) {
      throw new Error(`Edge ${edge.id} already exists`);
    }

    // Set defaults
    const newEdge: EdgeConfig = {
      ...edge,
      systemPrompt: edge.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      contextWindowSize: edge.contextWindowSize || DEFAULT_CONTEXT_WINDOW_SIZE,
      active: edge.active !== undefined ? edge.active : true,
      createdAt: edge.createdAt || new Date().toISOString(),
    };

    edges.push(newEdge);
    this.store.set('edges', edges);
  }

  /**
   * Update existing edge
   */
  updateEdge(edgeId: string, updates: Partial<EdgeConfig>): void {
    const edges = this.getEdges();
    const index = edges.findIndex((e) => e.id === edgeId);

    if (index === -1) {
      throw new Error(`Edge ${edgeId} not found`);
    }

    edges[index] = { ...edges[index], ...updates };
    this.store.set('edges', edges);
  }

  /**
   * Remove edge
   */
  removeEdge(edgeId: string): void {
    const edges = this.getEdges();
    const filtered = edges.filter((e) => e.id !== edgeId);

    if (filtered.length === edges.length) {
      throw new Error(`Edge ${edgeId} not found`);
    }

    this.store.set('edges', filtered);
  }

  /**
   * Set active LLM provider
   */
  setActiveLLM(provider: LLMProvider): void {
    this.store.set('activeLLM', provider);
  }

  /**
   * Get active LLM provider
   */
  getActiveLLM(): LLMProvider | undefined {
    return this.store.get('activeLLM');
  }

  /**
   * Add custom LLM provider
   */
  addCustomLLM(provider: LLMProvider): void {
    const custom = this.store.get('customLLMs', []);
    custom.push(provider);
    this.store.set('customLLMs', custom);
  }

  /**
   * Remove custom LLM provider
   */
  removeCustomLLM(baseUrl: string): void {
    const custom = this.store.get('customLLMs', []);
    const filtered = custom.filter((p) => p.baseUrl !== baseUrl);
    this.store.set('customLLMs', filtered);
  }

  /**
   * Clear all data (for debugging/testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get raw store for advanced operations
   */
  getRawStore(): Store<AppConfig> {
    return this.store;
  }
}

// Export singleton instance
export const configStore = new ConfigStore();

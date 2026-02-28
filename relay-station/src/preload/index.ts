/**
 * Electron Preload Script
 * 
 * Exposes safe IPC methods to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, EdgeConfig, LLMProvider, BridgeEdge } from '../shared/types';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Config operations
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('get-config'),
  updateConfig: (config: Partial<AppConfig>): Promise<void> => 
    ipcRenderer.invoke('update-config', config),

  // Edge operations
  addEdge: (edge: EdgeConfig): Promise<void> => 
    ipcRenderer.invoke('add-edge', edge),
  removeEdge: (edgeId: string): Promise<void> => 
    ipcRenderer.invoke('remove-edge', edgeId),
  updateEdge: (edgeId: string, changes: Partial<EdgeConfig>): Promise<void> => 
    ipcRenderer.invoke('update-edge', edgeId, changes),

  // LLM operations
  detectLLMs: (): Promise<LLMProvider[]> => 
    ipcRenderer.invoke('detect-llms'),
  setActiveLLM: (provider: LLMProvider): Promise<void> => 
    ipcRenderer.invoke('set-active-llm', provider),
  testLLM: (provider: LLMProvider): Promise<boolean> => 
    ipcRenderer.invoke('test-llm', provider),

  // Crypto operations
  generateKeypair: (): Promise<{ publicKey: string; privateKey: string }> => 
    ipcRenderer.invoke('generate-keypair'),
  
  // E2EE encryption/decryption for AI operators
  encryptE2EE: (payload: { plaintext: string; recipientPublicKey: string }): Promise<{ 
    ciphertext: string; 
    ephemeralPublicKey: string; 
    nonce: string 
  }> =>
    ipcRenderer.invoke('encrypt-e2ee', payload),
  decryptE2EE: (payload: {
    ciphertext: string;
    ephemeralPublicKey: string;
    nonce: string;
    recipientPrivateKey: string;
  }): Promise<string> =>
    ipcRenderer.invoke('decrypt-e2ee', payload),

  // Bridge edge operations
  createBridgeEdge: (label: string): Promise<BridgeEdge> => 
    ipcRenderer.invoke('create-bridge-edge', label),
  disconnectBridge: (): Promise<void> => 
    ipcRenderer.invoke('disconnect-bridge'),
  updateBridgeLabel: (label: string): Promise<void> =>
    ipcRenderer.invoke('update-bridge-label', label),
  getBridgeConfig: (): Promise<{ systemPrompt?: string; defaultModel?: string; availableModels?: string[] }> =>
    ipcRenderer.invoke('get-bridge-config'),
  updateBridgeConfig: (updates: { systemPrompt?: string; defaultModel?: string }): Promise<void> =>
    ipcRenderer.invoke('update-bridge-config', updates),
  getBridgeStatus: (): Promise<string> =>
    ipcRenderer.invoke('get-bridge-status'),
  getAuthorizedUsers: (): Promise<Array<{ id: string; label: string; addedAt: number; lastSeen?: number; requestCount: number }>> =>
    ipcRenderer.invoke('get-authorized-users'),
  addAuthorizedUser: (user: { id: string; label: string }): Promise<void> =>
    ipcRenderer.invoke('add-authorized-user', user),
  removeAuthorizedUser: (userId: string): Promise<void> =>
    ipcRenderer.invoke('remove-authorized-user', userId),

  // API Key management (new)
  generateAPIKey: (label: string): Promise<{ id: string; key: string }> =>
    ipcRenderer.invoke('generate-api-key', label),
  getAPIKeys: (): Promise<Array<{ 
    id: string; 
    label: string; 
    key: string; 
    createdAt: number; 
    lastUsed?: number; 
    requestCount: number; 
    tokensUsed: number;
    rateLimit?: { requestsPerHour?: number; tokensPerDay?: number };
  }>> =>
    ipcRenderer.invoke('get-api-keys'),
  revokeAPIKey: (keyId: string): Promise<void> =>
    ipcRenderer.invoke('revoke-api-key', keyId),
  updateAPIKeyLimits: (keyId: string, rateLimit: { requestsPerHour?: number; tokensPerDay?: number }): Promise<void> =>
    ipcRenderer.invoke('update-api-key-limits', keyId, rateLimit),

  // Legacy bridge operations (for client edges - deprecated)
  connectBridge: (edgeId: string): Promise<void> => 
    ipcRenderer.invoke('connect-bridge', edgeId),

  // Stats
  getStats: (): Promise<any> => 
    ipcRenderer.invoke('get-stats'),

  // Operator Service - Background AI request handling
  operatorStart: (config: {
    edge_id: string;
    name: string;
    region: string;
    models: Array<{ model_id: string; provider: string; payout_rate_per_token: string }>;
    x25519_public_key: string;
    x25519_private_key: string;
  }): Promise<void> =>
    ipcRenderer.invoke('operator-start', config),
  operatorStop: (): Promise<void> =>
    ipcRenderer.invoke('operator-stop'),
  operatorCleanupVRAM: (): Promise<void> =>
    ipcRenderer.invoke('operator-cleanup-vram'),
  operatorGetStats: (): Promise<{
    isRunning: boolean;
    isConnected: boolean;
    connectionStatus: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    averageLatency: number;
    uptime: number;
    lastActivity: number | null;
    errorMessage?: string;
  }> =>
    ipcRenderer.invoke('operator-get-stats'),
  onOperatorStatusChange: (callback: (stats: any) => void) => {
    ipcRenderer.on('operator-status-changed', (_event, stats) => callback(stats));
  },

  // Startup sequence — triggers boot cleanup in main, streams status events back
  startupClean: (): Promise<void> =>
    ipcRenderer.invoke('startup-clean'),
  onStartupStatus: (callback: (data: { phase: string; message: string; step: number; total: number }) => void) => {
    ipcRenderer.on('startup-status', (_event, data) => callback(data));
  },

  // Ollama management
  ollamaStatus: (): Promise<any> =>
    ipcRenderer.invoke('ollama-status'),
  ollamaRestart: (): Promise<boolean> =>
    ipcRenderer.invoke('ollama-restart'),
  ollamaListModels: (): Promise<any[]> =>
    ipcRenderer.invoke('ollama-models-list'),
  ollamaRunningModels: (): Promise<any[]> =>
    ipcRenderer.invoke('ollama-running-models'),
  testModel: (modelName: string): Promise<{ success: boolean; response?: string; error?: string; gpuPercent?: number; placement?: 'gpu' | 'partial' | 'cpu' }> =>
    ipcRenderer.invoke('test-model', modelName),
  ollamaPullModel: (modelName: string): Promise<boolean> =>
    ipcRenderer.invoke('ollama-model-pull', modelName),
  ollamaCancelPull: (modelName: string): Promise<boolean> =>
    ipcRenderer.invoke('ollama-model-cancel', modelName),
  ollamaDeleteModel: (modelName: string): Promise<boolean> =>
    ipcRenderer.invoke('ollama-model-delete', modelName),
  downloadOllama: (): Promise<boolean> =>
    ipcRenderer.invoke('ollama-download'),
  selectOllamaPath: (): Promise<string | null> =>
    ipcRenderer.invoke('ollama-select-path'),

  // Utility operations
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  // Events (renderer can listen)
  onLLMStatusChange: (callback: (providers: LLMProvider[]) => void) => {
    ipcRenderer.on('llm-status-change', (_event, providers) => callback(providers));
  },
  onOllamaDownloadProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('ollama-download-progress', (_event, progress) => callback(progress));
  },
  onOllamaPullProgress: (callback: (data: { modelName: string; status: string; completed?: number; total?: number }) => void) => {
    ipcRenderer.on('ollama-pull-progress', (_event, data) => callback(data));
  },
  onBridgeLog: (callback: (log: { timestamp: string; level: 'info' | 'warn' | 'error'; message: string; details?: any }) => void) => {
    ipcRenderer.on('bridge-log', (_event, log) => callback(log));
  },
  onBridgeStatusChange: (callback: (status: string) => void) => {
    ipcRenderer.on('bridge-status-change', (_event, status) => callback(status));
  },

  // Hardware detection
  hardwareDetect: (): Promise<any> =>
    ipcRenderer.invoke('hardware-detect'),
  hardwareCanRunModel: (modelSizeGB: number, modelVRAM: number): Promise<string> =>
    ipcRenderer.invoke('hardware-can-run-model', modelSizeGB, modelVRAM),
  hardwareEstimatePerformance: (modelSizeGB: number, modelVRAM: number): Promise<any> =>
    ipcRenderer.invoke('hardware-estimate-performance', modelSizeGB, modelVRAM),

  // Model catalog
  modelCatalogGet: (): Promise<any[]> =>
    ipcRenderer.invoke('model-catalog-get'),
  modelCatalogSearch: (query: string): Promise<any[]> =>
    ipcRenderer.invoke('model-catalog-search', query),

  // Model fit analysis
  modelFitGetSystemSpecs: (): Promise<any> =>
    ipcRenderer.invoke('model-fit:get-system-specs'),
  modelFitAnalyze: (modelId: string): Promise<any> =>
    ipcRenderer.invoke('model-fit:analyze', modelId),
  modelFitAnalyzeAll: (): Promise<any[]> =>
    ipcRenderer.invoke('model-fit:analyze-all'),
  modelFitRecommend: (filters?: { 
    useCase?: string;
    minFitLevel?: string;
    runtime?: string;
    maxSizeGB?: number;
    limit?: number;
  }): Promise<any[]> =>
    ipcRenderer.invoke('model-fit:recommend', filters),
  modelFitGetByFitLevel: (): Promise<any> =>
    ipcRenderer.invoke('model-fit:get-by-fit-level'),
  modelFitGetFastest: (limit?: number): Promise<any[]> =>
    ipcRenderer.invoke('model-fit:get-fastest', limit),

  // Enhanced model database
  enhancedModelsGetAll: (): Promise<any[]> =>
    ipcRenderer.invoke('enhanced-models:get-all'),
  enhancedModelsGet: (modelId: string): Promise<any> =>
    ipcRenderer.invoke('enhanced-models:get', modelId),
  enhancedModelsSearch: (query: string): Promise<any[]> =>
    ipcRenderer.invoke('enhanced-models:search', query),

  // Stats database queries
  statsGetCurrentSession: (): Promise<any> =>
    ipcRenderer.invoke('stats-get-current-session'),
  statsGetDaily: (bridgeId: string, startDate: string, endDate: string): Promise<any[]> =>
    ipcRenderer.invoke('stats-get-daily', bridgeId, startDate, endDate),
  statsGetRecentEvents: (bridgeId: string, limit?: number, offset?: number): Promise<any[]> =>
    ipcRenderer.invoke('stats-get-recent-events', bridgeId, limit, offset),
  statsGetLifetime: (bridgeId: string): Promise<any> =>
    ipcRenderer.invoke('stats-get-lifetime', bridgeId),
  statsGetTopUsers: (bridgeId: string, limit?: number): Promise<any[]> =>
    ipcRenderer.invoke('stats-get-top-users', bridgeId, limit),
  statsTriggerAggregation: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('stats-trigger-aggregation'),
});

// Type definitions for window.electronAPI
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      updateConfig: (config: Partial<AppConfig>) => Promise<void>;
      addEdge: (edge: EdgeConfig) => Promise<void>;
      removeEdge: (edgeId: string) => Promise<void>;
      updateEdge: (edgeId: string, changes: Partial<EdgeConfig>) => Promise<void>;
      detectLLMs: () => Promise<LLMProvider[]>;
      setActiveLLM: (provider: LLMProvider) => Promise<void>;
      testLLM: (provider: LLMProvider) => Promise<boolean>;
      generateKeypair: () => Promise<{ publicKey: string; privateKey: string }>;
      createBridgeEdge: (label: string) => Promise<BridgeEdge>;
      disconnectBridge: () => Promise<void>;
      updateBridgeLabel?: (label: string) => Promise<void>;
      getBridgeConfig?: () => Promise<{ systemPrompt?: string; defaultModel?: string; availableModels?: string[] }>;
      updateBridgeConfig?: (updates: { systemPrompt?: string; defaultModel?: string }) => Promise<void>;
      getBridgeStatus?: () => Promise<string>;
      getAuthorizedUsers?: () => Promise<Array<{ id: string; label: string; addedAt: number; lastSeen?: number; requestCount: number }>>;
      addAuthorizedUser?: (user: { id: string; label: string }) => Promise<void>;
      removeAuthorizedUser?: (userId: string) => Promise<void>;
      generateAPIKey?: (label: string) => Promise<{ id: string; key: string }>;
      getAPIKeys?: () => Promise<Array<{ 
        id: string; 
        label: string; 
        key: string; 
        createdAt: number; 
        lastUsed?: number; 
        requestCount: number; 
        tokensUsed: number;
        rateLimit?: { requestsPerHour?: number; tokensPerDay?: number };
      }>>;
      revokeAPIKey?: (keyId: string) => Promise<void>;
      updateAPIKeyLimits?: (keyId: string, rateLimit: { requestsPerHour?: number; tokensPerDay?: number }) => Promise<void>;
      connectBridge: (edgeId: string) => Promise<void>;
      getStats: () => Promise<any>;
      startupClean?: () => Promise<void>;
      onStartupStatus?: (callback: (data: { phase: string; message: string; step: number; total: number }) => void) => void;
      ollamaStatus: () => Promise<any>;
      ollamaRestart: () => Promise<boolean>;
      ollamaListModels: () => Promise<any[]>;
      ollamaRunningModels?: () => Promise<any[]>;
      testModel?: (modelName: string) => Promise<{ success: boolean; response?: string; error?: string; gpuPercent?: number; placement?: 'gpu' | 'partial' | 'cpu' }>;
      ollamaPullModel: (modelName: string) => Promise<boolean>;
      ollamaCancelPull?: (modelName: string) => Promise<boolean>;
      ollamaDeleteModel: (modelName: string) => Promise<boolean>;
      downloadOllama?: () => Promise<boolean>;
      selectOllamaPath?: () => Promise<string | null>;
      openExternal?: (url: string) => Promise<void>;
      onLLMStatusChange: (callback: (providers: LLMProvider[]) => void) => void;
      onOllamaDownloadProgress?: (callback: (progress: number) => void) => void;
      onOllamaPullProgress?: (callback: (data: { modelName: string; status: string; completed?: number; total?: number }) => void) => void;
      onBridgeLog?: (callback: (log: { timestamp: string; level: 'info' | 'warn' | 'error'; message: string; details?: any }) => void) => void;
      onBridgeStatusChange?: (callback: (status: string) => void) => void;
      hardwareDetect?: () => Promise<any>;
      hardwareCanRunModel?: (modelSizeGB: number, modelVRAM: number) => Promise<string>;
      hardwareEstimatePerformance?: (modelSizeGB: number, modelVRAM: number) => Promise<any>;
      modelCatalogGet?: () => Promise<any[]>;
      modelCatalogSearch?: (query: string) => Promise<any[]>;
      // Model fit analysis
      modelFitGetSystemSpecs?: () => Promise<any>;
      modelFitAnalyze?: (modelId: string) => Promise<any>;
      modelFitAnalyzeAll?: () => Promise<any[]>;
      modelFitRecommend?: (filters?: { 
        useCase?: string;
        minFitLevel?: string;
        runtime?: string;
        maxSizeGB?: number;
        limit?: number;
      }) => Promise<any[]>;
      modelFitGetByFitLevel?: () => Promise<any>;
      modelFitGetFastest?: (limit?: number) => Promise<any[]>;
      // Enhanced model database
      enhancedModelsGetAll?: () => Promise<any[]>;
      enhancedModelsGet?: (modelId: string) => Promise<any>;
      enhancedModelsSearch?: (query: string) => Promise<any[]>;
      // Stats database queries
      statsGetCurrentSession?: () => Promise<any>;
      statsGetDaily?: (bridgeId: string, startDate: string, endDate: string) => Promise<any[]>;
      statsGetRecentEvents?: (bridgeId: string, limit?: number, offset?: number) => Promise<any[]>;
      statsGetLifetime?: (bridgeId: string) => Promise<any>;
      statsGetTopUsers?: (bridgeId: string, limit?: number) => Promise<any[]>;
      statsTriggerAggregation?: () => Promise<{ success: boolean }>;
    };
  }
}

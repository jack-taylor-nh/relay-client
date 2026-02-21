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

  // Bridge edge operations
  createBridgeEdge: (label: string): Promise<BridgeEdge> => 
    ipcRenderer.invoke('create-bridge-edge', label),
  disconnectBridge: (): Promise<void> => 
    ipcRenderer.invoke('disconnect-bridge'),
  updateBridgeLabel: (label: string): Promise<void> =>
    ipcRenderer.invoke('update-bridge-label', label),
  getBridgeStatus: (): Promise<string> =>
    ipcRenderer.invoke('get-bridge-status'),

  // Legacy bridge operations (for client edges - deprecated)
  connectBridge: (edgeId: string): Promise<void> => 
    ipcRenderer.invoke('connect-bridge', edgeId),

  // Stats
  getStats: (): Promise<any> => 
    ipcRenderer.invoke('get-stats'),

  // Ollama management
  ollamaStatus: (): Promise<any> =>
    ipcRenderer.invoke('ollama-status'),
  ollamaRestart: (): Promise<boolean> =>
    ipcRenderer.invoke('ollama-restart'),
  ollamaListModels: (): Promise<any[]> =>
    ipcRenderer.invoke('ollama-models-list'),
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
      getBridgeStatus?: () => Promise<string>;
      connectBridge: (edgeId: string) => Promise<void>;
      getStats: () => Promise<any>;
      ollamaStatus: () => Promise<any>;
      ollamaRestart: () => Promise<boolean>;
      ollamaListModels: () => Promise<any[]>;
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
    };
  }
}

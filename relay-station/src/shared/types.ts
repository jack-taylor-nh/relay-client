/**
 * Shared Type Definitions
 */

export interface BridgeEdge {
  id: string;
  label: string;
  ed25519PrivateKey: string;
  ed25519PublicKey: string;
  x25519PrivateKey: string;
  x25519PublicKey: string;
  authToken: string;
  createdAt: string;
}

export interface BridgeAPIKey {
  id: string; // Unique key ID (e.g., 'relay_pk_abc123')
  label: string; // User-friendly name (e.g., 'Production Key')
  key: string; // The actual API key
  createdAt: number; // Timestamp
  lastUsed?: number; // Last request timestamp
  requestCount: number; // Total requests made
  tokensUsed: number; // Total tokens consumed
  rateLimit?: {
    requestsPerHour?: number;
    tokensPerDay?: number;
  };
}

export interface AppConfig {
  bridgeEdge?: BridgeEdge;
  edges: EdgeConfig[];
  activeLLM?: LLMProvider;
  customLLMs: LLMProvider[];
  autoLaunch: boolean;
  notifications: boolean;
  autoReconnect: boolean;
  // Bridge settings
  defaultModel?: string;
  systemPrompt?: string;
  availableModels?: string[];
  rateLimit?: {
    requestsPerHour?: number;
    tokensPerDay?: number;
  };
  accessControl?: 'public' | 'private' | 'hidden';
  // Streaming settings
  streamResponses?: boolean;  // Enable/disable streaming (default: false)
  chunkSize?: number;         // Tokens per chunk (default: 3)
  maxChunkDelayMs?: number;   // Max ms to wait before sending chunk (default: 100)
  apiKeys?: BridgeAPIKey[];
  // DEPRECATED: Legacy edge ID whitelist (kept for migration)
  authorizedUsers?: Array<{
    id: string;
    label: string;
    addedAt: number;
    lastSeen?: number;
    requestCount: number;
  }>;
}

export interface EdgeConfig {
  id: string;
  edgeId: string; // Alias for id
  authToken: string;
  token: string; // Alias for authToken
  x25519PrivateKey: string;
  privateKey: string; // Alias for x25519PrivateKey
  x25519PublicKey: string;
  label: string;
  systemPrompt: string;
  model?: string;
  modelName?: string; // Alias for model
  contextWindowSize: number;
  active: boolean;
  enabled: boolean; // Alias for active
  createdAt: string;
}

export interface LLMProvider {
  name: 'ollama' | 'lm-studio' | 'custom';
  baseUrl: string;
  available: boolean;
  models: string[];
  defaultModel?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ConversationContext {
  edgeId: string;
  senderHash: string;
  senderPublicKey?: string; // Sender's X25519 public key (base64)
  messages: ChatMessage[];
  systemPrompt: string;
  maxTokens: number;
  lastActivity: Date;
}

export type BridgeStatus = 
  | 'disconnected'  // Not connected, idle
  | 'connecting'    // Initial connection attempt
  | 'connected'     // Successfully connected and healthy
  | 'reconnecting'  // Connection lost, attempting to reconnect
  | 'failed';       // Max retries reached, giving up

export interface BridgeStats {
  uptime: number;
  messageCount: number;
  averageLatency: number;
  activeConversations: number;
}

export interface BridgeLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export interface RelayMessage {
  id: string;
  conversationId: string;
  edgeId: string;
  origin: string;
  securityLevel: 'e2ee' | 'gateway_secured';
  payload: {
    contentType: string;
    ciphertext: string;
    ephemeralPubkey: string;
    nonce: string;
  };
  senderHash: string;
  receivedAt: string;
}

export interface SSEEvent {
  type: 'connected' | 'conversation_update' | 'ping' | 'error';
  payload: any;
}

// Model Fit Analysis Types
export {
  FitLevel,
  RunMode,
  InferenceRuntime,
  type GpuVendor,
  type GpuBackend,
  type CpuArchitecture,
  type EnhancedGpuInfo,
  type EnhancedSystemSpecs,
  type ScoreComponents,
  type ModelMetadata,
  type ModelFitAnalysis,
  type RecommendationFilters
} from '../main/services/ModelFitTypes';

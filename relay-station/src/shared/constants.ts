/**
 * Shared Constants
 */

export const RELAY_API_BASE_URL = process.env.RELAY_API_URL || 'https://api.rlymsg.com';
export const RELAY_API_TIMEOUT = 30000; // 30 seconds

export const DEFAULT_CONTEXT_WINDOW_SIZE = 20;
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';

export const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
export const LM_STUDIO_DEFAULT_URL = 'http://127.0.0.1:1234';

export const SSE_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]; // Exponential backoff
export const SSE_MAX_RETRIES = 10;

export const LLM_DETECTION_INTERVAL = 30000; // 30 seconds

export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Relay LLM Bridge';

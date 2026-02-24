/**
 * LLM Provider Client
 * 
 * Detects and communicates with local LLM providers:
 * - Ollama (localhost:11434)
 * - LM Studio (localhost:1234)
 * - Custom OpenAI-compatible endpoints
 */

import * as http from 'http';
import type { LLMProvider, ChatMessage } from '../shared/types';
import { OLLAMA_DEFAULT_URL, LM_STUDIO_DEFAULT_URL } from '../shared/constants';

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Helper function to make HTTP GET requests
 */
function httpGet(url: string, timeoutMs: number = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Helper function to make HTTP POST requests
 */
function httpPost(url: string, body: any, timeoutMs: number = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(body);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(bodyStr);
    req.end();
  });
}

/**
 * LLM Client for managing local AI providers
 */
export class LLMClient {
  private activeLLM: LLMProvider | null = null;
  private detectedProviders: LLMProvider[] = [];
  private detectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[LLM] Client initialized');
  }

  /**
   * Start periodic detection of LLM providers
   */
  startDetection(intervalMs: number = 30000): void {
    console.log('[LLM] Starting periodic detection...');
    
    // Run immediately
    this.detectProviders();

    // Then run periodically
    this.detectionInterval = setInterval(() => {
      this.detectProviders();
    }, intervalMs);
  }

  /**
   * Stop periodic detection
   */
  stopDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  /**
   * Detect all available LLM providers
   */
  async detectProviders(): Promise<LLMProvider[]> {
    console.log('[LLM] Detecting providers...');

    const providers: LLMProvider[] = [];

    // Check Ollama
    const ollama = await this.detectOllama();
    if (ollama) {
      providers.push(ollama);
    }

    // Check LM Studio
    const lmStudio = await this.detectLMStudio();
    if (lmStudio) {
      providers.push(lmStudio);
    }

    this.detectedProviders = providers;

    // Auto-select first available provider if none selected
    if (providers.length > 0 && !this.activeLLM) {
      this.activeLLM = providers[0];
      console.log('[LLM] Auto-selected:', this.activeLLM.name);
    }

    console.log('[LLM] Detected providers:', providers.map(p => p.name).join(', ') || 'none');
    return providers;
  }

  /**
   * Detect Ollama
   */
  private async detectOllama(): Promise<LLMProvider | null> {
    try {
      const data = await httpGet(`${OLLAMA_DEFAULT_URL}/api/tags`, 3000) as { models: Array<{ name: string }> };
      const models = data.models?.map(m => m.name) || [];

      if (models.length === 0) {
        return null;
      }

      console.log('[LLM] Ollama detected with models:', models);
      
      return {
        name: 'ollama',
        baseUrl: OLLAMA_DEFAULT_URL,
        available: true,
        models,
        defaultModel: models[0],
      };
    } catch (error) {
      // Ollama not running or not accessible
      console.log('[LLM] Ollama not detected:', (error as Error).message);
      return null;
    }
  }

  /**
   * Detect LM Studio
   */
  private async detectLMStudio(): Promise<LLMProvider | null> {
    try {
      const data = await httpGet(`${LM_STUDIO_DEFAULT_URL}/v1/models`, 3000) as { data: Array<{ id: string }> };
      const models = data.data?.map(m => m.id) || [];

      if (models.length === 0) {
        return null;
      }

      console.log('[LLM] LM Studio detected with models:', models);

      return {
        name: 'lm-studio',
        baseUrl: LM_STUDIO_DEFAULT_URL,
        available: true,
        models,
        defaultModel: models[0],
      };
    } catch (error) {
      // LM Studio not running or not accessible
      console.log('[LLM] LM Studio not detected:', (error as Error).message);
      return null;
    }
  }

  /**
   * Get all detected providers
   */
  getDetectedProviders(): LLMProvider[] {
    return this.detectedProviders;
  }

  /**
   * Get currently active provider
   */
  getActiveProvider(): LLMProvider | null {
    return this.activeLLM;
  }

  /**
   * Set active provider
   */
  setActiveProvider(provider: LLMProvider): void {
    this.activeLLM = provider;
    console.log('[LLM] Active provider set to:', provider.name);
  }

  /**
   * Test connection to a provider
   */
  async testProvider(provider: LLMProvider): Promise<boolean> {
    try {
      if (provider.name === 'ollama') {
        await httpGet(`${provider.baseUrl}/api/tags`, 3000);
        return true;
      } else if (provider.name === 'lm-studio' || provider.name === 'custom') {
        await httpGet(`${provider.baseUrl}/v1/models`, 3000);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send a chat completion request
   */
  async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    if (!this.activeLLM) {
      throw new Error('No active LLM provider. Please start Ollama or LM Studio.');
    }

    const provider = this.activeLLM;
    const model = options.model || provider.defaultModel || provider.models[0];

    if (!model) {
      throw new Error(`No model available for ${provider.name}`);
    }

    console.log('[LLM] Sending chat request:', {
      provider: provider.name,
      model,
      messageCount: messages.length,
    });

    if (provider.name === 'ollama') {
      return this.chatOllama(messages, model, options);
    } else if (provider.name === 'lm-studio' || provider.name === 'custom') {
      return this.chatOpenAI(messages, model, options, provider.baseUrl);
    }

    throw new Error(`Unsupported provider: ${provider.name}`);
  }

  /**
   * Send a streaming chat completion request
   * Yields chunks of text as they arrive from LLM
   */
  async *chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.activeLLM) {
      throw new Error('No active LLM provider. Please start Ollama or LM Studio.');
    }

    const provider = this.activeLLM;
    const model = options.model || provider.defaultModel || provider.models[0];

    if (!model) {
      throw new Error(`No model available for ${provider.name}`);
    }

    console.log('[LLM] Sending streaming chat request:', {
      provider: provider.name,
      model,
      messageCount: messages.length,
    });

    if (provider.name === 'ollama') {
      yield* this.chatStreamOllama(messages, model, options);
    } else if (provider.name === 'lm-studio' || provider.name === 'custom') {
      yield* this.chatStreamOpenAI(messages, model, options, provider.baseUrl);
    } else {
      throw new Error(`Unsupported provider: ${provider.name}`);
    }
  }

  /**
   * Chat with Ollama
   */
  private async chatOllama(
    messages: ChatMessage[],
    model: string,
    options: ChatCompletionOptions
  ): Promise<string> {
    const response = await httpPost(
      `${OLLAMA_DEFAULT_URL}/api/chat`,
      {
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000,
        },
      },
      120000 // 2 min timeout for generation
    ) as { message: { content: string } };
    
    return response.message.content;
  }

  /**
   * Chat with OpenAI-compatible endpoint (LM Studio, custom)
   */
  private async chatOpenAI(
    messages: ChatMessage[],
    model: string,
    options: ChatCompletionOptions,
    baseUrl: string
  ): Promise<string> {
    const data = await httpPost(
      `${baseUrl}/v1/chat/completions`,
      {
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: false,
      },
      120000 // 2 min timeout
    ) as { choices: Array<{ message: { content: string } }> };

    return data.choices[0]?.message?.content || '';
  }

  /**
   * Chat with Ollama using streaming
   */
  private async *chatStreamOllama(
    messages: ChatMessage[],
    model: string,
    options: ChatCompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    const urlObj = new URL(`${OLLAMA_DEFAULT_URL}/api/chat`);
    const bodyStr = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 2000,
      },
    });

    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const generator = await new Promise<AsyncGenerator<string, void, unknown>>((resolve, reject) => {
      const req = http.request(opts, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const gen = async function* () {
          let buffer = '';
          
          for await (const chunk of res) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const json = JSON.parse(line);
                if (json.message?.content) {
                  yield json.message.content;
                }
                if (json.done) {
                  return;
                }
              } catch (error) {
                console.error('[LLM] Failed to parse Ollama stream line:', error);
              }
            }
          }
        };

        resolve(gen());
      });

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });

    yield* generator;
  }

  /**
   * Chat with OpenAI-compatible endpoint using streaming
   */
  private async *chatStreamOpenAI(
    messages: ChatMessage[],
    model: string,
    options: ChatCompletionOptions,
    baseUrl: string
  ): AsyncGenerator<string, void, unknown> {
    const urlObj = new URL(`${baseUrl}/v1/chat/completions`);
    const bodyStr = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000,
      stream: true,
    });

    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const generator = await new Promise<AsyncGenerator<string, void, unknown>>((resolve, reject) => {
      const req = http.request(opts, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const gen = async function* () {
          let buffer = '';
          
          for await (const chunk of res) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) continue;
              
              const data = line.slice(6); // Remove 'data: ' prefix
              if (data === '[DONE]') return;
              
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  yield content;
                }
              } catch (error) {
                console.error('[LLM] Failed to parse OpenAI stream line:', error);
              }
            }
          }
        };

        resolve(gen());
      });

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });

    yield* generator;
  }

  /**
   * Add a custom provider
   */
  async addCustomProvider(baseUrl: string): Promise<LLMProvider> {
    // Try to detect if it's OpenAI-compatible
    try {
      const data = await httpGet(`${baseUrl}/v1/models`, 3000) as { data: Array<{ id: string }> };
      const models = data.data?.map(m => m.id) || [];

      const provider: LLMProvider = {
        name: 'custom',
        baseUrl,
        available: true,
        models,
        defaultModel: models[0],
      };

      // Add to detected providers if not already there
      const exists = this.detectedProviders.find(p => p.baseUrl === baseUrl);
      if (!exists) {
        this.detectedProviders.push(provider);
      }

      return provider;
    } catch (error) {
      throw new Error(`Failed to add custom provider: ${error}`);
    }
  }

  /**
   * Cleanup on shutdown
   */
  dispose(): void {
    this.stopDetection();
  }
}

// Export singleton instance
export const llmClient = new LLMClient();

/**
 * Background Operator Service
 * 
 * Runs in Electron main process, independent of UI.
 * Maintains persistent SSE connection to relay-ai router and handles AI requests in the background.
 */

import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import * as crypto from '../crypto';

const RELAY_AI_ROUTER_URL = 'https://ai.rlymsg.com';

interface OperatorConfig {
  edge_id: string;
  name: string;
  region: string;
  models: Array<{
    model_id: string;
    provider: string;
    payout_rate_per_token: string;
  }>;
  x25519_public_key: string;
  x25519_private_key: string;
}

interface OperatorStats {
  isRunning: boolean;
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  averageLatency: number;
  uptime: number;
  lastActivity: number | null;
  errorMessage?: string;
  gpuStatus?: {
    modelLoaded: string | null;
    gpuLayers: number;
    totalLayers: number;
    vramUsed: string;
    loadedAt: number | null;
  };
}

interface RequestMetrics {
  startTime: number;
  endTime?: number;
  firstTokenTime?: number;
  totalTokens: number;
  success: boolean;
}

/**
 * Background operator service - runs in main process
 */
class OperatorService extends EventEmitter {
  private config: OperatorConfig | null = null;
  private isRunning: boolean = false;
  private isConnected: boolean = false;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private sseController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private activeModel: string | null = null; // Tracks the last model loaded into VRAM
  private reconnectDelay: number = 5000; // 5 seconds
  
  // Stats tracking
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private totalTokens: number = 0;
  private latencySum: number = 0;
  private startTime: number | null = null;
  private lastActivity: number | null = null;
  private activeRequests: Map<string, RequestMetrics> = new Map();
  private errorMessage?: string;

  constructor() {
    super();
  }

  /**
   * Start the operator with given configuration
   */
  async start(config: OperatorConfig): Promise<void> {
    if (this.isRunning) {
      console.log('[Operator] Already running, stopping first...');
      await this.stop();
    }

    console.log('[Operator] Starting with config:', {
      edge_id: config.edge_id,
      name: config.name,
      region: config.region,
      models: config.models.length,
    });

    this.config = config;
    this.isRunning = true;
    this.startTime = Date.now();
    this.reconnectAttempts = 0;
    this.errorMessage = undefined;

    // CRITICAL: Kill orphaned Ollama runner processes BEFORE starting
    // These hog VRAM and prevent models from loading on GPU
    await this.killOrphanedOllamaRunners();

    // Start connection in background (don't await - it's a long-running SSE stream)
    this.connect();
  }

  /**
   * Stop the operator and cleanup
   */
  /**
   * Kill orphaned Ollama runner processes (Windows only)
   * These are child processes that didn't exit cleanly and are hogging VRAM
   */
  async killOrphanedOllamaRunners(): Promise<void> {
    if (process.platform !== 'win32') return; // Windows only
    
    try {
      console.log('[Operator] Checking for orphaned Ollama runner processes...');
      
      // Use PowerShell to find and kill ollama.exe processes with "runner" in command line
      const { execSync } = require('child_process');
      
      // Step 1: Get all ollama.exe runner processes (exclude the main service)
      // We look for processes with "runner" or "--model" in the command line
      // Fixed syntax: Get-CimInstance without spaces in filter
      const psCommand = 'Get-Process -Name ollama -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*ollama.exe*\' } | ForEach-Object { $id = $_.Id; $cmdline = (Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $id }).CommandLine; if ($cmdline -match \'runner|--model|--ollama-engine\') { Write-Output "$id" } }';
      
      const result = execSync(`powershell -Command "${psCommand}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      
      if (!result) {
        console.log('[Operator] No orphaned Ollama runners found');
        return;
      }
      
      const pids = result.split('\n').map((pid: string) => pid.trim()).filter(Boolean);
      
      if (pids.length === 0) {
        console.log('[Operator] No orphaned Ollama runners found');
        return;
      }
      
      console.log(`[Operator] Found ${pids.length} orphaned Ollama runner(s), killing: ${pids.join(', ')}`);
      
      // Step 2: Kill each runner process
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 });
          console.log(`[Operator] ✓ Killed runner process ${pid}`);
        } catch (err) {
          console.warn(`[Operator] Could not kill runner ${pid}:`, err);
        }
      }
      
      // Wait for processes to fully terminate
      await new Promise(r => setTimeout(r, 1000));
      
      console.log('[Operator] ✓ Orphaned runner cleanup complete');
    } catch (err) {
      console.warn('[Operator] Failed to kill orphaned runners:', err);
    }
  }
  
  /**
   * On boot: query Ollama /api/ps and evict any models left loaded from a prior
   * crash or unclean shutdown. Prevents VRAM exhaustion across restarts.
   */
  async evictAllLoadedModels(): Promise<void> {
    try {
      const res = await fetch('http://localhost:11434/api/ps', {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const data = await res.json() as { models?: Array<{ name: string; size_vram?: number }> };
      const loaded = data.models ?? [];

      if (loaded.length === 0) {
        console.log('[Operator] Boot cleanup: no stale models in VRAM');
        return;
      }

      console.log(`[Operator] Boot cleanup: evicting ${loaded.length} stale model(s) from VRAM...`);
      await Promise.all(loaded.map(async ({ name }) => {
        try {
          await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: name, keep_alive: 0 }),
            signal: AbortSignal.timeout(5000),
          });
          console.log(`[Operator] Boot cleanup: evicted ${name}`);
        } catch {
          console.warn(`[Operator] Boot cleanup: could not evict ${name}`);
        }
      }));

      // Poll /api/ps until all runners are gone (VRAM is actually freed, not just scheduled)
      // The keep_alive:0 response comes back before the runner process exits
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const check = await fetch('http://localhost:11434/api/ps', {
            signal: AbortSignal.timeout(3000),
          });
          if (check.ok) {
            const checkData = await check.json() as { models?: Array<{ name: string }> };
            const remaining = checkData.models ?? [];
            if (remaining.length === 0) {
              console.log('[Operator] Boot cleanup: VRAM confirmed clear');
              return;
            }
            console.log(`[Operator] Boot cleanup: waiting for ${remaining.length} runner(s) to exit...`);
          }
        } catch {
          // ignore — keep polling
        }
      }
      console.warn('[Operator] Boot cleanup: timed out waiting for VRAM to clear — proceeding anyway');
    } catch {
      // Ollama may not be up yet — non-fatal
      console.log('[Operator] Boot cleanup: Ollama not ready yet, skipping');
    }
  }

  async stop(): Promise<void> {
    console.log('[Operator] Stopping...');
    
    this.isRunning = false;
    this.isConnected = false;
    this.connectionStatus = 'disconnected';
    
    // Abort SSE connection
    if (this.sseController) {
      this.sseController.abort();
      this.sseController = null;
    }

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Evict the active model from VRAM so runners don't persist across restarts
    if (this.activeModel) {
      const modelToUnload = this.activeModel;
      this.activeModel = null;
      try {
        await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelToUnload, keep_alive: 0 }),
          signal: AbortSignal.timeout(3000),
        });
        console.log(`[Operator] Unloaded model ${modelToUnload} from VRAM`);
      } catch {
        // Non-fatal — Ollama may already be shutting down
        console.log(`[Operator] Could not unload model ${modelToUnload} (Ollama may be stopping)`);
      }
    }
    
    // Kill any orphaned runner processes to free VRAM
    await this.killOrphanedOllamaRunners();

    this.emit('status-change', this.getStats());
  }

  /**
   * Connect to relay-ai router via SSE
   */
  private async connect(): Promise<void> {
    if (!this.config || !this.isRunning) return;

    try {
      console.log('[Operator] Connecting to relay-ai router...');
      this.connectionStatus = 'connecting';
      this.emit('status-change', this.getStats());

      this.sseController = new AbortController();

      // Build URL with query parameters (edge_id and edge_secret required by server)
      const url = `${RELAY_AI_ROUTER_URL}/v1/operators/subscribe?edge_id=${encodeURIComponent(this.config.edge_id)}&edge_secret=${encodeURIComponent(this.config.x25519_private_key)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'text/event-stream',
        },
        signal: this.sseController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      console.log('[Operator] SSE connection established');
      this.isConnected = true;
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.errorMessage = undefined;
      this.emit('status-change', this.getStats());

      // Process SSE stream
      await this.processSSEStream(response);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[Operator] Connection aborted (intentional stop)');
        return;
      }

      console.error('[Operator] Connection error:', error.message);
      this.isConnected = false;
      this.connectionStatus = 'error';
      this.errorMessage = error.message;
      this.emit('status-change', this.getStats());

      // Attempt reconnection
      if (this.isRunning && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
        console.log(`[Operator] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        console.error('[Operator] Max reconnection attempts reached, stopping');
        await this.stop();
      }
    }
  }

  /**
   * Send heartbeat pong to server
   * Responds to ping events to keep connection alive bidirectionally
   */
  private async sendHeartbeatPong(): Promise<void> {
    if (!this.config) return;

    try {
      await fetch(`${RELAY_AI_ROUTER_URL}/v1/operators/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edge_id: this.config.edge_id,
        }),
      });
    } catch (error: any) {
      // Don't log every failure - pong is best-effort
      // Only throw so caller can log if needed
      throw new Error(`Heartbeat pong failed: ${error.message}`);
    }
  }

  /**
   * Process SSE event stream
   */
  private async processSSEStream(response: any): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent: { event?: string; data?: string } = {};

    for await (const chunk of response.body) {
      if (!this.isRunning) break;

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Empty line = end of event
        if (!trimmedLine) {
          if (currentEvent.data) {
            try {
              const eventData = JSON.parse(currentEvent.data);
              
              // Handle different event types
              if (currentEvent.event === 'ping') {
                // Heartbeat from server — respond with pong
                this.lastActivity = Date.now();
                this.sendHeartbeatPong().catch(err => {
                  console.warn('[Operator] Failed to send heartbeat pong:', err.message);
                });
              } else if (eventData.type === 'connected') {
                // Connection confirmation
                console.log('[Operator] Received connection confirmation');
              } else if (eventData.type === 'ai_request') {
                // AI request
                await this.handleSSEEvent(eventData);
              }
            } catch (error) {
              console.error('[Operator] Failed to parse SSE event:', error);
            }
          }
          currentEvent = {};
          continue;
        }
        
        // Parse SSE fields
        if (trimmedLine.startsWith('event: ')) {
          currentEvent.event = trimmedLine.replace('event: ', '');
        } else if (trimmedLine.startsWith('data: ')) {
          currentEvent.data = trimmedLine.replace('data: ', '');
        }
      }
    }

    // Stream ended
    console.log('[Operator] SSE stream ended');
    this.isConnected = false;
    this.connectionStatus = 'disconnected';
    this.emit('status-change', this.getStats());

    // Reconnect if still running
    if (this.isRunning) {
      console.log('[Operator] Stream ended unexpectedly, reconnecting...');
      setTimeout(() => this.connect(), 2000);
    }
  }

  /**
   * Handle incoming SSE event
   */
  private async handleSSEEvent(event: any): Promise<void> {
    this.lastActivity = Date.now();

    if (event.type === 'heartbeat') {
      // Just a keep-alive, no action needed
      return;
    }

    if (event.type === 'ai_request') {
      // Extract the actual request from the payload wrapper
      await this.handleAIRequest(event.payload || event);
    } else {
      console.log('[Operator] Unknown event type:', event.type);
    }
  }

  /**
   * Handle AI request from router
   */
  private async handleAIRequest(event: any): Promise<void> {
    const { request_id, encrypted_payload, stream, client_x25519_public_key } = event;
    const is_streaming = stream || false;

    console.log(`[Operator] Received AI request ${request_id} (streaming: ${is_streaming})`);
    this.totalRequests++;
    
    const metrics: RequestMetrics = {
      startTime: Date.now(),
      totalTokens: 0,
      success: false,
    };
    this.activeRequests.set(request_id, metrics);
    this.emit('status-change', this.getStats());

    try {
      // Decrypt request payload
      const decryptedPayload = JSON.parse(
        crypto.decrypt(
          encrypted_payload.ciphertext,
          encrypted_payload.ephemeral_pubkey,
          encrypted_payload.nonce,
          this.config!.x25519_private_key
        )
      );

      // Use client's public key for response encryption
      const clientPublicKey = client_x25519_public_key || encrypted_payload.ephemeral_pubkey;

      if (is_streaming) {
        await this.handleStreamingRequest(
          request_id,
          decryptedPayload,
          clientPublicKey,
          this.config!.edge_id,
          metrics
        );
      } else {
        await this.handleNonStreamingRequest(
          request_id,
          decryptedPayload,
          clientPublicKey,
          this.config!.edge_id,
          metrics
        );
      }

      this.successfulRequests++;
      metrics.success = true;

    } catch (error) {
      console.error(`[Operator] Failed to process request ${request_id}:`, error);
      this.failedRequests++;
      metrics.success = false;
    } finally {
      metrics.endTime = Date.now();
      const latency = metrics.firstTokenTime || (metrics.endTime - metrics.startTime);
      this.latencySum += latency;
      this.totalTokens += metrics.totalTokens;
      this.activeRequests.delete(request_id);
      this.emit('status-change', this.getStats());
    }
  }

  /**
   * Truncate a string to a max character length, appending a notice if cut.
   */
  private truncate(text: string, maxChars: number): string {
    if (!text || text.length <= maxChars) return text;
    return text.slice(0, maxChars) + `\n\n[Content truncated — ${Math.round((text.length - maxChars) / 4)} tokens omitted for context efficiency]`;
  }

  /**
   * Prune message history to prevent context window explosion.
   * Keeps: system messages, last MAX_HISTORY_TURNS user+assistant pairs.
   * Strips: all tool messages and assistant tool_call messages from older turns.
   * Tool results from the MOST RECENT tool call round-trip are preserved.
   */
  private pruneMessageHistory(messages: any[]): any[] {
    const MAX_HISTORY_TURNS = 6; // last 6 user+assistant pairs = 12 messages

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    // Find indices of user messages (each marks a new turn)
    const userIndices = nonSystem.reduce((acc: number[], m, i) => {
      if (m.role === 'user') acc.push(i);
      return acc;
    }, []);

    if (userIndices.length <= MAX_HISTORY_TURNS) {
      return messages; // Nothing to prune yet
    }

    // Keep only the last MAX_HISTORY_TURNS turns
    const cutIndex = userIndices[userIndices.length - MAX_HISTORY_TURNS];
    const recentMessages = nonSystem.slice(cutIndex);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * Prepend a system prompt that guides the model to use the right tool.
   * Only applied on the first inference call (not tool-result continuations).
   */
  private buildMessagesWithSystemPrompt(baseMessages: any[]): any[] {
    const TOOL_SYSTEM_PROMPT =
      'You have access to three web tools:\n' +
      '- web_search: fast lookups — current prices, scores, headlines, simple facts.\n' +
      '- fetch_content: read the full text of a URL the user provides or that appeared in a prior search result.\n' +
      '- deep_search: thorough research — use this whenever the user asks to "research", "explain in detail", ' +
      '"summarize multiple sources", "find everything about", or needs comprehensive multi-source information. ' +
      'Prefer deep_search over web_search whenever depth matters more than speed.\n\n' +
      'IMPORTANT: Use the structured function calling format provided by the tools parameter. ' +
      'Do NOT output XML tags like <tool_call> or <function_calls> in your response text. ' +
      'When you need to call a tool, use the native JSON function calling mechanism.';

    if (baseMessages.length > 0 && baseMessages[0].role === 'system') {
      // Augment existing system message
      return [
        { role: 'system', content: baseMessages[0].content + '\n\n' + TOOL_SYSTEM_PROMPT },
        ...baseMessages.slice(1),
      ];
    }
    return [{ role: 'system', content: TOOL_SYSTEM_PROMPT }, ...baseMessages];
  }

  /**
   * Get tools definition for Ollama function calling
   */
  private getToolsDefinition(): any[] {
    return [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for real-time or time-sensitive information that CANNOT be answered from your training data — for example: today's stock prices, live sports scores, breaking news, current weather, cryptocurrency prices, or events that occurred after your knowledge cutoff. ONLY call this tool when the answer genuinely requires up-to-date external data that changes frequently. Do NOT use this tool for: math or arithmetic, counting letters or characters in words, logic puzzles, word games, grammar questions, spelling, definitions, historical facts, scientific concepts, programming questions, creative writing, or any question you can confidently answer from training knowledge.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query. Be specific and use keywords that would return relevant results. For example: 'Apple stock price today' or 'latest SpaceX launch news'",
              },
              count: {
                type: "number",
                description: "Number of results to return (1-20). Use fewer for specific queries, more for broad topics.",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "fetch_content",
          description: "Fetch and read the full text of a specific web page. Use this when: (1) the user provides a URL and asks you to read, summarize, or analyze it; (2) web_search returned a relevant URL and you need the full article instead of a short snippet. Do NOT use for general queries where you don't already have a URL — use web_search first to find URLs, then fetch_content to read them.",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The full URL of the page to read (must start with http:// or https://)",
              },
              selector: {
                type: "string",
                description: "Optional CSS selector to extract a specific part of the page (e.g. 'article', '.content'). Omit to let the tool auto-detect the main content.",
              },
            },
            required: ["url"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "deep_search",
          description: "Search the web AND read the full article text of the top results — not just titles and snippets. Use this when the user needs thorough research: 'explain in detail', 'research this topic', 'summarize multiple sources', 'find everything about X'. Slower than web_search but produces dramatically richer answers because you get full article content. For quick lookups (current price, today's score, etc.) use web_search instead.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The research query",
              },
              count: {
                type: "number",
                description: "Number of pages to fully read and synthesize (1-5). Default 3. Use 5 only when the user explicitly asks for comprehensive research.",
                default: 3,
              },
            },
            required: ["query"],
          },
        },
      },
    ];
  }

  /**
   * Shared header builder for relay-ai tool calls
   */
  private toolHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Edge ${this.config!.edge_id}:${this.config!.x25519_private_key}`,
    };
  }

  /**
   * Call web search tool via relay-ai
   */
  private async callWebSearchTool(query: string, count: number = 10): Promise<any> {
    console.log(`[Operator] Calling web search tool: "${query}"`);
    
    const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/tools/web-search`, {
      method: 'POST',
      headers: this.toolHeaders(),
      body: JSON.stringify({ query, count }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Web search failed: ${response.status} ${errorText}`);
    }

    const result: any = await response.json();
    console.log(`[Operator] Web search returned ${result.results?.length || 0} results`);
    return result;
  }

  /**
   * Fetch full content of a URL via relay-ai → scrapling-worker
   */
  private async callFetchContentTool(url: string, selector?: string): Promise<any> {
    console.log(`[Operator] Fetching content: ${url}`);

    const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/tools/fetch-content`, {
      method: 'POST',
      headers: this.toolHeaders(),
      body: JSON.stringify({ url, ...(selector ? { selector } : {}) }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`fetch-content failed: ${response.status} ${errorText}`);
    }

    const result: any = await response.json();
    console.log(`[Operator] Fetched ${result.word_count || 0} words from ${url}`);
    return result;
  }

  /**
   * Deep search: Brave URL discovery + scrapling full-content extraction
   */
  private async callDeepSearchTool(query: string, count: number = 3): Promise<any> {
    console.log(`[Operator] Deep search: "${query}" (depth=${count})`);

    const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/tools/deep-search`, {
      method: 'POST',
      headers: this.toolHeaders(),
      body: JSON.stringify({ query, count }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`deep-search failed: ${response.status} ${errorText}`);
    }

    const result: any = await response.json();
    const fetched = result.results?.filter((r: any) => r.fetch_success).length || 0;
    console.log(`[Operator] Deep search: ${result.results?.length || 0} results, ${fetched} fully fetched`);
    return result;
  }

  /**
   * Handle tool calls from model
   */
  private async handleToolCalls(toolCalls: any[]): Promise<any[]> {
    const toolResults: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        // Safely parse arguments — they may be a JSON string (assembled from stream
        // fragments), a pre-parsed object, or malformed/empty if the model misfired.
        let args: any = {};
        try {
          const rawArgs = toolCall.function.arguments;
          if (typeof rawArgs === 'string' && rawArgs.trim()) {
            args = JSON.parse(rawArgs);
          } else if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs;
          }
        } catch {
          console.warn(`[Operator] Failed to parse tool arguments for ${toolCall.function.name}:`, toolCall.function.arguments);
          // args stays {} — required-arg validation below will return an error to the model
        }

        if (toolCall.function.name === 'web_search') {
          if (!args.query || typeof args.query !== 'string') {
            console.warn(`[Operator] web_search called without a valid query — returning error to model`);
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: 'web_search',
              content: 'Error: Required parameter "query" was missing or empty. You must provide a non-empty search query string.',
            });
            continue;
          }
          // Models often return count as a string — coerce before sending
          const count = args.count ? Number(args.count) || 10 : 10;
          const searchResult = await this.callWebSearchTool(args.query, count);
          
          // Format results for model consumption
          const formattedResults = searchResult.results.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
            date: r.published_date,
          }));

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'web_search',
            content: JSON.stringify({
              query: searchResult.query,
              results: formattedResults,
              count: formattedResults.length,
            }),
          });

        } else if (toolCall.function.name === 'fetch_content') {
          if (!args.url || typeof args.url !== 'string') {
            console.warn(`[Operator] fetch_content called without a valid url — returning error to model`);
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: 'fetch_content',
              content: 'Error: Required parameter "url" was missing or empty. You must provide a valid URL string.',
            });
            continue;
          }
          const fetchResult = await this.callFetchContentTool(args.url, args.selector);

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'fetch_content',
            content: JSON.stringify({
              url: fetchResult.url,
              title: fetchResult.title,
              content: this.truncate(fetchResult.markdown, 8000), // ~2000 words max
              word_count: fetchResult.word_count,
              links: (fetchResult.links || []).slice(0, 5),
            }),
          });

        } else if (toolCall.function.name === 'deep_search') {
          if (!args.query || typeof args.query !== 'string') {
            console.warn(`[Operator] deep_search called without a valid query — returning error to model`);
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: 'deep_search',
              content: 'Error: Required parameter "query" was missing or empty. You must provide a non-empty search query string.',
            });
            continue;
          }
          const count = args.count ? Number(args.count) || 3 : 3;
          const deepResult = await this.callDeepSearchTool(args.query, count);

          // Format each result: snippet always present, full markdown when available
          const formattedResults = deepResult.results.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            // Truncate full content per source: 3 sources × ~1000 words = manageable context
            content: r.fetch_success ? this.truncate(r.markdown, 4000) : null,
            word_count: r.word_count,
            published_date: r.published_date,
          }));

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'deep_search',
            content: JSON.stringify({
              query: deepResult.query,
              results: formattedResults,
              count: formattedResults.length,
            }),
          });

        } else {
          console.warn(`[Operator] Unknown tool: ${toolCall.function.name}`);
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: 'Tool not supported' }),
          });
        }
      } catch (error: any) {
        console.error(`[Operator] Tool call failed:`, error);
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function?.name || 'unknown',
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    return toolResults;
  }

  /**
   * Send a tool status event through the SSE stream so the client UI can show
   * a live indicator ("Searching...", "Reading 3 sources...", etc.).
   * Failures are swallowed — status is cosmetic and must never break inference.
   */
  private async sendToolStatusChunk(
    requestId: string,
    tool: string,
    detail: string,
    phase: 'running' | 'complete'
  ): Promise<void> {
    try {
      await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/stream-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          tool_status: { tool, detail, phase },
        }),
      });
    } catch (err) {
      console.warn('[Operator] Failed to send tool status chunk:', err);
    }
  }
  private async handleStreamingRequest(
    requestId: string,
    decryptedPayload: any,
    clientPublicKey: string,
    operatorEdgeId: string,
    metrics: RequestMetrics,
    messages?: any[] // For tool call continuation
  ): Promise<void> {
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let chunkSequence = 0;
    let firstTokenTime: number | null = null;
    let toolCallsAccumulator: any[] = [];
    let finishReason: string | null = null;

    // Use provided messages or original payload messages
    // CRITICAL: Always include tools, even on continuation calls, so model knows it can call more tools
    const includeSystemPrompt = !messages; // Only add system prompt on first call
    const rawMessages = messages || decryptedPayload.messages;
    const prunedMessages = this.pruneMessageHistory(rawMessages);
    const messagesToSend = includeSystemPrompt ? this.buildMessagesWithSystemPrompt(prunedMessages) : prunedMessages;

    // Track the active model for VRAM cleanup on shutdown
    this.activeModel = decryptedPayload.model;
    
    console.log(`[Operator] Calling Ollama with model: ${decryptedPayload.model}`);

    // Call local Ollama with streaming via OpenAI-compatible endpoint.
    // keep_alive is an Ollama extension supported on this endpoint.
    // With VRAM clean on boot (evictAllLoadedModels), Ollama's scheduler
    // naturally maximises GPU placement — no need to force num_gpu.
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: decryptedPayload.model,
        messages: messagesToSend,
        stream: true,
        keep_alive: -1, // Ollama extension — keep model loaded between requests
        tools: this.getToolsDefinition(), // Always include tools for multi-turn tool calling
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Parse SSE stream (OpenAI format): 'data: {...}' lines, terminated by 'data: [DONE]'.
    // Tool call arguments arrive as streamed fragments — assemble by index.
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk as any, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          const choice = parsed.choices?.[0];

          // Assemble tool call fragments by index
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsAccumulator[idx]) {
                toolCallsAccumulator[idx] = { id: tc.id || '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCallsAccumulator[idx].id = tc.id;
              if (tc.function?.name) toolCallsAccumulator[idx].function.name += tc.function.name;
              // arguments can arrive as string fragments (OpenAI spec) OR as a pre-parsed
              // object (Ollama non-standard). Handle both so we always store a JSON string.
              const argChunk = tc.function?.arguments;
              if (argChunk !== undefined && argChunk !== null && argChunk !== '') {
                if (typeof argChunk === 'string') {
                  toolCallsAccumulator[idx].function.arguments += argChunk;
                } else if (typeof argChunk === 'object') {
                  // Ollama sometimes delivers the whole parsed object in one shot
                  toolCallsAccumulator[idx].function.arguments = JSON.stringify(argChunk);
                }
              }
            }
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (delta?.content) {
            const token = delta.content;
            fullContent += token;

            if (!firstTokenTime) {
              firstTokenTime = Date.now() - metrics.startTime;
              metrics.firstTokenTime = firstTokenTime;
            }

            const encryptedChunk = crypto.encrypt(
              JSON.stringify({ content: token }),
              clientPublicKey
            );

            await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/stream-chunk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                request_id: requestId,
                encrypted_chunk: {
                  ciphertext: encryptedChunk.ciphertext,
                  ephemeral_pubkey: encryptedChunk.ephemeralPublicKey,
                  nonce: encryptedChunk.nonce,
                },
                sequence: chunkSequence++,
                done: false,
              }),
            });
          }

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || promptTokens;
            completionTokens = parsed.usage.completion_tokens || completionTokens;
          }
        } catch (parseErr) {
          console.warn('[Operator] Failed to parse chunk:', parseErr);
        }
      }
    }

    console.log(`[Operator] Stream complete: ${fullContent.length} chars, finish=${finishReason}`);

    // Check if model requested tool calls
    if (finishReason === 'tool_calls' && toolCallsAccumulator.length > 0) {
      console.log(`[Operator] Model requested ${toolCallsAccumulator.length} tool calls`);

      // Notify client about each pending tool call so the UI can show a live status
      for (const toolCall of toolCallsAccumulator) {
        const name: string = toolCall.function?.name || 'unknown';
        let detail = '';
        try {
          const rawArgs = toolCall.function?.arguments;
          const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : (rawArgs || {});
          if (name === 'web_search')    detail = args.query || '';
          else if (name === 'fetch_content') detail = args.url || '';
          else if (name === 'deep_search')   detail = `${args.query || ''}${args.count ? ` (${args.count} sources)` : ''}`;
        } catch { /* ignore parse errors in status path */ }
        await this.sendToolStatusChunk(requestId, name, detail, 'running');
      }

      // Execute tool calls
      const toolResults = await this.handleToolCalls(toolCallsAccumulator);

      // Signal completion so the client can show "Got results, generating..."
      for (const toolCall of toolCallsAccumulator) {
        await this.sendToolStatusChunk(requestId, toolCall.function?.name || 'unknown', '', 'complete');
      }
      // Build updated messages with tool calls and results
      const updatedMessages = [
        ...messagesToSend,
        {
          role: 'assistant',
          content: null,
          tool_calls: toolCallsAccumulator,
        },
        ...toolResults,
      ];
      
      // Continue inference with tool results (recursive call)
      console.log('[Operator] Continuing inference with tool results');
      await this.handleStreamingRequest(
        requestId,
        decryptedPayload,
        clientPublicKey,
        operatorEdgeId,
        metrics,
        updatedMessages // Pass enriched messages
      );
      
      return; // Exit - the recursive call will handle final response
    }

    // Send final metadata (only if not tool calls - recursive call handles that)
    const totalTokens = promptTokens + completionTokens || Math.ceil((JSON.stringify(decryptedPayload.messages).length + fullContent.length) / 4);
    metrics.totalTokens = totalTokens;
    
    const metadata = {
      tokens_used: totalTokens,
      prompt_tokens: promptTokens || Math.ceil(JSON.stringify(decryptedPayload.messages).length / 4),
      completion_tokens: completionTokens || Math.ceil(fullContent.length / 4),
      model: decryptedPayload.model,
      finish_reason: 'stop',
      operator_edge_id: operatorEdgeId,
      processing_time_ms: firstTokenTime || (Date.now() - metrics.startTime),
    };
    
    const encryptedMetadata = crypto.encrypt(
      JSON.stringify(metadata),
      clientPublicKey
    );
    
    await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/stream-chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: requestId,
        encrypted_chunk: {
          ciphertext: encryptedMetadata.ciphertext,
          ephemeral_pubkey: encryptedMetadata.ephemeralPublicKey,
          nonce: encryptedMetadata.nonce,
        },
        sequence: chunkSequence++,
        done: true,
      }),
    });
  }

  /**
   * Handle non-streaming AI request
   */
  private async handleNonStreamingRequest(
    requestId: string,
    decryptedPayload: any,
    clientPublicKey: string,
    operatorEdgeId: string,
    metrics: RequestMetrics,
    messages?: any[] // For tool call continuation
  ): Promise<void> {
    // Use provided messages or original payload messages
    // CRITICAL: Always include tools, even on continuation calls, so model knows it can call more tools
    const includeSystemPrompt = !messages; // Only add system prompt on first call
    const rawMessages = messages || decryptedPayload.messages;
    const prunedMessages = this.pruneMessageHistory(rawMessages);
    const messagesToSend = includeSystemPrompt ? this.buildMessagesWithSystemPrompt(prunedMessages) : prunedMessages;

    // Use OpenAI-compatible endpoint — keep_alive is supported as an Ollama extension
    this.activeModel = decryptedPayload.model;
    
    console.log(`[Operator] Calling Ollama (non-streaming) with model: ${decryptedPayload.model}`);
    
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: decryptedPayload.model,
        messages: messagesToSend,
        temperature: decryptedPayload.temperature ?? 0.7,
        max_tokens: decryptedPayload.max_tokens ?? 2048,
        stream: false,
        keep_alive: -1,
        tools: this.getToolsDefinition(), // Always include tools for multi-turn tool calling
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data: any = await response.json();
    const message = data.choices[0].message;
    
    // Check if model requested tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(`[Operator] Model requested ${message.tool_calls.length} tool calls`);
      
      // Execute tool calls
      const toolResults = await this.handleToolCalls(message.tool_calls);
      
      // Build updated messages with tool calls and results
      const updatedMessages = [
        ...messagesToSend,
        {
          role: 'assistant',
          content: null,
          tool_calls: message.tool_calls,
        },
        ...toolResults,
      ];
      
      // Continue inference with tool results (recursive call)
      console.log('[Operator] Continuing inference with tool results');
      await this.handleNonStreamingRequest(
        requestId,
        decryptedPayload,
        clientPublicKey,
        operatorEdgeId,
        metrics,
        updatedMessages // Pass enriched messages
      );
      
      return; // Exit - the recursive call will handle final response
    }
    
    const latency = Date.now() - metrics.startTime;
    
    const content = message.content;
    const promptTokens = data.usage?.prompt_tokens || Math.ceil(JSON.stringify(messagesToSend).length / 4);
    const completionTokens = data.usage?.completion_tokens || Math.ceil(content.length / 4);
    const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);
    metrics.totalTokens = totalTokens;

    const responsePayload = {
      content: content,
      tokens_used: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      model: data.model,
      finish_reason: data.choices[0].finish_reason || 'stop',
      operator_edge_id: operatorEdgeId,
      processing_time_ms: latency,
    };

    const encryptedResponse = crypto.encrypt(
      JSON.stringify(responsePayload),
      clientPublicKey
    );

    await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ai_response',
        request_id: requestId,
        encrypted_payload: {
          ciphertext: encryptedResponse.ciphertext,
          ephemeral_pubkey: encryptedResponse.ephemeralPublicKey,
          nonce: encryptedResponse.nonce,
        },
      }),
    });
  }

  /**
   * Get GPU status from Ollama (running models)
   */
  async getGPUStatus(): Promise<OperatorStats['gpuStatus']> {
    try {
      const response = await fetch('http://localhost:11434/api/ps', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      
      if (!response.ok) return undefined;
      
      const data = await response.json() as { models?: any[] };
      const models = data.models || [];
      
      if (models.length === 0) {
        return {
          modelLoaded: null,
          gpuLayers: 0,
          totalLayers: 0,
          vramUsed: '0 MB',
          loadedAt: null,
        };
      }
      
      // Get the most recently loaded model
      const latestModel = models.sort((a: any, b: any) => 
        new Date(b.expires_at || 0).getTime() - new Date(a.expires_at || 0).getTime()
      )[0];
      
      // Parse layer info (e.g., "28/28 layers on GPU")
      const gpuLayers = latestModel.details?.gpu_layers || 0;
      const totalLayers = latestModel.details?.num_layers || 0;
      
      // Format VRAM usage
      const sizeBytes = latestModel.size || 0;
      const sizeMB = Math.round(sizeBytes / (1024 * 1024));
      const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(1);
      const vramUsed = sizeMB > 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;
      
      return {
        modelLoaded: latestModel.name || null,
        gpuLayers,
        totalLayers,
        vramUsed,
        loadedAt: latestModel.expires_at ? new Date(latestModel.expires_at).getTime() : Date.now(),
      };
    } catch (error) {
      // Non-fatal - GPU status is optional
      return undefined;
    }
  }

  /**
   * Get current operator stats
   */
  async getStats(): Promise<OperatorStats> {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const averageLatency = this.successfulRequests > 0 ? this.latencySum / this.successfulRequests : 0;
    const gpuStatus = await this.getGPUStatus();

    return {
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      connectionStatus: this.connectionStatus,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      totalTokens: this.totalTokens,
      averageLatency: Math.round(averageLatency),
      uptime: Math.round(uptime / 1000), // seconds
      lastActivity: this.lastActivity,
      errorMessage: this.errorMessage,
      gpuStatus,
    };
  }

  /**
   * Check if operator is running
   */
  isOperatorRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Check if operator is connected
   */
  isOperatorConnected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const operatorService = new OperatorService();

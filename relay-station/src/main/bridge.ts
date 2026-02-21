/**
 * Relay Bridge Connection
 * 
 * Manages SSE connection to Relay server and handles message encryption/decryption
 */

import EventSource from 'eventsource';
import * as crypto from './crypto';
import { llmClient } from './llm';
import { contextManager } from './context';
import { configStore } from './store';
import { ratchetStorage } from './ratchet-storage';
import { 
  type EncryptedRatchetMessage, 
  RatchetDecrypt,
} from '@relay/core';
import { decodeBase64 } from 'tweetnacl-util';
import type { BridgeEdge, BridgeStatus } from '../shared/types';
import { RELAY_API_BASE_URL, RELAY_API_TIMEOUT } from '../shared/constants';

/**
 * Single bridge connection using the bridge's own edge
 */
export class BridgeConnection {
  private bridgeEdge: BridgeEdge | null = null;
  private eventSource: EventSource | null = null;
  private status: BridgeStatus = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private onStatusChange?: (status: BridgeStatus) => void;
  private onLog?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void;
  
  // Health monitoring
  private lastEventTimestamp = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 15000; // Check every 15 seconds
  private readonly MAX_SILENCE_MS = 60000; // 60 seconds without event = dead connection

  constructor(onStatusChange?: (status: BridgeStatus) => void, onLog?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void) {
    this.onStatusChange = onStatusChange;
    this.onLog = onLog;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, details?: any): void {
    console.log(`[Bridge] ${message}`, details || '');
    if (this.onLog) {
      this.onLog(level, message, details);
    }
  }

  /**
   * Start the bridge connection using the bridge's own edge
   */
  async connect(): Promise<void> {
    // Load bridge edge from config
    this.bridgeEdge = configStore.getBridgeEdge() || null;
    
    if (!this.bridgeEdge) {
      this.log('error', 'No bridge edge found. Bridge edge must be initialized first.');
      this.updateStatus('error');
      return;
    }

    if (this.eventSource) {
      this.log('warn', 'Already connected - preventing duplicate connection', { edgeId: this.bridgeEdge.id });
      return;
    }

    this.updateStatus('connecting');
    this.log('info', 'Connecting with bridge edge', { edgeId: this.bridgeEdge.id });

    try {
      // Build SSE URL with bridge's edge ID in path
      const url = `${RELAY_API_BASE_URL}/v1/stream/edge/${this.bridgeEdge.id}`;
      
      this.log('info', 'Connecting to SSE endpoint', { url, edgeId: this.bridgeEdge.id });
      
      // Create EventSource with bridge's X25519 secret key as Bearer token
      // Server authenticates by deriving public key from secret key
      this.eventSource = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.x25519PrivateKey}`,
        },
      });

      // Setup event handlers
      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.log('info', 'Connected successfully to SSE stream');
        
        // Start health monitoring
        this.startHealthCheck();
      };

      this.eventSource.onerror = (error: any) => {
        const errorDetails = {
          type: error.type,
          message: error.message,
          status: error.status,
          statusText: error.statusText,
        };
        this.log('error', 'Connection error', errorDetails);
        console.error('[Bridge] Full error object:', error);
        this.handleDisconnect();
      };

      // Listen for different message types
      this.eventSource.addEventListener('connected', this.handleConnected.bind(this));
      this.eventSource.addEventListener('edge.message', this.handleEdgeMessage.bind(this));
      this.eventSource.addEventListener('ping', this.handlePing.bind(this));

    } catch (error) {
      this.log('error', 'Connection failed', error);
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Handle initial connection confirmation from server
   */
  private handleConnected(event: MessageEvent): void {
    this.lastEventTimestamp = Date.now();
    const data = JSON.parse(event.data);
    this.log('info', 'Server confirmed connection', data);
  }

  /**
   * Handle ping to keep connection alive
   */
  private handlePing(event: MessageEvent): void {
    this.lastEventTimestamp = Date.now();
    const data = JSON.parse(event.data);
    this.log('info', 'Heartbeat ping received', { serverTimestamp: data.timestamp });
  }

  /**
   * Handle incoming edge message
   */
  private async handleEdgeMessage(event: MessageEvent): Promise<void> {
    this.lastEventTimestamp = Date.now();
    
    try {
      const data = JSON.parse(event.data);
      this.log('info', 'Edge message received', { messageId: data.messageId });

      // Fetch full message with encrypted content
      const message = await this.fetchMessage(data.messageId);
      
      if (!message) {
        this.log('error', 'Failed to fetch message', { messageId: data.messageId });
        return;
      }

      // Decrypt the message using bridge's private key
      const decrypted = await this.decryptMessage(message);
      
      if (!decrypted) {
        this.log('error', 'Failed to decrypt message', { messageId: data.messageId });
        return;
      }

      this.log('info', 'Decrypted message', {
        messageId: data.messageId,
        conversationId: message.conversationId,
        contentLength: decrypted.content.length,
      });

      // Process the message and generate response
      await this.processMessage(message.conversationId, decrypted);

    } catch (error) {
      this.log('error', 'Error handling edge message', error);
    }
  }

  /**
   * Fetch full message from API
   */
  private async fetchMessage(messageId: string): Promise<any> {
    if (!this.bridgeEdge) {
      throw new Error('Bridge edge not initialized');
    }

    try {
      const url = `${RELAY_API_BASE_URL}/v1/messages/${messageId}`;
      this.log('info', 'Fetching message', { url, messageId });
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      this.log('info', 'Message fetch response', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorText = await response.text();
        this.log('error', 'Message fetch failed', { 
          status: response.status, 
          statusText: response.statusText,
          body: errorText 
        });
        throw new Error(`Failed to fetch message: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.log('info', 'Message fetched successfully', { 
        messageId: (data as any).id,
        conversationId: (data as any).conversationId,
        hasCiphertext: !!(data as any).ciphertext,
        hasEphemeralKey: !!(data as any).ephemeralPubkey,
        hasNonce: !!(data as any).nonce,
      });
      
      return data;
    } catch (error) {
      this.log('error', 'Error fetching message', { 
        messageId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Decrypt a Double Ratchet message
   */
  private async decryptMessage(message: any): Promise<{
    content: string;
    senderEdgeId: string;
  } | null> {
    if (!this.bridgeEdge) {
      return null;
    }

    try {
      this.log('info', 'Decrypting message', {
        messageId: message.id,
        conversationId: message.conversationId,
        hasCiphertext: !!message.ciphertext,
        hasEphemeralPubkey: !!message.ephemeralPubkey,
        hasNonce: !!message.nonce,
        hasRatchetPn: message.ratchetPn !== null && message.ratchetPn !== undefined,
        hasRatchetN: message.ratchetN !== null && message.ratchetN !== undefined,
        ciphertextLength: message.ciphertext?.length,
        ephemeralPubkeyLength: message.ephemeralPubkey?.length,
        nonceLength: message.nonce?.length,
        ratchetPn: message.ratchetPn,
        ratchetN: message.ratchetN,
      });
      
      // Validate required Double Ratchet fields
      const { ciphertext, ephemeralPubkey, nonce, ratchetPn, ratchetN, conversationId, edgeId } = message;
      
      if (!ciphertext || !ephemeralPubkey || !nonce) {
        throw new Error('Missing required encryption fields (ciphertext, ephemeralPubkey, nonce)');
      }

      if (ratchetPn === null || ratchetPn === undefined || ratchetN === null || ratchetN === undefined) {
        throw new Error('Missing required Double Ratchet fields (ratchetPn, ratchetN)');
      }

      if (!conversationId) {
        throw new Error('Missing conversationId');
      }

      if (!edgeId) {
        throw new Error('Missing sender edgeId');
      }

      this.log('info', 'Loading/initializing ratchet state', {
        conversationId,
        senderEdgeId: edgeId,
        bridgeX25519PublicKey: this.bridgeEdge.x25519PublicKey.substring(0, 20) + '...',
        bridgeX25519PrivateKeyLength: this.bridgeEdge.x25519PrivateKey.length,
      });

      // Load or initialize ratchet state for this conversation
      let ratchetState = await ratchetStorage.load(conversationId);
      
      if (!ratchetState) {
        this.log('info', 'Initializing new ratchet state as Bob (receiver)');
        
        // We need the sender's edge X25519 public key to initialize
        // For now, we'll fetch it from the conversation details
        // In production, this should be cached or included in the message
        const senderPublicKey = await this.fetchSenderPublicKey(conversationId, edgeId);
        
        if (!senderPublicKey) {
          throw new Error('Failed to get sender X25519 public key');
        }

        // Initialize ratchet state as Bob (receiver)
        ratchetState = await ratchetStorage.initializeAsBob(
          conversationId,
          {
            publicKey: decodeBase64(this.bridgeEdge.x25519PublicKey),
            secretKey: decodeBase64(this.bridgeEdge.x25519PrivateKey),
          },
          decodeBase64(senderPublicKey)
        );
      }

      // Build EncryptedRatchetMessage from server message
      const encryptedMessage: EncryptedRatchetMessage = {
        ciphertext: ciphertext,
        dh: ephemeralPubkey, // DH public key (base64)
        pn: ratchetPn,       // Previous chain length
        n: ratchetN,         // Message number
        nonce: nonce,        // AEAD nonce
      };

      this.log('info', 'Attempting Double Ratchet decryption', {
        dhKeyPreview: ephemeralPubkey.substring(0, 20) + '...',
        pn: ratchetPn,
        n: ratchetN,
      });

      // Decrypt using Double Ratchet
      const result = RatchetDecrypt(ratchetState, encryptedMessage);

      if (!result) {
        throw new Error('RatchetDecrypt returned null - decryption failed');
      }

      const { plaintext, newState } = result;

      // Save updated ratchet state
      await ratchetStorage.save(conversationId, newState);

      this.log('info', 'Decryption successful', {
        contentLength: plaintext.length,
        contentPreview: plaintext.substring(0, 50),
      });

      return {
        content: plaintext,
        senderEdgeId: edgeId,
      };

    } catch (error) {
      this.log('error', 'Decryption error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Fetch sender's X25519 public key from edge
   */
  private async fetchSenderPublicKey(conversationId: string, senderEdgeId: string): Promise<string | null> {
    try {
      if (!this.bridgeEdge) {
        throw new Error('Bridge edge not initialized');
      }

      this.log('info', 'Fetching sender X25519 public key', { conversationId, senderEdgeId });

      // Fetch edge details to get X25519 public key
      const url = `${RELAY_API_BASE_URL}/v1/edges/${senderEdgeId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch edge: ${response.status}`);
      }

      const edge: any = await response.json();
      
      if (!edge.x25519PublicKey) {
        throw new Error('Edge missing x25519PublicKey');
      }

      this.log('info', 'Fetched sender public key', {
        senderEdgeId,
        publicKeyPreview: edge.x25519PublicKey.substring(0, 20) + '...',
      });

      return edge.x25519PublicKey;
    } catch (error) {
      this.log('error', 'Failed to fetch sender public key', {
        conversationId,
        senderEdgeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Process decrypted message and generate LLM response
   */
  private async processMessage(conversationId: string, decrypted: {
    content: string;
    senderEdgeId: string;
  }): Promise<void> {
    if (!this.bridgeEdge) {
      console.error('[Bridge] Cannot process message: bridge edge not initialized');
      return;
    }

    try {
      // Get or create conversation context
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'user',
          content: decrypted.content,
          timestamp: new Date().toISOString(),
        },
        decrypted.senderEdgeId // Store sender edge ID for response
      );

      // Get conversation context for LLM
      const messages = contextManager.getMessagesForLLM(
        conversationId,
        decrypted.senderEdgeId
      );

      // Get active LLM provider
      const llmProvider = llmClient.getActiveProvider();
      
      if (!llmProvider) {
        throw new Error('No active LLM provider configured');
      }

      // Use the default model
      const model = llmProvider.defaultModel || llmProvider.models[0];

      this.log('info', 'Generating LLM response', {
        conversationId,
        provider: llmProvider.name,
        model,
        messageCount: messages.length,
      });

      // Generate LLM response
      const llmResponse = await llmClient.chat(messages, { model });

      if (!llmResponse) {
        throw new Error('LLM returned empty response');
      }

      this.log('info', 'LLM response generated', { length: llmResponse.length });

      // Add assistant message to context
      contextManager.addMessage(
        conversationId,
        decrypted.senderEdgeId,
        {
          role: 'assistant',
          content: llmResponse,
        }
      );

      // Send encrypted response back
      await this.sendResponse(conversationId, decrypted.senderEdgeId, llmResponse);

    } catch (error) {
      this.log('error', 'Error processing message', error);
      
      // Send error message back to user
      const errorMsg = 'Sorry, I encountered an error processing your message. Please try again.';
      try {
        await this.sendResponse(conversationId, decrypted.senderEdgeId, errorMsg);
      } catch (sendError) {
        this.log('error', 'Failed to send error message', sendError);
      }
    }
  }

  /**
   * Send encrypted response back to Relay server using Double Ratchet
   */
  private async sendResponse(
    conversationId: string,
    recipientEdgeId: string,
    content: string
  ): Promise<void> {
    if (!this.bridgeEdge) {
      throw new Error('Bridge edge not initialized');
    }

    try {
      this.log('info', 'Sending response', {
        conversationId,
        recipientEdgeId,
        contentLength: content.length,
      });

      // Load ratchet state for this conversation
      let ratchetState = await ratchetStorage.load(conversationId);
      
      if (!ratchetState) {
        throw new Error('Ratchet state not found - cannot send response without initialized conversation');
      }

      // Encrypt using Double Ratchet
      const { RatchetEncrypt } = await import('@relay/core');
      const { message: encryptedMessage, newState } = RatchetEncrypt(ratchetState, content);

      // Save updated ratchet state
      await ratchetStorage.save(conversationId, newState);

      this.log('info', 'Encrypted response with Double Ratchet', {
        dhKeyPreview: encryptedMessage.dh.substring(0, 20) + '...',
        pn: encryptedMessage.pn,
        n: encryptedMessage.n,
      });

      // Sign the message envelope
      const signatureMessage = `relay-msg:${recipientEdgeId}:${encryptedMessage.nonce}`;
      const signature = crypto.sign(signatureMessage, this.bridgeEdge.ed25519PrivateKey);

      // Send to Relay API with Double Ratchet fields
      const response = await fetch(`${RELAY_API_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.bridgeEdge.authToken}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          edge_id: this.bridgeEdge.id,
          origin: 'local-llm',
          security_level: 'e2ee',
          payload: {
            content_type: 'text/plain',
            ciphertext: encryptedMessage.ciphertext,
            ephemeral_pubkey: encryptedMessage.dh,
            nonce: encryptedMessage.nonce,
            dh: encryptedMessage.dh,
            pn: encryptedMessage.pn,
            n: encryptedMessage.n,
          },
          signature,
        }),
        signal: AbortSignal.timeout(RELAY_API_TIMEOUT),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(`Failed to send message: ${errorData.error || response.statusText}`);
      }

      this.log('info', 'Response sent successfully');

    } catch (error) {
      this.log('error', 'Error sending response', error);
      throw error;
    }
  }

  /**
   * Handle disconnection and schedule reconnect
   */
  private handleDisconnect(): void {
    this.stopHealthCheck();
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('error', 'Max reconnect attempts reached');
      this.updateStatus('error');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.log('info', 'Scheduling reconnect', { delayMs: delay, attempt: this.reconnectAttempts + 1 });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Start health check monitoring
   * Detects silent connection failures by checking for events
   */
  private startHealthCheck(): void {
    // Record connection time
    this.lastEventTimestamp = Date.now();
    
    // Stop any existing health check
    this.stopHealthCheck();
    
    this.log('info', 'Starting health check monitoring', {
      checkInterval: this.HEALTH_CHECK_INTERVAL,
      maxSilence: this.MAX_SILENCE_MS,
    });
    
    // Check health every 15 seconds
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastEvent = now - this.lastEventTimestamp;
      
      if (timeSinceLastEvent > this.MAX_SILENCE_MS) {
        this.log('warn', 'Connection appears dead - no events received', {
          timeSinceLastEvent,
          maxSilence: this.MAX_SILENCE_MS,
        });
        
        // Force disconnect and reconnect
        this.handleDisconnect();
      } else {
        // Log health status
        this.log('info', 'Connection health check passed', {
          timeSinceLastEvent,
          status: 'healthy',
        });
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.log('info', 'Stopped health check monitoring');
    }
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: BridgeStatus): void {
    this.status = status;
    
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Get current status
   */
  getStatus(): BridgeStatus {
    return this.status;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[Bridge] Disconnecting');

    this.stopHealthCheck();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateStatus('disconnected');
  }
}

/**
 * Manager for multiple bridge connections
 */
/**
 * Bridge Manager - Manages single bridge connection
 */
export class BridgeManager {
  private bridge: BridgeConnection | null = null;
  private mainWindow: Electron.BrowserWindow | null = null;

  constructor() {
    this.bridge = null;
  }

  /**
   * Set the main window for sending IPC events
   */
  setMainWindow(window: Electron.BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Emit log to renderer
   */
  private emitLog(level: 'info' | 'warn' | 'error', message: string, details?: any): void {
    console.log(`[BridgeManager] Emitting log: ${message}`, { hasWindow: !!this.mainWindow, details });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('bridge-log', {
        timestamp: new Date().toISOString(),
        level,
        message,
        details,
      });
    } else {
      console.warn('[BridgeManager] Cannot emit log - mainWindow not available');
    }
  }

  /**
   * Emit status change to renderer
   */
  private emitStatus(status: BridgeStatus): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('bridge-status-change', status);
    }
  }

  /**
   * Start the bridge connection
   */
  async start(): Promise<void> {
    if (this.bridge) {
      console.warn('[BridgeManager] Bridge already running');
      return;
    }

    console.log('[BridgeManager] Initializing bridge connection...');
    this.emitLog('info', 'Bridge manager starting', { hasMainWindow: !!this.mainWindow });

    const bridge = new BridgeConnection(
      (status) => {
        console.log('[BridgeManager] Bridge status:', status);
        this.emitStatus(status);
      },
      (level, message, details) => {
        this.emitLog(level, message, details);
      }
    );

    this.bridge = bridge;
    await bridge.connect();
  }

  /**
   * Stop the bridge connection
   */
  stop(): void {
    if (!this.bridge) {
      console.warn('[BridgeManager] Bridge not running');
      return;
    }

    this.bridge.disconnect();
    this.bridge = null;
  }

  /**
   * Get bridge status
   */
  getStatus(): BridgeStatus {
    return this.bridge ? this.bridge.getStatus() : 'disconnected';
  }

  /**
   * Get bridge's edge ID
   */
  getBridgeEdgeId(): string | null {
    const bridgeEdge = configStore.getBridgeEdge();
    return bridgeEdge ? bridgeEdge.id : null;
  }

  /**
   * Reload bridges from config (kept for compatibility)
   */
  async reloadFromConfig(): Promise<void> {
    console.log('[BridgeManager] Starting bridge connection');
    await this.start();
  }

  /**
   * Dispose (cleanup on shutdown)
   */
  dispose(): void {
    this.stop();
    console.log('[BridgeManager] Disposed');
  }
}

// Export singleton instance
export const bridgeManager = new BridgeManager();

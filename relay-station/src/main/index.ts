/**
 * Electron Main Process Entry Point
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import AutoLaunch from 'electron-auto-launch';
import { configStore } from './store';
import * as crypto from './crypto';
import { llmClient } from './llm';
import { contextManager } from './context';
import { bridgeManager } from './bridge';
import { ollamaManager } from './ollama-manager';
import { hardwareDetector } from './hardware-detector';
import { modelCatalog } from './model-catalog';
import { statsDb } from './services/StatsDatabase';
import { maintenanceJobs } from './services/MaintenanceJobs';
import type { AppConfig, EdgeConfig, LLMProvider } from '../shared/types';
// import { RELAY_API_BASE_URL } from '../shared/constants'; // Deprecated bridge functionality

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let llmStatusCheckInterval: NodeJS.Timeout | null = null;

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'Relay Station',
  isHidden: true, // Start minimized to tray
});

/**
 * Create the main application window (hidden by default)
 */
function createWindow(): void {
  // Icon paths - use .ico for Windows (supports all resolutions)
  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../assets/icon.ico')
    : path.join(process.resourcesPath, 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Hidden by default, shown via tray
    title: 'Relay Station',
    icon: iconPath,
    autoHideMenuBar: true, // Hide menu bar (press Alt to show)
    webPreferences: {
      preload: process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../dist/main/preload/index.js')
        : path.join(__dirname, './preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default Electron menu (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // Set main window for bridge manager (for IPC events)
  bridgeManager.setMainWindow(mainWindow);

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    console.log('[Window] Loading development URL...');
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      console.error('[Window] Failed to load URL:', err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Debug window events
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] Renderer loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Window] Failed to load:', errorCode, errorDescription);
  });

  // Hide instead of close
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

/**
 * Update tray menu with current status
 */
function updateTrayMenu(): void {
  if (!tray) return;

  const activeLLM = llmClient.getActiveProvider();
  const bridgeEdge = configStore.getBridgeEdge();
  const isConnected = bridgeManager.getStatus() === 'connected';

  // Status summary
  const llmStatus = activeLLM 
    ? `${activeLLM.name === 'ollama' ? 'Ollama' : 'LM Studio'} • ${activeLLM.models.length} models`
    : 'No LLM';
  
  const bridgeStatus = bridgeEdge && isConnected
    ? `Connected • ${bridgeEdge.label}`
    : bridgeEdge
    ? `Disconnected • ${bridgeEdge.label}`
    : 'No Bridge';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Relay Station',
      type: 'normal',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: `AI: ${llmStatus}`,
      type: 'normal',
      enabled: false,
    },
    {
      label: `Bridge: ${bridgeStatus}`,
      type: 'normal',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Manage Models',
      type: 'normal',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        // TODO: Send IPC to switch to Models tab
      },
    },
    {
      label: 'Restart Ollama',
      type: 'normal',
      enabled: activeLLM?.name === 'ollama',
      click: async () => {
        await ollamaManager.restart();
      },
    },
    { type: 'separator' },
    {
      label: 'Restart App',
      type: 'normal',
      click: () => {
        app.relaunch();
        app.quit();
      },
    },
    {
      label: 'Quit Relay Station',
      type: 'normal',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Create system tray icon and menu
 */
function createTray(): void {
  if (!tray) {
    // Try to load tray icon from assets folder
    let icon: Electron.NativeImage | null = null;
    const iconPaths = [
      // Development paths
      path.join(__dirname, '../../assets/tray/icon.png'),
      path.join(__dirname, '../../assets/tray/icon-dark.png'),
      // Production paths
      path.join(process.resourcesPath, 'assets/tray/icon.png'),
      path.join(process.resourcesPath, 'assets/tray/icon-dark.png'),
      // Fallback to old location
      path.join(__dirname, '../../icons/icon-16.png'),
    ];
    
    for (const tryPath of iconPaths) {
      if (fs.existsSync(tryPath)) {
        try {
          console.log('[Tray] Trying to load icon from:', tryPath);
          // Load icon data directly from file (more reliable than createFromPath on Windows)
          const iconData = fs.readFileSync(tryPath);
          icon = nativeImage.createFromBuffer(iconData);
          
          if (!icon.isEmpty()) {
            console.log('[Tray] Icon loaded successfully from:', tryPath, 'Size:', icon.getSize());
            break;
          }
        } catch (error) {
          console.warn('[Tray] Failed to load icon from:', tryPath, error);
        }
      }
    }
    
    if (!icon || icon.isEmpty()) {
      console.warn('[Tray] Creating programmatic fallback icon');
      // Create a simple colored icon programmatically (16x16 with Relay logo colors)
      const canvas = createIconCanvas();
      icon = nativeImage.createFromDataURL(canvas);
    }
    
    // Create tray with icon
    tray = new Tray(icon);
    
    tray.setToolTip('Relay Station');
  }

  updateTrayMenu();

  // Double-click opens main window
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

/**
 * Create a programmatic icon canvas for fallback
 */
function createIconCanvas(): string {
  // Create a 16x16 purple icon with "R" using SVG data URL
  const svg = `
    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" fill="#8B5CF6" rx="3"/>
      <text x="8" y="12" font-family="Arial" font-size="12" font-weight="bold" 
            text-anchor="middle" fill="white">R</text>
    </svg>
  `;
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * @deprecated Bridges are deprecated - this function is no longer used
 * Initialize or load the bridge's own edge
 * This edge is used by the bridge to authenticate with the server
 */
/*
async function _initializeBridgeEdge_DEPRECATED(label?: string): Promise<BridgeEdge> {
  // Check if we already have a bridge edge
  let bridgeEdge = configStore.getBridgeEdge();
  
  if (bridgeEdge) {
    console.log('[Bridge Edge] Using existing bridge edge:', bridgeEdge.id);
    return bridgeEdge;
  }

  console.log('[Bridge Edge] No bridge edge found, creating new one...');

  // Generate Ed25519 keypair (for identity/signing)
  const ed25519Keypair = crypto.generateEd25519Keypair();
  
  // Generate X25519 keypair (for encryption)
  const x25519Keypair = crypto.generateX25519Keypair();
  
  // Step 1: Register identity with server
  console.log('[Bridge Edge] Registering identity...');
  try {
    const registerNonce = crypto.randomString(32);
    const registerMessage = `relay-register:${registerNonce}`;
    const registerSignature = crypto.sign(registerMessage, ed25519Keypair.privateKey);
    
    const registerResponse = await fetch(`${RELAY_API_BASE_URL}/v1/identity/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicKey: ed25519Keypair.publicKey,
        nonce: registerNonce,
        signature: registerSignature,
      }),
    });

    if (!registerResponse.ok) {
      const errorData = await registerResponse.json() as { error?: string; code?: string };
      throw new Error(`Failed to register identity: ${errorData.error || errorData.code || registerResponse.statusText}`);
    }
    
    console.log('[Bridge Edge] Identity registered successfully');
  } catch (error) {
    console.error('[Bridge Edge] Identity registration failed:', error);
    throw error;
  }
  
  // Step 2: Create edge for this identity
  console.log('[Bridge Edge] Creating edge...');
  const nonce = crypto.randomString(32);
  const signatureMessage = `relay-create-edge:local-llm:${nonce}`;
  const signature = crypto.sign(signatureMessage, ed25519Keypair.privateKey);
  
  const requestBody = {
    type: 'local-llm',
    publicKey: ed25519Keypair.publicKey,
    x25519PublicKey: x25519Keypair.publicKey,
    nonce,
    signature,
    encryptedLabel: null, // Optional, could encrypt "LLM Bridge" label
    customAddress: null,
    authToken: null,
  };
  
  console.log('[Bridge Edge] Request body validation:', {
    type: requestBody.type,
    hasPublicKey: !!requestBody.publicKey,
    publicKeyLength: requestBody.publicKey?.length || 0,
    hasX25519: !!requestBody.x25519PublicKey,
    x25519Length: requestBody.x25519PublicKey?.length || 0,
    hasNonce: !!requestBody.nonce,
    nonceLength: requestBody.nonce?.length || 0,
    hasSignature: !!requestBody.signature,
    signatureLength: requestBody.signature?.length || 0,
  });
  
  try {
    const response = await fetch(`${RELAY_API_BASE_URL}/v1/edge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json() as { error?: string; code?: string };
      throw new Error(`Failed to create bridge edge: ${errorData.error || errorData.code || response.statusText}`);
    }

    const data = await response.json() as { id: string };
    
    // Store the bridge edge (authToken is the X25519 secret key for SSE auth)
    bridgeEdge = {
      id: data.id,
      label: label || 'My LLM Bridge',
      ed25519PrivateKey: ed25519Keypair.privateKey,
      ed25519PublicKey: ed25519Keypair.publicKey,
      x25519PrivateKey: x25519Keypair.privateKey,
      x25519PublicKey: x25519Keypair.publicKey,
      authToken: x25519Keypair.privateKey, // SSE uses X25519 secret key as Bearer token
      createdAt: new Date().toISOString(),
    };
    
    configStore.setBridgeEdge(bridgeEdge);
    console.log('[Bridge Edge] Created and stored bridge edge:', bridgeEdge.id);
    
    return bridgeEdge;
  } catch (error) {
    console.error('[Bridge Edge] Failed to initialize bridge edge:', error);
    throw error;
  }
}
*/

/**
 * Register IPC handlers
 */
function registerIPCHandlers(): void {
  // Config operations
  ipcMain.handle('get-config', (): AppConfig => {
    return configStore.getConfig();
  });

  ipcMain.handle('update-config', (_event, config: Partial<AppConfig>): void => {
    configStore.updateConfig(config);
  });

  // Edge operations
  ipcMain.handle('add-edge', (_event, edge: EdgeConfig): void => {
    configStore.addEdge(edge);
  });

  ipcMain.handle('remove-edge', (_event, edgeId: string): void => {
    configStore.removeEdge(edgeId);
  });

  ipcMain.handle('update-edge', (_event, edgeId: string, changes: Partial<EdgeConfig>): void => {
    configStore.updateEdge(edgeId, changes);
  });

  // ========================================
  // DEPRECATED: Bridge Operations
  // Bridges are being phased out in favor of RelayAI Operators
  // These handlers are kept for backward compatibility but should not be used
  // ========================================

  /*
  // Bridge edge operations
  ipcMain.handle('create-bridge-edge', async (_event, label: string): Promise<BridgeEdge> => {
    // Check if bridge edge already exists
    const existing = configStore.getBridgeEdge();
    if (existing) {
      throw new Error('Bridge edge already exists. Disconnect first to create a new one.');
    }

    // Create new bridge edge
    const bridgeEdge = await initializeBridgeEdge(label);
    
    // Start the bridge connection
    await bridgeManager.reloadFromConfig();
    updateTrayMenu();
    
    return bridgeEdge;
  });

  ipcMain.handle('disconnect-bridge', async (): Promise<void> => {
    console.log('[Main] Disconnecting bridge...');
    
    // Stop the bridge manager
    bridgeManager.dispose();
    
    // Clear the stored bridge edge
    configStore.clearBridgeEdge();
    
    // Update UI
    updateTrayMenu();
    
    console.log('[Main] Bridge disconnected and edge cleared');
  });

  ipcMain.handle('update-bridge-label', async (_event, label: string): Promise<void> => {
    const bridgeEdge = configStore.getBridgeEdge();
    if (!bridgeEdge) {
      throw new Error('No bridge edge exists');
    }
    
    // Update the label
    bridgeEdge.label = label;
    configStore.setBridgeEdge(bridgeEdge);
    updateTrayMenu();
    
    console.log('[Main] Bridge label updated to:', label);
  });

  ipcMain.handle('get-bridge-edge-id', (): string | null => {
    const bridgeEdge = configStore.getBridgeEdge();
    return bridgeEdge ? bridgeEdge.id : null;
  });

  ipcMain.handle('get-bridge-edge', (): BridgeEdge | undefined => {
    return configStore.getBridgeEdge();
  });
  */

  ipcMain.handle('get-bridge-config', (): { systemPrompt?: string; defaultModel?: string; availableModels?: string[] } => {
    // DEPRECATED: Return empty config
    return {
      systemPrompt: undefined,
      defaultModel: undefined,
      availableModels: [],
    };
  });

  ipcMain.handle('update-bridge-config', async (_event, _updates: { systemPrompt?: string; defaultModel?: string }): Promise<void> => {
    // DEPRECATED: No-op
    console.warn('[Bridge] Bridge configuration updates are deprecated');
  });

  ipcMain.handle('get-authorized-users', (): Array<{ id: string; label: string; addedAt: number; lastSeen?: number; requestCount: number }> => {
    const config = configStore.getConfig();
    return config.authorizedUsers || [];
  });

  ipcMain.handle('add-authorized-user', async (_event, user: { id: string; label: string }): Promise<void> => {
    try {
      const config = configStore.getConfig();
      const authorizedUsers = config.authorizedUsers || [];
      
      // Check if user already exists
      if (authorizedUsers.some(u => u.id === user.id)) {
        throw new Error('User already authorized');
      }
      
      const newUser = {
        id: user.id,
        label: user.label,
        addedAt: Date.now(),
        requestCount: 0,
      };
      
      configStore.updateConfig({ 
        authorizedUsers: [...authorizedUsers, newUser] 
      });
      console.log('[Bridge] Added authorized user:', user.id);
    } catch (err) {
      console.error('[Bridge] Failed to add authorized user:', err);
      throw err;
    }
  });

  ipcMain.handle('remove-authorized-user', async (_event, userId: string): Promise<void> => {
    try {
      const config = configStore.getConfig();
      const authorizedUsers = config.authorizedUsers || [];
      
      configStore.updateConfig({ 
        authorizedUsers: authorizedUsers.filter(u => u.id !== userId)
      });
      console.log('[Bridge] Removed authorized user:', userId);
    } catch (err) {
      console.error('[Bridge] Failed to remove authorized user:', err);
      throw err;
    }
  });

  // API Key management (new access control system)
  ipcMain.handle('generate-api-key', async (_event, label: string): Promise<{ id: string; key: string }> => {
    try {
      // Generate API key inline
      const bytes = randomBytes(24);
      const key = `relay_pk_${bytes.toString('base64url')}`;
      
      const config = configStore.getConfig();
      const apiKeys = config.apiKeys || [];
      
      const newKey = {
        id: key.substring(0, 20), // Use prefix as ID
        label,
        key,
        createdAt: Date.now(),
        requestCount: 0,
        tokensUsed: 0,
      };
      
      configStore.updateConfig({ 
        apiKeys: [...apiKeys, newKey] 
      });
      
      console.log('[Bridge] Generated API key:', newKey.id);
      return { id: newKey.id, key: newKey.key };
    } catch (err) {
      console.error('[Bridge] Failed to generate API key:', err);
      throw err;
    }
  });

  ipcMain.handle('get-api-keys', () => {
    const config = configStore.getConfig();
    return (config.apiKeys || []).map(key => ({
      id: key.id,
      label: key.label,
      key: key.key,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      requestCount: key.requestCount,
      tokensUsed: key.tokensUsed,
      rateLimit: key.rateLimit,
    }));
  });

  ipcMain.handle('revoke-api-key', async (_event, keyId: string): Promise<void> => {
    try {
      const config = configStore.getConfig();
      const apiKeys = config.apiKeys || [];
      
      configStore.updateConfig({ 
        apiKeys: apiKeys.filter(k => k.id !== keyId)
      });
      console.log('[Bridge] Revoked API key:', keyId);
    } catch (err) {
      console.error('[Bridge] Failed to revoke API key:', err);
      throw err;
    }
  });

  ipcMain.handle('update-api-key-limits', async (_event, keyId: string, rateLimit: { requestsPerHour?: number; tokensPerDay?: number }): Promise<void> => {
    try {
      const config = configStore.getConfig();
      const apiKeys = config.apiKeys || [];
      
      const updatedKeys = apiKeys.map(key => {
        if (key.id === keyId) {
          return { ...key, rateLimit };
        }
        return key;
      });
      
      configStore.updateConfig({ apiKeys: updatedKeys });
      console.log('[Bridge] Updated API key limits:', keyId, rateLimit);
    } catch (err) {
      console.error('[Bridge] Failed to update API key limits:', err);
      throw err;
    }
  });

  // LLM operations
  ipcMain.handle('detect-llms', async (): Promise<LLMProvider[]> => {
    const providers = await llmClient.detectProviders();
    updateTrayMenu();
    return providers;
  });

  ipcMain.handle('set-active-llm', (_event, provider: LLMProvider): void => {
    llmClient.setActiveProvider(provider);
    configStore.setActiveLLM(provider);
    updateTrayMenu();
  });

  ipcMain.handle('test-llm', async (_event, provider: LLMProvider): Promise<boolean> => {
    return await llmClient.testProvider(provider);
  });

  // Crypto operations
  ipcMain.handle('generate-keypair', (): { publicKey: string; privateKey: string } => {
    return crypto.generateX25519Keypair();
  });

  // E2EE encryption for AI operators
  ipcMain.handle('encrypt-e2ee', (_event, payload: {
    plaintext: string;
    recipientPublicKey: string;
  }): { ciphertext: string; ephemeralPublicKey: string; nonce: string } => {
    return crypto.encrypt(payload.plaintext, payload.recipientPublicKey);
  });

  // E2EE decryption for AI operators
  ipcMain.handle('decrypt-e2ee', (_event, payload: {
    ciphertext: string;
    ephemeralPublicKey: string;
    nonce: string;
    recipientPrivateKey: string;
  }): string => {
    return crypto.decrypt(
      payload.ciphertext,
      payload.ephemeralPublicKey,
      payload.nonce,
      payload.recipientPrivateKey
    );
  });

  // Legacy bridge operations (for client edges - deprecated)
  ipcMain.handle('connect-bridge', async (_event, _edgeId: string): Promise<void> => {
    console.warn('[Bridge] Bridge connections are deprecated');
  });

  // Stats
  ipcMain.handle('get-stats', (): any => {
    return {
      uptime: process.uptime(),
      messageCount: contextManager.getTotalMessageCount(),
      averageLatency: 0,
      activeConversations: 0,
      bridgeStatus: 'disconnected',
    };
  });

  // Bridge status
  ipcMain.handle('get-bridge-status', (): string => {
    return 'disconnected'; // Bridges are deprecated
  });

  // Network event handlers (deprecated)
  ipcMain.handle('network-online', (): void => {
    console.log('[Main] Network online - bridge reconnection disabled');
  });

  ipcMain.handle('network-offline', (): void => {
    console.log('[Main] Network offline - no action needed');
  });

  // Ollama management
  const activeDownloads = new Map<string, AbortController>();

  ipcMain.handle('ollama-status', async (): Promise<any> => {
    return await ollamaManager.getStatus();
  });

  ipcMain.handle('ollama-restart', async (): Promise<boolean> => {
    return await ollamaManager.restart();
  });

  ipcMain.handle('ollama-models-list', async (): Promise<any[]> => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json() as { models?: any[] };
      return data.models || [];
    } catch (error) {
      console.error('[Ollama] Failed to list models:', error);
      return [];
    }
  });

  ipcMain.handle('ollama-running-models', async (): Promise<any[]> => {
    try {
      const response = await fetch('http://localhost:11434/api/ps');
      const data = await response.json() as { models?: any[] };
      return data.models || [];
    } catch (error) {
      console.error('[Ollama] Failed to get running models:', error);
      return [];
    }
  });

  ipcMain.handle('test-model', async (_event, modelName: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    try {
      console.log('[Bridge] Testing model:', modelName);
      
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'Say "test successful"' }],
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { message?: { content: string } };
      const content = data.message?.content || 'No response';
      
      console.log('[Bridge] Model test successful:', modelName);
      return { success: true, response: content };
    } catch (error) {
      console.error('[Bridge] Model test failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });

  ipcMain.handle('ollama-model-pull', async (event, modelName: string): Promise<boolean> => {
    try {
      console.log(`[Ollama] Pulling model: ${modelName}`);
      
      // Create AbortController for this download
      const abortController = new AbortController();
      activeDownloads.set(modelName, abortController);
      
      const response = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        activeDownloads.delete(modelName);
        return false;
      }
      
      // Stream progress updates to renderer
      const reader = response.body?.getReader();
      if (!reader) {
        activeDownloads.delete(modelName);
        return false;
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const progress = JSON.parse(line);
              // Send progress update to renderer
              event.sender.send('ollama-pull-progress', {
                model: modelName,
                modelName,
                status: progress.status,
                completed: progress.completed,
                total: progress.total,
                digest: progress.digest,
                percent: progress.total > 0 ? (progress.completed / progress.total) * 100 : 0,
              });
              
              // Check for completion
              if (progress.status === 'success') {
                activeDownloads.delete(modelName);
                // Sync available models after successful download
                syncAvailableModels().catch(console.error);
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }
      
      activeDownloads.delete(modelName);
      return true;
    } catch (error: any) {
      activeDownloads.delete(modelName);
      if (error.name === 'AbortError') {
        console.log(`[Ollama] Download cancelled: ${modelName}`);
        event.sender.send('ollama-pull-progress', {
          model: modelName,
          modelName,
          status: 'cancelled',
          completed: 0,
          total: 0,
          percent: 0,
        });
        return false;
      }
      console.error('[Ollama] Failed to pull model:', error);
      return false;
    }
  });

  ipcMain.handle('ollama-model-cancel', async (_event, modelName: string): Promise<boolean> => {
    try {
      const controller = activeDownloads.get(modelName);
      if (controller) {
        console.log(`[Ollama] Cancelling download: ${modelName}`);
        controller.abort();
        activeDownloads.delete(modelName);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Ollama] Failed to cancel download:', error);
      return false;
    }
  });

  ipcMain.handle('ollama-model-delete', async (_event, modelName: string): Promise<boolean> => {
    try {
      console.log(`[Ollama] Deleting model: ${modelName}`);
      const response = await fetch('http://localhost:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });
      
      if (response.ok) {
        // Sync available models after successful delete
        syncAvailableModels().catch(console.error);
      }
      
      return response.ok;
    } catch (error) {
      console.error('[Ollama] Failed to delete model:', error);
      return false;
    }
  });

  ipcMain.handle('ollama-download', async (event): Promise<boolean> => {
    try {
      console.log('[Ollama] Starting download...');
      
      // Determine platform-specific installer URL
      const platform = process.platform;
      let installerUrl = '';
      
      if (platform === 'win32') {
        installerUrl = 'https://ollama.com/download/OllamaSetup.exe';
      } else if (platform === 'darwin') {
        installerUrl = 'https://ollama.com/download/Ollama-darwin.zip';
      } else if (platform === 'linux') {
        // Linux uses install script
        shell.openExternal('https://ollama.com/download/linux');
        return false; // Manual installation required
      } else {
        throw new Error('Unsupported platform');
      }

      // Download to temp directory
      const fs = await import('fs');
      const tempDir = app.getPath('temp');
      const fileName = path.basename(installerUrl);
      const filePath = path.join(tempDir, fileName);

      console.log(`[Ollama] Downloading to: ${filePath}`);

      const response = await fetch(installerUrl);
      if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Stream download with progress
      const totalSize = parseInt(response.headers.get('content-length') || '0', 10);
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(filePath);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloadedSize += value.length;
        fileStream.write(value);

        // Send progress to renderer
        const progress = Math.round((downloadedSize / totalSize) * 100);
        event.sender.send('ollama-download-progress', progress);
      }

      fileStream.end();
      console.log('[Ollama] Download complete');

      // Launch installer
      console.log('[Ollama] Launching installer...');
      shell.openPath(filePath);

      return true;
    } catch (error) {
      console.error('[Ollama] Download failed:', error);
      return false;
    }
  });

  ipcMain.handle('ollama-select-path', async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Ollama Executable',
        properties: ['openFile'],
        filters: [
          { name: 'Executables', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error('[Ollama] Failed to select path:', error);
      return null;
    }
  });
  // Hardware detection
  ipcMain.handle('hardware-detect', async () => {
    return await hardwareDetector.detect();
  });

  ipcMain.handle('hardware-can-run-model', async (_event, modelSizeGB: number, modelVRAM: number) => {
    await hardwareDetector.detect(); // Ensure detection has run
    return hardwareDetector.canRunModel(modelSizeGB, modelVRAM);
  });

  ipcMain.handle('hardware-estimate-performance', async (_event, modelSizeGB: number, modelVRAM: number) => {
    await hardwareDetector.detect(); // Ensure detection has run
    return hardwareDetector.estimatePerformance(modelSizeGB, modelVRAM);
  });

  // Model catalog
  ipcMain.handle('model-catalog-get', async () => {
    return await modelCatalog.getCatalog();
  });

  ipcMain.handle('model-catalog-search', async (_event, query: string) => {
    await modelCatalog.getCatalog(); // Ensure catalog is loaded
    return modelCatalog.search(query);
  });
  ipcMain.handle('open-external', async (_event, url: string): Promise<void> => {
    await shell.openExternal(url);
  });

  // Stats database queries
  ipcMain.handle('stats-get-current-session', () => {
    return statsDb.getCurrentSession();
  });

  ipcMain.handle('stats-get-daily', (_event, bridgeId: string, startDate: string, endDate: string) => {
    return statsDb.getDailyStats(bridgeId, startDate, endDate);
  });

  ipcMain.handle('stats-get-recent-events', (_event, bridgeId: string, limit: number = 100, offset: number = 0) => {
    return statsDb.getRecentEvents(bridgeId, limit, offset);
  });

  ipcMain.handle('stats-get-lifetime', (_event, bridgeId: string) => {
    return statsDb.getBridgeLifetimeStats(bridgeId);
  });

  ipcMain.handle('stats-get-top-users', (_event, bridgeId: string, limit: number = 10) => {
    return statsDb.getTopUsers(bridgeId, limit);
  });

  ipcMain.handle('stats-trigger-aggregation', () => {
    console.log('[Stats] Manual aggregation triggered via IPC');
    maintenanceJobs.runAggregationNow();
    return { success: true };
  });
}

/**
 * Sync available models to config
 */
async function syncAvailableModels(): Promise<void> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json() as { models?: any[] };
    const modelNames = (data.models || []).map(m => m.name);
    
    const config = configStore.getConfig();
    
    // If no models configured yet, add all
    if (!config.availableModels || config.availableModels.length === 0) {
      configStore.updateConfig({ availableModels: modelNames });
    } else {
      // Only add new models, keep user's selection for existing ones
      const newModels = modelNames.filter(name => !config.availableModels!.includes(name));
      if (newModels.length > 0) {
        configStore.updateConfig({
          availableModels: [...config.availableModels, ...newModels]
        });
      }
    }
    
    // Set default model if not set
    if (!config.defaultModel && modelNames.length > 0) {
      configStore.updateConfig({ defaultModel: modelNames[0] });
    }
  } catch (error) {
    console.error('[Config] Failed to sync available models:', error);
  }
}

/**
 * App lifecycle events
 */
app.whenReady().then(async () => {
  console.log('🚀 Relay Station starting...');
  
  try {
    // Initialize stats database
    console.log('[App] Initializing stats database...');
    await statsDb.initialize();

    // Start maintenance jobs (cleanup, aggregation)
    console.log('[App] Starting maintenance jobs...');
    maintenanceJobs.start();

    registerIPCHandlers();
    createWindow();
    createTray();

    // Start LLM detection
    console.log('[App] Starting LLM detection...');
    llmClient.startDetection(30000); // Check every 30s
    
    // Initial detection
    const providers = await llmClient.detectProviders();
    console.log(`[App] Found ${providers.length} LLM provider(s)`);
    
    // Start bundled Ollama (will fall back to system Ollama if not found)
    console.log('[App] Starting Ollama...');
    try {
      const ollamaStarted = await ollamaManager.start();
      if (ollamaStarted) {
        console.log('[App] Ollama started successfully');
      } else {
        console.warn('[App] Ollama failed to start - users may need to install manually');
      }
    } catch (err) {
      console.error('[App] Ollama startup error:', err);
    }

    // Load saved active LLM
    const savedLLM = configStore.getActiveLLM();
    if (savedLLM) {
      const available = providers.find(p => p.name === savedLLM.name && p.baseUrl === savedLLM.baseUrl);
      if (available) {
        llmClient.setActiveProvider(available);
        console.log('[App] Restored saved LLM:', savedLLM.name);
      }
    }

    // DEPRECATED: Bridge auto-start disabled
    // Bridges are being phased out in favor of RelayAI Operators
    /*
    // Check if bridge edge exists, but don't auto-create
    const existingBridgeEdge = configStore.getBridgeEdge();
    if (existingBridgeEdge) {
      console.log('[App] Found existing bridge edge:', existingBridgeEdge.id);
    } else {
      console.log('[App] No bridge edge found - user will need to create one');
    }

    // Auto-start bridge connection if edge exists
    if (existingBridgeEdge) {
      console.log('[App] Starting bridge...');
      await bridgeManager.reloadFromConfig();
      console.log('[App] Bridge manager started');
    }
    */
    
    updateTrayMenu();

    // Enable auto-launch (will be controlled by user settings later)
    // Wrap in try-catch to handle registry access errors gracefully
    try {
      const isEnabled = await autoLauncher.isEnabled();
      if (!isEnabled) {
        await autoLauncher.enable();
      }
    } catch (error) {
      console.warn('[App] Auto-launch setup failed (may require elevated permissions):', (error as Error).message);
    }

    // Periodic LLM status updates to renderer
    llmStatusCheckInterval = setInterval(() => {
      const currentProviders = llmClient.getDetectedProviders();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llm-status-change', currentProviders);
      }
    }, 5000); // Update UI every 5s

    console.log('✅ App ready');
    console.log('[App] Main window exists:', !!mainWindow);
    console.log('[App] All windows count:', BrowserWindow.getAllWindows().length);
  } catch (error) {
    console.error('❌ Fatal startup error:', error);
    app.quit();
  }
});

// Prevent app from quitting when all windows are closed (stay in tray)
app.on('window-all-closed', (event: Event) => {
  console.log('[App] window-all-closed event triggered, preventing quit');
  event.preventDefault();
});

app.on('before-quit', async () => {
  (app as any).isQuitting = true;
  
  console.log('[App] Shutting down...');
  
  // Stop maintenance jobs
  console.log('[App] Stopping maintenance jobs...');
  maintenanceJobs.stop();
  
  // End current session and close database
  console.log('[App] Closing stats database...');
  statsDb.endSession();
  statsDb.close();
  
  // Cleanup other services
  await ollamaManager.stop();
  llmClient.dispose();
  contextManager.dispose();
  bridgeManager.dispose();
  if (llmStatusCheckInterval) {
    clearInterval(llmStatusCheckInterval);
  }
  
  console.log('[App] Shutdown complete');
});

// macOS: Re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
console.log('[App] Single instance lock acquired:', gotTheLock);
if (!gotTheLock) {
  console.log('[App] Another instance is already running, exiting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window if user tries to launch again
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

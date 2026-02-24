/**
 * Ollama Manager
 * 
 * Manages the lifecycle of the bundled Ollama process:
 * - Finding/resolving bundled binary path
 * - Spawning Ollama on app startup
 * - Health monitoring and auto-restart
 * - Graceful shutdown on app quit
 * - Port conflict detection
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

const OLLAMA_PORT = 11434;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const STARTUP_TIMEOUT = 30000; // 30 seconds
const RESTART_DELAY = 5000; // 5 seconds after crash

interface OllamaStatus {
  running: boolean;
  version?: string;
  bundled: boolean; // true if using bundled binary, false if system
  pid?: number;
  uptime?: number; // milliseconds
  error?: string;
}

export class OllamaManager {
  private process: ChildProcess | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime: number | null = null;
  private binaryPath: string | null = null;
  private isBundled: boolean = false;
  private isShuttingDown: boolean = false;
  private autoRestart: boolean = true;

  constructor() {
    // Auto-restart by default, can be disabled via config later
    this.autoRestart = true;
  }

  /**
   * Find Ollama binary (bundled or system)
   */
  private async findOllamaBinary(): Promise<{ path: string; bundled: boolean } | null> {
    // Strategy 1: Try bundled binary first
    const platform = process.platform;
    let bundledPath: string;

    if (platform === 'win32') {
      bundledPath = join(process.resourcesPath, 'ollama', 'ollama.exe');
    } else {
      bundledPath = join(process.resourcesPath, 'ollama', 'ollama');
    }

    // In development, resources are in project root
    if (!app.isPackaged) {
      if (platform === 'win32') {
        bundledPath = join(app.getAppPath(), 'resources', 'ollama', 'win', 'ollama.exe');
      } else if (platform === 'darwin') {
        bundledPath = join(app.getAppPath(), 'resources', 'ollama', 'mac', 'ollama');
      } else {
        bundledPath = join(app.getAppPath(), 'resources', 'ollama', 'linux', 'ollama');
      }
    }

    if (existsSync(bundledPath)) {
      console.log('[OllamaManager] Found bundled binary:', bundledPath);
      return { path: bundledPath, bundled: true };
    }

    // Strategy 2: Check if system Ollama is available
    const systemPath = platform === 'win32' ? 'ollama.exe' : 'ollama';
    
    try {
      // Try to spawn with just the command name (relies on PATH)
      const testProcess = spawn(systemPath, ['--version'], { shell: true });
      
      await new Promise<void>((resolve, reject) => {
        testProcess.on('error', reject);
        testProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Exit code ${code}`));
          }
        });
        
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      console.log('[OllamaManager] Found system Ollama in PATH');
      return { path: systemPath, bundled: false };
    } catch (error) {
      console.log('[OllamaManager] System Ollama not found:', (error as Error).message);
    }

    console.error('[OllamaManager] No Ollama binary found (bundled or system)');
    return null;
  }

  /**
   * Check if Ollama is already running (externally)
   */
  private async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${OLLAMA_PORT}/api/version`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start Ollama process
   */
  async start(): Promise<boolean> {
    if (this.process) {
      console.log('[OllamaManager] Ollama already running');
      return true;
    }

    // Check if externally managed Ollama is already running
    const alreadyRunning = await this.isOllamaRunning();
    if (alreadyRunning) {
      console.log('[OllamaManager] External Ollama detected on port', OLLAMA_PORT);
      // Don't manage external process, but mark as available
      this.isBundled = false;
      this.startHealthMonitoring();
      return true;
    }

    // Find binary
    const binary = await this.findOllamaBinary();
    if (!binary) {
      console.error('[OllamaManager] Cannot start: No Ollama binary found');
      return false;
    }

    this.binaryPath = binary.path;
    this.isBundled = binary.bundled;

    console.log(`[OllamaManager] Starting Ollama from ${binary.bundled ? 'bundled' : 'system'} binary...`);

    try {
      // Spawn Ollama server
      this.process = spawn(this.binaryPath, ['serve'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          OLLAMA_HOST: `0.0.0.0:${OLLAMA_PORT}`,
        },
      });

      this.startTime = Date.now();

      // Log stdout/stderr
      this.process.stdout?.on('data', (data) => {
        console.log('[Ollama]', data.toString().trim());
      });

      this.process.stderr?.on('data', (data) => {
        console.error('[Ollama Error]', data.toString().trim());
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[OllamaManager] Process exited with code ${code} signal ${signal}`);
        this.process = null;
        this.startTime = null;

        // Auto-restart if not intentional shutdown
        if (this.autoRestart && !this.isShuttingDown) {
          console.log(`[OllamaManager] Auto-restarting in ${RESTART_DELAY}ms...`);
          setTimeout(() => {
            if (!this.isShuttingDown) {
              this.start();
            }
          }, RESTART_DELAY);
        }
      });

      // Wait for Ollama to be responsive
      const started = await this.waitForStartup();
      
      if (started) {
        console.log('[OllamaManager] Ollama started successfully');
        this.startHealthMonitoring();
        return true;
      } else {
        console.error('[OllamaManager] Ollama failed to start within timeout');
        this.stop();
        return false;
      }
    } catch (error) {
      console.error('[OllamaManager] Failed to spawn Ollama:', error);
      return false;
    }
  }

  /**
   * Wait for Ollama to respond to health checks
   */
  private async waitForStartup(): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < STARTUP_TIMEOUT) {
      try {
        const response = await fetch(`http://localhost:${OLLAMA_PORT}/api/version`, {
          method: 'GET',
        });
        
        if (response.ok) {
          return true;
        }
      } catch (error) {
        // Not ready yet, keep trying
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }

  /**
   * Start health check monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const running = await this.isOllamaRunning();
      
      if (!running && this.process) {
        console.warn('[OllamaManager] Health check failed, Ollama not responding');
        // Process exists but not responding - might be hung
        // Auto-restart will kick in via process exit handler
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop Ollama process
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (!this.process) {
      console.log('[OllamaManager] No process to stop');
      return;
    }

    console.log('[OllamaManager] Stopping Ollama...');

    // Try graceful shutdown first (SIGTERM)
    this.process.kill('SIGTERM');

    // Wait up to 10 seconds for graceful shutdown
    await Promise.race([
      new Promise<void>((resolve) => {
        this.process?.once('exit', () => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 10000)),
    ]);

    // Force kill if still running
    if (this.process && !this.process.killed) {
      console.log('[OllamaManager] Force killing Ollama process');
      this.process.kill('SIGKILL');
    }

    this.process = null;
    this.startTime = null;
    console.log('[OllamaManager] Ollama stopped');
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<OllamaStatus> {
    const running = await this.isOllamaRunning();

    if (!running) {
      return {
        running: false,
        bundled: this.isBundled,
        error: 'Ollama not responding',
      };
    }

    // Try to get version
    let version: string | undefined;
    try {
      const response = await fetch(`http://localhost:${OLLAMA_PORT}/api/version`);
      const data = await response.json() as { version?: string };
      version = data.version;
    } catch (error) {
      // Version not critical
    }

    return {
      running: true,
      version,
      bundled: this.isBundled,
      pid: this.process?.pid,
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
    };
  }

  /**
   * Restart Ollama
   */
  async restart(): Promise<boolean> {
    console.log('[OllamaManager] Restarting Ollama...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    return await this.start();
  }

  /**
   * Kill ALL ollama processes at the OS level and restart fresh.
   *
   * The normal eviction path (keep_alive:0 via /api/ps) only reaches runners that
   * Ollama's scheduler is still tracking. Orphaned runners from prior crashes or
   * from manually-killed sessions never appear in /api/ps, so they hold VRAM
   * indefinitely. This method uses taskkill / pkill to nuke everything, then
   * starts a clean Ollama instance.
   */
  async restartClean(): Promise<boolean> {
    console.log('[OllamaManager] Boot cleanup: killing all Ollama processes for clean VRAM state...');

    // Disable auto-restart so the exit handler doesn't race with us
    this.autoRestart = false;
    this.isShuttingDown = true;

    // Stop our managed process first (gracefully)
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>(resolve => {
        this.process?.once('exit', resolve);
        setTimeout(resolve, 5000);
      });
      this.process = null;
    }

    // Kill any remaining ollama processes at the OS level (orphaned runners, etc.)
    await new Promise<void>(resolve => {
      try {
        const killer = process.platform === 'win32'
          ? spawn('taskkill', ['/f', '/im', 'ollama.exe'], { shell: false, stdio: 'ignore' })
          : spawn('pkill', ['-f', 'ollama'], { stdio: 'ignore' });
        killer.on('exit', () => resolve());
        killer.on('error', () => resolve()); // command not found etc. — non-fatal
        setTimeout(resolve, 5000);
      } catch {
        resolve();
      }
    });
    console.log('[OllamaManager] Boot cleanup: all Ollama processes terminated');

    // Wait for port 11434 to be released
    const released = await this.waitForPortFree(5000);
    if (!released) {
      console.warn('[OllamaManager] Boot cleanup: port 11434 still busy after kill — proceeding anyway');
    } else {
      console.log('[OllamaManager] Boot cleanup: port 11434 free, starting fresh Ollama instance');
    }

    // Re-enable normal lifecycle and start fresh
    this.autoRestart = true;
    this.isShuttingDown = false;
    this.startTime = null;

    return this.start();
  }

  /**
   * Poll until port 11434 is not accepting connections (i.e. Ollama is gone).
   */
  private async waitForPortFree(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 400));
      const stillUp = await this.isOllamaRunning();
      if (!stillUp) return true;
    }
    return false;
  }

  /**
   * Set auto-restart behavior
   */
  setAutoRestart(enabled: boolean): void {
    this.autoRestart = enabled;
  }
}

// Singleton instance
export const ollamaManager = new OllamaManager();

import React, { useState, useEffect } from 'react';
import { OllamaSetup } from './components/OllamaSetup';
import { ModelManager } from './components/ModelManager';
import type { AppConfig, BridgeEdge, LLMProvider } from '../shared/types';

type Tab = 'dashboard' | 'models' | 'settings';

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [checkingOllama, setCheckingOllama] = useState(true);
  const [showCreateBridge, setShowCreateBridge] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Check Ollama status on mount
  useEffect(() => {
    checkOllama();
  }, []);

  const checkOllama = async () => {
    try {
      const status = await window.electronAPI.ollamaStatus();
      setOllamaReady(status.running);
      setCheckingOllama(false);
    } catch (error) {
      console.error('Failed to check Ollama:', error);
      setOllamaReady(false);
      setCheckingOllama(false);
    }
  };

  // Load initial data once Ollama is ready
  useEffect(() => {
    if (!ollamaReady) return;

    loadData();
    
    // Listen for LLM status changes
    window.electronAPI.onLLMStatusChange((providers) => {
      setLlmProviders(providers);
    });

    // Poll stats every 5 seconds
    const interval = setInterval(async () => {
      const newStats = await window.electronAPI.getStats();
      setStats(newStats);
    }, 5000);

    return () => clearInterval(interval);
  }, [ollamaReady]);

  const loadData = async () => {
    try {
      const [configData, providers, statsData] = await Promise.all([
        window.electronAPI.getConfig(),
        window.electronAPI.detectLLMs(),
        window.electronAPI.getStats(),
      ]);
      
      setConfig(configData);
      setLlmProviders(providers);
      setStats(statsData);
      setLoading(false);

      // Update bridge status based on connection
      if (configData?.bridgeEdge) {
        setBridgeStatus('connected'); // Simplified for now
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  const handleSetActiveLLM = async (provider: LLMProvider) => {
    try {
      await window.electronAPI.setActiveLLM(provider);
      await loadData();
    } catch (error) {
      console.error('Failed to set active LLM:', error);
    }
  };

  const handleUpdateSetting = async (key: keyof AppConfig, value: any) => {
    try {
      await window.electronAPI.updateConfig({ [key]: value });
      await loadData();
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const handleCreateBridgeEdge = async (label: string) => {
    try {
      const bridgeEdge = await window.electronAPI.createBridgeEdge(label);
      await loadData();
      setShowCreateBridge(false);
      setBridgeStatus('connected');
    } catch (error) {
      console.error('Failed to create bridge edge:', error);
    }
  };

  const handleDisconnectBridge = async () => {
    if (!confirm('Disconnect bridge? You can reconnect later.')) return;
    try {
      await window.electronAPI.disconnectBridge();
      await loadData();
      setBridgeStatus('disconnected');
    } catch (error) {
      console.error('Failed to disconnect bridge:', error);
    }
  };

  // Show Ollama setup if not ready
  if (checkingOllama) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-primary mx-auto mb-3"></div>
          <p className="text-muted-foreground text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!ollamaReady) {
    return (
      <OllamaSetup
        onComplete={() => {
          setOllamaReady(true);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-primary mx-auto mb-3"></div>
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with Tabs */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-xl font-semibold">Relay Station</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Self-Hosted AI Infrastructure
              </p>
            </div>
          </div>
          
          <nav className="flex gap-1 -mb-px">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'models'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              Models
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'models' ? (
          <ModelManager />
        ) : activeTab === 'settings' ? (
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Settings</h2>
              <p className="text-muted-foreground">Settings panel coming soon...</p>
            </div>
          </div>
        ) : (
          <DashboardView
            config={config}
            llmProviders={llmProviders}
            stats={stats}
            bridgeStatus={bridgeStatus}
            showCreateBridge={showCreateBridge}
            onSetShowCreateBridge={setShowCreateBridge}
            onHandleSetActiveLLM={handleSetActiveLLM}
            onHandleUpdateSetting={handleUpdateSetting}
            onHandleCreateBridgeEdge={handleCreateBridgeEdge}
            onHandleDisconnectBridge={handleDisconnectBridge}
          />
        )}
      </div>
    </div>
  );
}

// Extract Dashboard to separate component to keep it clean
function DashboardView({
  config,
  llmProviders,
  stats,
  bridgeStatus,
  showCreateBridge,
  onSetShowCreateBridge,
  onHandleSetActiveLLM,
  onHandleUpdateSetting,
  onHandleCreateBridgeEdge,
  onHandleDisconnectBridge,
}: {
  config: AppConfig | null;
  llmProviders: LLMProvider[];
  stats: any;
  bridgeStatus: string;
  showCreateBridge: boolean;
  onSetShowCreateBridge: (show: boolean) => void;
  onHandleSetActiveLLM: (provider: LLMProvider) => void;
  onHandleUpdateSetting: (key: keyof AppConfig, value: any) => void;
  onHandleCreateBridgeEdge: (label: string) => void;
  onHandleDisconnectBridge: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-1">
            Relay LLM Bridge
          </h1>
          <p className="text-sm text-text-secondary">
            Share your local AI models securely through Relay messaging
          </p>
        </header>

        {/* Bridge Identity Section */}
        <section className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-900 rounded-lg p-5 mb-4">
          <h2 className="text-base font-medium text-text-primary mb-4">
            Bridge Identity
          </h2>
          
          {config?.bridgeEdge ? (
            <div>
              <div className="bg-white dark:bg-gray-900 rounded-md p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      bridgeStatus === 'connected' ? 'bg-success' :
                      bridgeStatus === 'connecting' ? 'bg-warning animate-pulse' :
                      bridgeStatus === 'error' ? 'bg-error' :
                      'bg-border'
                    }`}></div>
                    <span className="text-sm font-medium text-text-primary">
                      {bridgeStatus === 'connected' ? 'Connected' :
                       bridgeStatus === 'connecting' ? 'Connecting...' :
                       bridgeStatus === 'error' ? 'Connection Error' :
                       'Disconnected'}
                    </span>
                  </div>
                  <span className="text-xs text-text-tertiary">Active since {new Date(config.bridgeEdge.createdAt).toLocaleDateString()}</span>
                </div>
                
                <div className="mb-3">
                  <label className="text-xs font-medium text-text-secondary block mb-1">Bridge Edge ID (Share this with clients)</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-background px-3 py-2 rounded border border-border text-text-primary">
                      {config.bridgeEdge.id}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(config.bridgeEdge!.id);
                        alert('Bridge Edge ID copied!');
                      }}
                      className="px-3 py-2 bg-primary text-white text-sm rounded-md hover:bg-primary-hover transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">
                    Give this ID to anyone you want to grant access to your local models
                  </p>
                </div>

                <div className="pt-3 border-t border-border">
                  <button
                    onClick={onHandleDisconnectBridge}
                    className="px-3 py-1.5 bg-error/10 text-error text-sm rounded-md hover:bg-error/20 transition-colors"
                  >
                    Disconnect Bridge
                  </button>
                </div>
              </div>

              <div className="bg-purple-100 dark:bg-purple-950/50 rounded-md p-3 text-sm text-text-primary">
                <p className="font-medium mb-1">✨ Your bridge is ready!</p>
                <p className="text-xs text-text-secondary">
                  Share your Bridge Edge ID above with clients. Manage who can access your models in the Client Access section below.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary mb-4">
                No bridge identity created yet. Create one to start sharing your local AI models.
              </p>
              <button
                onClick={() => setShowCreateBridge(true)}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm rounded-md hover:from-purple-700 hover:to-pink-700 transition-colors font-medium"
              >
                Create Bridge Edge
              </button>
              <p className="text-xs text-text-tertiary mt-3">
                This creates a secure edge identity for your bridge on Relay servers
              </p>
            </div>
          )}
        </section>

        {/* LLM Provider Section */}
        <section className="bg-background-elevated border border-border rounded-lg p-5 mb-4">
          <h2 className="text-base font-medium text-text-primary mb-4">
            LLM Providers
          </h2>
          
          {llmProviders.length === 0 ? (
            <div className="bg-warning/10 border border-warning/20 rounded-md p-4">
              <p className="text-sm font-medium text-warning mb-1">No LLM Providers Detected</p>
              <p className="text-sm text-text-secondary mb-3">
                Install Ollama or LM Studio and ensure the local server is running.
              </p>
              <button 
                onClick={() => window.electronAPI.detectLLMs()}
                className="px-3 py-1.5 bg-background-active text-text-primary text-sm rounded-md hover:bg-background-hover transition-colors"
              >
                Retry Detection
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {llmProviders.map((provider) => {
                const isActive = config?.activeLLM?.name === provider.name && config?.activeLLM?.baseUrl === provider.baseUrl;
                return (
                  <div
                    key={`${provider.name}-${provider.baseUrl}`}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      isActive
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border hover:border-border-subtle hover:bg-background-hover'
                    }`}
                    onClick={() => handleSetActiveLLM(provider)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-text-primary">
                            {provider.name === 'ollama' ? 'Ollama' : 
                             provider.name === 'lm-studio' ? 'LM Studio' : 
                             'Custom Provider'}
                          </span>
                          {isActive && (
                            <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-md">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-text-tertiary">{provider.baseUrl}</p>
                        <p className="text-xs text-text-secondary mt-1">
                          {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-success' : 'bg-border'}`}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Client Access Management */}
        <section className="bg-background-elevated border border-border rounded-lg p-5 mb-4">
          <h2 className="text-base font-medium text-text-primary mb-4">
            Client Access Management
          </h2>
          
          {!config?.bridgeEdge ? (
            <div className="text-center py-8 text-text-tertiary">
              <p className="text-sm">Create a bridge edge first to manage client access</p>
            </div>
          ) : (
            <div>
              <div className="bg-background-hover border border-border rounded-md p-4 mb-4">
                <p className="text-sm text-text-primary mb-2">
                  <strong>Access Mode:</strong> Open (All clients allowed)
                </p>
                <p className="text-xs text-text-secondary">
                  Currently, all clients with your Bridge Edge ID can connect. Access control and whitelisting will be available in a future update.
                </p>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-md p-3 text-sm">
                <p className="font-medium text-text-primary mb-1">Coming Soon</p>
                <ul className="text-xs text-text-secondary space-y-1">
                  <li>• Whitelist/blacklist specific client edges</li>
                  <li>• Set rate limits per client</li>
                  <li>• Monitor usage and request logs</li>
                  <li>• Revoke access for specific clients</li>
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Stats Section */}
        {stats && (
          <section className="bg-background-elevated border border-border rounded-lg p-5 mb-4">
            <h2 className="text-base font-medium text-text-primary mb-4">
              Statistics
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-background rounded-md">
                <div className="text-xl font-semibold text-text-primary">{stats.messageCount || 0}</div>
                <div className="text-xs text-text-secondary mt-1">Messages</div>
              </div>
              <div className="text-center p-3 bg-background rounded-md">
                <div className="text-xl font-semibold text-text-primary">{stats.activeConversations || 0}</div>
                <div className="text-xs text-text-secondary mt-1">Conversations</div>
              </div>
              <div className="text-center p-3 bg-background rounded-md">
                <div className="text-xl font-semibold text-text-primary">{Math.floor(stats.uptime / 60) || 0}m</div>
                <div className="text-xs text-text-secondary mt-1">Uptime</div>
              </div>
              <div className="text-center p-3 bg-background rounded-md">
                <div className="text-xl font-semibold text-text-primary">{Object.values(stats.bridgeStatuses || {}).filter((s: any) => s === 'connected').length}</div>
                <div className="text-xs text-text-secondary mt-1">Connected</div>
              </div>
            </div>
          </section>
        )}

        {/* Settings Section */}
        <section className="bg-background-elevated border border-border rounded-lg p-5">
          <h2 className="text-base font-medium text-text-primary mb-4">
            Settings
          </h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-primary rounded border-border focus:ring-primary focus:ring-offset-0"
                checked={config?.autoLaunch || false}
                onChange={(e) => handleUpdateSetting('autoLaunch', e.target.checked)}
              />
              <span className="text-sm text-text-primary">Launch on system startup</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-primary rounded border-border focus:ring-primary focus:ring-offset-0"
                checked={config?.notifications || false}
                onChange={(e) => handleUpdateSetting('notifications', e.target.checked)}
              />
              <span className="text-sm text-text-primary">Desktop notifications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-primary rounded border-border focus:ring-primary focus:ring-offset-0"
                checked={config?.autoReconnect || false}
                onChange={(e) => handleUpdateSetting('autoReconnect', e.target.checked)}
              />
              <span className="text-sm text-text-primary">Auto-reconnect bridges</span>
            </label>
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-text-tertiary">
          Relay LLM Bridge v1.0.0
        </footer>
      </div>

      {/* Create Bridge Modal */}
      {showCreateBridge && (
        <CreateBridgeModal 
          onClose={() => onSetShowCreateBridge(false)}
          onCreate={onHandleCreateBridgeEdge}
        />
      )}
    </div>
  );
}

// Create Bridge Modal Component
function CreateBridgeModal({ onClose, onCreate }: { 
  onClose: () => void; 
  onCreate: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!label.trim()) {
      setError('Please enter a label for your bridge');
      return;
    }

    setCreating(true);
    try {
      await onCreate(label);
    } catch (err: any) {
      setError(err.message || 'Failed to create bridge edge');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Create Bridge Edge</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bridge Label *
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., My Home AI Bridge"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              required
              disabled={creating}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Give your bridge a friendly name (you can change this later)
            </p>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900 dark:text-white mb-1">What happens next:</p>
            <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
              <li>• Bridge generates cryptographic keys</li>
              <li>• Creates edge identity on Relay servers</li>
              <li>• Connects via SSE to receive messages</li>
              <li>• You get a Bridge Edge ID to share with clients</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Bridge Edge'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;

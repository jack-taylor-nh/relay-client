/**
 * @deprecated Bridges are being phased out in favor of RelayAI Operators.
 * This component is kept for backward compatibility only.
 * Use RelayAIOperator component instead for connecting to the Relay network.
 */

import { useState, useEffect, useRef } from 'react';
import type { AppConfig } from '../../shared/types';
import StatsOverview from './StatsOverview';
import ConfigurationTab from './ConfigurationTab';
import AnalyticsTab from './AnalyticsTab';
import AccessControlTab from './AccessControlTab';

interface BridgeLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

interface BridgeManagerProps {
  config: AppConfig | null;
  onReload: () => void;
}

type TabType = 'overview' | 'configuration' | 'stats' | 'analytics' | 'access';

export function BridgeManager({ config, onReload }: BridgeManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isCreating, setIsCreating] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [bridgeLabel, setBridgeLabel] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [createdEdge, setCreatedEdge] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<BridgeLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<string>('disconnected');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial bridge status
  useEffect(() => {
    const fetchStatus = async () => {
      if (config?.bridgeEdge) {
        const status = await window.electronAPI.getBridgeStatus?.();
        if (status) setBridgeStatus(status);
      }
    };
    fetchStatus();
  }, [config?.bridgeEdge]);

  // Listen for bridge status changes
  useEffect(() => {
    const handleStatusChange = (status: string) => {
      setBridgeStatus(status);
    };

    window.electronAPI.onBridgeStatusChange?.(handleStatusChange);
  }, []);

  // Listen for bridge logs
  useEffect(() => {
    const handleLog = (log: BridgeLog) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        // Keep last 100 logs
        return newLogs.slice(-100);
      });
    };

    window.electronAPI.onBridgeLog?.(handleLog);
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (showConsole) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showConsole]);

  const clearLogs = () => {
    setLogs([]);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const getLevelColor = (level: 'info' | 'warn' | 'error') => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'connected':
        return {
          color: 'text-green-600 dark:text-green-400',
          dotColor: 'bg-green-500',
          label: 'Connected',
          description: 'SSE stream active, ready to receive messages',
          icon: '✓',
        };
      case 'connecting':
        return {
          color: 'text-yellow-600 dark:text-yellow-400',
          dotColor: 'bg-yellow-500',
          label: 'Connecting',
          description: 'Establishing SSE connection to server...',
          icon: '↻',
          pulse: true,
        };
      case 'reconnecting':
        return {
          color: 'text-orange-600 dark:text-orange-400',
          dotColor: 'bg-orange-500',
          label: 'Reconnecting',
          description: 'Connection lost. Attempting to reconnect...',
          icon: '↻',
          pulse: true,
        };
      case 'failed':
        return {
          color: 'text-red-600 dark:text-red-400',
          dotColor: 'bg-red-500',
          label: 'Failed',
          description: 'Connection failed after multiple attempts. Check console for details.',
          icon: '✕',
        };
      case 'error':
        // Legacy support - map to failed
        return {
          color: 'text-red-600 dark:text-red-400',
          dotColor: 'bg-red-500',
          label: 'Error',
          description: 'Connection error occurred. Check console for details.',
          icon: '✕',
        };
      case 'disconnected':
      default:
        return {
          color: 'text-muted-foreground',
          dotColor: 'bg-muted-foreground',
          label: 'Disconnected',
          description: 'SSE stream not connected',
          icon: '○',
        };
    }
  };

  const handleCreateBridge = async () => {
    if (!bridgeLabel.trim()) {
      alert('Please enter a bridge label');
      return;
    }

    setIsCreating(true);
    try {
      const edge = await window.electronAPI.createBridgeEdge(bridgeLabel.trim());
      setCreatedEdge(edge);
      await onReload();
    } catch (error) {
      console.error('Failed to create bridge:', error);
      alert('Failed to create bridge. Please try again.');
      setIsCreating(false);
      setShowCreateModal(false);
    }
  };

  const handleOpenEditModal = () => {
    setEditLabel(config?.bridgeEdge?.label || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editLabel.trim()) {
      alert('Please enter a bridge label');
      return;
    }

    setIsSaving(true);
    try {
      await window.electronAPI.updateBridgeLabel?.(editLabel.trim());
      await onReload();
      setShowEditModal(false);
    } catch (error) {
      console.error('Failed to update bridge:', error);
      alert('Failed to update bridge. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setBridgeLabel('');
    setCreatedEdge(null);
    setIsCreating(false);
  };

  const handleDisconnectBridge = async () => {
    try {
      await window.electronAPI.disconnectBridge();
      await onReload();
      setShowDisconnectConfirm(false);
    } catch (error) {
      console.error('Failed to disconnect bridge:', error);
      alert('Failed to disconnect bridge. Please try again.');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Bridges</h1>
        <p className="text-muted-foreground">Manage your Relay network connections</p>
      </div>

      {/* Tab Navigation */}
      {config?.bridgeEdge && (
        <div className="border-b border-border">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === 'overview'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Overview
              {activeTab === 'overview' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('configuration')}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === 'configuration'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Configuration
              {activeTab === 'configuration' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === 'stats'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Statistics
              {activeTab === 'stats' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === 'analytics'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Analytics
              {activeTab === 'analytics' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('access')}
              className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
                activeTab === 'access'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Access
              {activeTab === 'access' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'stats' ? (
        <StatsOverview />
      ) : activeTab === 'configuration' ? (
        <ConfigurationTab />
      ) : activeTab === 'analytics' ? (
        <AnalyticsTab />
      ) : activeTab === 'access' ? (
        <AccessControlTab />
      ) : (
        <>
      {/* Active Bridge Card */}
      {config?.bridgeEdge ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`relative w-3 h-3`}>
                  {getStatusDisplay(bridgeStatus).pulse && (
                    <span className={`absolute inline-flex h-full w-full rounded-full ${getStatusDisplay(bridgeStatus).dotColor} opacity-75 animate-ping`}></span>
                  )}
                  <div className={`relative w-3 h-3 ${getStatusDisplay(bridgeStatus).dotColor} rounded-full ${bridgeStatus === 'connected' ? 'animate-pulse' : ''}`}></div>
                </div>
                <h2 className="text-lg font-semibold">Active Bridge</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {getStatusDisplay(bridgeStatus).icon} {getStatusDisplay(bridgeStatus).description}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleOpenEditModal}
                className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="px-4 py-2 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded-lg text-sm font-medium transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          {/* Bridge Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">RELAY LLM API KEY</p>
              <div className="border border-border bg-muted rounded p-2 flex items-center justify-between gap-2">
                <p className="text-xs font-mono break-all flex-1">{config.bridgeEdge.id}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(config.bridgeEdge.id);
                    // TODO: Show toast notification
                  }}
                  className="px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors flex-shrink-0"
                >
                  Copy
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">Share this key with Relay clients to connect</p>
            </div>

            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">LABEL</p>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-xs">{config.bridgeEdge.label || 'Untitled Bridge'}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">LOCAL MODELS</p>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-xs font-medium">{config.availableModels?.length || 0} models</p>
                {config.availableModels && config.availableModels.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {config.availableModels.slice(0, 3).map(model => (
                      <p key={model} className="text-[10px] text-muted-foreground font-mono">• {model}</p>
                    ))}
                    {config.availableModels.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+ {config.availableModels.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">CONNECTION STATUS</p>
              <div className="border border-border bg-muted rounded p-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-base ${getStatusDisplay(bridgeStatus).color}`}>
                    {getStatusDisplay(bridgeStatus).icon}
                  </span>
                  <p className={`text-xs font-medium ${getStatusDisplay(bridgeStatus).color}`}>
                    {getStatusDisplay(bridgeStatus).label}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {getStatusDisplay(bridgeStatus).description}
                </p>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">CAPABILITIES</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px] font-medium">
                Text Generation
              </span>
              <span className="px-2 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px] font-medium">
                Streaming
              </span>
              <span className="px-2 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px] font-medium">
                Context Memory
              </span>
              {config.availableModels?.some(m => m.includes('vision') || m.includes('vl')) && (
                <span className="px-2 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px] font-medium">
                  Vision
                </span>
              )}
            </div>
          </div>

          {/* Console/Logs */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowConsole(!showConsole)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showConsole ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                CONSOLE
                <span className="text-muted-foreground/70 font-normal">({logs.length} events)</span>
              </button>
              {logs.length > 0 && (
                <button
                  onClick={clearLogs}
                  className="text-[10px] px-2 py-1 border border-border bg-card hover:bg-accent rounded text-muted-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {showConsole && (
              <div className="border border-border bg-muted rounded-lg overflow-hidden">
                <div className="h-64 overflow-y-auto font-mono text-[10px] p-3 space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-muted-foreground/50 text-center py-8">
                      No logs yet. Waiting for bridge activity...
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-muted-foreground/50 shrink-0">{formatTimestamp(log.timestamp)}</span>
                        <span className={`shrink-0 font-medium ${getLevelColor(log.level)}`}>{log.level.toUpperCase()}</span>
                        <span className="text-foreground">{log.message}</span>
                        {log.details && (
                          <span className="text-muted-foreground/70">{JSON.stringify(log.details)}</span>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No Bridge - Setup Card */
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">No Active Bridge</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create a bridge to connect your local AI models to the Relay network and enable remote access
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 border border-border bg-card hover:bg-accent text-foreground rounded-lg font-medium transition-colors"
          >
            Create Bridge Edge
          </button>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 text-left">
            <div className="border border-border bg-muted rounded-lg p-4">
              <div className="w-8 h-8 border border-border bg-card rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-medium text-sm mb-1">Secure</h3>
              <p className="text-xs text-muted-foreground">End-to-end encrypted</p>
            </div>

            <div className="border border-border bg-muted rounded-lg p-4">
              <div className="w-8 h-8 border border-border bg-card rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-sm mb-1">Fast</h3>
              <p className="text-xs text-muted-foreground">Low-latency streaming</p>
            </div>

            <div className="border border-border bg-muted rounded-lg p-4">
              <div className="w-8 h-8 border border-border bg-card rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-medium text-sm mb-1">Private</h3>
              <p className="text-xs text-muted-foreground">Your data stays local</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Bridge Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-xl w-full">
            {!createdEdge ? (
              <>
                <h3 className="text-lg font-semibold mb-2">Create Bridge Edge</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  A bridge edge connects your local LLM to the Relay network. Give it a memorable name.
                </p>
                
                <div className="mb-6">
                  <label className="block text-xs font-medium text-muted-foreground mb-2">BRIDGE LABEL</label>
                  <input
                    type="text"
                    value={bridgeLabel}
                    onChange={(e) => setBridgeLabel(e.target.value)}
                    placeholder="e.g., Home AI Assistant"
                    className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleCloseCreateModal}
                    disabled={isCreating}
                    className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateBridge}
                    disabled={isCreating || !bridgeLabel.trim()}
                    className="px-4 py-2 border border-border bg-card hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-foreground border-t-transparent"></div>
                        Creating...
                      </span>
                    ) : (
                      'Create Bridge'
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Bridge Created Successfully!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your bridge is now active and ready to receive connections
                  </p>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1.5">BRIDGE EDGE ID</label>
                    <div className="border border-border bg-muted rounded-lg p-3 flex items-center justify-between">
                      <code className="text-xs font-mono break-all flex-1">{createdEdge.id}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdEdge.id);
                          alert('Edge ID copied to clipboard!')
                        }}
                        className="ml-3 px-2 py-1 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors flex-shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="border border-border bg-muted rounded-lg p-4">
                    <h4 className="text-xs font-semibold mb-2">Next Steps:</h4>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Copy the Edge ID above</li>
                      <li>Open your Relay extension or mobile app</li>
                      <li>Add a new LLM bridge edge using this ID</li>
                      <li>Start chatting with your local AI!</li>
                    </ol>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleCloseCreateModal}
                    className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* Edit Bridge Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Edit Bridge</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Update your bridge label
            </p>
            
            <div className="mb-6">
              <label className="block text-xs font-medium text-muted-foreground mb-2">BRIDGE LABEL</label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="e.g., Home AI Assistant"
                className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border"
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={isSaving}
                className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || !editLabel.trim()}
                className="px-4 py-2 border border-border bg-card hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-foreground border-t-transparent"></div>
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Disconnect Bridge?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will disconnect your local models from the Relay network. Remote users will no longer be able to access this bridge.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnectBridge}
                className="px-4 py-2 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded-lg text-sm font-medium transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

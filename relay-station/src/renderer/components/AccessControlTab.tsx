/**
 * Access Control Tab Component
 * Manage bridge access via API keys
 */

import { useEffect, useState } from 'react';

interface APIKey {
  id: string;
  label: string;
  key: string;
  createdAt: number;
  lastUsed?: number;
  requestCount: number;
  tokensUsed: number;
  rateLimit?: {
    requestsPerHour?: number;
    tokensPerDay?: number;
  };
}

type AccessMode = 'public' | 'private' | 'hidden';

export default function AccessControlTab() {
  const [accessMode, setAccessMode] = useState<AccessMode>('public');
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [generatedKey, setGeneratedKey] = useState<{ id: string; key: string } | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  
  // Global rate limits (for public mode)
  const [globalRequestsPerHour, setGlobalRequestsPerHour] = useState<number | ''>('');
  const [globalTokensPerDay, setGlobalTokensPerDay] = useState<number | ''>('');
  const [savingGlobalLimits, setSavingGlobalLimits] = useState(false);
  
  // Per-key rate limit editing
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editRequestsPerHour, setEditRequestsPerHour] = useState<number | ''>('');
  const [editTokensPerDay, setEditTokensPerDay] = useState<number | ''>('');

  useEffect(() => {
    loadAccessControl();
  }, []);

  const loadAccessControl = async () => {
    try {
      setLoading(true);
      const config = await window.electronAPI.getConfig();
      
      setAccessMode((config.accessControl || 'public') as AccessMode);
      
      // Load global rate limits
      if (config.rateLimit) {
        setGlobalRequestsPerHour(config.rateLimit.requestsPerHour || '');
        setGlobalTokensPerDay(config.rateLimit.tokensPerDay || '');
      }
      
      // Load API keys
      const keys = await window.electronAPI.getAPIKeys?.() || [];
      setApiKeys(keys);
    } catch (err) {
      console.error('[AccessControlTab] Failed to load access control:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: AccessMode) => {
    try {
      setSavingMode(true);
      await window.electronAPI.updateConfig({ accessControl: mode });
      setAccessMode(mode);
    } catch (err) {
      console.error('[AccessControlTab] Failed to update access mode:', err);
    } finally {
      setSavingMode(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyLabel.trim()) {
      alert('Please enter a label for the API key');
      return;
    }

    try {
      setGeneratingKey(true);
      const result = await window.electronAPI.generateAPIKey?.(newKeyLabel.trim());
      if (result) {
        setGeneratedKey(result);
        setNewKeyLabel('');
        await loadAccessControl(); // Refresh list
      }
    } catch (err) {
      console.error('[AccessControlTab] Failed to generate API key:', err);
      alert('Failed to generate API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
      return;
    }

    try {
      await window.electronAPI.revokeAPIKey?.(keyId);
      await loadAccessControl(); // Refresh list
    } catch (err) {
      console.error('[AccessControlTab] Failed to revoke API key:', err);
      alert('Failed to revoke API key');
    }
  };

  const handleCopyKey = (key: string, keyId: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleSaveGlobalLimits = async () => {
    try {
      setSavingGlobalLimits(true);
      
      const rateLimit = {
        requestsPerHour: typeof globalRequestsPerHour === 'number' ? globalRequestsPerHour : undefined,
        tokensPerDay: typeof globalTokensPerDay === 'number' ? globalTokensPerDay : undefined,
      };
      
      await window.electronAPI.updateConfig({ rateLimit });
      await loadAccessControl();
    } catch (err) {
      console.error('[AccessControlTab] Failed to save global rate limits:', err);
      alert('Failed to save global rate limits');
    } finally {
      setSavingGlobalLimits(false);
    }
  };

  const handleStartEditKeyLimits = (key: APIKey) => {
    setEditingKeyId(key.id);
    setEditRequestsPerHour(key.rateLimit?.requestsPerHour || '');
    setEditTokensPerDay(key.rateLimit?.tokensPerDay || '');
  };

  const handleCancelEditKeyLimits = () => {
    setEditingKeyId(null);
    setEditRequestsPerHour('');
    setEditTokensPerDay('');
  };

  const handleSaveKeyLimits = async (keyId: string) => {
    try {
      const rateLimit = {
        requestsPerHour: typeof editRequestsPerHour === 'number' ? editRequestsPerHour : undefined,
        tokensPerDay: typeof editTokensPerDay === 'number' ? editTokensPerDay : undefined,
      };
      
      await window.electronAPI.updateAPIKeyLimits?.(keyId, rateLimit);
      await loadAccessControl();
      setEditingKeyId(null);
      setEditRequestsPerHour('');
      setEditTokensPerDay('');
    } catch (err) {
      console.error('[AccessControlTab] Failed to update key limits:', err);
      alert('Failed to update key limits');
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeSince = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
          <span>Loading access control...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold mb-2">Access Control</h2>
        <p className="text-muted-foreground">
          Control who can use your bridge and manage API keys
        </p>
      </div>

      {/* Access Mode Selection */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Access Mode</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Public Mode */}
          <button
            onClick={() => handleModeChange('public')}
            disabled={savingMode}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              accessMode === 'public'
                ? 'border-green-500 bg-green-500/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h4 className="font-semibold">Public</h4>
              </div>
              {accessMode === 'public' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/20 text-green-500">
                  Active
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Anyone can use this bridge. No authentication required. Can be listed on marketplace.
            </p>
          </button>

          {/* Private Mode */}
          <button
            onClick={() => handleModeChange('private')}
            disabled={savingMode}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              accessMode === 'private'
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <h4 className="font-semibold">Private</h4>
              </div>
              {accessMode === 'private' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500">
                  Active
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Requires valid API key. Not listed on marketplace. You control who has access.
            </p>
          </button>

          {/* Hidden Mode */}
          <button
            onClick={() => handleModeChange('hidden')}
            disabled={savingMode}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              accessMode === 'hidden'
                ? 'border-red-500 bg-red-500/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
                <h4 className="font-semibold">Hidden</h4>
              </div>
              {accessMode === 'hidden' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/20 text-red-500">
                  Active
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Bridge is offline. All requests are ignored. Use when you want to disconnect temporarily.
            </p>
          </button>
        </div>
      </div>

      {/* Global Rate Limits (only show for public mode) */}
      {accessMode === 'public' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Global Rate Limits</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set rate limits that apply to all incoming requests in public mode.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="global-requests" className="block text-sm font-medium mb-2">
                Requests per Hour
              </label>
              <input
                id="global-requests"
                type="number"
                min="0"
                placeholder="Leave empty for unlimited"
                value={globalRequestsPerHour}
                onChange={(e) => setGlobalRequestsPerHour(e.target.value ? parseInt(e.target.value) : '')}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            
            <div>
              <label htmlFor="global-tokens" className="block text-sm font-medium mb-2">
                Tokens per Day
              </label>
              <input
                id="global-tokens"
                type="number"
                min="0"
                placeholder="Leave empty for unlimited"
                value={globalTokensPerDay}
                onChange={(e) => setGlobalTokensPerDay(e.target.value ? parseInt(e.target.value) : '')}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            
            <button
              onClick={handleSaveGlobalLimits}
              disabled={savingGlobalLimits}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {savingGlobalLimits ? 'Saving...' : 'Save Limits'}
            </button>
          </div>
        </div>
      )}

      {/* API Keys Section (only show for private mode) */}
      {accessMode === 'private' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">API Keys</h3>
            <button
              onClick={() => {
                setShowGenerateModal(true);
                setGeneratedKey(null);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Generate New Key
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-muted-foreground mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="text-muted-foreground mb-2">No API keys yet</p>
              <p className="text-sm text-muted-foreground">
                Generate a key to allow specific users to access your bridge
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="border border-border rounded-lg p-4 hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                        </svg>
                        <h4 className="font-semibold">{key.label}</h4>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-xs bg-background px-2 py-1 rounded border border-border">
                          {key.key}
                        </code>
                        <button
                          onClick={() => handleCopyKey(key.key, key.id)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          {copiedKeyId === key.id ? (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {formatDate(key.createdAt)}</span>
                        <span>•</span>
                        <span>Last Used: {formatTimeSince(key.lastUsed)}</span>
                        <span>•</span>
                        <span>Requests: {key.requestCount.toLocaleString()}</span>
                        <span>•</span>
                        <span>Tokens: {key.tokensUsed.toLocaleString()}</span>
                      </div>

                      {key.rateLimit && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          Limits: 
                          {key.rateLimit.requestsPerHour && (
                            <span>{key.rateLimit.requestsPerHour} req/hr</span>
                          )}
                          {key.rateLimit.tokensPerDay && (
                            <>
                              <span>•</span>
                              <span>{key.rateLimit.tokensPerDay.toLocaleString()} tokens/day</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditKeyLimits(key)}
                        className="text-primary hover:text-primary/80 p-2"
                        title="Edit rate limits"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        className="text-red-500 hover:text-red-400 p-2"
                        title="Revoke key"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Rate Limit Editor */}
                  {editingKeyId === key.id && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <h5 className="text-sm font-semibold mb-3">Edit Rate Limits</h5>
                      <div className="space-y-3">
                        <div>
                          <label htmlFor={`key-requests-${key.id}`} className="block text-xs font-medium mb-1">
                            Requests per Hour
                          </label>
                          <input
                            id={`key-requests-${key.id}`}
                            type="number"
                            min="0"
                            placeholder="Leave empty for unlimited"
                            value={editRequestsPerHour}
                            onChange={(e) => setEditRequestsPerHour(e.target.value ? parseInt(e.target.value) : '')}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>
                        
                        <div>
                          <label htmlFor={`key-tokens-${key.id}`} className="block text-xs font-medium mb-1">
                            Tokens per Day
                          </label>
                          <input
                            id={`key-tokens-${key.id}`}
                            type="number"
                            min="0"
                            placeholder="Leave empty for unlimited"
                            value={editTokensPerDay}
                            onChange={(e) => setEditTokensPerDay(e.target.value ? parseInt(e.target.value) : '')}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                          />
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveKeyLimits(key.id)}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEditKeyLimits}
                            className="px-3 py-1.5 bg-background border border-border rounded-lg hover:bg-accent transition-colors text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1">How API Keys Work</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Public Mode:</strong> No authentication needed. Anyone can send messages to your bridge.</p>
              <p>• <strong>Private Mode:</strong> Users must include an API key in their messages. Generate keys here and share them with trusted users.</p>
              <p>• <strong>Hidden Mode:</strong> Bridge stops responding to all messages. Use when you want to go offline temporarily.</p>
              <p className="mt-2">
                <strong>Note:</strong> In private mode, users include the key in their message as: <code className="bg-background px-1 rounded">X-Relay-API-Key: your_key_here</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Key Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4">
            {generatedKey ? (
              // Show generated key
              <div>
                <h3 className="text-lg font-semibold mb-4">API Key Generated</h3>
                <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Copy this key now - you won&apos;t be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background px-2 py-1 rounded border border-border flex-1 break-all">
                      {generatedKey.key}
                    </code>
                    <button
                      onClick={() => handleCopyKey(generatedKey.key, generatedKey.id)}
                      className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 transition-colors"
                    >
                      {copiedKeyId === generatedKey.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowGenerateModal(false);
                    setGeneratedKey(null);
                  }}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              // Input label
              <div>
                <h3 className="text-lg font-semibold mb-4">Generate New API Key</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Key Label
                  </label>
                  <input
                    type="text"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="e.g., Production App, Test Client"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Give this key a descriptive name so you can identify it later
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowGenerateModal(false);
                      setNewKeyLabel('');
                    }}
                    className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateKey}
                    disabled={generatingKey || !newKeyLabel.trim()}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingKey ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

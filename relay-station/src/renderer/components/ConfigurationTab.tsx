/**
 * Configuration Tab Component
 * Allows operators to configure bridge settings like system prompt and model
 */

import { useEffect, useState } from 'react';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';

export default function ConfigurationTab() {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultModel, setDefaultModel] = useState(''); // Currently loaded model
  const [selectedModel, setSelectedModel] = useState(''); // Model selected in dropdown
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ originalConfig, setOriginalConfig] = useState({ systemPrompt: '', defaultModel: '', streamResponses: true, chunkSize: 10 });
  
  // Streaming settings
  const [streamResponses, setStreamResponses] = useState(true);
  const [chunkSize, setChunkSize] = useState(10);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showModelLoadSuccess, setShowModelLoadSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  // Track changes (system prompt and streaming settings)
  useEffect(() => {
    const changed = systemPrompt !== originalConfig.systemPrompt ||
                    streamResponses !== originalConfig.streamResponses ||
                    chunkSize !== originalConfig.chunkSize;
    setHasChanges(changed);
  }, [systemPrompt, streamResponses, chunkSize, originalConfig]);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const config = await window.electronAPI.getBridgeConfig?.();
      const models = await window.electronAPI.ollamaListModels?.();
      
      console.log('[ConfigurationTab] Loaded config:', config);
      
      const prompt = config?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const model = config?.defaultModel || '';
      const stream = config?.streamResponses ?? true;
      const chunk = config?.chunkSize || 10;
      
      console.log('[ConfigurationTab] Setting state:', { prompt: prompt.substring(0, 50) + '...', model, stream, chunk });
      
      setSystemPrompt(prompt);
      setDefaultModel(model);
      setSelectedModel(model); // Initialize selected to current
      setStreamResponses(stream);
      setChunkSize(chunk);
      setOriginalConfig({ systemPrompt: prompt, defaultModel: model, streamResponses: stream, chunkSize: chunk });
      
      if (models && Array.isArray(models)) {
        setAvailableModels(models.map((m: any) => m.name));
      }
    } catch (err) {
      console.error('[ConfigurationTab] Failed to load configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await window.electronAPI.updateBridgeConfig?.({
        systemPrompt: systemPrompt.trim(),
        streamResponses,
        chunkSize,
      });
      
      // Update original config to reflect saved state
      setOriginalConfig(prev => ({ ...prev, systemPrompt: systemPrompt.trim(), streamResponses, chunkSize }));
      setHasChanges(false);
      
      console.log('[ConfigurationTab] Configuration saved successfully');
    } catch (err) {
      console.error('[ConfigurationTab] Failed to save configuration:', err);
      alert('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSystemPrompt(originalConfig.systemPrompt);
    setStreamResponses(originalConfig.streamResponses);
    setChunkSize(originalConfig.chunkSize);
    setHasChanges(false);
  };

  const handleReset = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  };

  const handleLoadModel = async () => {
    try {
      setLoadingModel(true);
      setShowModelLoadSuccess(false);
      setTestResult(null);
      
      console.log('[ConfigurationTab] Loading model:', selectedModel);
      
      await window.electronAPI.updateBridgeConfig?.({
        defaultModel: selectedModel,
      });
      
      // Update loaded model state
      setDefaultModel(selectedModel);
      setOriginalConfig(prev => ({ ...prev, defaultModel: selectedModel }));
      
      // Show success message
      setShowModelLoadSuccess(true);
      setTimeout(() => setShowModelLoadSuccess(false), 3000);
      
      console.log('[ConfigurationTab] Model loaded successfully:', selectedModel);
    } catch (err) {
      console.error('[ConfigurationTab] Failed to load model:', err);
      alert('Failed to load model. Please try again.');
    } finally {
      setLoadingModel(false);
    }
  };

  const handleTestModel = async () => {
    const modelToTest = defaultModel || selectedModel;
    if (!modelToTest) {
      setTestResult({ success: false, message: 'No model selected' });
      return;
    }

    try {
      setTestingModel(true);
      setTestResult(null);
      
      console.log('[ConfigurationTab] Testing model:', modelToTest);
      
      const result = await window.electronAPI.testModel?.(modelToTest);
      
      if (result?.success) {
        setTestResult({ 
          success: true, 
          message: `✓ Model "${modelToTest}" is working! Response: "${result.response}"` 
        });
      } else {
        setTestResult({ 
          success: false, 
          message: `✗ Model test failed: ${result?.error || 'Unknown error'}` 
        });
      }
    } catch (err) {
      console.error('[ConfigurationTab] Failed to test model:', err);
      setTestResult({ 
        success: false, 
        message: `✗ Test failed: ${err instanceof Error ? err.message : 'Unknown error'}` 
      });
    } finally {
      setTestingModel(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
          <span>Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Bridge Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure how your bridge responds to incoming requests
        </p>
      </div>

      {/* System Prompt Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            System Prompt
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Defines the behavior and personality of your AI assistant. This message is prepended to all conversations.
          </p>
        </div>

        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
          placeholder="Enter system prompt..."
        />

        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-muted-foreground">
            {systemPrompt.length} characters
          </span>
          <button
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to default
          </button>
        </div>
      </div>

      {/* Model Selection Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Model Management
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Load a model to use for incoming requests. Changes take effect immediately.
          </p>
        </div>

        {/* Currently Loaded Model Display */}
        <div className="mb-6 p-4 bg-accent/30 border-2 border-primary/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-0.5">Currently Loaded</div>
                <div className="font-mono text-sm font-semibold">
                  {defaultModel || 'Auto (First Available)'}
                </div>
              </div>
            </div>
            {showModelLoadSuccess && (
              <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Model Loaded
              </div>
            )}
          </div>
        </div>

        {/* Model Selector */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Select Model to Load
          </label>
          
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loadingModel}
            className="w-full px-4 py-3 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          >
            <option value="">Auto-select (use first available)</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>

          {/* Load Button */}
          {selectedModel !== defaultModel && (
            <button
              onClick={handleLoadModel}
              disabled={loadingModel}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingModel ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent"></div>
                  Loading Model...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Load Model
                </>
              )}
            </button>
          )}

          {/* Test Model Button */}
          {defaultModel && (
            <button
              onClick={handleTestModel}
              disabled={testingModel}
              className="w-full py-2.5 px-4 border-2 border-primary text-primary rounded-lg font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {testingModel ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                  Testing Model...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Test Current Model
                </>
              )}
            </button>
          )}

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${
              testResult.success 
                ? 'bg-green-500/10 border border-green-500/30 text-green-700'
                : 'bg-red-500/10 border border-red-500/30 text-red-700'
            }`}>
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Streaming Settings Section */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Response Streaming
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Enable streaming to send responses in chunks as they're generated, improving perceived responsiveness.
          </p>
        </div>

        <div className="space-y-4">
          {/* Stream Toggle */}
          <div className="flex items-center justify-between p-4 bg-accent/20 rounded-lg">
            <div>
              <div className="text-sm font-medium">Enable Streaming</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Send responses in real-time chunks instead of waiting for completion
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={streamResponses}
                onChange={(e) => setStreamResponses(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Chunk Size Slider (only show if streaming enabled) */}
          {streamResponses && (
            <div className="p-4 bg-accent/10 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Chunk Size</label>
                <span className="text-sm font-mono text-primary">{chunkSize} tokens</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="5"
                value={chunkSize}
                onChange={(e) => setChunkSize(parseInt(e.target.value))}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>5 (Fastest)</span>
                <span>15 (Balanced)</span>
                <span>30 (Slower)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Smaller chunks provide faster initial response but increase network overhead. 
                Recommended: 10-15 tokens for optimal balance.
              </p>
            </div>
          )}

          {!streamResponses && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-yellow-700">Streaming Disabled</div>
                  <div className="text-xs text-yellow-600 mt-1">
                    Responses will be sent only after complete generation. Users will experience longer wait times before seeing output.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}

      {/* Action Buttons */}
      {hasChanges && (
        <div className="flex items-center justify-between p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span className="text-sm font-medium">You have unsaved changes</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent"></div>
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

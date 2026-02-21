import { useState, useEffect } from 'react';
import type { AppConfig } from '../../shared/types';

interface SettingsViewProps {
  config: AppConfig | null;
  onReload: () => void;
}

const SYSTEM_PROMPT_TEMPLATES = [
  {
    name: 'Default Assistant',
    prompt: 'You are a helpful AI assistant. Provide clear, accurate, and concise responses to user questions.',
  },
  {
    name: 'Code Expert',
    prompt: 'You are an expert software engineer. Provide detailed, well-commented code examples and explanations. Focus on best practices and clean code principles.',
  },
  {
    name: 'Technical Writer',
    prompt: 'You are a technical documentation specialist. Write clear, precise documentation with proper formatting, examples, and organization.',
  },
  {
    name: 'Teacher',
    prompt: 'You are a patient educator. Break down complex topics into simple, easy-to-understand explanations. Use analogies and examples.',
  },
  {
    name: 'Creative Writer',
    prompt: 'You are a creative writer with a vivid imagination. Write engaging, descriptive content with attention to narrative flow and character development.',
  },
  {
    name: 'Research Assistant',
    prompt: 'You are a thorough research assistant. Provide well-sourced, objective information with attention to accuracy and relevance.',
  },
];

export function SettingsView({ config, onReload }: SettingsViewProps) {
  const [activeModels, setActiveModels] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('custom');
  const [rateLimit, setRateLimit] = useState(10);
  const [rateLimitWindow, setRateLimitWindow] = useState(60);
  const [accessControl, setAccessControl] = useState<'public' | 'whitelist'>('public');
  const [saving, setSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [config]);

  const loadSettings = async () => {
    try {
      const models = await window.electronAPI.ollamaListModels();
      setAvailableModels(models);
      
      if (config) {
        setSelectedModel(config.defaultModel || (models[0]?.name || ''));
        setSystemPrompt(config.systemPrompt || SYSTEM_PROMPT_TEMPLATES[0].prompt);
        setRateLimit(config.rateLimit?.requests || 10);
        setRateLimitWindow(config.rateLimit?.windowSeconds || 60);
        setAccessControl(config.accessControl || 'public');
        setActiveModels(config.availableModels || models.map(m => m.name));
      } else if (models.length > 0) {
        setSelectedModel(models[0].name);
        setSystemPrompt(SYSTEM_PROMPT_TEMPLATES[0].prompt);
        setActiveModels(models.map(m => m.name));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.updateConfig({
        defaultModel: selectedModel,
        systemPrompt: systemPrompt,
        availableModels: activeModels,
        rateLimit: {
          requests: rateLimit,
          windowSeconds: rateLimitWindow,
        },
        accessControl,
      });
      
      await onReload();
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = (template: typeof SYSTEM_PROMPT_TEMPLATES[0]) => {
    setSystemPrompt(template.prompt);
    setSelectedTemplate(template.name);
    setShowTemplates(false);
  };

  const toggleModel = (modelName: string) => {
    setActiveModels(prev => {
      if (prev.includes(modelName)) {
        // Don't allow removing the last model
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter(m => m !== modelName);
      } else {
        return [...prev, modelName];
      }
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure your Relay Station bridge</p>
      </div>

      {/* Model Configuration */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Model Configuration</h2>
          <p className="text-sm text-muted-foreground">Choose which models are available and set a default</p>
        </div>

        {/* Default Model Selection */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-2">DEFAULT MODEL</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border"
          >
            {availableModels.length === 0 ? (
              <option value="">No models installed</option>
            ) : (
              availableModels.map(model => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
            )}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            This model will be used when no specific model is requested
          </p>
        </div>

        {/* Available Models */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-2">AVAILABLE MODELS</label>
          <div className="border border-border rounded-lg divide-y divide-border">
            {availableModels.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No models installed. Download models from the Models tab.
              </div>
            ) : (
              availableModels.map(model => (
                <label
                  key={model.name}
                  className="flex items-center justify-between p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(model.size / 1e9).toFixed(1)} GB
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={activeModels.includes(model.name)}
                    onChange={() => toggleModel(model.name)}
                    className="w-4 h-4 rounded border-border"
                  />
                </label>
              ))
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Only checked models will be accessible through the bridge
          </p>
        </div>
      </div>

      {/* System Prompt */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">System Prompt</h2>
            <p className="text-sm text-muted-foreground">Define the AI's behavior and personality</p>
          </div>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-3 py-1.5 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors"
          >
            {showTemplates ? 'Hide' : 'Templates'}
          </button>
        </div>

        {/* Template Selection */}
        {showTemplates && (
          <div className="border border-border rounded-lg p-3 bg-muted">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">QUICK TEMPLATES</p>
            <div className="grid grid-cols-2 gap-2">
              {SYSTEM_PROMPT_TEMPLATES.map(template => (
                <button
                  key={template.name}
                  onClick={() => handleApplyTemplate(template)}
                  className="px-3 py-2 border border-border bg-card hover:bg-accent rounded-lg text-left transition-colors"
                >
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                    {template.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt Editor */}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-2">PROMPT</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setSelectedTemplate('custom');
            }}
            rows={6}
            placeholder="Enter system prompt..."
            className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1.5">
            This message sets the context for how the AI should respond
          </p>
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Rate Limiting</h2>
          <p className="text-sm text-muted-foreground">Control request frequency to prevent abuse</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-2">MAX REQUESTS</label>
            <input
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="1000"
              className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-2">TIME WINDOW (SECONDS)</label>
            <input
              type="number"
              value={rateLimitWindow}
              onChange={(e) => setRateLimitWindow(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="3600"
              className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
        </div>

        <div className="border border-border bg-muted rounded-lg p-3">
          <p className="text-xs">
            <span className="font-medium">Current limit:</span>{' '}
            <span className="text-muted-foreground">
              {rateLimit} requests per {rateLimitWindow} seconds
              ({Math.round((rateLimit / rateLimitWindow) * 60)} requests/minute)
            </span>
          </p>
        </div>
      </div>

      {/* Access Control */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Access Control</h2>
          <p className="text-sm text-muted-foreground">Manage who can use your bridge</p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
            <input
              type="radio"
              name="accessControl"
              value="public"
              checked={accessControl === 'public'}
              onChange={(e) => setAccessControl(e.target.value as 'public')}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Public Access</p>
              <p className="text-[10px] text-muted-foreground">Anyone with the edge ID can connect</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
            <input
              type="radio"
              name="accessControl"
              value="whitelist"
              checked={accessControl === 'whitelist'}
              onChange={(e) => setAccessControl(e.target.value as 'whitelist')}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Whitelist Only <span className="text-[10px] text-muted-foreground">(Coming Soon)</span></p>
              <p className="text-[10px] text-muted-foreground">Only approved edge IDs can connect</p>
            </div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button
          onClick={loadSettings}
          className="px-4 py-2 border border-border bg-card hover:bg-accent rounded-lg text-sm font-medium transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !selectedModel}
          className="px-6 py-2 border border-border bg-card hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-foreground border-t-transparent"></div>
              Saving...
            </span>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>
    </div>
  );
}

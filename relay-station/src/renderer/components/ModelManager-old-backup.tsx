import { useState, useEffect } from 'react';

interface Model {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
  };
}

interface ModelCard {
  id: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  parameters: string;
  contextWindow: number;
  tags: string[];
  capabilities: string[];
  sizeGB: number;
  vramGB: number;
  popularity: number;
}

interface PerformanceEstimate {
  status: 'optimal' | 'compatible' | 'slow' | 'incompatible';
  tokensPerSecond: number;
  loadTimeSeconds: number;
  warnings: string[];
  recommendations: string[];
}

interface ModelManagerProps {
  onClose?: () => void;
}

export function ModelManager({ onClose }: ModelManagerProps) {
  const [installedModels, setInstalledModels] = useState<Model[]>([]);
  const [catalog, setCatalog] = useState<ModelCard[]>([]);
  const [filteredCatalog, setFilteredCatalog] = useState<ModelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullModelName, setPullModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState('');
  const [pullPercent, setPullPercent] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [hardwareSpecs, setHardwareSpecs] = useState<any>(null);
  const [modelPerformance, setModelPerformance] = useState<Map<string, PerformanceEstimate>>(new Map());

  useEffect(() => {
    loadData();
    
    // Listen for pull progress updates
    if (window.electronAPI.onOllamaPullProgress) {
      window.electronAPI.onOllamaPullProgress((data) => {
        if (data.status) {
          setPullProgress(data.status);
        }
        if (data.completed && data.total) {
          const percent = Math.floor((data.completed / data.total) * 100);
          setPullPercent(percent);
        }
      });
    }
  }, []);

  useEffect(() => {
    // Filter catalog based on search and category
    let filtered = catalog;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(query) ||
        model.displayName.toLowerCase().includes(query) ||
        model.description.toLowerCase().includes(query) ||
        model.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (filterCategory && filterCategory !== 'all') {
      filtered = filtered.filter(model =>
        model.capabilities.includes(filterCategory) ||
        model.tags.some(tag => tag.toLowerCase() === filterCategory.toLowerCase())
      );
    }

    setFilteredCatalog(filtered);
  }, [searchQuery, filterCategory, catalog]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load installed models
      const installed = await window.electronAPI.ollamaListModels();
      setInstalledModels(installed);

      // Load model catalog
      if (window.electronAPI.modelCatalogGet) {
        const catalogData = await window.electronAPI.modelCatalogGet();
        setCatalog(catalogData);
        setFilteredCatalog(catalogData);

        // Detect hardware
        if (window.electronAPI.hardwareDetect) {
          const specs = await window.electronAPI.hardwareDetect();
          setHardwareSpecs(specs);
          console.log('[ModelManager] Hardware:', specs);

          // Estimate performance for each model
          const perfMap = new Map<string, PerformanceEstimate>();
          for (const model of catalogData) {
            if (window.electronAPI.hardwareEstimatePerformance) {
              const perf = await window.electronAPI.hardwareEstimatePerformance(model.sizeGB, model.vramGB);
              perfMap.set(model.id, perf);
            }
          }
          setModelPerformance(perfMap);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;

    setPulling(true);
    setPullProgress('Initializing download...');
    setPullPercent(0);

    try {
      const success = await window.electronAPI.ollamaPullModel(pullModelName);

      if (success) {
        setPullProgress('Download complete! ✓');
        setPullPercent(100);
        setPullModelName('');
        await loadData();
        setTimeout(() => {
          setPulling(false);
          setPullProgress('');
          setPullPercent(0);
        }, 2000);
      } else {
        setPullProgress('Download failed. Check model name and try again.');
        setTimeout(() => {
          setPulling(false);
          setPullProgress('');
          setPullPercent(0);
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to pull model:', error);
      setPullProgress('Error downloading model');
      setTimeout(() => {
        setPulling(false);
        setPullProgress('');
        setPullPercent(0);
      }, 3000);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    try {
      const success = await window.electronAPI.ollamaDeleteModel(modelName);
      if (success) {
        await loadData();
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  const getCompatibilityBadge = (status: string) => {
    const badges = {
      optimal: { text: '✓ Optimal', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      compatible: { text: '⚠ Compatible', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      slow: { text: '⏱ Slow', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
      incompatible: { text: '✗ Cannot Run', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' }
    };
    return badges[status as keyof typeof badges] || badges.compatible;
  };

  const isInstalled = (modelName: string) => {
    return installedModels.some(m => m.name === modelName);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold">Model Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hardwareSpecs ? (
              <>
                {hardwareSpecs.cpu.brand} • {hardwareSpecs.ram.total}GB RAM
                {hardwareSpecs.gpu && ` • ${hardwareSpecs.gpu.model}`}
              </>
            ) : (
              'Browse and manage AI models'
            )}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search & Filters */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models by name, author, or capability..."
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Models</option>
              <option value="text">Text Generation</option>
              <option value="code">Code & Programming</option>
              <option value="vision">Vision & Multimodal</option>
              <option value="reasoning">Reasoning & Logic</option>
            </select>
          </div>

          {/* Quick download bar */}
          <div className="flex gap-3">
            <input
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
              placeholder="Or enter model name directly (e.g., llama3.2:3b)"
              disabled={pulling}
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handlePullModel}
              disabled={pulling || !pullModelName.trim()}
              className="px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pulling ? 'Downloading...' : 'Download'}
            </button>
          </div>

          {pullProgress && (
            <div className="mt-3 space-y-2">
              <div className="p-3 bg-accent/50 rounded-lg">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">{pullProgress}</span>
                  {pullPercent > 0 && pullPercent < 100 && (
                    <span className="text-muted-foreground">{pullPercent}%</span>
                  )}
                </div>
                {pullPercent > 0 && pullPercent < 100 && (
                  <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300 ease-out"
                      style={{ width: `${pullPercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading models...</div>
          </div>
        ) : (
          <>
            {/* Model Grid */}
            <div>
              <h2 className="text-lg font-semibold mb-4">
                Available Models ({filteredCatalog.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCatalog.map((model) => {
                  const perf = modelPerformance.get(model.id);
                  const badge = perf ? getCompatibilityBadge(perf.status) : null;
                  const installed = isInstalled(model.name);

                  return (
                    <div key={model.id} className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-lg">{model.displayName}</h3>
                          <p className="text-sm text-muted-foreground">{model.author}</p>
                        </div>
                        {badge && (
                          <span className={`text-xs px-2 py-1 rounded-full ${badge.color}`}>
                            {badge.text}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">{model.description}</p>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs px-2 py-1 bg-accent rounded-full">
                          {model.parameters}
                        </span>
                        <span className="text-xs px-2 py-1 bg-accent rounded-full">
                          {model.sizeGB.toFixed(1)}GB
                        </span>
                        <span className="text-xs px-2 py-1 bg-accent rounded-full">
                          {model.contextWindow / 1000}K context
                        </span>
                        {model.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {perf && perf.status !== 'incompatible' && (
                        <div className="text-xs text-muted-foreground mb-3 flex items-center gap-3">
                          <span>~{perf.tokensPerSecond} tokens/sec</span>
                          <span>•</span>
                          <span>{perf.loadTimeSeconds}s load</span>
                        </div>
                      )}

                      {perf && perf.warnings.length > 0 && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 mb-2">
                          {perf.warnings[0]}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {installed ? (
                          <button
                            disabled
                            className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-sm rounded-md cursor-not-allowed"
                          >
                            ✓ Installed
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setPullModelName(model.name);
                              handlePullModel();
                            }}
                            disabled={pulling || perf?.status === 'incompatible'}
                            className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Download
                          </button>
                        )}
                        <button
                          onClick={() => window.electronAPI.openExternal?.(`https://ollama.com/library/${model.name.split(':')[0]}`)}
                          className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-sm rounded-md transition-colors"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Installed Models */}
            {installedModels.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">
                  Installed Models ({installedModels.length})
                </h2>
                <div className="space-y-2">
                  {installedModels.map((model) => (
                    <div key={model.digest} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{model.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {(model.size / (1024 ** 3)).toFixed(2)} GB • {formatDate(model.modified_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteConfirm(model.name)}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Model?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{deleteConfirm}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent/80 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteModel(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelManager;

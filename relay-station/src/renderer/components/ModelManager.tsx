import { useState, useEffect } from 'react';

interface Model {
  name: string;
  size: number;
  modified: string;
}

interface ModelCard {
  id: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  parameters: string;
  quantization: string[];
  contextWindow: number;
  architecture: string;
  license: string;
  tags: string[];
  capabilities: string[];
  sizeGB: number;
  vramGB: number;
  popularity: number;
}

interface PerformanceEstimate {
  tokensPerSecond: number;
  loadTime: number;
  warnings: string[];
  recommendations: string[];
}

interface HardwareSpecs {
  cpu: {
    brand: string;
    physicalCores: number;
    speed: number;
  };
  ram: {
    total: number;
    available: number;
    used: number;
  };
  gpu: {
    model: string;
    vram: number;
    vendor: string;
  } | null;
  platform: string;
  arch: string;
}

interface DownloadProgress {
  modelName: string;
  status: string;
  completed: number;
  total: number;
  percent: number;
  startTime: number;
}

export function ModelManager() {
  const [installedModels, setInstalledModels] = useState<Model[]>([]);
  const [catalog, setCatalog] = useState<ModelCard[]>([]);
  const [filteredCatalog, setFilteredCatalog] = useState<ModelCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [selectedModel, setSelectedModel] = useState<ModelCard | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  
  // Download state
  const [downloadingModels, setDownloadingModels] = useState<Map<string, DownloadProgress>>(new Map());
  
  useEffect(() => {
    loadData();
    
    // Listen for download progress
    const unsubscribe = window.electronAPI.onOllamaPullProgress?.((progress: any) => {
      if (progress.status === 'cancelled') {
        // Download cancelled - remove immediately
        setDownloadingModels(prev => {
          const next = new Map(prev);
          next.delete(progress.model);
          return next;
        });
      } else if (progress.status === 'success') {
        // Download complete - show 100% briefly before removing
        setDownloadingModels(prev => {
          const next = new Map(prev);
          const existing = next.get(progress.model);
          next.set(progress.model, {
            modelName: progress.model,
            status: 'Complete!',
            completed: progress.total || existing?.total || 0,
            total: progress.total || existing?.total || 0,
            percent: 100,
            startTime: existing?.startTime || Date.now(),
          });
          return next;
        });
        
        // After 1.5 seconds, remove from map and refresh
        setTimeout(() => {
          setDownloadingModels(prev => {
            const next = new Map(prev);
            next.delete(progress.model);
            return next;
          });
          loadData(); // Refresh installed models
        }, 1500);
      } else {
        // Update progress
        setDownloadingModels(prev => {
          const next = new Map(prev);
          const existing = next.get(progress.model);
          next.set(progress.model, {
            modelName: progress.model,
            status: progress.status,
            completed: progress.completed || 0,
            total: progress.total || 0,
            percent: Math.round(progress.percent || 0),
            startTime: existing?.startTime || Date.now(),
          });
          return next;
        });
      }
    });
    
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    // Filter catalog based on search query and category
    let filtered = catalog;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        model =>
          model.name.toLowerCase().includes(query) ||
          model.displayName.toLowerCase().includes(query) ||
          model.description.toLowerCase().includes(query) ||
          model.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    if (filterCategory !== 'all') {
      filtered = filtered.filter(model => 
        model.tags.some(tag => tag.toLowerCase() === filterCategory.toLowerCase())
      );
    }
    
    setFilteredCatalog(filtered);
  }, [searchQuery, filterCategory, catalog]);

  const loadData = async () => {
    try {
      const [models, catalogData] = await Promise.all([
        window.electronAPI.ollamaListModels(),
        window.electronAPI.modelCatalogGet?.() || [],
      ]);
      
      setInstalledModels(models);
      setCatalog(catalogData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load model data:', error);
      setLoading(false);
    }
  };

  const handleDownloadModel = async (modelName: string) => {
    try {
      // Initialize download progress
      setDownloadingModels(prev => {
        const next = new Map(prev);
        next.set(modelName, {
          modelName,
          status: 'Starting...',
          completed: 0,
          total: 0,
          percent: 0,
          startTime: Date.now(),
        });
        return next;
      });
      
      await window.electronAPI.ollamaPullModel(modelName);
      setShowDetailsModal(false);
    } catch (error) {
      console.error('Failed to download model:', error);
      alert('Failed to start download. Please try again.');
      setDownloadingModels(prev => {
        const next = new Map(prev);
        next.delete(modelName);
        return next;
      });
    }
  };

  const handleCancelDownload = async (modelName: string) => {
    try {
      await window.electronAPI.ollamaCancelPull?.(modelName);
      setDownloadingModels(prev => {
        const next = new Map(prev);
        next.delete(modelName);
        return next;
      });
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  const handleDeleteModel = async () => {
    if (!modelToDelete) return;
    
    try {
      await window.electronAPI.ollamaDeleteModel(modelToDelete);
      await loadData();
      setShowDeleteConfirm(false);
      setModelToDelete(null);
    } catch (error) {
      console.error('Failed to delete model:', error);
      alert('Failed to delete model. Please try again.');
    }
  };

  const handleViewDetails = (model: ModelCard) => {
    setSelectedModel(model);
    setShowDetailsModal(true);
  };

  const isInstalled = (modelName: string) => {
    return installedModels.some(m => m.name === modelName);
  };

  const isDownloading = (modelName: string) => {
    return downloadingModels.has(modelName);
  };

  const getDownloadProgress = (modelName: string): DownloadProgress | null => {
    return downloadingModels.get(modelName) || null;
  };

  const formatBytes = (bytes: number): string => {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  };

  const formatTimeRemaining = (progress: DownloadProgress): string => {
    if (progress.percent === 0 || progress.total === 0) return 'Calculating...';
    
    const elapsed = (Date.now() - progress.startTime) / 1000; // seconds
    const bytesPerSecond = progress.completed / elapsed;
    const remaining = (progress.total - progress.completed) / bytesPerSecond;
    
    if (remaining < 60) return `${Math.round(remaining)}s`;
    if (remaining < 3600) return `${Math.round(remaining / 60)}m`;
    return `${Math.round(remaining / 3600)}h`;
  };

  const getCompatibilityBadge = (sizeGB: number) => {
    // Simple heuristic based on model size
    if (sizeGB <= 4) {
      return { label: 'Optimal', color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' };
    } else if (sizeGB <= 8) {
      return { label: 'Compatible', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' };
    } else if (sizeGB <= 16) {
      return { label: 'Slow', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400' };
    } else {
      return { label: 'Incompatible', color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' };
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-primary mx-auto mb-3"></div>
          <p className="text-muted-foreground text-sm">Loading models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Model Library</h1>
        <p className="text-muted-foreground">Browse and manage AI models</p>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <svg className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Categories</option>
          <option value="recommended">Recommended</option>
          <option value="code">Code</option>
          <option value="vision">Vision</option>
          <option value="lightweight">Lightweight</option>
        </select>
      </div>

      {/* Active Downloads */}
      {downloadingModels.size > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-sm">Active Downloads</h2>
          {Array.from(downloadingModels.values()).map(progress => (
            <div key={progress.modelName} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{progress.modelName}</span>
                <span className="text-muted-foreground">
                  {progress.percent > 0 ? `${progress.percent}% • ${formatTimeRemaining(progress)}` : 'Starting...'}
                </span>
              </div>
              <div className="w-full bg-accent rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{progress.status}</p>
            </div>
          ))}
        </div>
      )}

      {/* Available Models Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Models</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCatalog.map(model => {
            const compatibility = getCompatibilityBadge(model.sizeGB);
            const installed = isInstalled(model.name);
            const downloading = isDownloading(model.name);
            const progress = getDownloadProgress(model.name);
            
            return (
              <div
                key={model.id}
                className="bg-card border border-border rounded-lg p-3 hover:border-border/80 transition-colors relative"
              >
                {/* Header */}
                <div className="mb-2">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-sm">{model.displayName}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${compatibility.color}`}>
                      {compatibility.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1">by {model.author}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{model.description}</p>
                </div>

                {/* Specs */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="px-1.5 py-0.5 border border-border bg-muted rounded text-[10px] font-medium text-muted-foreground">{model.parameters}</span>
                  <span className="px-1.5 py-0.5 border border-border bg-muted rounded text-[10px] font-medium text-muted-foreground">{model.sizeGB}GB</span>
                  <span className="px-1.5 py-0.5 border border-border bg-muted rounded text-[10px] font-medium text-muted-foreground">{model.contextWindow}k ctx</span>
                </div>

                {/* Progress (if downloading) */}
                {downloading && progress && (
                  <div className="mb-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{progress.status}</span>
                      <span className="font-medium">{Math.round(progress.percent)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1">
                      <div
                        className="bg-foreground h-1 rounded-full transition-all"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{formatTimeRemaining(progress)} remaining</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleViewDetails(model)}
                    className="flex-1 px-2.5 py-1.5 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors"
                  >
                    Details
                  </button>
                  {installed ? (
                    <button
                      disabled
                      className="flex-1 px-2.5 py-1.5 border border-border bg-muted text-muted-foreground rounded text-xs font-medium cursor-not-allowed flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Installed
                    </button>
                  ) : downloading ? (
                    <button
                      onClick={() => handleCancelDownload(model.name)}
                      className="flex-1 px-2.5 py-1.5 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownloadModel(model.name)}
                      className="flex-1 px-2.5 py-1.5 border border-primary bg-primary/5 hover:bg-primary/10 text-primary rounded text-xs font-medium transition-colors"
                    >
                      Download
                    </button>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border">
                  {model.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Installed Models */}
      {installedModels.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Installed Models</h2>
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {installedModels.map(model => {
              const downloading = isDownloading(model.name);
              const progress = getDownloadProgress(model.name);
              
              return (
                <div key={model.name} className="p-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium">{model.name}</h3>
                        <span className="px-1.5 py-0.5 border border-border bg-muted text-muted-foreground rounded text-[10px] font-medium">
                          Installed
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatBytes(model.size)}</span>
                        <span>•</span>
                        <span>Modified {new Date(model.modified).toLocaleDateString()}</span>
                      </div>
                      
                      {/* Show progress if currently downloading update */}
                      {downloading && progress && (
                        <div className="mt-2 max-w-md">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground">Updating: {progress.status}</span>
                            <span className="font-medium">{Math.round(progress.percent)}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1">
                            <div
                              className="bg-foreground h-1 rounded-full transition-all"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          <button
                            onClick={() => handleCancelDownload(model.name)}
                            className="mt-1 px-2 py-0.5 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-[10px] font-medium transition-colors"
                          >
                            Cancel Update
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setModelToDelete(model.name);
                        setShowDeleteConfirm(true);
                      }}
                      className="px-2.5 py-1.5 border border-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model Details Modal */}
      {showDetailsModal && selectedModel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-card border border-border rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold mb-0.5">{selectedModel.displayName}</h2>
                <p className="text-xs text-muted-foreground">by {selectedModel.author}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground mb-4">{selectedModel.description}</p>

            {/* Specs Grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Parameters</p>
                <p className="text-sm font-medium">{selectedModel.parameters}</p>
              </div>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Size</p>
                <p className="text-sm font-medium">{selectedModel.sizeGB} GB</p>
              </div>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Context Window</p>
                <p className="text-sm font-medium">{selectedModel.contextWindow}k tokens</p>
              </div>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Architecture</p>
                <p className="text-sm font-medium">{selectedModel.architecture}</p>
              </div>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">License</p>
                <p className="text-sm font-medium">{selectedModel.license}</p>
              </div>
              <div className="border border-border bg-muted rounded p-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">VRAM</p>
                <p className="text-sm font-medium">{selectedModel.vramGB > 0 ? `${selectedModel.vramGB} GB` : 'N/A'}</p>
              </div>
            </div>

            {/* Capabilities */}
            <div className="mb-6">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">CAPABILITIES</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedModel.capabilities.map(cap => (
                  <span key={cap} className="px-2 py-0.5 border border-border bg-card text-muted-foreground rounded text-[10px] font-medium">
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {/* Quantization Options */}
            {selectedModel.quantization.length > 1 && (
              <div className="mb-4">
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5">QUANTIZATION OPTIONS</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedModel.quantization.map(quant => (
                    <span key={quant} className="px-2 py-0.5 border border-border bg-muted rounded text-[10px] font-medium">
                      {quant}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Different quantizations are available. Default version will be downloaded.
                </p>
              </div>
            )}

            {/* Download Progress (if downloading) */}
            {isDownloading(selectedModel.name) && getDownloadProgress(selectedModel.name) && (() => {
              const progress = getDownloadProgress(selectedModel.name)!;
              return (
                <div className="mb-6 p-4 border border-border bg-muted rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Download in Progress</span>
                    <span className="text-muted-foreground">
                      {Math.round(progress.percent)}% • {formatTimeRemaining(progress)}
                    </span>
                  </div>
                  <div className="w-full bg-background rounded-full h-2">
                    <div
                      className="bg-foreground h-2 rounded-full transition-all"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{progress.status}</p>
                    <button
                      onClick={() => handleCancelDownload(selectedModel.name)}
                      className="px-2 py-1 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-xs font-medium transition-colors"
                    >
                      Cancel Download
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-3 py-2 border border-border bg-card hover:bg-accent rounded text-sm font-medium transition-colors"
              >
                Close
              </button>
              {isInstalled(selectedModel.name) ? (
                <button
                  disabled
                  className="flex-1 px-3 py-2 border border-border bg-muted text-muted-foreground rounded text-sm font-medium cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Already Installed
                </button>
              ) : isDownloading(selectedModel.name) ? (
                <button
                  onClick={() => handleCancelDownload(selectedModel.name)}
                  className="flex-1 px-3 py-2 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-sm font-medium transition-colors"
                >
                  Cancel Download
                </button>
              ) : (
                <button
                  onClick={() => handleDownloadModel(selectedModel.name)}
                  className="flex-1 px-3 py-2 border border-primary bg-primary/5 hover:bg-primary/10 text-primary rounded text-sm font-medium transition-colors"
                >
                  Download Model
                </button>
              )}
            </div>

            {/* External Link */}
            <div className="mt-3 pt-3 border-t border-border">
              <a
                href={`https://ollama.com/library/${selectedModel.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View on Ollama
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Delete Model?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete <span className="font-medium text-foreground">{modelToDelete}</span>?
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setModelToDelete(null);
                }}
                className="px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteModel}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
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

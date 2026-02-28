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

interface ModelFitAnalysis {
  model_name: string;
  fit_level: 'perfect' | 'good' | 'marginal' | 'too_tight';
  run_mode: 'gpu' | 'cpu_offload' | 'moe_offload' | 'cpu_only';
  runtime: 'mlx' | 'llama.cpp' | 'vllm';
  memory_required_gb: number;
  memory_available_gb: number;
  utilization_pct: number;
  recommended_quant: string;
  available_quants: string[];
  estimated_tokens_per_sec: number;
  estimated_load_time_sec: number;
  composite_score: number;
  score_components: {
    quality: number;
    speed: number;
    fit: number;
    context: number;
  };
  notes: string[];
  warnings: string[];
  recommendations: string[];
}

interface EnhancedSystemSpecs {
  cpu: {
    name: string;
    manufacturer: string;
    cores: number;
    physicalCores: number;
    speed: number;
    architecture: string;
  };
  memory: {
    total_gb: number;
    available_gb: number;
    used_gb: number;
  };
  gpus: Array<{
    name: string;
    vendor: string;
    vram_gb: number | null;
    backend: string;
    count: number;
    unified_memory: boolean;
  }>;
  primary_gpu: {
    name: string;
    vendor: string;
    vram_gb: number | null;
    backend: string;
    unified_memory: boolean;
  } | null;
  has_gpu: boolean;
  unified_memory: boolean;
  platform: string;
  backend: string;
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
  const [runningModels, setRunningModels] = useState<string[]>([]); // Currently loaded in Ollama
  const [catalog, setCatalog] = useState<ModelCard[]>([]);
  const [filteredCatalog, setFilteredCatalog] = useState<ModelCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [hardwareSpecs, setHardwareSpecs] = useState<HardwareSpecs | null>(null);
  const [enhancedSpecs, setEnhancedSpecs] = useState<EnhancedSystemSpecs | null>(null);
  const [modelAnalyses, setModelAnalyses] = useState<Map<string, ModelFitAnalysis>>(new Map());
  const [analysisLoading, setAnalysisLoading] = useState(false);
  
  // Sorting and pagination
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'size' | 'speed' | 'memory'>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Modal states
  const [selectedModel, setSelectedModel] = useState<ModelCard | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  
  // Download state
  const [downloadingModels, setDownloadingModels] = useState<Map<string, DownloadProgress>>(new Map());
  
  useEffect(() => {
    loadData();
    loadHardware();
    loadEnhancedSpecs();
    
    // Auto-refresh specs every 30 seconds for live updates
    const specsInterval = setInterval(loadEnhancedSpecs, 30000);
    
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
      clearInterval(specsInterval);
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
    
    // Sort the filtered results
    filtered.sort((a, b) => {
      const analysisA = modelAnalyses.get(a.name);
      const analysisB = modelAnalyses.get(b.name);
      
      let comparison = 0;
      switch (sortBy) {
        case 'score':
          comparison = (analysisB?.composite_score || 0) - (analysisA?.composite_score || 0);
          break;
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'size':
          comparison = a.sizeGB - b.sizeGB;
          break;
        case 'speed':
          comparison = (analysisB?.estimated_tokens_per_sec || 0) - (analysisA?.estimated_tokens_per_sec || 0);
          break;
        case 'memory':
          comparison = (analysisA?.memory_required_gb || 0) - (analysisB?.memory_required_gb || 0);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    setFilteredCatalog(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchQuery, filterCategory, catalog, sortBy, sortDirection, modelAnalyses]);

  const loadData = async () => {
    try {
      // Fetch data in parallel
      const [models, running, enhancedModels] = await Promise.all([
        window.electronAPI.ollamaListModels(),
        window.electronAPI.ollamaRunningModels?.() || Promise.resolve([]),
        window.electronAPI.enhancedModelsGetAll?.() || Promise.resolve([]),
      ]);
      
      setInstalledModels(models);
      setRunningModels(running.map((m: any) => m.name));
      
      // Use enhanced models as catalog (60 curated models with full metadata and analysis)
      const catalogData = enhancedModels.map((m: any) => ({
        id: m.id,
        name: m.name,
        displayName: m.displayName,
        author: m.author,
        description: m.description,
        parameters: m.parameters,
        quantization: m.available_quantizations || [],
        contextWindow: Math.floor(m.context_length / 1000),
        architecture: m.architecture,
        license: m.license || 'Unknown',
        tags: m.tags || [],
        capabilities: m.capabilities || [],
        sizeGB: m.sizeGB,
        vramGB: m.min_vram_gb || m.sizeGB,
        popularity: m.popularity || 0,
      }));
      
      setCatalog(catalogData);
      
      // Load model fit analyses for all models
      await loadModelAnalyses();
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to load model data:', error);
      setLoading(false);
    }
  };

  const loadHardware = async () => {
    try {
      if (window.electronAPI.hardwareDetect) {
        const specs = await window.electronAPI.hardwareDetect();
        setHardwareSpecs(specs);
      }
    } catch (error) {
      console.error('Failed to load hardware specs:', error);
    }
  };

  const loadEnhancedSpecs = async () => {
    try {
      if (window.electronAPI.modelFitGetSystemSpecs) {
        const specs = await window.electronAPI.modelFitGetSystemSpecs();
        setEnhancedSpecs(specs);
      }
    } catch (error) {
      console.error('Failed to load enhanced specs:', error);
    }
  };

  const loadModelAnalyses = async () => {
    try {
      setAnalysisLoading(true);
      if (window.electronAPI.modelFitAnalyzeAll) {
        const analyses: ModelFitAnalysis[] = await window.electronAPI.modelFitAnalyzeAll();
        const analysisMap = new Map<string, ModelFitAnalysis>();
        analyses.forEach(analysis => {
          analysisMap.set(analysis.model_name, analysis);
        });
        setModelAnalyses(analysisMap);
      }
    } catch (error) {
      console.error('Failed to load model analyses:', error);
    } finally {
      setAnalysisLoading(false);
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

  const isRunning = (modelName: string) => {
    return runningModels.some(m => m === modelName || modelName.startsWith(m.split(':')[0]));
  };

  const formatBytes = (bytes: number): string => {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  };

  const handleSort = (column: 'score' | 'name' | 'size' | 'speed' | 'memory') => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };
  
  const getSortIcon = (column: 'score' | 'name' | 'size' | 'speed' | 'memory') => {
    if (sortBy !== column) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };
  
  const canDownloadModel = (modelName: string): boolean => {
    const analysis = modelAnalyses.get(modelName);
    // Allow if analysis not loaded yet (during initial load)
    // Block only confirmed too_tight models
    return !analysis || analysis.fit_level !== 'too_tight';
  };
  
  const getDownloadWarning = (modelName: string): string | null => {
    const analysis = modelAnalyses.get(modelName);
    if (!analysis) return null;
    if (analysis.fit_level === 'too_tight') {
      return 'This model requires more memory than available and will not run properly.';
    }
    if (analysis.fit_level === 'marginal') {
      return 'This model may experience performance issues due to memory constraints.';
    }
    return null;
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

  const getCompatibilityBadge = (modelName: string) => {
    const analysis = modelAnalyses.get(modelName);
    
    if (!analysis) {
      return { 
        label: 'Analyzing...', 
        color: 'bg-muted/50 text-muted-foreground border-border',
        icon: '⏳'
      };
    }
    
    switch (analysis.fit_level) {
      case 'perfect':
        return {
          label: 'Perfect Fit',
          color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
          icon: '✨',
          description: `${analysis.run_mode.toUpperCase()} • ${Math.round(analysis.estimated_tokens_per_sec)} tok/s`
        };
      case 'good':
        return {
          label: 'Good Fit',
          color: 'bg-green-500/10 text-green-600 border-green-500/30',
          icon: '✓',
          description: `${analysis.run_mode.toUpperCase()} • ${Math.round(analysis.estimated_tokens_per_sec)} tok/s`
        };
      case 'marginal':
        return {
          label: 'Marginal',
          color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
          icon: '⚠',
          description: `${analysis.run_mode.toUpperCase()} • ${Math.round(analysis.estimated_tokens_per_sec)} tok/s`
        };
      case 'too_tight':
        return {
          label: 'Too Tight',
          color: 'bg-red-500/10 text-red-600 border-red-500/30',
          icon: '✗',
          description: 'Insufficient memory'
        };
      default:
        return { 
          label: 'Unknown', 
          color: 'bg-muted/50 text-muted-foreground border-border',
          icon: '?'
        };
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
        <h1 className="text-3xl font-bold mb-2">My Models</h1>
        <p className="text-muted-foreground">Manage your downloaded AI models with hardware-aware recommendations</p>
      </div>

      {/* Live System Specs Panel */}
      {enhancedSpecs && (
        <div className="bg-gradient-to-br from-card via-card to-accent/20 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-2xl">💻</span>
              System Specifications
              <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            </h2>
            <button
              onClick={loadEnhancedSpecs}
              className="px-3 py-1.5 border border-border hover:bg-accent rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* GPU Section */}
            <div className="bg-card/50 border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎮</span>
                <h3 className="font-semibold text-sm">Graphics</h3>
              </div>
              {enhancedSpecs.primary_gpu ? (
                <>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">GPU</p>
                    <p className="text-xs font-medium truncate" title={enhancedSpecs.primary_gpu.name}>
                      {enhancedSpecs.primary_gpu.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {enhancedSpecs.primary_gpu.vendor} • {enhancedSpecs.primary_gpu.backend.toUpperCase()}
                    </p>
                  </div>
                  {enhancedSpecs.primary_gpu.vram_gb && enhancedSpecs.primary_gpu.vram_gb > 0 ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-muted-foreground">VRAM</p>
                        <p className="text-[10px] font-medium">{enhancedSpecs.primary_gpu.vram_gb.toFixed(1)} GB</p>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {enhancedSpecs.unified_memory ? '🔄 Unified Memory' : 'VRAM info unavailable'}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  No discrete GPU detected<br />
                  <span className="text-[10px]">CPU-only inference</span>
                </div>
              )}
            </div>

            {/* Memory Section */}
            <div className="bg-card/50 border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🧠</span>
                <h3 className="font-semibold text-sm">Memory</h3>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground">Total RAM</p>
                  <p className="text-[10px] font-medium">{enhancedSpecs.memory.total_gb.toFixed(1)} GB</p>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <div
                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(enhancedSpecs.memory.used_gb / enhancedSpecs.memory.total_gb) * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Used</p>
                    <p className="font-medium">{enhancedSpecs.memory.used_gb.toFixed(1)} GB</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Available</p>
                    <p className="font-medium text-green-600">{enhancedSpecs.memory.available_gb.toFixed(1)} GB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CPU Section */}
            <div className="bg-card/50 border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-semibold text-sm">Processor</h3>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">CPU</p>
                <p className="text-xs font-medium truncate" title={enhancedSpecs.cpu.name}>
                  {enhancedSpecs.cpu.manufacturer} {enhancedSpecs.cpu.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {enhancedSpecs.cpu.physicalCores}C/{enhancedSpecs.cpu.cores}T @ {enhancedSpecs.cpu.speed.toFixed(2)} GHz
                </p>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Architecture</p>
                    <p className="font-medium uppercase">{enhancedSpecs.cpu.architecture}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Platform</p>
                    <p className="font-medium capitalize">{enhancedSpecs.platform}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Backend Info */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Backend: <span className="font-medium text-foreground uppercase">{enhancedSpecs.backend}</span></span>
              {enhancedSpecs.gpus.length > 1 && (
                <span>Multi-GPU: <span className="font-medium text-foreground">{enhancedSpecs.gpus.length} devices</span></span>
              )}
            </div>
            {analysisLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin"></div>
                Analyzing models...
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Installed Models - SHOWN FIRST */}
      {installedModels.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Installed Models ({installedModels.length})</h2>
          <div className="bg-card border border-border rounded-lg divide-y divide-border">
            {installedModels.map(model => {
              const downloading = isDownloading(model.name);
              const progress = getDownloadProgress(model.name);
              const running = isRunning(model.name);
              
              return (
                <div key={model.name} className="p-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium">{model.name}</h3>
                        {running ? (
                          <span className="px-2 py-0.5 border border-green-600 bg-green-500/10 text-green-600 rounded text-[10px] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse"></span>
                            LOADED
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 border border-border bg-muted text-muted-foreground rounded text-[10px] font-medium">
                            Installed
                          </span>
                        )}
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
                      className="px-3 py-1.5 border border-destructive/50 hover:border-destructive hover:bg-destructive/5 text-destructive text-xs rounded transition-colors"
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

      {/* Available Models Table - SHOWN SECOND */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Models ({filteredCatalog.length})</h2>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      Model
                      <span className="text-sm">{getSortIcon('name')}</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compatibility</th>
                  <th 
                    onClick={() => handleSort('size')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      Specs
                      <span className="text-sm">{getSortIcon('size')}</span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('speed')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      Performance
                      <span className="text-sm">{getSortIcon('speed')}</span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('memory')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      Memory
                      <span className="text-sm">{getSortIcon('memory')}</span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('score')}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      Score
                      <span className="text-sm">{getSortIcon('score')}</span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCatalog
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map(model => {
                  const compatibility = getCompatibilityBadge(model.name);
                  const analysis = modelAnalyses.get(model.name);
                  const installed = isInstalled(model.name);
                  const downloading = isDownloading(model.name);
                  const progress = getDownloadProgress(model.name);
                  const canDownload = canDownloadModel(model.name);
                  const downloadWarning = getDownloadWarning(model.name);
                  
                  return (
                    <tr key={model.id} className="hover:bg-accent/30 transition-colors">
                      {/* Model Info */}
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-sm mb-0.5">{model.displayName}</div>
                          <div className="text-[10px] text-muted-foreground mb-1">by {model.author}</div>
                          <div className="text-xs text-muted-foreground max-w-xs line-clamp-2">{model.description}</div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {model.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-muted border border-border text-muted-foreground rounded text-[10px]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      
                      {/* Compatibility */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 border rounded text-xs font-medium inline-flex items-center gap-1.5 ${compatibility.color}`}>
                          <span className="text-sm">{compatibility.icon}</span>
                          {compatibility.label}
                        </span>
                        {analysis && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {compatibility.description}
                          </div>
                        )}
                      </td>
                      
                      {/* Specs */}
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-xs">
                          <div><span className="text-muted-foreground">Size:</span> <span className="font-medium">{model.parameters}</span></div>
                          <div><span className="text-muted-foreground">Disk:</span> <span className="font-medium">{model.sizeGB.toFixed(1)} GB</span></div>
                          <div><span className="text-muted-foreground">Context:</span> <span className="font-medium">{model.contextWindow}k</span></div>
                          {analysis && (
                            <div><span className="text-muted-foreground">Quant:</span> <span className="font-medium uppercase">{analysis.recommended_quant}</span></div>
                          )}
                        </div>
                      </td>
                      
                      {/* Performance */}
                      <td className="px-4 py-3">
                        {analysis ? (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-muted-foreground">Speed:</span> <span className="font-medium">{Math.round(analysis.estimated_tokens_per_sec)} tok/s</span></div>
                            <div><span className="text-muted-foreground">Mode:</span> <span className="font-medium uppercase">{analysis.run_mode.replace('_', ' ')}</span></div>
                            <div><span className="text-muted-foreground">Load:</span> <span className="font-medium">{analysis.estimated_load_time_sec.toFixed(1)}s</span></div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Analyzing...</div>
                        )}
                      </td>
                      
                      {/* Memory */}
                      <td className="px-4 py-3">
                        {analysis ? (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-muted-foreground">Required:</span> <span className="font-medium">{analysis.memory_required_gb.toFixed(1)} GB</span></div>
                            <div><span className="text-muted-foreground">Available:</span> <span className="font-medium">{analysis.memory_available_gb.toFixed(1)} GB</span></div>
                            <div>
                              <span className="text-muted-foreground">Usage:</span>
                              <div className="w-20 bg-muted rounded-full h-1.5 mt-0.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    analysis.utilization_pct > 90 ? 'bg-red-500' :
                                    analysis.utilization_pct > 70 ? 'bg-yellow-500' :
                                    'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(100, analysis.utilization_pct)}%` }}
                                />
                              </div>
                              <span className="font-medium">{Math.round(analysis.utilization_pct)}%</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">-</div>
                        )}
                      </td>
                      
                      {/* Score */}
                      <td className="px-4 py-3">
                        {analysis ? (
                          <div className="text-center">
                            <div className="text-2xl font-bold">{Math.round(analysis.composite_score)}</div>
                            <div className="text-[10px] text-muted-foreground">/ 100</div>
                            <div className="flex gap-0.5 mt-1 justify-center">
                              <div className="w-1 h-8 bg-green-500 rounded-full" style={{ opacity: analysis.score_components.quality / 100 }}></div>
                              <div className="w-1 h-8 bg-blue-500 rounded-full" style={{ opacity: analysis.score_components.speed / 100 }}></div>
                              <div className="w-1 h-8 bg-purple-500 rounded-full" style={{ opacity: analysis.score_components.fit / 100 }}></div>
                              <div className="w-1 h-8 bg-orange-500 rounded-full" style={{ opacity: analysis.score_components.context / 100 }}></div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground text-center">-</div>
                        )}
                      </td>
                      
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => handleViewDetails(model)}
                            className="px-3 py-1.5 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            Details
                          </button>
                          {installed ? (
                            <button
                              disabled
                              className="px-3 py-1.5 border border-border bg-muted text-muted-foreground rounded text-xs font-medium cursor-not-allowed flex items-center justify-center gap-1 whitespace-nowrap"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Installed
                            </button>
                          ) : downloading ? (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted-foreground">{Math.round(progress?.percent || 0)}%</div>
                              <button
                                onClick={() => handleCancelDownload(model.name)}
                                className="w-full px-3 py-1.5 border border-destructive bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-xs font-medium transition-colors whitespace-nowrap"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <button
                                onClick={() => handleDownloadModel(model.name)}
                                disabled={!canDownload}
                                className={`w-full px-3 py-1.5 border rounded text-xs font-medium transition-colors whitespace-nowrap ${
                                  canDownload
                                    ? 'border-primary bg-primary/5 hover:bg-primary/10 text-primary cursor-pointer'
                                    : 'border-muted bg-muted/5 text-muted-foreground cursor-not-allowed opacity-50'
                                }`}
                                title={downloadWarning || undefined}
                              >
                                {canDownload ? 'Download' : 'Incompatible'}
                              </button>
                              {downloadWarning && (
                                <div className="text-[10px] text-yellow-600 dark:text-yellow-500 max-w-[140px] leading-tight">
                                  {downloadWarning}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Pagination Controls */}
        {filteredCatalog.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-4 px-2">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredCatalog.length)} of {filteredCatalog.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.ceil(filteredCatalog.length / itemsPerPage) }, (_, i) => i + 1)
                  .filter(page => {
                    const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    );
                  })
                  .map((page, idx, arr) => {
                    const prevPage = arr[idx - 1];
                    return (
                      <div key={page} className="flex items-center gap-1">
                        {prevPage && page - prevPage > 1 && (
                          <span className="px-2 text-muted-foreground">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 border rounded text-xs font-medium transition-colors ${
                            currentPage === page
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-card hover:bg-accent text-foreground'
                          }`}
                        >
                          {page}
                        </button>
                      </div>
                    );
                  })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredCatalog.length / itemsPerPage), p + 1))}
                disabled={currentPage >= Math.ceil(filteredCatalog.length / itemsPerPage)}
                className="px-3 py-1.5 border border-border bg-card hover:bg-accent rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
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

            {/* Fit Analysis Section */}
            {(() => {
              const analysis = modelAnalyses.get(selectedModel.name);
              const compatibility = getCompatibilityBadge(selectedModel.name);
              
              if (!analysis) {
                return (
                  <div className="mb-4 p-3 border border-border bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Loading compatibility analysis...</p>
                  </div>
                );
              }

              return (
                <div className="mb-4 p-4 border border-border bg-gradient-to-br from-card to-accent/10 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="text-lg">{compatibility.icon}</span>
                      Hardware Compatibility
                    </h3>
                    <span className={`px-2 py-1 border rounded text-xs font-medium ${compatibility.color}`}>
                      {compatibility.label}
                    </span>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-card border border-border rounded">
                      <p className="text-[10px] text-muted-foreground mb-1">Est. Speed</p>
                      <p className="text-sm font-medium">{Math.round(analysis.estimated_tokens_per_sec)} tok/s</p>
                    </div>
                    <div className="p-2 bg-card border border-border rounded">
                      <p className="text-[10px] text-muted-foreground mb-1">Memory</p>
                      <p className="text-sm font-medium">{analysis.memory_required_gb.toFixed(1)} GB</p>
                    </div>
                    <div className="p-2 bg-card border border-border rounded">
                      <p className="text-[10px] text-muted-foreground mb-1">Utilization</p>
                      <p className="text-sm font-medium">{Math.round(analysis.utilization_pct)}%</p>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground">PERFORMANCE SCORE: {Math.round(analysis.composite_score)}/100</p>
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <p className="text-muted-foreground mb-1">Quality</p>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${analysis.score_components.quality}%` }}></div>
                        </div>
                        <p className="font-medium mt-0.5">{Math.round(analysis.score_components.quality)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Speed</p>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${analysis.score_components.speed}%` }}></div>
                        </div>
                        <p className="font-medium mt-0.5">{Math.round(analysis.score_components.speed)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Fit</p>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500" style={{ width: `${analysis.score_components.fit}%` }}></div>
                        </div>
                        <p className="font-medium mt-0.5">{Math.round(analysis.score_components.fit)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Context</p>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500" style={{ width: `${analysis.score_components.context}%` }}></div>
                        </div>
                        <p className="font-medium mt-0.5">{Math.round(analysis.score_components.context)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Runtime Info */}
                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Runtime: <span className="font-medium text-foreground uppercase">{analysis.runtime}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Mode: <span className="font-medium text-foreground uppercase">{analysis.run_mode.replace('_', ' ')}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Quant: <span className="font-medium text-foreground uppercase">{analysis.recommended_quant}</span>
                    </span>
                  </div>

                  {/* Warnings */}
                  {analysis.warnings.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-[10px] font-medium text-yellow-600 mb-1">⚠ WARNINGS</p>
                      <ul className="text-[10px] text-muted-foreground space-y-0.5">
                        {analysis.warnings.map((warning, i) => (
                          <li key={i}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {analysis.recommendations.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-[10px] font-medium text-blue-600 mb-1">💡 RECOMMENDATIONS</p>
                      <ul className="text-[10px] text-muted-foreground space-y-0.5">
                        {analysis.recommendations.map((rec, i) => (
                          <li key={i}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

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

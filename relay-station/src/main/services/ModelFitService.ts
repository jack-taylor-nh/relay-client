/**
 * Model Fit Service
 * 
 * Main orchestration service for model-hardware compatibility analysis
 * Ties together hardware detection, fit analysis, and recommendations
 */

import { enhancedHardwareDetector } from './EnhancedHardwareDetector';
import { modelFitAnalyzer } from './ModelFitAnalyzer';
import {
  EnhancedSystemSpecs,
  ModelMetadata,
  ModelFitAnalysis,
  RecommendationFilters,
  FitLevel
} from './ModelFitTypes';

class ModelFitService {
  private systemSpecs: EnhancedSystemSpecs | null = null;
  private fitAnalysisCache: Map<string, ModelFitAnalysis> = new Map();
  private lastHardwareCheck: number = 0;
  private HARDWARE_CHECK_INTERVAL = 300000; // 5 minutes

  /**
   * Get enhanced system specifications
   */
  async getSystemSpecs(): Promise<EnhancedSystemSpecs> {
    const now = Date.now();
    
    // Refresh hardware if stale
    if (!this.systemSpecs || now - this.lastHardwareCheck > this.HARDWARE_CHECK_INTERVAL) {
      console.log('[ModelFit] Refreshing system specifications...');
      this.systemSpecs = await enhancedHardwareDetector.detect();
      this.lastHardwareCheck = now;
      
      // Clear cache when hardware changes
      this.fitAnalysisCache.clear();
    }
    
    return this.systemSpecs;
  }

  /**
   * Analyze a single model
   */
  async analyzeModel(model: ModelMetadata): Promise<ModelFitAnalysis> {
    // Check cache first
    if (this.fitAnalysisCache.has(model.id)) {
      return this.fitAnalysisCache.get(model.id)!;
    }
    
    // Get system specs
    const specs = await this.getSystemSpecs();
    
    // Analyze
    const analysis = modelFitAnalyzer.analyze(model, specs);
    
    // Cache result
    this.fitAnalysisCache.set(model.id, analysis);
    
    return analysis;
  }

  /**
   * Analyze all models in catalog
   */
  async analyzeAllModels(models: ModelMetadata[]): Promise<ModelFitAnalysis[]> {
    const specs = await this.getSystemSpecs();
    const analyses: ModelFitAnalysis[] = [];
    
    for (const model of models) {
      // Use cache if available
      if (this.fitAnalysisCache.has(model.id)) {
        analyses.push(this.fitAnalysisCache.get(model.id)!);
        continue;
      }
      
      // Analyze and cache
      const analysis = modelFitAnalyzer.analyze(model, specs);
      this.fitAnalysisCache.set(model.id, analysis);
      analyses.push(analysis);
    }
    
    return analyses;
  }

  /**
   * Get top model recommendations based on filters
   */
  async getRecommendations(
    models: ModelMetadata[],
    filters: RecommendationFilters = {}
  ): Promise<ModelFitAnalysis[]> {
    // Analyze all models
    let analyses = await this.analyzeAllModels(models);
    
    // Apply filters
    if (filters.min_fit_level) {
      const fitOrder = {
        [FitLevel.PERFECT]: 4,
        [FitLevel.GOOD]: 3,
        [FitLevel.MARGINAL]: 2,
        [FitLevel.TOO_TIGHT]: 1
      };
      const minLevel = fitOrder[filters.min_fit_level];
      
      analyses = analyses.filter(a => fitOrder[a.fit_level] >= minLevel);
    }
    
    if (filters.runtime) {
      analyses = analyses.filter(a => a.runtime === filters.runtime);
    }
    
    if (filters.max_size_gb) {
      analyses = analyses.filter(a => a.memory_required_gb <= filters.max_size_gb!);
    }
    
    if (filters.use_case) {
      analyses = analyses.filter(a => {
        const model = models.find(m => m.name === a.model_name);
        return model?.use_cases.includes(filters.use_case!);
      });
    }
    
    // Sort by composite score (best first)
    analyses.sort((a, b) => b.composite_score - a.composite_score);
    
    // Apply limit
    if (filters.limit) {
      analyses = analyses.slice(0, filters.limit);
    }
    
    return analyses;
  }

  /**
   * Get models grouped by fit level
   */
  async getModelsByFitLevel(models: ModelMetadata[]): Promise<{
    perfect: ModelFitAnalysis[];
    good: ModelFitAnalysis[];
    marginal: ModelFitAnalysis[];
    tooTight: ModelFitAnalysis[];
  }> {
    const analyses = await this.analyzeAllModels(models);
    
    return {
      perfect: analyses.filter(a => a.fit_level === FitLevel.PERFECT)
        .sort((a, b) => b.composite_score - a.composite_score),
      good: analyses.filter(a => a.fit_level === FitLevel.GOOD)
        .sort((a, b) => b.composite_score - a.composite_score),
      marginal: analyses.filter(a => a.fit_level === FitLevel.MARGINAL)
        .sort((a, b) => b.composite_score - a.composite_score),
      tooTight: analyses.filter(a => a.fit_level === FitLevel.TOO_TIGHT)
        .sort((a, b) => b.composite_score - a.composite_score)
    };
  }

  /**
   * Get fastest models (ranked by estimated tokens/sec)
   */
  async getFastestModels(models: ModelMetadata[], limit: number = 5): Promise<ModelFitAnalysis[]> {
    const analyses = await this.analyzeAllModels(models);
    
    return analyses
      .filter(a => a.fit_level !== FitLevel.TOO_TIGHT)
      .sort((a, b) => b.estimated_tokens_per_sec - a.estimated_tokens_per_sec)
      .slice(0, limit);
  }

  /**
   * Get highest quality models that fit
   */
  async getHighestQualityModels(models: ModelMetadata[], limit: number = 5): Promise<ModelFitAnalysis[]> {
    const analyses = await this.analyzeAllModels(models);
    
    return analyses
      .filter(a => a.fit_level !== FitLevel.TOO_TIGHT)
      .sort((a, b) => b.score_components.quality - a.score_components.quality)
      .slice(0, limit);
  }

  /**
   * Clear all caches (useful for testing or when hardware changes)
   */
  clearCache(): void {
    this.fitAnalysisCache.clear();
    this.systemSpecs = null;
    this.lastHardwareCheck = 0;
    enhancedHardwareDetector.clearCache();
  }

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats(): { cachedModels: number; hasSystemSpecs: boolean } {
    return {
      cachedModels: this.fitAnalysisCache.size,
      hasSystemSpecs: this.systemSpecs !== null
    };
  }
}

export const modelFitService = new ModelFitService();

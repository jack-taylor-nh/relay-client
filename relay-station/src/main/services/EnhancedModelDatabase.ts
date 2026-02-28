/**
 * Enhanced Model Database
 * 
 * Loads and manages the curated model specifications database
 */

import * as fs from 'fs';
import * as path from 'path';
import { ModelMetadata } from './ModelFitTypes';

class EnhancedModelDatabase {
  private models: ModelMetadata[] = [];
  private modelsById: Map<string, ModelMetadata> = new Map();
  private loaded: boolean = false;

  /**
   * Load model database
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const dbPath = path.join(__dirname, '..', 'data', 'model-specs.json');
      console.log('[ModelDB] Loading from:', dbPath);
      
      const data = fs.readFileSync(dbPath, 'utf-8');
      const db = JSON.parse(data);
      
      this.models = db.models || [];
      
      // Build index
      this.modelsById.clear();
      for (const model of this.models) {
        this.modelsById.set(model.id, model);
        
        // Also index by name (handle "latest" variants)
        if (model.name !== model.id) {
          this.modelsById.set(model.name, model);
        }
      }
      
      this.loaded = true;
      console.log(`[ModelDB] Loaded ${this.models.length} models`);
    } catch (error) {
      console.error('[ModelDB] Failed to load database:', error);
      // Initialize with empty array on error
      this.models = [];
      this.modelsById.clear();
      this.loaded = true;
    }
  }

  /**
   * Get all models
   */
  async getAllModels(): Promise<ModelMetadata[]> {
    await this.load();
    return [...this.models];
  }

  /**
   * Get model by ID or name
   */
  async getModel(idOrName: string): Promise<ModelMetadata | null> {
    await this.load();
    return this.modelsById.get(idOrName) || null;
  }

  /**
   * Find model by partial name match
   */
  async findModel(query: string): Promise<ModelMetadata | null> {
    await this.load();
    
    const normalizedQuery = query.toLowerCase().trim();
    
    // Exact match first
    const exactMatch = this.modelsById.get(query);
    if (exactMatch) {
      return exactMatch;
    }
    
    // Fuzzy match
    for (const model of this.models) {
      if (
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.displayName.toLowerCase().includes(normalizedQuery)
      ) {
        return model;
      }
    }
    
    return null;
  }

  /**
   * Search models
   */
  async searchModels(query: string): Promise<ModelMetadata[]> {
    await this.load();
    
    if (!query) {
      return this.models;
    }
    
    const normalizedQuery = query.toLowerCase().trim();
    
    return this.models.filter(model =>
      model.name.toLowerCase().includes(normalizedQuery) ||
      model.displayName.toLowerCase().includes(normalizedQuery) ||
      model.description.toLowerCase().includes(normalizedQuery) ||
      model.tags.some(tag => tag.toLowerCase().includes(normalizedQuery)) ||
      model.use_cases.some(uc => uc.toLowerCase().includes(normalizedQuery))
    );
  }

  /**
   * Filter models by use case
   */
  async getModelsByUseCase(useCase: string): Promise<ModelMetadata[]> {
    await this.load();
    
    const normalized = useCase.toLowerCase();
    return this.models.filter(m => 
      m.use_cases.some(uc => uc.toLowerCase() === normalized)
    );
  }

  /**
   * Get models by size range
   */
  async getModelsBySize(minGB: number, maxGB: number): Promise<ModelMetadata[]> {
    await this.load();
    
    return this.models.filter(m => 
      m.sizeGB >= minGB && m.sizeGB <= maxGB
    );
  }

  /**
   * Get most popular models
   */
  async getMostPopular(limit: number = 10): Promise<ModelMetadata[]> {
    await this.load();
    
    return [...this.models]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  /**
   * Get newest models
   */
  async getNewest(limit: number = 10): Promise<ModelMetadata[]> {
    await this.load();
    
    return [...this.models]
      .filter(m => m.release_date)
      .sort((a, b) => {
        const dateA = new Date(a.release_date!).getTime();
        const dateB = new Date(b.release_date!).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);
  }

  /**
   * Enrich Ollama model with metadata from database
   */
  async enrichOllamaModel(ollamaModel: any): Promise<ModelMetadata | null> {
    await this.load();
    
    // Try to find matching model
    const dbModel = await this.findModel(ollamaModel.name);
    
    if (dbModel) {
      // Return enhanced model with both Ollama and DB data
      return {
        ...dbModel,
        // Override with actual Ollama data if available
        sizeGB: ollamaModel.size ? Math.round(ollamaModel.size / (1024 ** 3) * 10) / 10 : dbModel.sizeGB,
      };
    }
    
    // If not in DB, create basic metadata from Ollama data
    return this.createMetadataFromOllama(ollamaModel);
  }

  /**
   * Create basic metadata from Ollama model data (fallback)
   */
  private createMetadataFromOllama(ollamaModel: any): ModelMetadata {
    const sizeGB = ollamaModel.size 
      ? Math.round(ollamaModel.size / (1024 ** 3) * 10) / 10 
      : 5.0;
    
    // Parse parameter size from name (e.g., "llama3.2:8b" -> "8B")
    const paramMatch = ollamaModel.name.match(/(\d+\.?\d*)[bB]/);
    const params = paramMatch ? `${paramMatch[1]}B` : 'Unknown';
    const paramsRaw = paramMatch ? parseFloat(paramMatch[1]) * 1e9 : 7e9;
    
    return {
      id: ollamaModel.name,
      name: ollamaModel.name,
      displayName: ollamaModel.name,
      author: 'Unknown',
      description: 'Model from Ollama library',
      parameters: params,
      parameters_raw: paramsRaw,
      min_ram_gb: sizeGB * 1.2,
      recommended_ram_gb: sizeGB * 2.0,
      min_vram_gb: sizeGB,
      context_length: 8192,
      quantization_default: 'Q4_K_M',
      available_quantizations: ['Q4_K_M', 'Q4_0', 'Q8_0'],
      is_moe: false,
      architecture: 'unknown',
      use_cases: ['general'],
      tags: [],
      capabilities: ['text', 'chat'],
      sizeGB,
      popularity: 50,
      license: 'Unknown'
    };
  }
}

export const enhancedModelDatabase = new EnhancedModelDatabase();

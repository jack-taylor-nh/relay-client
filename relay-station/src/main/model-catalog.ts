/**
 * Model Catalog Service
 * 
 * Fetches and manages Ollama model library catalog
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface ModelCard {
  id: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  parameters: string; // "3B", "7B", "70B"
  quantization: string[];
  contextWindow: number;
  architecture: string;
  license: string;
  tags: string[];
  capabilities: string[]; // "text", "vision", "code", etc.
  sizeGB: number;
  vramGB: number;
  popularity: number;
  updatedAt: string;
}

interface OllamaTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

class ModelCatalogService {
  private catalog: ModelCard[] = [];
  private lastFetch: number = 0;
  private CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private catalogPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.catalogPath = path.join(userDataPath, 'model-catalog.json');
  }

  /**
   * Get model catalog (fetches from Ollama if stale)
   */
  async getCatalog(): Promise<ModelCard[]> {
    // Return cached if fresh
    if (this.catalog.length > 0 && Date.now() - this.lastFetch < this.CACHE_TTL) {
      return this.catalog;
    }

    // Try loading from disk cache
    if (fs.existsSync(this.catalogPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(this.catalogPath, 'utf-8'));
        
        // Invalidate old cache if it has too few models (old version)
        if (cached.models && cached.models.length < 20) {
          console.log('[ModelCatalog] Cache has too few models, invalidating...');
          fs.unlinkSync(this.catalogPath);
        } else if (Date.now() - cached.timestamp < this.CACHE_TTL) {
          console.log('[ModelCatalog] Loaded from disk cache');
          this.catalog = cached.models;
          this.lastFetch = cached.timestamp;
          return this.catalog;
        }
      } catch (error) {
        console.warn('[ModelCatalog] Failed to load disk cache:', error);
      }
    }

    // Fetch fresh catalog
    await this.fetchCatalog();
    return this.catalog;
  }

  /**
   * Fetch catalog from Ollama library
   */
  private async fetchCatalog(): Promise<void> {
    console.log('[ModelCatalog] Fetching from Ollama library...');

    try {
      // Fetch from local Ollama instance's available models list
      const response = await fetch('http://localhost:11434/api/tags');
      
      if (!response.ok) {
        throw new Error('Failed to fetch from Ollama');
      }

      const data = await response.json() as { models?: any[] };
      const localModels = data.models || [];

      // Build catalog from available models (we'll also add curated list)
      this.catalog = this.buildCatalogFromModels(localModels);
      
      // Add popular models that might not be installed yet
      this.addPopularModels();

      this.lastFetch = Date.now();

      // Save to disk
      this.saveToDisk();

      console.log('[ModelCatalog] Fetched', this.catalog.length, 'models');
    } catch (error) {
      console.error('[ModelCatalog] Fetch failed:', error);
      
      // Fall back to built-in catalog
      this.catalog = this.getBuiltInCatalog();
      this.lastFetch = Date.now();
    }
  }

  /**
   * Build catalog from Ollama tags response
   */
  private buildCatalogFromModels(models: OllamaTag[]): ModelCard[] {
    return models.map(model => {
      const family = model.details?.family || model.details?.families?.[0] || 'unknown';
      const paramSize = model.details?.parameter_size || this.estimateParamSize(model.name);
      const sizeGB = model.size / (1024 ** 3); // Convert bytes to GB
      
      return {
        id: model.name,
        name: model.name,
        displayName: this.formatDisplayName(model.name),
        author: this.extractAuthor(model.name),
        description: this.generateDescription(model.name, family),
        parameters: paramSize,
        quantization: [model.details?.quantization_level || 'Q4_0'],
        contextWindow: this.estimateContextWindow(family),
        architecture: family,
        license: this.guesslicense(family),
        tags: this.generateTags(model.name, family),
        capabilities: this.guessCapabilities(model.name, family),
        sizeGB: Math.round(sizeGB * 10) / 10,
        vramGB: this.estimateVRAM(sizeGB, paramSize),
        popularity: this.estimatePopularity(model.name),
        updatedAt: model.modified_at
      };
    });
  }

  /**
   * Add popular models that should always be shown
   */
  private addPopularModels(): void {
    const popular = this.getBuiltInCatalog();
    
    for (const model of popular) {
      // Only add if not already in catalog
      if (!this.catalog.find(m => m.name === model.name)) {
        this.catalog.push(model);
      }
    }

    // Sort by popularity
    this.catalog.sort((a, b) => b.popularity - a.popularity);
  }

  /**
   * Get built-in catalog of popular models
   */
  private getBuiltInCatalog(): ModelCard[] {
    return [
      // Llama Series
      {
        id: 'llama3.2:3b',
        name: 'llama3.2:3b',
        displayName: 'Llama 3.2 3B',
        author: 'Meta',
        description: 'Fast, efficient model. Great for everyday tasks, coding assistance, and quick queries.',
        parameters: '3B',
        quantization: ['Q4_0', 'Q4_K_M', 'Q8_0'],
        contextWindow: 128000,
        architecture: 'llama',
        license: 'Llama 3.2 License',
        tags: ['Fast', 'Lightweight', 'Recommended'],
        capabilities: ['text', 'code', 'chat'],
        sizeGB: 2.0,
        vramGB: 3,
        popularity: 95,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'llama3.2:latest',
        name: 'llama3.2:latest',
        displayName: 'Llama 3.2 Latest',
        author: 'Meta',
        description: 'Latest Llama 3.2 model with balanced performance and quality. Excellent for general use.',
        parameters: '8B',
        quantization: ['Q4_K_M', 'Q8_0'],
        contextWindow: 128000,
        architecture: 'llama',
        license: 'Llama 3.2 License',
        tags: ['Recommended', 'Versatile', 'Popular'],
        capabilities: ['text', 'code', 'chat', 'reasoning'],
        sizeGB: 4.7,
        vramGB: 6,
        popularity: 100,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'llama3.1:70b',
        name: 'llama3.1:70b',
        displayName: 'Llama 3.1 70B',
        author: 'Meta',
        description: 'Flagship model. Exceptional quality for complex reasoning and creative tasks.',
        parameters: '70B',
        quantization: ['Q4_0', 'Q4_K_M'],
        contextWindow: 128000,
        architecture: 'llama',
        license: 'Llama 3.1 License',
        tags: ['Flagship', 'High Quality', 'Advanced'],
        capabilities: ['text', 'code', 'chat', 'reasoning', 'creative'],
        sizeGB: 40,
        vramGB: 48,
        popularity: 70,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'llama3.1:8b',
        name: 'llama3.1:8b',
        displayName: 'Llama 3.1 8B',
        author: 'Meta',
        description: 'Versatile mid-size model with strong reasoning capabilities.',
        parameters: '8B',
        quantization: ['Q4_0', 'Q4_K_M', 'Q8_0'],
        contextWindow: 128000,
        architecture: 'llama',
        license: 'Llama 3.1 License',
        tags: ['Versatile', 'Popular'],
        capabilities: ['text', 'code', 'chat', 'reasoning'],
        sizeGB: 4.7,
        vramGB: 6,
        popularity: 88,
        updatedAt: new Date().toISOString()
      },
      // Mistral Series
      {
        id: 'mistral:7b',
        name: 'mistral:7b',
        displayName: 'Mistral 7B',
        author: 'Mistral AI',
        description: 'Excellent for coding, reasoning, and technical tasks. Strong instruction following.',
        parameters: '7B',
        quantization: ['Q4_0', 'Q4_K_M', 'Q8_0'],
        contextWindow: 32000,
        architecture: 'mistral',
        license: 'Apache 2.0',
        tags: ['Code', 'Reasoning', 'Technical'],
        capabilities: ['text', 'code', 'chat', 'reasoning'],
        sizeGB: 4.1,
        vramGB: 5,
        popularity: 90,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'mixtral:8x7b',
        name: 'mixtral:8x7b',
        displayName: 'Mixtral 8x7B',
        author: 'Mistral AI',
        description: 'Mixture of Experts model. Excellent quality with efficient inference.',
        parameters: '47B',
        quantization: ['Q4_0', 'Q4_K_M'],
        contextWindow: 32000,
        architecture: 'mixtral',
        license: 'Apache 2.0',
        tags: ['Flagship', 'High Quality', 'Efficient'],
        capabilities: ['text', 'code', 'chat', 'reasoning'],
        sizeGB: 26,
        vramGB: 30,
        popularity: 82,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'mistral-small:latest',
        name: 'mistral-small:latest',
        displayName: 'Mistral Small',
        author: 'Mistral AI',
        description: 'Compact Mistral model for efficient local inference.',
        parameters: '22B',
        quantization: ['Q4_K_M'],
        contextWindow: 32000,
        architecture: 'mistral',
        license: 'Apache 2.0',
        tags: ['Efficient', 'Technical'],
        capabilities: ['text', 'code', 'chat'],
        sizeGB: 13,
        vramGB: 16,
        popularity: 75,
        updatedAt: new Date().toISOString()
      },
      // Qwen Series
      {
        id: 'qwen2.5:latest',
        name: 'qwen2.5:latest',
        displayName: 'Qwen 2.5',
        author: 'Alibaba',
        description: 'Advanced multilingual model with strong reasoning capabilities.',
        parameters: '7B',
        quantization: ['Q4_K_M', 'Q8_0'],
        contextWindow: 128000,
        architecture: 'qwen',
        license: 'Apache 2.0',
        tags: ['Multilingual', 'Reasoning', 'Recent'],
        capabilities: ['text', 'code', 'chat', 'reasoning'],
        sizeGB: 4.4,
        vramGB: 6,
        popularity: 78,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'qwen3-vl:8b',
        name: 'qwen3-vl:8b',
        displayName: 'Qwen3 Vision 8B',
        author: 'Alibaba',
        description: 'Vision-language model. Understands and describes images. Excellent for multimodal tasks.',
        parameters: '8B',
        quantization: ['Q4_K_M'],
        contextWindow: 32000,
        architecture: 'qwen',
        license: 'Apache 2.0',
        tags: ['Vision', 'Multimodal', 'Image Understanding'],
        capabilities: ['text', 'vision', 'code', 'chat'],
        sizeGB: 5.0,
        vramGB: 6,
        popularity: 80,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'qwen2.5-coder:latest',
        name: 'qwen2.5-coder:latest',
        displayName: 'Qwen 2.5 Coder',
        author: 'Alibaba',
        description: 'Specialized coding model with excellent code generation.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 128000,
        architecture: 'qwen',
        license: 'Apache 2.0',
        tags: ['Code', 'Programming', 'Recent'],
        capabilities: ['code', 'text'],
        sizeGB: 4.5,
        vramGB: 6,
        popularity: 73,
        updatedAt: new Date().toISOString()
      },
      // Code Models
      {
        id: 'codellama:13b',
        name: 'codellama:13b',
        displayName: 'Code Llama 13B',
        author: 'Meta',
        description: 'Specialized for code generation, completion, and debugging. Supports many languages.',
        parameters: '13B',
        quantization: ['Q4_0', 'Q4_K_M'],
        contextWindow: 16000,
        architecture: 'llama',
        license: 'Llama 2 License',
        tags: ['Code', 'Programming', 'Developer'],
        capabilities: ['code', 'text'],
        sizeGB: 7.4,
        vramGB: 9,
        popularity: 85,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'codellama:7b',
        name: 'codellama:7b',
        displayName: 'Code Llama 7B',
        author: 'Meta',
        description: 'Efficient code model for programming assistance.',
        parameters: '7B',
        quantization: ['Q4_0', 'Q4_K_M'],
        contextWindow: 16000,
        architecture: 'llama',
        license: 'Llama 2 License',
        tags: ['Code', 'Programming', 'Fast'],
        capabilities: ['code', 'text'],
        sizeGB: 3.8,
        vramGB: 5,
        popularity: 80,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'deepseek-coder:6.7b',
        name: 'deepseek-coder:6.7b',
        displayName: 'DeepSeek Coder 6.7B',
        author: 'DeepSeek',
        description: 'High-performance code model. Strong at code generation and technical documentation.',
        parameters: '6.7B',
        quantization: ['Q4_K_M'],
        contextWindow: 16000,
        architecture: 'deepseek',
        license: 'MIT',
        tags: ['Code', 'Fast', 'Efficient'],
        capabilities: ['code', 'text'],
        sizeGB: 3.8,
        vramGB: 5,
        popularity: 75,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'deepseek-coder-v2:latest',
        name: 'deepseek-coder-v2:latest',
        displayName: 'DeepSeek Coder V2',
        author: 'DeepSeek',
        description: 'Latest DeepSeek coding model with improved capabilities.',
        parameters: '16B',
        quantization: ['Q4_K_M'],
        contextWindow: 16000,
        architecture: 'deepseek',
        license: 'MIT',
        tags: ['Code', 'Recent', 'Advanced'],
        capabilities: ['code', 'text'],
        sizeGB: 9.0,
        vramGB: 11,
        popularity: 72,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'codegemma:latest',
        name: 'codegemma:latest',
        displayName: 'CodeGemma',
        author: 'Google',
        description: 'Google\'s specialized code generation model.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 8192,
        architecture: 'gemma',
        license: 'Gemma License',
        tags: ['Code', 'Google'],
        capabilities: ['code', 'text'],
        sizeGB: 5.0,
        vramGB: 6,
        popularity: 68,
        updatedAt: new Date().toISOString()
      },
      // Gemma Series
      {
        id: 'gemma2:9b',
        name: 'gemma2:9b',
        displayName: 'Gemma 2 9B',
        author: 'Google',
        description: 'Google\'s efficient language model with strong performance.',
        parameters: '9B',
        quantization: ['Q4_K_M', 'Q8_0'],
        contextWindow: 8192,
        architecture: 'gemma',
        license: 'Gemma License',
        tags: ['Google', 'Efficient', 'Recent'],
        capabilities: ['text', 'chat', 'code'],
        sizeGB: 5.4,
        vramGB: 7,
        popularity: 76,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gemma2:27b',
        name: 'gemma2:27b',
        displayName: 'Gemma 2 27B',
        author: 'Google',
        description: 'Larger Gemma model with enhanced capabilities.',
        parameters: '27B',
        quantization: ['Q4_K_M'],
        contextWindow: 8192,
        architecture: 'gemma',
        license: 'Gemma License',
        tags: ['Google', 'High Quality'],
        capabilities: ['text', 'chat', 'code', 'reasoning'],
        sizeGB: 15.6,
        vramGB: 20,
        popularity: 70,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gemma:7b',
        name: 'gemma:7b',
        displayName: 'Gemma 7B',
        author: 'Google',
        description: 'Efficient Google model for general tasks.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 8192,
        architecture: 'gemma',
        license: 'Gemma License',
        tags: ['Google', 'Lightweight'],
        capabilities: ['text', 'chat'],
        sizeGB: 5.0,
        vramGB: 6,
        popularity: 72,
        updatedAt: new Date().toISOString()
      },
      // Phi Series
      {
        id: 'phi3:mini',
        name: 'phi3:mini',
        displayName: 'Phi-3 Mini',
        author: 'Microsoft',
        description: 'Ultra-efficient small model. Surprisingly capable for its size.',
        parameters: '3.8B',
        quantization: ['Q4_K_M'],
        contextWindow: 4096,
        architecture: 'phi',
        license: 'MIT',
        tags: ['Mini', 'Efficient', 'Fast'],
        capabilities: ['text', 'chat'],
        sizeGB: 2.3,
        vramGB: 3,
        popularity: 65,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'phi3:medium',
        name: 'phi3:medium',
        displayName: 'Phi-3 Medium',
        author: 'Microsoft',
        description: 'Balanced Phi-3 model with good performance.',
        parameters: '14B',
        quantization: ['Q4_K_M'],
        contextWindow: 4096,
        architecture: 'phi',
        license: 'MIT',
        tags: ['Efficient', 'Microsoft'],
        capabilities: ['text', 'chat', 'code'],
        sizeGB: 7.9,
        vramGB: 10,
        popularity: 62,
        updatedAt: new Date().toISOString()
      },
      // Vicuna & Other Community Models
      {
        id: 'vicuna:13b',
        name: 'vicuna:13b',
        displayName: 'Vicuna 13B',
        author: 'LMSYS',
        description: 'Chat-optimized model based on LLaMA. Strong conversational abilities.',
        parameters: '13B',
        quantization: ['Q4_K_M'],
        contextWindow: 2048,
        architecture: 'llama',
        license: 'Non-commercial',
        tags: ['Chat', 'Conversational'],
        capabilities: ['text', 'chat'],
        sizeGB: 7.3,
        vramGB: 9,
        popularity: 60,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'orca2:13b',
        name: 'orca2:13b',
        displayName: 'Orca 2 13B',
        author: 'Microsoft',
        description: 'Reasoning-focused model trained with advanced techniques.',
        parameters: '13B',
        quantization: ['Q4_K_M'],
        contextWindow: 4096,
        architecture: 'llama',
        license: 'Microsoft Research',
        tags: ['Reasoning', 'Microsoft'],
        capabilities: ['text', 'chat', 'reasoning'],
        sizeGB: 7.4,
        vramGB: 9,
        popularity: 58,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'wizardlm2:latest',
        name: 'wizardlm2:latest',
        displayName: 'WizardLM 2',
        author: 'WizardLM',
        description: 'Instruction-tuned model with strong reasoning.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 32000,
        architecture: 'llama',
        license: 'Apache 2.0',
        tags: ['Reasoning', 'Instructions'],
        capabilities: ['text', 'chat', 'reasoning'],
        sizeGB: 4.1,
        vramGB: 5,
        popularity: 56,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'solar:10.7b',
        name: 'solar:10.7b',
        displayName: 'Solar 10.7B',
        author: 'Upstage',
        description: 'High-performance mid-size model with strong capabilities.',
        parameters: '10.7B',
        quantization: ['Q4_K_M'],
        contextWindow: 4096,
        architecture: 'solar',
        license: 'Apache 2.0',
        tags: ['Performance', 'Balanced'],
        capabilities: ['text', 'chat', 'code'],
        sizeGB: 6.1,
        vramGB: 8,
        popularity: 54,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'yi:34b',
        name: 'yi:34b',
        displayName: 'Yi 34B',
        author: '01.AI',
        description: 'Large bilingual model with strong performance.',
        parameters: '34B',
        quantization: ['Q4_K_M'],
        contextWindow: 4096,
        architecture: 'yi',
        license: 'Yi License',
        tags: ['Large', 'Bilingual'],
        capabilities: ['text', 'chat', 'code'],
        sizeGB: 19,
        vramGB: 24,
        popularity: 52,
        updatedAt: new Date().toISOString()
      },
      // Specialized & Recent Models
      {
        id: 'llava:latest',
        name: 'llava:latest',
        displayName: 'LLaVA',
        author: 'Microsoft',
        description: 'Multimodal model combining vision and language.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 2048,
        architecture: 'llava',
        license: 'Apache 2.0',
        tags: ['Vision', 'Multimodal'],
        capabilities: ['text', 'vision', 'chat'],
        sizeGB: 4.5,
        vramGB: 6,
        popularity: 64,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'dolphin-mixtral:latest',
        name: 'dolphin-mixtral:latest',
        displayName: 'Dolphin Mixtral',
        author: 'Eric Hartford',
        description: 'Uncensored Mixtral variant for open-ended tasks.',
        parameters: '47B',
        quantization: ['Q4_K_M'],
        contextWindow: 32000,
        architecture: 'mixtral',
        license: 'Apache 2.0',
        tags: ['Uncensored', 'Versatile'],
        capabilities: ['text', 'chat', 'code'],
        sizeGB: 26,
        vramGB: 30,
        popularity: 50,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'starling-lm:latest',
        name: 'starling-lm:latest',
        displayName: 'Starling LM',
        author: 'Berkeley',
        description: 'RLHF-trained model optimized for helpfulness.',
        parameters: '7B',
        quantization: ['Q4_K_M'],
        contextWindow: 8192,
        architecture: 'mistral',
        license: 'Apache 2.0',
        tags: ['RLHF', 'Helpful'],
        capabilities: ['text', 'chat'],
        sizeGB: 4.1,
        vramGB: 5,
        popularity: 48,
        updatedAt: new Date().toISOString()
      },
      {
        id: 'nomic-embed-text:latest',
        name: 'nomic-embed-text:latest',
        displayName: 'Nomic Embed',
        author: 'Nomic AI',
        description: 'Embedding model for semantic search and RAG.',
        parameters: '137M',
        quantization: ['Q4_K_M'],
        contextWindow: 8192,
        architecture: 'bert',
        license: 'Apache 2.0',
        tags: ['Embeddings', 'RAG', 'Search'],
        capabilities: ['embeddings'],
        sizeGB: 0.27,
        vramGB: 1,
        popularity: 66,
        updatedAt: new Date().toISOString()
      }
    ];
  }

  // Helper methods for model metadata estimation
  private formatDisplayName(name: string): string {
    // Remove tag, capitalize
    const base = name.split(':')[0];
    return base.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  private extractAuthor(name: string): string {
    if (name.includes('llama')) return 'Meta';
    if (name.includes('mistral')) return 'Mistral AI';
    if (name.includes('qwen')) return 'Alibaba';
    if (name.includes('phi')) return 'Microsoft';
    if (name.includes('deepseek')) return 'DeepSeek';
    if (name.includes('gemma')) return 'Google';
    return 'Community';
  }

  private generateDescription(name: string, family: string): string {
    if (name.includes('vision') || name.includes('vl')) {
      return 'Vision-language model with multimodal capabilities.';
    }
    if (name.includes('code')) {
      return 'Specialized for code generation and programming tasks.';
    }
    return `${family} based model for general text generation and chat.`;
  }

  private estimateParamSize(name: string): string {
    const match = name.match(/(\d+\.?\d*)b/i);
    if (match) {
      return match[1].toUpperCase() + 'B';
    }
    return 'Unknown';
  }

  private estimateContextWindow(family: string): number {
    if (family.includes('llama3')) return 128000;
    if (family.includes('mistral')) return 32000;
    return 4096;
  }

  private guesslicense(family: string): string {
    if (family.includes('llama')) return 'Llama License';
    if (family.includes('mistral')) return 'Apache 2.0';
    if (family.includes('phi')) return 'MIT';
    return 'Various';
  }

  private generateTags(name: string, family: string): string[] {
    const tags: string[] = [];
    
    if (name.includes('vision') || name.includes('vl')) tags.push('Vision');
    if (name.includes('code')) tags.push('Code');
    if (name.includes('chat')) tags.push('Chat');
    if (name.includes('mini') || name.includes('small')) tags.push('Lightweight');
    if (family.includes('llama')) tags.push('Popular');
    
    return tags;
  }

  private guessCapabilities(name: string, family: string): string[] {
    const caps: string[] = ['text', 'chat'];
    
    if (name.includes('code') || family.includes('code')) caps.push('code');
    if (name.includes('vision') || name.includes('vl')) caps.push('vision');
    if (name.includes('70b') || name.includes('large')) caps.push('reasoning');
    
    return caps;
  }

  private estimateVRAM(sizeGB: number, _paramSize: string): number {
    // Rough estimate: model size + 20% overhead
    return Math.ceil(sizeGB * 1.2);
  }

  private estimatePopularity(name: string): number {
    // Simple heuristic based on common models
    if (name.includes('llama3.2')) return 95;
    if (name.includes('llama3')) return 90;
    if (name.includes('mistral')) return 85;
    if (name.includes('code')) return 80;
    if (name.includes('qwen')) return 75;
    return 50;
  }

  /**
   * Save catalog to disk
   */
  private saveToDisk(): void {
    try {
      const data = {
        models: this.catalog,
        timestamp: this.lastFetch
      };
      fs.writeFileSync(this.catalogPath, JSON.stringify(data, null, 2));
      console.log('[ModelCatalog] Saved to disk');
    } catch (error) {
      console.warn('[ModelCatalog] Failed to save to disk:', error);
    }
  }

  /**
   * Search models by query
   */
  search(query: string): ModelCard[] {
    const lowerQuery = query.toLowerCase();
    return this.catalog.filter(model =>
      model.name.toLowerCase().includes(lowerQuery) ||
      model.displayName.toLowerCase().includes(lowerQuery) ||
      model.description.toLowerCase().includes(lowerQuery) ||
      model.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Filter by capabilities
   */
  filterByCapabilities(capabilities: string[]): ModelCard[] {
    return this.catalog.filter(model =>
      capabilities.every(cap => model.capabilities.includes(cap))
    );
  }

  /**
   * Filter by hardware compatibility
   */
  filterByHardware(maxSizeGB: number, maxVRAM?: number): ModelCard[] {
    return this.catalog.filter(model => {
      if (model.sizeGB > maxSizeGB) return false;
      if (maxVRAM !== undefined && model.vramGB > maxVRAM) return false;
      return true;
    });
  }
}

export const modelCatalog = new ModelCatalogService();

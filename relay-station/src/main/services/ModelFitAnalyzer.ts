/**
 * Model Fit Analyzer
 * 
 * Core algorithm for analyzing model-hardware compatibility
 * Mimics llmfit's ModelFit::analyze() logic
 */

import {
  EnhancedSystemSpecs,
  ModelMetadata,
  ModelFitAnalysis,
  FitLevel,
  RunMode,
  InferenceRuntime,
  ScoreComponents
} from './ModelFitTypes';
import { quantizationSelector } from './QuantizationSelector';

export class ModelFitAnalyzer {
  /**
   * Analyze model fit against system hardware
   * Main entry point - mimics llmfit's ModelFit::analyze()
   */
  analyze(
    model: ModelMetadata,
    system: EnhancedSystemSpecs
  ): ModelFitAnalysis {
    const notes: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // 1. Determine inference runtime
    const runtime = this.selectRuntime(system);
    
    // 2. Select execution path
    const { runMode, memRequired, memAvailable } = this.selectExecutionPath(
      model,
      system,
      runtime,
      notes
    );
    
    // 3. Score memory fit
    const fitLevel = this.scoreFit(
      memRequired,
      memAvailable,
      model.recommended_ram_gb,
      runMode
    );
    
    // 4. Select optimal quantization
    const quantResult = quantizationSelector.selectBestQuant(
      model,
      memAvailable,
      runtime
    );
    
    const recommendedQuant = quantResult?.quant || model.quantization_default;
    const availableQuants = quantResult?.allQuants || [model.quantization_default];
    
    if (quantResult && quantResult.quant !== model.quantization_default) {
      notes.push(
        `Best quantization for hardware: ${quantResult.quant} (model default: ${model.quantization_default})`
      );
    }
    
    // 5. Estimate performance
    const { tokensPerSec, loadTimeSec } = this.estimatePerformance(
      model,
      system,
      runMode,
      runtime
    );
    
    // 6. Calculate composite score
    const scoreComponents = this.calculateScoreComponents(
      model,
      system,
      fitLevel,
      tokensPerSec,
      runMode
    );
    
    // 7. Generate recommendations
    this.generateRecommendations(
      model,
      system,
      fitLevel,
      runMode,
      warnings,
      recommendations
    );
    
    const utilizationPct = memAvailable > 0 
      ? Math.round((memRequired / memAvailable) * 100)
      : 100;
    
    return {
      model_name: model.name,
      model_params: model.parameters,
      fit_level: fitLevel,
      run_mode: runMode,
      runtime,
      memory_required_gb: memRequired,
      memory_available_gb: memAvailable,
      utilization_pct: utilizationPct,
      recommended_quant: recommendedQuant,
      available_quants: availableQuants,
      estimated_tokens_per_sec: tokensPerSec,
      estimated_load_time_sec: loadTimeSec,
      composite_score: this.calculateCompositeScore(scoreComponents),
      score_components: scoreComponents,
      notes,
      warnings,
      recommendations,
      is_moe: model.is_moe,
      moe_experts_total: model.num_experts,
      moe_experts_active: model.active_experts
    };
  }

  /**
   * Select inference runtime based on system hardware
   */
  private selectRuntime(system: EnhancedSystemSpecs): InferenceRuntime {
    // Apple Silicon with Metal → MLX
    if (system.backend === 'metal' && system.unified_memory) {
      return InferenceRuntime.MLX;
    }
    
    // Everything else → llama.cpp (via Ollama)
    return InferenceRuntime.LLAMACPP;
  }

  /**
   * Select execution path (GPU/CPU-Offload/CPU-Only)
   * Returns run mode, memory required, memory available
   */
  private selectExecutionPath(
    model: ModelMetadata,
    system: EnhancedSystemSpecs,
    _runtime: InferenceRuntime,
    notes: string[]
  ): { runMode: RunMode; memRequired: number; memAvailable: number } {
    const minVram = model.min_vram_gb || model.min_ram_gb;
    
    // Unified memory path (Apple Silicon)
    if (system.unified_memory && system.primary_gpu) {
      notes.push('Unified memory: GPU and CPU share the same pool');
      
      if (model.is_moe) {
        notes.push(
          `MoE: ${model.active_experts || 0}/${model.num_experts || 0} experts active`
        );
      }
      
      return {
        runMode: RunMode.GPU,
        memRequired: minVram,
        memAvailable: system.memory.total_gb
      };
    }
    
    // Has discrete GPU with known VRAM
    if (system.has_gpu && system.primary_gpu?.vram_gb) {
      const vram = system.primary_gpu.vram_gb;
      
      // Fits in VRAM → GPU path
      if (minVram <= vram) {
        notes.push('GPU: model loaded into VRAM');
        
        if (model.is_moe) {
          notes.push('MoE: all experts loaded in VRAM (optimal)');
        }
        
        return {
          runMode: RunMode.GPU,
          memRequired: minVram,
          memAvailable: vram
        };
      }
      
      // MoE model → try expert offloading
      if (model.is_moe) {
        return this.selectMoeOffloadPath(model, system, vram, notes);
      }
      
      // Doesn't fit in VRAM → CPU offload
      if (model.min_ram_gb <= system.memory.available_gb) {
        notes.push('GPU: insufficient VRAM, spilling to system RAM');
        notes.push('Performance will be significantly reduced');
        
        return {
          runMode: RunMode.CPU_OFFLOAD,
          memRequired: model.min_ram_gb,
          memAvailable: system.memory.available_gb
        };
      }
    }
    
    // CPU-only fallback
    return this.selectCpuPath(model, system, notes);
  }

  /**
   * MoE offload path selection
   */
  private selectMoeOffloadPath(
    model: ModelMetadata,
    system: EnhancedSystemSpecs,
    vram: number,
    notes: string[]
  ): { runMode: RunMode; memRequired: number; memAvailable: number } {
    // Calculate expert offloading potential
    const activeExperts = model.active_experts || 2;
    const totalExperts = model.num_experts || 8;
    
    // Estimate: ~30% can be offloaded for MoE
    const offloadedGb = model.min_ram_gb * 0.3;
    const vramNeeded = model.min_ram_gb - offloadedGb;
    
    if (vramNeeded <= vram) {
      notes.push(`MoE: ${activeExperts}/${totalExperts} experts in VRAM, inactive offloaded to RAM`);
      notes.push('Performance will be good for active experts');
      
      return {
        runMode: RunMode.MOE_OFFLOAD,
        memRequired: model.min_ram_gb,
        memAvailable: vram + system.memory.available_gb * 0.5
      };
    }
    
    // Fall back to CPU offload
    notes.push('MoE: insufficient VRAM even with offloading');
    notes.push('Performance will be slower');
    
    return {
      runMode: RunMode.CPU_OFFLOAD,
      memRequired: model.min_ram_gb,
      memAvailable: system.memory.available_gb
    };
  }

  /**
   * CPU-only path selection
   */
  private selectCpuPath(
    model: ModelMetadata,
    system: EnhancedSystemSpecs,
    notes: string[]
  ): { runMode: RunMode; memRequired: number; memAvailable: number } {
    notes.push('No GPU detected or insufficient VRAM - CPU-only inference');
    
    return {
      runMode: RunMode.CPU_ONLY,
      memRequired: model.min_ram_gb,
      memAvailable: system.memory.available_gb
    };
  }

  /**
   * Score memory fit
   */
  private scoreFit(
    memRequired: number,
    memAvailable: number,
    recommended: number,
    runMode: RunMode
  ): FitLevel {
    // Doesn't fit at all
    if (memRequired > memAvailable) {
      return FitLevel.TOO_TIGHT;
    }
    
    switch (runMode) {
      case RunMode.GPU:
        // GPU can achieve Perfect
        if (memAvailable >= recommended) {
          return FitLevel.PERFECT;
        }
        if (memAvailable >= memRequired * 1.2) {
          return FitLevel.GOOD;
        }
        return FitLevel.MARGINAL;
        
      case RunMode.MOE_OFFLOAD:
      case RunMode.CPU_OFFLOAD:
        // Offload caps at Good
        if (memAvailable >= memRequired * 1.2) {
          return FitLevel.GOOD;
        }
        return FitLevel.MARGINAL;
        
      case RunMode.CPU_ONLY:
        // CPU-only always caps at Marginal
        return FitLevel.MARGINAL;
        
      default:
        return FitLevel.MARGINAL;
    }
  }

  /**
   * Estimate performance (tokens/sec and load time)
   */
  private estimatePerformance(
    model: ModelMetadata,
    system: EnhancedSystemSpecs,
    runMode: RunMode,
    runtime: InferenceRuntime
  ): { tokensPerSec: number; loadTimeSec: number } {
    // Base tokens/sec by parameter count
    const paramCount = quantizationSelector.parseParamCount(model.parameters);
    let baseTps = 20; // 7B baseline
    
    if (paramCount <= 1) baseTps = 60;
    else if (paramCount <= 3) baseTps = 40;
    else if (paramCount <= 7) baseTps = 20;
    else if (paramCount <= 13) baseTps = 12;
    else if (paramCount <= 34) baseTps = 6;
    else if (paramCount <= 70) baseTps = 3;
    else baseTps = 1.5;
    
    // Run mode multiplier
    const modeFactor = {
      [RunMode.GPU]: 1.0,
      [RunMode.MOE_OFFLOAD]: 0.5,
      [RunMode.CPU_OFFLOAD]: 0.3,
      [RunMode.CPU_ONLY]: system.cpu.architecture.includes('arm') ? 0.1 : 0.05
    }[runMode];
    
    // Backend multiplier
    const backendFactor = {
      'metal': 0.8,  // MLX efficiency
      'cuda': 1.0,
      'rocm': 0.9,
      'vulkan': 0.7,
      'sycl': 0.6,
      'cpu': 1.0
    }[system.backend] || 1.0;
    
    // Runtime multiplier
    const runtimeFactor = runtime === InferenceRuntime.MLX ? 1.1 : 1.0;
    
    const tokensPerSec = Math.round(baseTps * modeFactor * backendFactor * runtimeFactor);
    
    // Load time estimate
    const loadTimeSec = runMode === RunMode.GPU ? 3 : runMode === RunMode.CPU_ONLY ? 15 : 8;
    
    return { tokensPerSec, loadTimeSec };
  }

  /**
   * Calculate score components
   */
  private calculateScoreComponents(
    model: ModelMetadata,
    _system: EnhancedSystemSpecs,
    fitLevel: FitLevel,
    tokensPerSec: number,
    _runMode: RunMode
  ): ScoreComponents {
    // Quality score (based on parameter count)
    const paramCount = quantizationSelector.parseParamCount(model.parameters);
    const qualityScore = Math.min(100, Math.round(40 + (paramCount / 70) * 60));
    
    // Speed score (based on estimated tokens/sec)
    const speedScore = Math.min(100, Math.round((tokensPerSec / 50) * 100));
    
    // Fit score (based on fit level)
    const fitScore = {
      [FitLevel.PERFECT]: 100,
      [FitLevel.GOOD]: 80,
      [FitLevel.MARGINAL]: 50,
      [FitLevel.TOO_TIGHT]: 0
    }[fitLevel];
    
    // Context score (based on context window)
    const contextScore = Math.min(100, Math.round((model.context_length / 128000) * 100));
    
    return {
      quality: qualityScore,
      speed: speedScore,
      fit: fitScore,
      context: contextScore
    };
  }

  /**
   * Calculate composite score (weighted average)
   */
  private calculateCompositeScore(components: ScoreComponents): number {
    // Weights: quality 25%, speed 30%, fit 35%, context 10%
    const weighted = 
      components.quality * 0.25 +
      components.speed * 0.30 +
      components.fit * 0.35 +
      components.context * 0.10;
    
    return Math.round(weighted);
  }

  /**
   * Generate warnings and recommendations
   */
  private generateRecommendations(
    model: ModelMetadata,
    system: EnhancedSystemSpecs,
    fitLevel: FitLevel,
    runMode: RunMode,
    warnings: string[],
    recommendations: string[]
  ): void {
    // Fit-based recommendations
    if (fitLevel === FitLevel.TOO_TIGHT) {
      warnings.push('Model does not fit in available memory');
      recommendations.push('Try a smaller model or add more RAM/VRAM');
    } else if (fitLevel === FitLevel.MARGINAL) {
      warnings.push('Model will run with limited headroom');
      recommendations.push('Consider closing other applications to free memory');
    } else if (fitLevel === FitLevel.PERFECT) {
      recommendations.push('Optimal hardware for this model - expect great performance!');
    }
    
    // Run mode recommendations
    if (runMode === RunMode.CPU_ONLY && !system.has_gpu) {
      warnings.push('No GPU detected - inference will be slow');
      recommendations.push('Consider GPU upgrade for 10-20x faster inference');
    } else if (runMode === RunMode.CPU_OFFLOAD) {
      warnings.push('Model spilling to system RAM - expect reduced performance');
      recommendations.push('Try a smaller quantization (Q4_0) or smaller model variant');
    }
    
    // CPU core warning
    if (runMode !== RunMode.GPU && system.cpu.physicalCores < 4) {
      warnings.push('Low CPU core count may bottleneck inference');
    }
    
    // Context window note
    if (model.context_length >= 100000) {
      recommendations.push('Large context window - may require more memory at high utilization');
    }
  }
}

export const modelFitAnalyzer = new ModelFitAnalyzer();

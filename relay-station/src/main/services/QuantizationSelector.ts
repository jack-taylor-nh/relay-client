/**
 * Quantization Selection Service
 * 
 * Selects optimal quantization based on available memory
 * Mimics llmfit's quantization hierarchy logic
 */

import { InferenceRuntime, ModelMetadata } from './ModelFitTypes';

// Quantization hierarchies (best to most compressed)
export const GGUF_QUANT_HIERARCHY = [
  'F16', 'Q8_0', 'Q6_K', 'Q5_K_M', 
  'Q4_K_M', 'Q4_0', 'Q3_K_M', 'Q2_K'
] as const;

export const MLX_QUANT_HIERARCHY = [
  'bf16', '8bit', '6bit', '4bit'
] as const;

export class QuantizationSelector {
  /**
   * Select best quantization that fits within memory budget
   */
  selectBestQuant(
    model: ModelMetadata,
    budgetGb: number,
    runtime: InferenceRuntime
  ): { quant: string; memRequired: number; allQuants: string[] } | null {
    const hierarchy = runtime === InferenceRuntime.MLX
      ? MLX_QUANT_HIERARCHY
      : GGUF_QUANT_HIERARCHY;
    
    const allAvailable: string[] = [];
    
    for (const quant of hierarchy) {
      const memRequired = this.estimateMemory(
        model, 
        quant, 
        model.context_length
      );
      
      allAvailable.push(quant);
      
      if (memRequired <= budgetGb) {
        return { 
          quant, 
          memRequired, 
          allQuants: allAvailable 
        };
      }
    }
    
    // Nothing fits
    return null;
  }

  /**
   * Estimate memory requirement for a specific quantization
   * Formula: (params * bits_per_param / 8) + (context * overhead) + activation_overhead
   */
  estimateMemory(
    model: ModelMetadata,
    quant: string,
    contextLength: number
  ): number {
    const paramCount = model.parameters_raw / 1e9; // Convert to billions
    const bitsPerParam = this.getBitsPerParam(quant);
    
    // Model weights in GB
    const modelMemGb = (paramCount * bitsPerParam) / 8;
    
    // KV cache overhead (scales with context length)
    // Rough formula: context_tokens * params_billions * 2 * bytes_per_activation / 1e9
    const contextMemGb = (contextLength * paramCount * 2 * 2) / 1e9;
    
    // Activation overhead (~20% of model size)
    const overhead = modelMemGb * 0.2;
    
    const total = modelMemGb + contextMemGb + overhead;
    
    return Math.round(total * 10) / 10; // Round to 1 decimal
  }

  /**
   * Get bits per parameter for quantization level
   */
  private getBitsPerParam(quant: string): number {
    const bitsMap: Record<string, number> = {
      // Full precision
      'F16': 16,
      'bf16': 16,
      'F32': 32,
      
      // 8-bit quantization
      'Q8_0': 8,
      '8bit': 8,
      'Q8_K': 8,
      
      // 6-bit quantization
      'Q6_K': 6.5,
      '6bit': 6,
      
      // 5-bit quantization
      'Q5_K_M': 5.5,
      'Q5_K_S': 5,
      'Q5_0': 5,
      'Q5_1': 5,
      
      // 4-bit quantization
      'Q4_K_M': 4.5,
      'Q4_K_S': 4.25,
      'Q4_0': 4,
      'Q4_1': 4,
      '4bit': 4,
      
      // 3-bit quantization
      'Q3_K_M': 3.5,
      'Q3_K_S': 3.25,
      
      // 2-bit quantization
      'Q2_K': 2.5,
    };
    
    return bitsMap[quant] || 4; // Default to Q4 if unknown
  }

  /**
   * Parse parameter count from string like "7B" or "70B"
   */
  parseParamCount(params: string): number {
    const match = params.match(/(\d+\.?\d*)([BMK])?/i);
    if (!match) return 7; // Default to 7B
    
    const num = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    switch (unit) {
      case 'B': return num;
      case 'M': return num / 1000;
      case 'K': return num / 1000000;
      default: return num;
    }
  }

  /**
   * Get all quantization options for a model
   */
  getAllQuantOptions(runtime: InferenceRuntime): string[] {
    return runtime === InferenceRuntime.MLX
      ? [...MLX_QUANT_HIERARCHY]
      : [...GGUF_QUANT_HIERARCHY];
  }

  /**
   * Estimate memory for all quantization levels
   */
  estimateAllQuantMemory(
    model: ModelMetadata,
    runtime: InferenceRuntime
  ): Array<{ quant: string; memory_gb: number }> {
    const allQuants = this.getAllQuantOptions(runtime);
    
    return allQuants.map(quant => ({
      quant,
      memory_gb: this.estimateMemory(model, quant, model.context_length)
    }));
  }
}

export const quantizationSelector = new QuantizationSelector();

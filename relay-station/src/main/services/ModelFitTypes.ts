/**
 * Model Fit System - Type Definitions
 * 
 * Shared types for model-hardware compatibility analysis
 * Inspired by llmfit's architecture
 */

export enum FitLevel {
  PERFECT = 'perfect',    // Recommended RAM met, GPU acceleration
  GOOD = 'good',          // Adequate headroom (1.2x)
  MARGINAL = 'marginal',  // Tight fit or CPU-only
  TOO_TIGHT = 'too_tight' // Doesn't fit
}

export enum RunMode {
  GPU = 'gpu',                 // Full GPU acceleration
  CPU_OFFLOAD = 'cpu_offload', // GPU + system RAM spillover
  MOE_OFFLOAD = 'moe_offload', // MoE expert offloading
  CPU_ONLY = 'cpu_only'        // CPU-only inference
}

export enum InferenceRuntime {
  MLX = 'mlx',            // Apple MLX
  LLAMACPP = 'llama.cpp', // llama.cpp/Ollama
  VLLM = 'vllm'          // vLLM for advanced users
}

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
export type GpuBackend = 'cuda' | 'rocm' | 'metal' | 'vulkan' | 'sycl' | 'cpu';
export type CpuArchitecture = 'x86' | 'x86_64' | 'arm' | 'arm64';

export interface EnhancedGpuInfo {
  name: string;
  vendor: GpuVendor;
  vram_gb: number | null;
  backend: GpuBackend;
  count: number; // Multi-GPU support
  unified_memory: boolean;
  pci_slot?: string;
}

export interface EnhancedSystemSpecs {
  cpu: {
    name: string;
    manufacturer: string;
    cores: number;
    physicalCores: number;
    speed: number;
    architecture: CpuArchitecture;
  };
  memory: {
    total_gb: number;
    available_gb: number;
    used_gb: number;
  };
  gpus: EnhancedGpuInfo[];
  primary_gpu: EnhancedGpuInfo | null;
  has_gpu: boolean;
  unified_memory: boolean;
  platform: 'win32' | 'darwin' | 'linux';
  backend: GpuBackend; // Primary backend
}

export interface ScoreComponents {
  quality: number;   // 0-100, based on param count
  speed: number;     // 0-100, hardware throughput
  fit: number;       // 0-100, memory headroom
  context: number;   // 0-100, context window size
}

export interface ModelMetadata {
  id: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  
  // Parameters
  parameters: string; // "3B", "7B", "70B"
  parameters_raw: number; // 7000000000
  
  // Memory requirements
  min_ram_gb: number;
  recommended_ram_gb: number;
  min_vram_gb: number | null;
  
  // Context and quantization
  context_length: number;
  quantization_default: string;
  available_quantizations: string[];
  
  // MoE fields
  is_moe: boolean;
  num_experts?: number;
  active_experts?: number;
  
  // Metadata
  architecture: string;
  use_cases: string[];
  release_date?: string;
  license?: string;
  tags: string[];
  capabilities: string[];
  
  // Size info
  sizeGB: number;
  popularity: number;
}

export interface ModelFitAnalysis {
  model_name: string;
  model_params: string; // "7B", "70B"
  
  // Fit assessment
  fit_level: FitLevel;
  run_mode: RunMode;
  runtime: InferenceRuntime;
  
  // Memory
  memory_required_gb: number;
  memory_available_gb: number;
  utilization_pct: number;
  
  // Quantization
  recommended_quant: string;
  available_quants: string[];
  
  // Performance
  estimated_tokens_per_sec: number;
  estimated_load_time_sec: number;
  
  // Scoring
  composite_score: number; // 0-100
  score_components: ScoreComponents;
  
  // Metadata
  notes: string[];
  warnings: string[];
  recommendations: string[];
  
  // MoE-specific (if applicable)
  is_moe?: boolean;
  moe_experts_total?: number;
  moe_experts_active?: number;
  moe_offloaded_gb?: number;
}

export interface RecommendationFilters {
  use_case?: string;
  min_fit_level?: FitLevel;
  runtime?: InferenceRuntime;
  max_size_gb?: number;
  limit?: number;
}

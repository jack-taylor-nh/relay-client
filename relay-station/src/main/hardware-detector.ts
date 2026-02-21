/**
 * Hardware Detection Service
 * 
 * Detects system hardware specs (CPU, RAM, GPU) for model compatibility checks
 */

import * as si from 'systeminformation';

export interface HardwareSpecs {
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speed: number; // GHz
  };
  ram: {
    total: number; // GB
    available: number; // GB
    used: number; // GB
  };
  gpu?: {
    model: string;
    vram: number; // GB
    vendor: string;
  };
  platform: 'win32' | 'darwin' | 'linux';
  arch: string;
}

export enum CompatibilityStatus {
  OPTIMAL = 'optimal',
  COMPATIBLE = 'compatible',
  SLOW = 'slow',
  INCOMPATIBLE = 'incompatible'
}

export interface PerformanceEstimate {
  status: CompatibilityStatus;
  tokensPerSecond: number;
  loadTimeSeconds: number;
  warnings: string[];
  recommendations: string[];
}

class HardwareDetector {
  private cachedSpecs: HardwareSpecs | null = null;
  private lastDetection: number = 0;
  private CACHE_TTL = 60000; // 1 minute

  /**
   * Detect system hardware specifications
   */
  async detect(): Promise<HardwareSpecs> {
    // Return cached if recent
    if (this.cachedSpecs && Date.now() - this.lastDetection < this.CACHE_TTL) {
      return this.cachedSpecs;
    }

    console.log('[Hardware] Detecting system specifications...');

    try {
      const [cpu, mem, graphics, osInfo] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.graphics(),
        si.osInfo()
      ]);

      // Parse RAM (convert bytes to GB)
      const totalRAM = Math.round(mem.total / (1024 ** 3));
      const usedRAM = Math.round(mem.used / (1024 ** 3));
      const availableRAM = totalRAM - usedRAM;

      // Parse GPU (if available)
      let gpu: HardwareSpecs['gpu'] | undefined;
      if (graphics.controllers && graphics.controllers.length > 0) {
        const primaryGPU = graphics.controllers[0];
        // VRAM in GB
        const vram = primaryGPU.vram ? Math.round(primaryGPU.vram / 1024) : 0;
        
        if (vram > 0) {
          gpu = {
            model: primaryGPU.model || 'Unknown GPU',
            vram,
            vendor: primaryGPU.vendor || 'Unknown'
          };
        }
      }

      const specs: HardwareSpecs = {
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          speed: cpu.speed
        },
        ram: {
          total: totalRAM,
          available: availableRAM,
          used: usedRAM
        },
        gpu,
        platform: osInfo.platform as any,
        arch: osInfo.arch
      };

      this.cachedSpecs = specs;
      this.lastDetection = Date.now();

      console.log('[Hardware] Detection complete:', {
        cpu: `${specs.cpu.brand} (${specs.cpu.physicalCores} cores)`,
        ram: `${specs.ram.total}GB total, ${specs.ram.available}GB available`,
        gpu: specs.gpu ? `${specs.gpu.model} (${specs.gpu.vram}GB VRAM)` : 'None detected'
      });

      return specs;
    } catch (error) {
      console.error('[Hardware] Detection failed:', error);
      // Return minimal fallback specs
      return {
        cpu: {
          manufacturer: 'Unknown',
          brand: 'Unknown CPU',
          cores: 4,
          physicalCores: 4,
          speed: 2.5
        },
        ram: {
          total: 8,
          available: 4,
          used: 4
        },
        platform: process.platform as any,
        arch: process.arch
      };
    }
  }

  /**
   * Check if system can run a model with given specs
   */
  canRunModel(modelSizeGB: number, modelVRAM: number = 0): CompatibilityStatus {
    if (!this.cachedSpecs) {
      return CompatibilityStatus.COMPATIBLE; // Unknown, assume compatible
    }

    const { ram, gpu } = this.cachedSpecs;
    
    // Calculate required RAM (model size * 1.2 for overhead)
    const requiredRAM = modelSizeGB * 1.2;
    
    // Check if model requires GPU
    if (modelVRAM > 0) {
      if (!gpu || gpu.vram < modelVRAM) {
        return CompatibilityStatus.SLOW; // Can run on CPU but will be slow
      }
      
      if (gpu.vram >= modelVRAM * 2) {
        return CompatibilityStatus.OPTIMAL;
      }
      
      return CompatibilityStatus.COMPATIBLE;
    }
    
    // CPU-only model
    if (ram.available < requiredRAM) {
      return CompatibilityStatus.INCOMPATIBLE;
    }
    
    if (ram.available >= requiredRAM * 2) {
      return CompatibilityStatus.OPTIMAL;
    }
    
    if (ram.available >= requiredRAM * 1.5) {
      return CompatibilityStatus.COMPATIBLE;
    }
    
    return CompatibilityStatus.SLOW;
  }

  /**
   * Estimate performance for a given model
   */
  estimatePerformance(modelSizeGB: number, modelVRAM: number = 0): PerformanceEstimate {
    const status = this.canRunModel(modelSizeGB, modelVRAM);
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (!this.cachedSpecs) {
      return {
        status: CompatibilityStatus.COMPATIBLE,
        tokensPerSecond: 10,
        loadTimeSeconds: 5,
        warnings: ['Hardware detection unavailable'],
        recommendations: []
      };
    }

    const { ram, gpu } = this.cachedSpecs;
    
    // Estimate tokens per second based on hardware
    let tokensPerSecond = 2; // Base CPU speed
    let loadTimeSeconds = 10;
    
    if (gpu && modelVRAM > 0 && gpu.vram >= modelVRAM) {
      // GPU acceleration
      tokensPerSecond = 30; // Much faster with GPU
      loadTimeSeconds = 3;
      
      if (gpu.vram >= modelVRAM * 2) {
        tokensPerSecond = 50; // Optimal GPU
        loadTimeSeconds = 2;
      }
    } else {
      // CPU-only performance
      const ramFactor = ram.available / (modelSizeGB * 1.2);
      tokensPerSecond = Math.max(2, Math.min(15, ramFactor * 5));
      loadTimeSeconds = Math.max(3, Math.min(30, 60 / ramFactor));
      
      if (modelVRAM > 0) {
        warnings.push('No GPU detected or insufficient VRAM - model will run on CPU (slower)');
        recommendations.push('Consider GPU upgrade for 10-20x faster inference');
      }
    }
    
    // Add warnings based on status
    if (status === CompatibilityStatus.INCOMPATIBLE) {
      warnings.push(`Insufficient RAM: ${ram.available}GB available, ${(modelSizeGB * 1.2).toFixed(1)}GB required`);
      recommendations.push('Close other applications or upgrade RAM');
    } else if (status === CompatibilityStatus.SLOW) {
      warnings.push('Model will run slowly on your hardware');
      if (!gpu) {
        recommendations.push('Try a smaller quantized version (Q4_0) for better performance');
      }
    } else if (status === CompatibilityStatus.OPTIMAL) {
      recommendations.push('Optimal hardware for this model - expect great performance!');
    }
    
    return {
      status,
      tokensPerSecond: Math.round(tokensPerSecond),
      loadTimeSeconds: Math.round(loadTimeSeconds),
      warnings,
      recommendations
    };
  }
}

export const hardwareDetector = new HardwareDetector();

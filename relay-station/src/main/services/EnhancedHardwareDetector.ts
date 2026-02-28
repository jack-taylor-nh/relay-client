/**
 * Enhanced Hardware Detection Service
 * 
 * Multi-vendor GPU detection with fallbacks
 * Inspired by llmfit's hardware.rs
 */

import * as si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  EnhancedSystemSpecs,
  EnhancedGpuInfo,
  GpuVendor,
  GpuBackend,
  CpuArchitecture
} from './ModelFitTypes';

const execAsync = promisify(exec);

class EnhancedHardwareDetector {
  private cachedSpecs: EnhancedSystemSpecs | null = null;
  private lastDetection: number = 0;
  private CACHE_TTL = 300000; // 5 minutes

  /**
   * Main hardware detection entry point
   */
  async detect(): Promise<EnhancedSystemSpecs> {
    // Return cached if recent
    if (this.cachedSpecs && Date.now() - this.lastDetection < this.CACHE_TTL) {
      console.log('[EnhancedHardware] Using cached specs');
      return this.cachedSpecs;
    }

    console.log('[EnhancedHardware] Detecting system specifications...');

    try {
      // Parallel detection
      const [cpu, mem, graphics, osInfo] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.graphics(),
        si.osInfo()
      ]);

      // Parse CPU
      const cpuArch = this.detectCpuArchitecture(osInfo.arch, cpu.manufacturer);
      
      // Parse Memory (convert bytes to GB)
      const totalRAM = Math.round(mem.total / (1024 ** 3) * 10) / 10;
      const usedRAM = Math.round(mem.used / (1024 ** 3) * 10) / 10;
      const availableRAM = Math.round((mem.available || (mem.total - mem.used)) / (1024 ** 3) * 10) / 10;

      // Detect GPUs with multi-vendor support
      const gpus = await this.detectAllGpus(graphics, totalRAM, cpu.manufacturer);
      
      // Primary GPU = best VRAM
      const primaryGpu = gpus.length > 0 ? gpus[0] : null;
      const hasGpu = gpus.length > 0;
      const unifiedMemory = primaryGpu?.unified_memory || false;
      
      // Determine primary backend
      const backend = this.determineBackend(primaryGpu, cpuArch);

      const specs: EnhancedSystemSpecs = {
        cpu: {
          name: cpu.brand,
          manufacturer: cpu.manufacturer,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          speed: cpu.speed,
          architecture: cpuArch
        },
        memory: {
          total_gb: totalRAM,
          available_gb: availableRAM,
          used_gb: usedRAM
        },
        gpus,
        primary_gpu: primaryGpu,
        has_gpu: hasGpu,
        unified_memory: unifiedMemory,
        platform: osInfo.platform as any,
        backend
      };

      this.cachedSpecs = specs;
      this.lastDetection = Date.now();

      console.log('[EnhancedHardware] Detection complete:', {
        cpu: `${specs.cpu.name} (${specs.cpu.physicalCores} cores)`,
        ram: `${specs.memory.total_gb}GB total, ${specs.memory.available_gb}GB available`,
        gpus: specs.gpus.map(g => `${g.name} (${g.vram_gb || 'unknown'}GB VRAM)`),
        backend: specs.backend
      });

      return specs;
    } catch (error) {
      console.error('[EnhancedHardware] Detection failed:', error);
      return this.getFallbackSpecs();
    }
  }

  /**
   * Detect all GPUs across all vendors
   * Returns array sorted by VRAM descending (best first)
   */
  private async detectAllGpus(
    graphics: si.Systeminformation.GraphicsData,
    totalRamGb: number,
    cpuManufacturer: string
  ): Promise<EnhancedGpuInfo[]> {
    const gpus: EnhancedGpuInfo[] = [];

    // Start with systeminformation data
    if (graphics.controllers && graphics.controllers.length > 0) {
      for (const controller of graphics.controllers) {
        const vramMB = controller.vram || 0;
        const vramGB = vramMB > 0 ? Math.round(vramMB / 1024 * 10) / 10 : null;
        
        const vendor = this.detectVendor(controller.vendor, controller.model);
        const backend = this.detectBackend(vendor, process.platform, cpuManufacturer);
        
        // Check for Apple Silicon unified memory
        const isAppleSilicon = this.isAppleSilicon(controller.model, cpuManufacturer);
        const unifiedMemory = isAppleSilicon;
        const finalVram = isAppleSilicon ? totalRamGb : vramGB;
        
        if (vramGB !== null || isAppleSilicon) {
          gpus.push({
            name: controller.model || 'Unknown GPU',
            vendor,
            vram_gb: finalVram,
            backend,
            count: 1,
            unified_memory: unifiedMemory,
            pci_slot: controller.bus
          });
        }
      }
    }

    // Fallback: Try vendor-specific tools
    if (gpus.length === 0 || gpus.every(g => g.vram_gb === null)) {
      console.log('[EnhancedHardware] Trying vendor-specific detection...');
      
      const nvidiaGpus = await this.detectNvidiaGpus();
      if (nvidiaGpus.length > 0) {
        gpus.push(...nvidiaGpus);
      }
      
      // Could add AMD/ROCm detection here in the future
      // const amdGpus = await this.detectAmdGpus();
    }

    // Sort by VRAM descending (best GPU first)
    gpus.sort((a, b) => {
      const vramA = a.vram_gb || 0;
      const vramB = b.vram_gb || 0;
      return vramB - vramA;
    });

    return gpus;
  }

  /**
   * Detect NVIDIA GPUs via nvidia-smi
   */
  private async detectNvidiaGpus(): Promise<EnhancedGpuInfo[]> {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.total,name --format=csv,noheader,nounits');
      
      const lines = stdout.trim().split('\n');
      const gpuMap = new Map<string, { count: number; vram: number }>();
      
      for (const line of lines) {
        const [vramStr, name] = line.split(',').map(s => s.trim());
        const vramMB = parseInt(vramStr, 10);
        const vramGB = Math.round(vramMB / 1024 * 10) / 10;
        
        if (!gpuMap.has(name)) {
          gpuMap.set(name, { count: 0, vram: vramGB });
        }
        gpuMap.get(name)!.count++;
      }
      
      return Array.from(gpuMap.entries()).map(([name, data]) => ({
        name,
        vendor: 'nvidia',
        vram_gb: data.vram,
        backend: 'cuda',
        count: data.count,
        unified_memory: false
      }));
    } catch (error) {
      console.log('[EnhancedHardware] nvidia-smi not available');
      return [];
    }
  }

  /**
   * Detect GPU vendor from name/vendor string
   */
  private detectVendor(vendor: string, model: string): GpuVendor {
    const combined = `${vendor} ${model}`.toLowerCase();
    
    if (combined.includes('nvidia') || combined.includes('geforce') || combined.includes('rtx') || combined.includes('gtx')) {
      return 'nvidia';
    }
    if (combined.includes('amd') || combined.includes('radeon') || combined.includes('rx ')) {
      return 'amd';
    }
    if (combined.includes('intel') || combined.includes('arc') || combined.includes('iris')) {
      return 'intel';
    }
    if (combined.includes('apple') || combined.includes('m1') || combined.includes('m2') || 
        combined.includes('m3') || combined.includes('m4')) {
      return 'apple';
    }
    
    return 'unknown';
  }

  /**
   * Detect GPU backend based on vendor and platform
   */
  private detectBackend(vendor: GpuVendor, platform: string, cpuManufacturer: string): GpuBackend {
    if (vendor === 'apple' || this.isAppleSilicon('', cpuManufacturer)) {
      return 'metal';
    }
    
    if (vendor === 'nvidia') {
      return 'cuda';
    }
    
    if (vendor === 'amd') {
      // ROCm on Linux, Vulkan elsewhere
      return platform === 'linux' ? 'rocm' : 'vulkan';
    }
    
    if (vendor === 'intel') {
      // SYCL for Intel Arc
      return 'sycl';
    }
    
    return 'cpu';
  }

  /**
   * Check if this is Apple Silicon
   */
  private isAppleSilicon(model: string, cpuManufacturer: string): boolean {
    const combined = `${model} ${cpuManufacturer}`.toLowerCase();
    return combined.includes('apple') || 
           combined.includes('m1') || 
           combined.includes('m2') || 
           combined.includes('m3') ||
           combined.includes('m4');
  }

  /**
   * Detect CPU architecture
   */
  private detectCpuArchitecture(arch: string, manufacturer: string): CpuArchitecture {
    const lower = arch.toLowerCase();
    const mfg = manufacturer.toLowerCase();
    
    if (mfg.includes('apple') || lower.includes('arm64') || lower.includes('aarch64')) {
      return 'arm64';
    }
    if (lower.includes('arm')) {
      return 'arm';
    }
    if (lower.includes('x64') || lower.includes('x86_64') || lower.includes('amd64')) {
      return 'x86_64';
    }
    return 'x86';
  }

  /**
   * Determine primary backend
   */
  private determineBackend(primaryGpu: EnhancedGpuInfo | null, cpuArch: CpuArchitecture): GpuBackend {
    if (primaryGpu) {
      return primaryGpu.backend;
    }
    
    // CPU-only: distinguish ARM vs x86
    return cpuArch.includes('arm') ? 'cpu' : 'cpu';
  }

  /**
   * Fallback specs when detection fails
   */
  private getFallbackSpecs(): EnhancedSystemSpecs {
    console.warn('[EnhancedHardware] Using fallback specs');
    
    return {
      cpu: {
        name: 'Unknown CPU',
        manufacturer: 'Unknown',
        cores: 4,
        physicalCores: 4,
        speed: 2.5,
        architecture: 'x86_64'
      },
      memory: {
        total_gb: 16,
        available_gb: 8,
        used_gb: 8
      },
      gpus: [],
      primary_gpu: null,
      has_gpu: false,
      unified_memory: false,
      platform: process.platform as any,
      backend: 'cpu'
    };
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cachedSpecs = null;
    this.lastDetection = 0;
  }
}

export const enhancedHardwareDetector = new EnhancedHardwareDetector();

/**
 * Platform detection and compatibility utilities
 */

import type { Platform } from './export-schema.js';

/**
 * Detect current platform at runtime
 */
export function detectPlatform(): Platform {
  // Check for Chrome extension environment
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return 'extension';
  }
  
  // Check for Electron
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return 'desktop';
  }
  
  // Check for React Native
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'mobile';
  }
  
  // Default to web
  return 'web';
}

/**
 * Compatibility warning for cross-platform imports
 */
export interface CompatibilityWarning {
  level: 'info' | 'warning' | 'error';
  message: string;
}

/**
 * Check platform compatibility for import
 */
export function validatePlatformCompatibility(
  exportedFrom: Platform,
  importingTo: Platform
): {
  compatible: boolean;
  warnings: CompatibilityWarning[];
} {
  const warnings: CompatibilityWarning[] = [];
  
  // Same platform - fully compatible
  if (exportedFrom === importingTo) {
    return { compatible: true, warnings: [] };
  }
  
  // Cross-platform compatibility checks
  
  // Extension → Other platforms
  if (exportedFrom === 'extension') {
    warnings.push({
      level: 'info',
      message: `Importing from ${exportedFrom} to ${importingTo}. All data should be compatible.`
    });
  }
  
  // Mobile → Other platforms
  if (exportedFrom === 'mobile') {
    warnings.push({
      level: 'info',
      message: `Importing from ${exportedFrom} to ${importingTo}. All data should be compatible.`
    });
  }
  
  // Desktop → Other platforms
  if (exportedFrom === 'desktop') {
    warnings.push({
      level: 'info',
      message: `Importing from ${exportedFrom} to ${importingTo}. All data should be compatible.`
    });
  }
  
  // Web → Other platforms
  if (exportedFrom === 'web') {
    warnings.push({
      level: 'info',
      message: `Importing from ${exportedFrom} to ${importingTo}. All data should be compatible.`
    });
  }
  
  // All platforms use the same @relay/core library, so cross-platform
  // imports should work seamlessly. Add warnings only for known edge cases.
  
  return {
    compatible: true,
    warnings
  };
}

/**
 * Get platform display name
 */
export function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    extension: 'Browser Extension',
    mobile: 'Mobile App',
    web: 'Web App',
    desktop: 'Desktop App'
  };
  
  return names[platform] || platform;
}

/**
 * Check if platform supports certain features
 */
export interface PlatformCapabilities {
  fileSystem: boolean;      // Direct file system access
  secureEnclave: boolean;   // Hardware-backed key storage
  biometric: boolean;       // Biometric authentication
  notifications: boolean;   // Push notifications
  backgroundSync: boolean;  // Background data sync
}

/**
 * Get platform capabilities
 */
export function getPlatformCapabilities(platform: Platform): PlatformCapabilities {
  switch (platform) {
    case 'extension':
      return {
        fileSystem: false,  // Via downloads API only
        secureEnclave: false,
        biometric: false,
        notifications: true,
        backgroundSync: true
      };
      
    case 'mobile':
      return {
        fileSystem: true,
        secureEnclave: true,  // iOS Secure Enclave / Android Keystore
        biometric: true,
        notifications: true,
        backgroundSync: true
      };
      
    case 'desktop':
      return {
        fileSystem: true,
        secureEnclave: false, // Could use OS keychain
        biometric: false,     // Could integrate with Windows Hello, etc.
        notifications: true,
        backgroundSync: true
      };
      
    case 'web':
      return {
        fileSystem: false,    // Via File API only
        secureEnclave: false,
        biometric: false,     // Could use WebAuthn
        notifications: true,  // Web Push
        backgroundSync: true  // Service Workers
      };
  }
}

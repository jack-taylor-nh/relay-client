/**
 * Relay Theme Hook
 * 
 * Provides theme state management with persistence.
 * Works with both chrome.storage (extension) and localStorage (web).
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'relay-theme';

/**
 * Get the system preferred color scheme
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve theme mode to actual light/dark
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

/**
 * Apply theme to DOM
 */
function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  // Temporarily disable transitions to prevent flash
  root.classList.add('no-transitions');
  
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
  
  // Re-enable transitions after a frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('no-transitions');
    });
  });
}

/**
 * Storage adapter - uses chrome.storage if available, falls back to localStorage
 */
const storage = {
  async get(): Promise<ThemeMode | null> {
    try {
      // Try chrome.storage first (extension context)
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return result[STORAGE_KEY] as ThemeMode | null;
      }
    } catch (e) {
      // Not in extension context
    }
    
    // Fall back to localStorage
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    }
    
    return null;
  },
  
  async set(theme: ThemeMode): Promise<void> {
    try {
      // Try chrome.storage first (extension context)
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: theme });
        return;
      }
    } catch (e) {
      // Not in extension context
    }
    
    // Fall back to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  },
};

/**
 * Theme state manager singleton
 * Can be used standalone or with framework hooks
 */
class ThemeManager {
  private mode: ThemeMode = 'system';
  private resolved: ResolvedTheme = 'light';
  private listeners: Set<() => void> = new Set();
  private initialized = false;
  private mediaQuery: MediaQueryList | null = null;
  
  /**
   * Initialize the theme system
   * Call this once when your app starts
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    
    // Load saved preference
    const savedTheme = await storage.get();
    this.mode = savedTheme || 'system';
    this.resolved = resolveTheme(this.mode);
    
    // Apply immediately
    applyTheme(this.resolved);
    
    // Listen for system theme changes
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', this.handleSystemChange);
    }
  }
  
  private handleSystemChange = (): void => {
    if (this.mode === 'system') {
      this.resolved = getSystemTheme();
      applyTheme(this.resolved);
      this.notifyListeners();
    }
  };
  
  /**
   * Get current theme mode
   */
  getMode(): ThemeMode {
    return this.mode;
  }
  
  /**
   * Get resolved theme (actual light/dark)
   */
  getResolved(): ResolvedTheme {
    return this.resolved;
  }
  
  /**
   * Set theme mode
   */
  async setMode(mode: ThemeMode): Promise<void> {
    this.mode = mode;
    this.resolved = resolveTheme(mode);
    applyTheme(this.resolved);
    await storage.set(mode);
    this.notifyListeners();
  }
  
  /**
   * Toggle between light and dark (skips system)
   */
  async toggle(): Promise<void> {
    const newMode = this.resolved === 'dark' ? 'light' : 'dark';
    await this.setMode(newMode);
  }
  
  /**
   * Subscribe to theme changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(fn => fn());
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.handleSystemChange);
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const themeManager = new ThemeManager();

// Export for direct use
export { applyTheme, resolveTheme, getSystemTheme };

/**
 * Theme hook for the extension
 * Bridges to the @relay/ui theme system with chrome.storage persistence
 */

import { useState, useEffect } from 'preact/hooks';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isReady: boolean;
}

const STORAGE_KEY = 'relay-theme';

// Get system preference
function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Resolve theme mode to actual light/dark
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

// Apply theme to DOM
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  
  // Add no-transitions class to prevent flash
  root.classList.add('no-transitions');
  
  if (resolved === 'dark') {
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

// Storage abstraction - use chrome.storage if available, fallback to localStorage
async function loadTheme(): Promise<ThemeMode> {
  try {
    // Try chrome.storage first (extension context)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          resolve((result[STORAGE_KEY] as ThemeMode) || 'system');
        });
      });
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as ThemeMode) || 'system';
  } catch {
    return 'system';
  }
}

async function saveTheme(mode: ThemeMode): Promise<void> {
  try {
    // Try chrome.storage first
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: mode });
      return;
    }
    
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Silently fail
  }
}

/**
 * Hook for managing theme state in the extension
 * Persists to chrome.storage.local and applies CSS class to :root
 */
export function useTheme() {
  const [state, setState] = useState<ThemeState>({
    theme: 'system',
    resolvedTheme: 'light',
    isReady: false,
  });
  
  // Initialize theme on mount
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      const savedTheme = await loadTheme();
      const resolved = resolveTheme(savedTheme);
      
      if (mounted) {
        applyTheme(resolved);
        setState({
          theme: savedTheme,
          resolvedTheme: resolved,
          isReady: true,
        });
      }
    }
    
    init();
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setState((prev) => {
        if (prev.theme === 'system') {
          const resolved = getSystemTheme();
          applyTheme(resolved);
          return { ...prev, resolvedTheme: resolved };
        }
        return prev;
      });
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mounted = false;
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);
  
  // Set theme mode
  const setTheme = async (mode: ThemeMode) => {
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    await saveTheme(mode);
    setState({
      theme: mode,
      resolvedTheme: resolved,
      isReady: true,
    });
  };
  
  // Toggle between light and dark (bypasses system)
  const toggleTheme = () => {
    const newMode: ThemeMode = state.resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(newMode);
  };
  
  return {
    theme: state.theme,
    resolvedTheme: state.resolvedTheme,
    isReady: state.isReady,
    setTheme,
    toggleTheme,
  };
}

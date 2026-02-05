/**
 * Relay Theme Hook for Preact/React
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
 *   
 *   return (
 *     <button onClick={toggleTheme}>
 *       {resolvedTheme === 'dark' ? '☀️' : '🌙'}
 *     </button>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { themeManager, type ThemeMode, type ResolvedTheme } from './themeManager';

export interface UseThemeResult {
  /** Current theme mode setting */
  theme: ThemeMode;
  /** Actual resolved theme (light or dark) */
  resolvedTheme: ResolvedTheme;
  /** Set theme mode */
  setTheme: (theme: ThemeMode) => Promise<void>;
  /** Toggle between light and dark */
  toggleTheme: () => Promise<void>;
  /** Whether the theme system has initialized */
  isReady: boolean;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemeMode>(themeManager.getMode());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(themeManager.getResolved());
  const [isReady, setIsReady] = useState(false);
  
  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    
    themeManager.init().then(() => {
      if (mounted) {
        setThemeState(themeManager.getMode());
        setResolvedTheme(themeManager.getResolved());
        setIsReady(true);
      }
    });
    
    // Subscribe to changes
    const unsubscribe = themeManager.subscribe(() => {
      if (mounted) {
        setThemeState(themeManager.getMode());
        setResolvedTheme(themeManager.getResolved());
      }
    });
    
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  
  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    await themeManager.setMode(newTheme);
  }, []);
  
  const toggleTheme = useCallback(async () => {
    await themeManager.toggle();
  }, []);
  
  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isReady,
  };
}

// Re-export types
export type { ThemeMode, ResolvedTheme };

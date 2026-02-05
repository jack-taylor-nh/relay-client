/**
 * Theme Toggle Button
 * 
 * A button that toggles between light and dark themes.
 * Shows sun icon in dark mode, moon icon in light mode.
 */

import { useTheme } from '../theme/useTheme';

interface ThemeToggleProps {
  /** Additional CSS classes */
  class?: string;
  /** Size of the icon (default: 16) */
  size?: number;
}

export function ThemeToggle({ class: className = '', size = 16 }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme, isReady } = useTheme();
  
  if (!isReady) {
    // Render placeholder to prevent layout shift
    return (
      <button
        class={`p-2 rounded-md opacity-50 ${className}`}
        disabled
        aria-label="Loading theme"
      >
        <div style={{ width: size, height: size }} />
      </button>
    );
  }
  
  const isDark = resolvedTheme === 'dark';
  
  return (
    <button
      class={`p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-all duration-150 cursor-pointer ${className}`}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        // Sun icon for dark mode (click to go light)
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon icon for light mode (click to go dark)
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

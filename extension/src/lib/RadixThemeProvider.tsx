/**
 * Radix Theme Provider for Relay Extension
 * 
 * Bridges our existing chrome.storage theme system with Radix UI Themes.
 * - Uses useTheme() hook for theme persistence and state management
 * - Configures Radix with blue accent, mauve gray, and large radius
 * - Scaling set to 95% for compact extension UI
 */

import { Theme } from '@radix-ui/themes';
import { ComponentChildren } from 'preact';
import { useTheme } from './useTheme';

interface RadixThemeProviderProps {
  children: ComponentChildren;
}

export function RadixThemeProvider({ children }: RadixThemeProviderProps) {
  const { resolvedTheme } = useTheme();
  
  return (
    <Theme
      accentColor="blue"
      grayColor="mauve"
      radius="large"
      appearance={resolvedTheme} // 'light' or 'dark'
      scaling="95%" // Slightly tighter for extension UI
      panelBackground="solid" // Better contrast in extension context
    >
      {children}
    </Theme>
  );
}

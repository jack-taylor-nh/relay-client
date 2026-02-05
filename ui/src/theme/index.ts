/**
 * Relay Theme System
 * 
 * Exports:
 * - CSS variables: import '@relay/ui/theme/variables.css'
 * - Theme hook: useTheme() for Preact/React
 * - Theme manager: themeManager for vanilla JS
 */

export { useTheme, type UseThemeResult, type ThemeMode, type ResolvedTheme } from './useTheme';
export { themeManager, applyTheme, resolveTheme, getSystemTheme } from './themeManager';

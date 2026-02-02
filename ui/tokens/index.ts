/**
 * Relay Design Tokens
 * 
 * Shared design system tokens for cross-platform consistency.
 * Use these values across web, mobile, and desktop applications.
 */

// ============================================
// Brand Colors (from official iconpack)
// ============================================

export const brandColors = {
  relayCyan: '#22D3EE',
  relayPurple: '#8B5CF6',
  relayEmerald: '#10B981',
  relayNavy: '#0B1020',
} as const;

// ============================================
// Semantic Color Tokens
// ============================================

export const colors = {
  // Primary
  primary: {
    DEFAULT: '#8B5CF6',
    hover: '#7C3AED',
    active: '#6D28D9',
    subtle: '#EDE9FE',
  },
  
  // Accent
  accent: {
    DEFAULT: '#22D3EE',
    hover: '#06B6D4',
    active: '#0891B2',
    subtle: '#CFFAFE',
  },
  
  // Success/Emerald
  success: {
    DEFAULT: '#10B981',
    hover: '#059669',
    active: '#047857',
    subtle: '#D1FAE5',
  },
  
  // Background
  background: {
    DEFAULT: '#fafaf9',      // stone-50
    elevated: '#ffffff',     // white
    hover: '#f5f5f4',        // stone-100
    active: '#e7e5e4',       // stone-200
  },
  
  // Text
  text: {
    primary: '#1c1917',      // stone-900
    secondary: '#57534e',    // stone-600
    tertiary: '#a8a29e',     // stone-400
    inverse: '#ffffff',      // white
  },
  
  // Border
  border: {
    DEFAULT: '#e7e5e4',      // stone-200
    hover: '#d6d3d1',        // stone-300
    focus: '#8B5CF6',        // primary
  },
  
  // Status
  status: {
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },
} as const;

// ============================================
// Typography
// ============================================

export const typography = {
  fontFamily: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
    mono: ['SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', 'monospace'],
  },
  
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ============================================
// Spacing (8px grid system)
// ============================================

export const spacing = {
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  2: '0.5rem',      // 8px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
} as const;

// ============================================
// Border Radius
// ============================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  full: '9999px',
} as const;

// ============================================
// Shadows
// ============================================

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
} as const;

// ============================================
// Transitions
// ============================================

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ============================================
// Z-Index Scale
// ============================================

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;

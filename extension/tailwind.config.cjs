/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx,html}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors from iconpack
        'relay-cyan': '#22D3EE',
        'relay-purple': '#8B5CF6',
        'relay-emerald': '#10B981',
        'relay-navy': '#0B1020',
        
        // Semantic tokens for cross-platform consistency
        primary: {
          DEFAULT: '#8B5CF6', // relay-purple
          hover: '#7C3AED',
          subtle: '#EDE9FE',
        },
        accent: {
          cyan: '#22D3EE',
          emerald: '#10B981',
        },
        background: {
          DEFAULT: '#fafaf9', // stone-50
          elevated: '#ffffff',
          hover: '#f5f5f4', // stone-100
          active: '#e7e5e4', // stone-200
        },
        text: {
          primary: '#1c1917', // stone-900
          secondary: '#57534e', // stone-600
          tertiary: '#a8a29e', // stone-400
        },
        border: {
          DEFAULT: '#e7e5e4', // stone-200
          subtle: '#f5f5f4', // stone-100
        },
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
      spacing: {
        // 8px grid system
        '0.5': '0.125rem', // 2px
        '1': '0.25rem',    // 4px
        '1.5': '0.375rem', // 6px
        '2': '0.5rem',     // 8px
        '3': '0.75rem',    // 12px
        '4': '1rem',       // 16px
        '5': '1.25rem',    // 20px
        '6': '1.5rem',     // 24px
        '8': '2rem',       // 32px
        '10': '2.5rem',    // 40px
        '12': '3rem',      // 48px
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        'full': '9999px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        base: '200ms',
      },
    },
  },
  plugins: [],
}

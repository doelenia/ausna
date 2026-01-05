/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class', // Use class-based dark mode instead of media query
  theme: {
    extend: {
      colors: {
        // Neutral grays
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
        // Primary colors (blue)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Primary
          700: '#1d4ed8', // Primary hover
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Success colors (green)
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a', // Success
          700: '#15803d', // Success hover
          800: '#166534',
          900: '#14532d',
        },
        // Danger colors (red)
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626', // Danger
          700: '#b91c1c', // Danger hover
          800: '#991b1b',
          900: '#7f1d1d',
        },
      },
      // Design tokens for consistent spacing
      spacing: {
        'card': '1.5rem', // 24px - Standard card padding
        'card-compact': '1rem', // 16px - Compact card padding
        'card-spacious': '2rem', // 32px - Spacious card padding
      },
      // Design tokens for border radius
      borderRadius: {
        'card': '0.5rem', // 8px - Standard card radius
        'input': '0.375rem', // 6px - Standard input radius
      },
      // Design tokens for shadows
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
}


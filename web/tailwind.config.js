/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        logo: ['"Zen Dots"', 'sans-serif'],
        heading: ['"DM Sans"', 'sans-serif'],
        sans: ['"PT Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['"PT Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        violet: {
          primary: '#7C3AED',
          light: '#A78BFA',
          dark: '#5B21B6',
          soft: 'rgba(124, 58, 237, 0.12)',
        },
        payd: {
          canvas: '#09090b',
          card: '#18181b',
          'card-subtle': '#27272a',
          border: 'rgba(255, 255, 255, 0.08)',
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        slate: {
          850: '#151518',
          925: '#0f0f12',
        },
      },
      keyframes: {
        pulseWave: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.08)' },
        },
        micRipple: {
          '0%': { transform: 'scale(0.85)', opacity: '0.8' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        barJump: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1.0)' },
        },
      },
      animation: {
        'pulse-wave': 'pulseWave 1s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'mic-ripple': 'micRipple 1.8s infinite ease-out',
        'bar-jump': 'barJump 1s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};


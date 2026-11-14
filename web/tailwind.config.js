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
        silver: {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e3e6ea',
          300: '#cdd2d8',
          400: '#b0b6be',
          500: '#8e959e',
          600: '#6c737c',
          700: '#535960',
          800: '#3d4248',
          900: '#2a2e33',
          950: '#181b1f',
          primary: '#8e959e',
          light: '#cdd2d8',
          dark: '#535960',
          soft: 'rgba(176, 182, 190, 0.12)',
        },
        steel: {
          300: '#9aa1aa',
          400: '#7d848d',
          500: '#5f666f',
          600: '#474d55',
          700: '#363b41',
        },
        payd: {
          canvas: '#09090b',
          card: '#18181b',
          'card-subtle': '#27272a',
          border: 'rgba(255, 255, 255, 0.08)',
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e3e6ea',
          300: '#cdd2d8',
          400: '#b0b6be',
          500: '#8e959e',
          600: '#6c737c',
          700: '#535960',
          800: '#3d4248',
          900: '#2a2e33',
          950: '#181b1f',
        },
        slate: {
          850: '#151518',
          925: '#0f0f12',
        },
      },
      backgroundImage: {
        'silver-gradient': 'linear-gradient(135deg, #e3e6ea 0%, #b0b6be 30%, #8e959e 55%, #cdd2d8 80%, #8e959e 100%)',
        'silver-hero': 'linear-gradient(135deg, #8d939b 0%, #6c737c 40%, #474d55 75%, #2f3338 100%)',
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


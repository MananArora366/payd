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
        // Brand: a green spectrum (lime -> green -> emerald -> teal). Change the brand here.
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
          primary: '#22c55e',
          light: '#86efac',
          dark: '#15803d',
          soft: 'rgba(34, 197, 94, 0.12)',
        },
        // Deeper emerald/teal end of the spectrum (gradient partners, secondary accents).
        'brand-deep': {
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        payd: {
          canvas: '#09090b',
          card: '#18181b',
          'card-subtle': '#27272a',
          border: 'rgba(255, 255, 255, 0.08)',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        slate: {
          850: '#151518',
          925: '#0f0f12',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #bef264 0%, #4ade80 35%, #10b981 70%, #0d9488 100%)',
        'brand-hero': 'linear-gradient(135deg, #15803d 0%, #047857 45%, #065f46 75%, #064e3b 100%)',
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


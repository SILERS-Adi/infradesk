import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      colors: {
        // Semantic tokens bound to CSS variables so dark/light/auto switch at runtime.
        bg: 'hsl(var(--bg))',
        bg2: 'hsl(var(--bg2))',
        surface: 'hsl(var(--surface))',
        t: 'hsl(var(--t))',
        ts: 'hsl(var(--ts))',
        tm: 'hsl(var(--tm))',
        border: 'hsl(var(--border))',
        accent: { DEFAULT: 'hsl(var(--accent))', fg: 'hsl(var(--accent-fg))' },
        success: 'hsl(var(--success))',
        danger: 'hsl(var(--danger))',
        warning: 'hsl(var(--warning))',
      },
      borderRadius: { DEFAULT: 'var(--r)', sm: 'var(--rs)' },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      colors: {
        bg: 'var(--bg)',
        sf: 'var(--sf)',
        sf2: 'var(--sf2)',
        'sf-h': 'var(--sf-h)',
        'sf-el': 'var(--sf-el)',
        tx: 'var(--tx)',
        tx2: 'var(--tx2)',
        tx3: 'var(--tx3)',
        bd: 'var(--bd)',
        'bd-l': 'var(--bd-l)',
        'bd-f': 'var(--bd-f)',
        pri: { DEFAULT: 'var(--pri)', h: 'var(--pri-h)', l: 'var(--pri-l)' },
        ok: { DEFAULT: 'var(--ok)', l: 'var(--ok-l)', b: 'var(--ok-b)' },
        wn: { DEFAULT: 'var(--wn)', l: 'var(--wn-l)', b: 'var(--wn-b)' },
        er: { DEFAULT: 'var(--er)', l: 'var(--er-l)', b: 'var(--er-b)' },
        in: { DEFAULT: 'var(--in)', l: 'var(--in-l)', b: 'var(--in-b)' },
        'side-bg': 'var(--side-bg)',
        'side-bd': 'var(--side-bd)',
        'side-act': 'var(--side-act)',
        'side-act-tx': 'var(--side-act-tx)',
        'side-hv': 'var(--side-hv)',
      },
      borderRadius: {
        DEFAULT: 'var(--r)',
        sm: 'var(--r-s)',
        lg: 'var(--r-l)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        1: 'var(--sh1)',
        2: 'var(--sh2)',
        3: 'var(--sh3)',
        4: 'var(--sh4)',
        glow: 'var(--sh-glow)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

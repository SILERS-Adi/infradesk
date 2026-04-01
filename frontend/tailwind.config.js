/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Token-mapped colors — reference CSS vars from tokens.css */
        ids: {
          bg:      'var(--bg)',
          bg2:     'var(--bg2)',
          card:    'var(--bg-card)',
          border:  'var(--border)',
          't':     'var(--t)',
          ts:      'var(--ts)',
          tm:      'var(--tm)',
          td:      'var(--td)',
          accent:  'var(--accent)',
          'accent-s': 'var(--accent-s)',
          blue:    '#4F8CFF',
          violet:  '#8B5CF6',
          cyan:    '#22D3EE',
          green:   '#4ADE80',
          orange:  '#FB923C',
          red:     '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'ids': '18px',
        'ids-sm': '12px',
        'ids-xs': '8px',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      backgroundColor: {
        surface: 'var(--bg2)',
        card: 'var(--bg-card)',
      },
    },
  },
  plugins: [],
}

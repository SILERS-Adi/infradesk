/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f7fd',
          100: '#c4eaf8',
          200: '#8dd4f1',
          300: '#4abde8',
          400: '#1fb0df',
          500: '#1ba3d8',
          600: '#1589b8',
          700: '#0f6b8f',
          900: '#083d55',
        },
        accent: {
          50:  '#fff3e8',
          100: '#fddcb8',
          400: '#f9a254',
          500: '#f5821f',
          600: '#e06b08',
          700: '#b85500',
        },
        // Premium dark SaaS sidebar
        sidebar: {
          bg:         '#080D19',
          hover:      '#0F1629',
          active:     '#151E35',
          border:     '#151E35',
          text:       '#64748B',
          textActive: '#E2E8F0',
        },
        // Desktop dark surfaces
        dsk: {
          bg:      '#0A0F1E',
          surface: '#0E1425',
          card:    '#111827',
          border:  '#1E293B',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

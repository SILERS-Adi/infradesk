/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // InfraDesk brand blue (niebieski z logo)
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
        // InfraDesk accent orange (pomarańczowy z "Desk")
        accent: {
          50:  '#fff3e8',
          100: '#fddcb8',
          400: '#f9a254',
          500: '#f5821f',
          600: '#e06b08',
          700: '#b85500',
        },
        // Sidebar (ciemny granat jak tło kolorystyki)
        sidebar: {
          bg:          '#0d1b2a',
          hover:       '#162436',
          active:      '#1a3a55',
          border:      '#162436',
          text:        '#7fa3be',
          textActive:  '#e2f0f8',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

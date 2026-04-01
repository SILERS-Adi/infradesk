import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://infradesk.pl',
        changeOrigin: true,
        secure: true,
      },
      '/uploads': {
        target: 'https://infradesk.pl',
        changeOrigin: true,
        secure: true,
      },
      '/downloads': {
        target: 'https://infradesk.pl',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})

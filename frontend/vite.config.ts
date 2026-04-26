import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_HASH = Date.now().toString(36)

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
  },
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

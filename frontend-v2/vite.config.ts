import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Shared canAccess with backend — import the single source of truth file.
      '@shared/canAccess': path.resolve(__dirname, '../backend-v2/src/utils/canAccess.ts'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api/v2': { target: 'http://localhost:4200', changeOrigin: true, secure: false },
    },
  },
});

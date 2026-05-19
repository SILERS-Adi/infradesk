import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

// Sentry source maps upload — aktywuje się tylko gdy SENTRY_AUTH_TOKEN ustawiony.
// Generate token w Sentry UI: Account Settings → API → Auth Tokens
//   scopes: project:releases, org:read
// Set: export SENTRY_AUTH_TOKEN=sntrys_... (na maszynie buildującej / w CI)
const sentryEnabled = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  plugins: [
    react(),
    ...(sentryEnabled ? [sentryVitePlugin({
      org: 'silers-adrian-baszczykowski',
      project: 'infradesk-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Release tagging — nadpisywany commit SHA z env (CI) lub package.json version.
      release: { name: process.env.SENTRY_RELEASE ?? `infradesk-frontend@${process.env.GIT_SHA ?? 'dev'}` },
      sourcemaps: {
        // Upload tylko z dist/ po build — bez node_modules.
        assets: './dist/**',
        // Po upload usuń sourcemap.* z dist (żeby nie wysyłać do klienta — security).
        filesToDeleteAfterUpload: './dist/**/*.map',
      },
      // Tylko prod build — w dev waste of cycles.
      disable: process.env.NODE_ENV !== 'production',
    })] : []),
  ],
  build: {
    // Sourcemap TYLKO gdy plugin aktywny (uploaduje + usuwa z dist po upload).
    // Bez tokenu — NIE generuj sourcemap, inaczej wycieka source code do klienta przez nginx.
    sourcemap: sentryEnabled,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Shared canAccess with backend — import the single source of truth file.
      '@shared/canAccess': path.resolve(__dirname, '../backend-v2/src/utils/canAccess.ts'),
      // Silers Design System (Faza 2B pilot — patrz docs/MIGRATION_PLAYBOOK.md w silers-design-system).
      '@silers/design-system': path.resolve(__dirname, '../../silers-design-system'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api/v2': { target: 'http://localhost:4200', changeOrigin: true, secure: false },
    },
  },
});

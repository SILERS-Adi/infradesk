/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENV?: string;
  readonly VITE_SENTRY_TRACES_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

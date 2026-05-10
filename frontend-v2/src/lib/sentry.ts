// Sentry browser init — pusty DSN = no-op (dev). Konfiguracja przez Vite env vars
// (VITE_SENTRY_DSN, VITE_SENTRY_ENV). DSN jest publiczne dla SPA (browser-side).

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function initSentry(): void {
  if (initialized || !DSN) return;
  initialized = true;
  Sentry.init({
    dsn: DSN,
    environment: (import.meta.env.VITE_SENTRY_ENV as string) ?? import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE ?? 0.1),
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Ignoruj rate-limit/4xx — nie są problemami aplikacji.
      const msg = event.message ?? '';
      if (msg.includes('rate_limited') || msg.includes('Network Error')) return null;
      return event;
    },
  });
}

export { Sentry };

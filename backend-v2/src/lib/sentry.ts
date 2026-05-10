// Sentry init — wpięte w index.ts PRZED `import buildApp` (kolejność CJS top-down
// gwarantuje że Sentry zarejestruje HTTP/Express/Prisma auto-instrumentation
// patches zanim te moduły zostaną wymagane).
//
// Pusty DSN = wyłączone (no-op). Dev/CI pracuje bez konta Sentry, prod włącza env.

import * as Sentry from '@sentry/node';
import { config } from '../config';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;
  if (!config.SENTRY_DSN) return;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: config.SENTRY_RELEASE,
    // 100% sampling w dev, 10% w prod (best practice).
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    // Załącza IP, request headers do eventów — nasze prywatność acceptable
    // bo workspace.user mapping jest w tagach, nie w PII.
    sendDefaultPii: true,
    // Stack frame z lokalnymi zmiennymi — debugowanie z pełnym kontekstem.
    includeLocalVariables: true,
    // Default integrations (HTTP, Express, Prisma) auto-aktywowane przez SDK v8.
    // enableLogs i nodeRuntimeMetricsIntegration są w v9+ — po upgrade do v9 dodać.
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err instanceof Error) {
        const msg = err.message || '';
        // Rate limit / 4xx — szum, nie problem aplikacji.
        if (msg.includes('rate_limited') || msg.includes('Invalid token')) return null;
        // Knownе SMTP bounce dla nieistniejącej skrzynki — log only.
        if (msg.includes('5.1.1') || msg.includes('no mailbox here')) return null;
      }
      return event;
    },
  });
}

export { Sentry };

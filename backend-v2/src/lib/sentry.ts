// Sentry init — wpięte w index.ts najwcześniej jak się da (przed buildApp).
// Pusty DSN = wyłączone (no-op handlers wciąż zwracane). Pozwala dev-emu pracować
// bez konta Sentry, a produkcji włączyć przez env.
//
// Sentry v8 API: brak ręcznych Handlers — `Sentry.setupExpressErrorHandler(app)`
// po definicji wszystkich routerów. Tutaj zostaje tylko init + re-export.

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
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err instanceof Error) {
        const msg = err.message || '';
        if (msg.includes('rate_limited') || msg.includes('Invalid token')) return null;
      }
      return event;
    },
  });
}

export { Sentry };

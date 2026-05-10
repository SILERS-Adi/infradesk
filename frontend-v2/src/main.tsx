import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initSentry, Sentry } from './lib/sentry';
import App from './App';
import './styles/globals.css';

initSentry();

const rootElement = document.getElementById('root')!;
const ErrorBoundary = Sentry.ErrorBoundary;

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary fallback={<FallbackUi />} showDialog={false}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

function FallbackUi() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0d', color: '#fff', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Coś poszło nie tak</h1>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
          Wystąpił niespodziewany błąd. Zespół został powiadomiony.
        </p>
        <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Odśwież stronę
        </button>
      </div>
    </div>
  );
}

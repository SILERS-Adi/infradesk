import { useEffect, useState } from 'react';
import { canInstall, isStandalone, onInstallAvailabilityChange, triggerInstall } from '../utils/pwa';

const DISMISS_KEY = 'infradesk_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallPrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;

    setAvailable(canInstall());
    const unsub = onInstallAvailabilityChange(setAvailable);
    return unsub;
  }, []);

  if (!available) return null;

  const handleInstall = async () => {
    const outcome = await triggerInstall();
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setAvailable(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setAvailable(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Zainstaluj InfraDesk"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 420,
        margin: '0 auto',
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--panel, rgba(15, 20, 34, 0.96))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 9999,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t, #fff)' }}>Zainstaluj InfraDesk</div>
        <div style={{ fontSize: 11, color: 'var(--tm, rgba(255,255,255,0.55))', lineHeight: 1.3 }}>
          Szybszy dostęp z pulpitu, powiadomienia, tryb offline.
        </div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          background: 'var(--accent, #4F8CFF)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Zainstaluj
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Odrzuć"
        style={{
          padding: 6,
          background: 'transparent',
          color: 'var(--tm, rgba(255,255,255,0.5))',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

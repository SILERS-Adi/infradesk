import { useState, useEffect } from 'react';

const COOKIE_KEY = 'infradesk_cookie_consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem(COOKIE_KEY, 'rejected');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
      padding: '16px 24px',
      background: 'var(--bg-card, #0C1220)',
      borderTop: '1px solid var(--border, #1E293B)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
    }}>
      <p style={{ color: 'var(--tm, #9CA3AF)', fontSize: 13, margin: 0, flex: 1, minWidth: 200 }}>
        Używamy plików cookies do zapewnienia prawidłowego działania serwisu i analizy ruchu.{' '}
        <a href="/prywatnosc" style={{ color: '#A78BFA', textDecoration: 'underline' }}>Polityka prywatności</a>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={reject} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--tm)', fontSize: 13, cursor: 'pointer',
        }}>
          Odrzuć
        </button>
        <button onClick={accept} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: '#6D28D9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          Akceptuję
        </button>
      </div>
    </div>
  );
}

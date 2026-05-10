// Cookie banner RODO — minimalna zgoda zgodna z polskim prawem (UODO/RODO).
// Aplikacja używa TYLKO niezbędnych cookies (auth refresh, locale prefs).
// Brak third-party trackerów (analityka, marketing) → banner ma jedną akcję "OK".
//
// Pełna lista cookies w docs/security.md i Polityce prywatności.

import { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'idesk-cookie-consent';
const CURRENT_VERSION = '1';   // bump gdy zmienimy listę cookies

export function useCookieConsent(): { consented: boolean; consent: () => void } {
  const [consented, setConsented] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      return v === CURRENT_VERSION;
    } catch {
      return true;   // Storage zablokowany — nie pokazuj bannera
    }
  });

  const consent = () => {
    try { window.localStorage.setItem(STORAGE_KEY, CURRENT_VERSION); } catch { /* ignore */ }
    setConsented(true);
  };

  return { consented, consent };
}

export function CookieBanner() {
  const { consented, consent } = useCookieConsent();
  const [hidden, setHidden] = useState(false);

  // Animacja delayed mount żeby nie skoczyło natychmiast (UX)
  useEffect(() => {
    if (consented) return;
    const t = setTimeout(() => setHidden(false), 600);
    return () => clearTimeout(t);
  }, [consented]);

  if (consented || hidden) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-[400px] z-[100] glass rounded-[var(--r-l)] p-4 shadow-lg border border-bd anim-up"
      style={{ background: 'var(--sf)', boxShadow: 'var(--sh3)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}
        >
          <Cookie className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p id="cookie-banner-title" className="text-[13px] font-semibold text-tx mb-1">
            Niezbędne cookies
          </p>
          <p id="cookie-banner-desc" className="text-[11px] text-tx2 leading-relaxed">
            Używamy wyłącznie technicznie niezbędnych cookies (logowanie, preferencje języka).
            Bez analityki ani trackerów marketingowych. Korzystając z panelu akceptujesz to —{' '}
            <Link to="/prywatnosc" className="text-pri hover:underline">więcej w Polityce prywatności</Link>.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={consent}
              className="text-[12px] font-semibold px-4 py-1.5 rounded-[var(--r-s)] text-white press"
              style={{ background: 'var(--pri)' }}
            >
              Rozumiem
            </button>
            <Link
              to="/prywatnosc"
              className="text-[12px] font-medium px-4 py-1.5 rounded-[var(--r-s)] text-tx2 hover:bg-sf-h press"
            >
              Polityka
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="text-tx3 hover:text-tx2 press p-1"
          aria-label="Zamknij — pojawi się ponownie po reload"
          title="Zamknij (pojawi się ponownie)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

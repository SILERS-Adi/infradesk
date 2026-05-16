// P2.4 — 404 page zamiast cichego Navigate to "/" dla nieznanych URL.
// Pomaga klientowi zorientować się że link jest stary/zły, zamiast wracać
// nieświadomie na home page.

import { Link, useLocation } from 'react-router-dom';

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md text-center">
        <p className="text-[64px] font-bold mb-2" style={{ color: 'var(--pri)' }}>404</p>
        <h1 className="text-[20px] font-bold text-tx mb-2">Nie znaleziono strony</h1>
        <p className="text-[13px] text-tx3 mb-6">
          Adres <code className="font-mono text-tx2">{location.pathname}</code> nie istnieje. Mogłeś trafić tu z nieaktualnego linka.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-s)] text-[13px] font-semibold"
            style={{ background: 'var(--pri)', color: 'white' }}
          >
            Otwórz panel
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--r-s)] text-[13px] font-semibold border"
            style={{ borderColor: 'var(--bd)', color: 'var(--tx)' }}
          >
            Strona główna
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;

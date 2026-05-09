import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';

const NAV: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Start' },
  { to: '/jak-to-dziala', label: 'Jak to działa' },
  { to: '/cennik', label: 'Cennik' },
  { to: '/pobieranie', label: 'Pobieranie' },
  { to: '/changelog', label: 'Zmiany' },
  { to: '/kontakt', label: 'Kontakt' },
];

const FOOTER_LEGAL: Array<{ to: string; label: string }> = [
  { to: '/regulamin', label: 'Regulamin' },
  { to: '/prywatnosc', label: 'Polityka prywatności' },
  { to: '/rodo', label: 'RODO' },
];

export function PublicLayout() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--tx)' }}>
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--sf) 88%, transparent)', borderColor: 'var(--bd)' }}
      >
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-6 px-5 h-14">
          <Link to="/" className="flex items-center gap-2 press" aria-label="InfraDesk">
            <img src="/logo-icon.png" alt="" className="h-7 w-7" />
            <span className="text-[15px] font-bold tracking-tight">InfraDesk</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-[var(--r-s)] transition-colors"
                  style={{
                    color: active ? 'var(--pri)' : 'var(--tx2)',
                    background: active ? 'var(--pri-l)' : 'transparent',
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center h-8 px-3 rounded-[var(--r-s)] text-[12px] font-semibold press"
                style={{ background: 'var(--pri)', color: 'white' }}
              >
                Twój panel
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center h-8 px-3 rounded-[var(--r-s)] text-[12px] font-medium text-tx2 hover:text-tx press"
                >
                  Zaloguj się
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center h-8 px-3 rounded-[var(--r-s)] text-[12px] font-semibold press"
                  style={{ background: 'var(--pri)', color: 'white' }}
                >
                  Wypróbuj 30 dni
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="md:hidden p-2 rounded-[var(--r-s)] text-tx2 hover:bg-sf-h press"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t" style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}>
            <nav className="max-w-[1200px] mx-auto px-5 py-3 flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-[var(--r-s)] text-[14px] font-medium hover:bg-sf-h"
                  style={{ color: pathname === n.to ? 'var(--pri)' : 'var(--tx)' }}
                >
                  {n.label}
                </Link>
              ))}
              <div className="border-t pt-3 mt-2 flex flex-col gap-2" style={{ borderColor: 'var(--bd)' }}>
                {user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 rounded-[var(--r-s)] text-[14px] font-semibold text-center"
                    style={{ background: 'var(--pri)', color: 'white' }}
                  >
                    Twój panel
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="px-3 py-2 rounded-[var(--r-s)] text-[14px] font-medium text-center hover:bg-sf-h"
                    >
                      Zaloguj się
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setOpen(false)}
                      className="px-3 py-2 rounded-[var(--r-s)] text-[14px] font-semibold text-center"
                      style={{ background: 'var(--pri)', color: 'white' }}
                    >
                      Wypróbuj 30 dni
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t mt-16" style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}>
        <div className="max-w-[1200px] mx-auto px-5 py-8 grid grid-cols-1 md:grid-cols-4 gap-6 text-[13px]">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo-icon.png" alt="" className="h-6 w-6" />
              <span className="font-bold">InfraDesk</span>
            </div>
            <p className="text-tx3 leading-relaxed">
              Helpdesk i monitoring IT dla MSP oraz wewnętrznych zespołów.
              Asystent z AI na każdej stacji.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-2">Produkt</p>
            <ul className="space-y-1.5">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="text-tx2 hover:text-tx press">{n.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-2">Zaufane</p>
            <ul className="space-y-1.5 text-tx2">
              <li>
                <a href="https://faktura.infradesk.pl" target="_blank" rel="noopener noreferrer" className="hover:text-tx press">
                  faktura.infradesk.pl
                </a>
              </li>
              <li>
                <a href="https://github.com/SILERS-Adi/infradesk" target="_blank" rel="noopener noreferrer" className="hover:text-tx press">
                  Open issues na GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-2">Prawne</p>
            <ul className="space-y-1.5">
              {FOOTER_LEGAL.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-tx2 hover:text-tx press">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t" style={{ borderColor: 'var(--bd)' }}>
          <div className="max-w-[1200px] mx-auto px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-tx3">
            <span>© {new Date().getFullYear()} InfraDesk. Wszystkie prawa zastrzeżone.</span>
            <span>NIP 8261941094 · biuro@silers.pl</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

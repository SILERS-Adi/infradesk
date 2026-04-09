import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CHANGELOG = [
  {
    version: '5.1.0',
    date: '2026-04-09',
    title: 'SLA Tracking + Onboarding + Billing',
    changes: [
      { type: 'new' as const, text: 'Onboarding wizard — konfiguracja krok po kroku dla nowych użytkowników' },
      { type: 'new' as const, text: 'SLA Tracking — automatyczne śledzenie terminów zgłoszeń z alertami' },
      { type: 'new' as const, text: 'Płatności online — integracja z PayNow (pay.infradesk.pl)' },
      { type: 'new' as const, text: 'Cookie consent banner + akceptacja regulaminu przy rejestracji' },
      { type: 'new' as const, text: 'Eksport danych RODO (art. 20)' },
      { type: 'new' as const, text: 'Cennik na stronie głównej' },
    ],
  },
  {
    version: '5.0.0',
    date: '2026-04-08',
    title: 'Audyt bezpieczeństwa + architektura',
    changes: [
      { type: 'security' as const, text: 'Helmet.js — security headers (CSP, HSTS, X-Frame-Options)' },
      { type: 'security' as const, text: 'Rate limiting na publicznych endpointach' },
      { type: 'security' as const, text: 'AES-256-CBC z HMAC integrity na szyfrowanych danych' },
      { type: 'security' as const, text: 'Account lockout po 5 nieudanych logowaniach' },
      { type: 'fix' as const, text: 'Walidacja URL/IP/GPS — ochrona przed XSS' },
      { type: 'fix' as const, text: 'Ticket state machine — kontrola przejść statusów' },
      { type: 'new' as const, text: 'Redis cache layer z graceful fallback' },
      { type: 'new' as const, text: 'BullMQ — distributed background jobs' },
      { type: 'new' as const, text: 'SSE real-time badges w sidebar' },
      { type: 'new' as const, text: 'Soft delete na urządzeniach, lokalizacjach, zgłoszeniach' },
      { type: 'new' as const, text: 'ErrorBoundary + ErrorState na wszystkich stronach' },
      { type: 'fix' as const, text: 'Dark mode — wykrywanie preferencji systemowych' },
      { type: 'fix' as const, text: 'Zero @ts-nocheck w całym frontend' },
    ],
  },
  {
    version: '4.0.0',
    date: '2026-03-31',
    title: 'Workspace model + moduły',
    changes: [
      { type: 'new' as const, text: 'Workspace isolation — pełna separacja danych między firmami' },
      { type: 'new' as const, text: 'System modułów: Infrastructure, Service Desk, Invoicing, Packaging, SKP' },
      { type: 'new' as const, text: 'MSP model — operator IT zarządza wieloma klientami' },
      { type: 'new' as const, text: 'Permission system — RBAC z scope filtering' },
      { type: 'new' as const, text: 'Portal klienta' },
      { type: 'new' as const, text: 'Aplikacja mobilna (PWA)' },
    ],
  },
];

const TYPE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  new:      { label: 'Nowe', bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
  fix:      { label: 'Fix', bg: 'rgba(59,130,246,0.1)', color: '#3B82F6' },
  security: { label: 'Security', bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--tm)' }}>
          <ArrowLeft className="h-4 w-4" /> Strona główna
        </Link>

        <h1 className="text-3xl font-bold mb-2">Co nowego w InfraDesk</h1>
        <p className="mb-10" style={{ color: 'var(--tm)' }}>Historia zmian i nowych funkcji</p>

        <div className="space-y-10">
          {CHANGELOG.map(release => (
            <div key={release.version}>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-xl font-bold" style={{ color: 'var(--accent, #A78BFA)' }}>v{release.version}</span>
                <span className="text-sm" style={{ color: 'var(--tm)' }}>{release.date}</span>
              </div>
              <h3 className="text-lg font-semibold mb-3">{release.title}</h3>
              <ul className="space-y-2">
                {release.changes.map((c, i) => {
                  const badge = TYPE_BADGE[c.type];
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm" style={{ color: 'var(--ts)' }}>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5"
                        style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                      {c.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 text-center text-xs" style={{ color: 'var(--td)', borderTop: '1px solid var(--border)' }}>
          © {new Date().getFullYear()} SILERS — Błaszczykowski Adrian
        </div>
      </div>
    </div>
  );
}

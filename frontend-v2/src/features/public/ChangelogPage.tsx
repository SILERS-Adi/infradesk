import { usePageMeta } from '@/hooks/usePageMeta';

interface Release {
  version: string;
  date: string;
  highlights: string[];
  type: 'major' | 'feature' | 'fix';
}

const RELEASES: Release[] = [
  {
    version: '2.0.0',
    date: '2026-04-22',
    type: 'major',
    highlights: [
      'Pełen rebuild — nowy panel V2 oparty o Vite + React 18 + Postgres z RLS na poziomie bazy',
      'Wycofanie V1 — całkowita migracja danych na nową strukturę workspaces',
      'Nowy moduł „Plan i moduły" z włączaniem funkcjonalności bez restartu',
      'Asystent Business v5 ze wsparciem dla komend ad-hoc',
      'Migracja modułu Fakturowanie do osobnej domeny faktura.infradesk.pl',
    ],
  },
  {
    version: '2.0.1',
    date: '2026-04-28',
    type: 'feature',
    highlights: [
      'Cennik 4-tier: START (49 zł), TEAM (149 zł), PRO (399 zł, 30 dni trial), ENTERPRISE',
      'Toggle miesięczny / roczny z automatycznym rabatem −20%',
      'Lista urządzeń: pełna paleta wyłączalnych kolumn (online status, RustDesk Connect button, RAM/dysk, ostatnia widoczność, ticketów, alertów)',
      'Endpoint publicznego pobierania chroniony PIN-em (RustDesk)',
      'Nowa strona główna i marketingowa pod infradesk.pl',
    ],
  },
  {
    version: '1.9.x',
    date: '2026-04 (V1 final)',
    type: 'fix',
    highlights: [
      'Stabilizacja przed cutoverem do V2',
      'Hot-fix dla przepływu rotacji haseł DB',
      'Lockdown CORS i ratelimiterów',
    ],
  },
];

const TYPE_META: Record<Release['type'], { label: string; color: string }> = {
  major:   { label: 'MAJOR',   color: 'var(--pri)' },
  feature: { label: 'FEATURE', color: 'var(--ok)' },
  fix:     { label: 'FIX',     color: 'var(--tx2)' },
};

export function ChangelogPage() {
  usePageMeta({
    title: 'Zmiany',
    description: 'Historia wersji InfraDesk. Najnowsze: 4-tier pricing (START/TEAM/PRO/ENT), nowy marketing site, kolumny urządzeń, audyt 20 punktów.',
  });
  return (
    <div className="px-5 py-12 md:py-16">
      <div className="max-w-[800px] mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Changelog</p>
          <h1 className="text-[34px] md:text-[42px] font-bold tracking-tight mb-3">
            Co nowego w InfraDesk
          </h1>
          <p className="text-[14px] text-tx2">
            Ważniejsze zmiany od ostatniego cutoveru. Drobne fixy lecą codziennie — nie spamujemy.
          </p>
        </div>

        <ol className="relative border-l-2 pl-6 space-y-6" style={{ borderColor: 'var(--bd)' }}>
          {RELEASES.map((r) => {
            const meta = TYPE_META[r.type];
            return (
              <li key={r.version} className="relative">
                <span
                  className="absolute -left-[31px] top-2 w-3 h-3 rounded-full"
                  style={{ background: meta.color, boxShadow: '0 0 0 4px var(--bg)' }}
                />
                <div
                  className="rounded-[var(--r-m)] p-5 border"
                  style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
                >
                  <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'color-mix(in srgb, ' + meta.color + ' 14%, transparent)', color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <h2 className="text-[18px] font-bold">v{r.version}</h2>
                    <span className="text-[12px] text-tx3">· {r.date}</span>
                  </div>
                  <ul className="space-y-1.5 text-[13px] text-tx2">
                    {r.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-tx3 shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 text-center text-[12px] text-tx3">
          <p>
            Pełna historia zmian dostępna w repo:{' '}
            <a
              href="https://github.com/SILERS-Adi/infradesk/commits/main"
              target="_blank"
              rel="noopener noreferrer"
              className="text-pri hover:underline"
            >
              github.com/SILERS-Adi/infradesk
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

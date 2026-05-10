// Press kit — strona dla mediów, blogerów IT, podcastów. Pobranie logo,
// screenshotów, faktów. URL: /press

import { useEffect } from 'react';
import { Download, Mail, Phone, ExternalLink, FileText, ImageIcon } from 'lucide-react';

const FACTS = [
  { label: 'Nazwa produktu', value: 'InfraDesk' },
  { label: 'Producent', value: 'Silers Adrian Błaszczykowski' },
  { label: 'Siedziba', value: 'Garwolin, Polska' },
  { label: 'NIP', value: 'PL8261941094' },
  { label: 'Domena', value: 'infradesk.pl' },
  { label: 'Rok startu', value: '2025' },
  { label: 'Kategoria', value: 'SaaS B2B / IT Service Management' },
  { label: 'Target', value: 'Firmy IT / MSP / wewnętrzne działy IT' },
  { label: 'Stack', value: 'Node.js, React, PostgreSQL, Anthropic Claude (AI)' },
];

const ASSETS = [
  { label: 'Logo InfraDesk (PNG, transparent)', file: '/logo.png', size: '~30 KB' },
  { label: 'Logo InfraDesk (SVG)', file: '/logo.svg', size: '~5 KB' },
  { label: 'Logo Icon (favicon, PNG)', file: '/logo-icon.png', size: '~5 KB' },
  { label: 'Screenshot — Dashboard (PNG, 1920×1080)', file: '/screenshots/dashboard.png', size: '~200 KB' },
  { label: 'Screenshot — Tickety (PNG, 1920×1080)', file: '/screenshots/tickets.png', size: '~250 KB' },
  { label: 'Screenshot — Asystent IT (PNG)', file: '/screenshots/agent.png', size: '~180 KB' },
  { label: 'OG image (PNG, 1200×630)', file: '/og-image.png', size: '~100 KB' },
];

const BOILERPLATE_PL = `InfraDesk to polska platforma SaaS do zarządzania infrastrukturą IT, helpdeskiem i monitoringiem dla firm IT typu MSP oraz wewnętrznych działów IT. W jednym panelu łączy zgłoszenia serwisowe (ticketing), inwentaryzację urządzeń, sejf haseł, monitorowanie agentem Windows, integracje email-to-ticket oraz asystenta AI (Iris) opartego o Claude od Anthropic. Stworzona przez Silers w 2025 roku, dostępna na infradesk.pl.`;

const BOILERPLATE_EN = `InfraDesk is a Polish SaaS platform for IT infrastructure management, helpdesk and monitoring designed for MSPs and in-house IT teams. It combines ticketing, asset inventory, password vault, Windows agent monitoring, email-to-ticket integration, and an AI assistant (Iris) powered by Anthropic's Claude — all in one panel. Founded by Silers in 2025, available at infradesk.pl.`;

export function PressPage() {
  useEffect(() => {
    document.title = 'Press kit — InfraDesk';
  }, []);

  return (
    <div className="max-w-[900px] mx-auto px-5 py-10">
      <header className="mb-10">
        <h1 className="text-[36px] font-bold text-tx mb-2">Press kit</h1>
        <p className="text-[14px] text-tx2">
          Materiały dla mediów, blogerów IT, podcastów i partnerów.
          Możesz używać poniższych materiałów do publikacji o InfraDesk.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-[20px] font-bold text-tx mb-4">📌 Krótko o InfraDesk</h2>
        <div className="space-y-3 p-5 rounded-[var(--r-l)] glass border border-bd">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-tx3 font-bold mb-1">Boilerplate (PL)</p>
            <p className="text-[13px] text-tx leading-relaxed">{BOILERPLATE_PL}</p>
          </div>
          <div className="pt-3 border-t border-bd">
            <p className="text-[10px] uppercase tracking-[0.12em] text-tx3 font-bold mb-1">Boilerplate (EN)</p>
            <p className="text-[13px] text-tx leading-relaxed">{BOILERPLATE_EN}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(BOILERPLATE_PL).catch(() => {});
          }}
          className="mt-3 text-[12px] text-pri hover:underline press"
        >
          Kopiuj boilerplate (PL)
        </button>
      </section>

      <section className="mb-10">
        <h2 className="text-[20px] font-bold text-tx mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Fakty
        </h2>
        <dl className="grid sm:grid-cols-2 gap-3">
          {FACTS.map((f) => (
            <div key={f.label} className="p-3 rounded-[var(--r-s)] bg-sf2 border border-bd">
              <dt className="text-[10px] uppercase tracking-[0.12em] text-tx3 font-bold mb-1">{f.label}</dt>
              <dd className="text-[13px] text-tx">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-10">
        <h2 className="text-[20px] font-bold text-tx mb-4 flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Assety do pobrania
        </h2>
        <ul className="space-y-2">
          {ASSETS.map((a) => (
            <li key={a.file}>
              <a
                href={a.file}
                download
                className="flex items-center justify-between p-3 rounded-[var(--r-s)] bg-sf2 border border-bd hover:border-pri/50 press"
              >
                <span className="text-[13px] text-tx">{a.label}</span>
                <span className="flex items-center gap-2 text-[11px] text-tx3">
                  <span>{a.size}</span>
                  <Download className="h-4 w-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-tx3 mt-3">
          Wszystkie assety są dostępne pod licencją: użycie z wymienieniem nazwy "InfraDesk".
          Logo nie wolno modyfikować ani zmieniać proporcji.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-[20px] font-bold text-tx mb-4">🌐 Linki</h2>
        <ul className="space-y-2 text-[13px]">
          <li>
            <a href="https://infradesk.pl" className="text-pri hover:underline flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Strona główna
            </a>
          </li>
          <li>
            <a href="https://infradesk.pl/cennik" className="text-pri hover:underline flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Cennik
            </a>
          </li>
          <li>
            <a href="https://infradesk.pl/jak-to-dziala" className="text-pri hover:underline flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Jak to działa
            </a>
          </li>
          <li>
            <a href="https://status.infradesk.pl" className="text-pri hover:underline flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Status systemów
            </a>
          </li>
          <li>
            <a href="https://github.com/SILERS-Adi" className="text-pri hover:underline flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> GitHub Silers
            </a>
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-[20px] font-bold text-tx mb-4">📞 Kontakt prasowy</h2>
        <div className="space-y-3 p-5 rounded-[var(--r-l)] glass border border-bd">
          <div>
            <p className="text-[12px] text-tx font-semibold">Adrian Błaszczykowski</p>
            <p className="text-[11px] text-tx3">Założyciel · Silers</p>
          </div>
          <div className="space-y-1.5">
            <a href="mailto:biuro@silers.pl" className="flex items-center gap-2 text-[13px] text-pri hover:underline">
              <Mail className="h-4 w-4" />
              biuro@silers.pl
            </a>
            <a href="tel:+48604292831" className="flex items-center gap-2 text-[13px] text-pri hover:underline">
              <Phone className="h-4 w-4" />
              +48 604 292 831
            </a>
          </div>
          <p className="text-[11px] text-tx3 pt-2 border-t border-bd">
            Odpowiadam na pytania prasowe w ciągu 24h. Język: polski / angielski.
          </p>
        </div>
      </section>

      <footer className="text-center text-[11px] text-tx3 pt-6 border-t border-bd">
        Ostatnia aktualizacja: 2026-05. Materiały dostępne dla mediów na zasadzie fair use.
      </footer>
    </div>
  );
}

export default PressPage;

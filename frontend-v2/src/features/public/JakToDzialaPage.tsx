import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Building2, Briefcase, ArrowRight, Check, ShieldCheck, HardDrive, Bot,
  Activity, Wifi, Network, Terminal, Receipt,
  MapPin, Plane, Clock, Mail, AlertTriangle, Zap, Users, KeyRound,
  Sparkles, Camera, MonitorPlay, Database, Calendar,
  PackageOpen, X, ZoomIn,
} from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

type Scenario = 'INTERNAL' | 'MSP';

interface SegmentMeta {
  key: Scenario;
  label: string;
  tagline: string;
  icon: typeof Building2;
}

const SEGMENTS: SegmentMeta[] = [
  { key: 'INTERNAL', label: 'Zarządzam IT w jednej firmie',  tagline: 'wewnętrzny zespół IT', icon: Building2 },
  { key: 'MSP',      label: 'Zarządzam IT w wielu firmach',  tagline: 'MSP / outsourcing IT', icon: Briefcase },
];

interface Capability {
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
  bullets?: string[];
  color: string;
  scope?: Scenario; // jeśli ustawione → tylko dla tego scenariusza
}

const ASYSTENT_FEATURES: Array<{ icon: typeof Activity; label: string; desc: string }> = [
  { icon: Activity,    label: 'Stan systemu w czasie rzeczywistym', desc: 'CPU, RAM, dyski (z S.M.A.R.T.), uptime, GPU. Pracownik widzi 46% — wie że trzeba reagować.' },
  { icon: ShieldCheck, label: 'Audyt 20 punktów dziennie',          desc: 'Score 0-100 z one-click fix dla większości checków (BitLocker, RDP NLA, password policy, Defender, SMBv1, autorun…).' },
  { icon: Camera,      label: 'Zgłoszenia ze screenem',              desc: 'Pracownik klika „Zgłoś problem", robi screen, opisuje, leci do helpdesku z urządzeniem już dopiętym.' },
  { icon: MonitorPlay, label: 'Detekcja RustDesk / AnyDesk / TeamViewer', desc: 'Asystent widzi co masz zainstalowane, instaluje brakujące, pokazuje ID. Helpdesk klika i łączy się.' },
  { icon: Network,     label: 'Skan sieci LAN + diff',                desc: 'Codziennie ARP-discovery, raport jakie urządzenia doszły / zniknęły z sieci.' },
  { icon: HardDrive,   label: 'Inventory: hardware + software',       desc: 'Hostname, OS, CPU/RAM, serial, MAC, lista zainstalowanych programów + licencje (Windows/Office/SQL).' },
  { icon: Database,    label: 'Skan baz danych',                      desc: 'Detekcja SQL Server, MySQL, Postgres na maszynie + test connection do każdej.' },
  { icon: Bot,         label: 'Iris (AI) wbudowane',                  desc: 'Lokalny chat z asystentem AI — Iris diagnozuje, pisze odpowiedzi, sugeruje fix.' },
];

const SECURITY_CHECKS: string[] = [
  'BitLocker (szyfrowanie dysku)',
  'Windows Firewall (Domain / Private / Public)',
  'Windows Defender + wiek definicji',
  'Windows Updates (<30 dni)',
  'Password policy (min 8 znaków)',
  'Account lockout policy',
  'SMBv1 wyłączony',
  'Konto Guest wyłączone',
  'RDP NLA wymagane',
  'RDP włączony / wyłączony',
  'Wygasające certyfikaty',
  'Pending Windows Updates',
  'Uptime systemu',
  'Krytyczne event logi (24h)',
  'Otwarte network shares',
  'PowerShell execution policy',
  'Liczba kont Administrator (max 3)',
  'Autorun wyłączony',
  'Identyfikacja konta admina',
  'Rotacja kluczy / haseł VPN',
];

const REMOTE_ACTIONS: Array<{ icon: typeof Terminal; label: string; desc: string }> = [
  { icon: MonitorPlay, label: 'Zdalny pulpit',           desc: 'RustDesk launch jednym klikiem z listy urządzeń (z PIN-em jednorazowym dla klienta).' },
  { icon: Database,    label: 'Run database scan',       desc: 'Zdalnie uruchamiasz skan baz danych — agent zwraca listę instancji + status connection.' },
  { icon: ShieldCheck, label: 'Run security audit',      desc: 'Wymuszasz pełen audyt 20 punktów na zawołanie (zamiast czekać na cykl 24h).' },
  { icon: Wifi,        label: 'Run network scan',        desc: 'Zdalnie skanujesz LAN klienta i widzisz nowe / zniknięte urządzenia.' },
  { icon: PackageOpen, label: 'Run full inventory',      desc: 'Pełna inwentaryzacja sprzętu i softu na życzenie — szybciej niż klikanie po stacjach.' },
  { icon: Terminal,    label: 'Run server metrics',      desc: 'Komendy ad-hoc dla serwerów (services, listy plików, status pool/RAID).' },
  { icon: HardDrive,   label: 'Run backup now',          desc: 'Triggerujesz backup z panelu — bez logowania na serwer.' },
];

const CAPABILITIES: Capability[] = [
  {
    icon: ShieldCheck, color: 'var(--ok)',
    title: 'Audyty sieci i bezpieczeństwa',
    desc: 'Codziennie automatycznie + na żądanie z panelu. 20-punktowa lista z one-click fix.',
    bullets: ['Score 0-100 dla każdej stacji', 'Skan LAN + diff zmian', 'Logi krytyczne (eventy z 24h)', 'Audyt licencji Windows/Office'],
  },
  {
    icon: HardDrive, color: 'var(--pri)',
    title: 'Backupy zarządzane',
    desc: 'Cron schedule, multi-source, wiele destynacji.',
    bullets: ['MySQL / PostgreSQL / MSSQL / foldery', 'Google Drive / InfraDesk Cloud / FTP / dysk', 'AES encryption + retention 1-3650 dni', 'Trigger ad-hoc z panelu', 'Alert gdy zadanie failuje'],
  },
  {
    icon: AlertTriangle, color: 'var(--er)',
    title: 'Monitoring + alerty',
    desc: 'Audit Score, uptime, dyski, certyfikaty. HIGH+ → automatyczny ticket.',
    bullets: ['5 poziomów: INFO / LOW / MEDIUM / HIGH / CRITICAL', 'Deduplikacja 60-min per (urządzenie + typ)', 'Auto-ticket na HIGH+', 'Heatmap urządzeń w panelu'],
  },
  {
    icon: KeyRound, color: 'var(--wn)',
    title: 'Sejf haseł',
    desc: 'AES-256-GCM, kategorie, audit log każdego podejrzenia.',
    bullets: ['11 kategorii: Windows / VPN / Email / DB / Router / Wi-Fi / SSH / API…', 'Powiązanie z urządzeniem', 'Polityka rotacji + alert wygasania', 'Kto / kiedy / skąd podejrzał (IP + UA)'],
  },
  {
    icon: Mail, color: 'var(--pri)',
    title: 'Zgłoszenia (helpdesk)',
    desc: 'Pełen workflow z auto-rozliczeniem czasu.',
    bullets: ['NEW → IN_PROGRESS → RESOLVED → CLOSED', 'Komentarze publiczne + wewnętrzne', 'Auto-numeracja T-2026-0001', 'IMAP inboxing — maile robią się ticketami', 'Ocena rozwiązania od klienta', 'AI sugeruje kategorię + odpowiedź'],
  },
  {
    icon: Calendar, color: 'var(--ok)',
    title: 'Zadania + delegacje',
    desc: 'Lista zadań, kalendarz, wyjazdy serwisowe z autonaliczaniem.',
    bullets: ['Zadania: NEW / IN_PROGRESS / DONE', 'Delegacje DEL-2026-0001: data, technik, godziny, lokalizacja, samochód', 'Pole „dystans" + auto-naliczanie kilometrówki', 'Status PLANNED → IN_PROGRESS → DONE'],
  },
  {
    icon: MapPin, color: 'var(--pri)',
    title: 'Lokalizacje serwisantów (GPS)',
    desc: 'Real-time tracking gdzie są technicy w terenie.',
    bullets: ['Pozycja, prędkość, kierunek, dokładność', 'Source: GPS / CELL / WIFI', 'Battery level (telefon technika)', 'Auto-clock-in po wjechaniu na lokalizację klienta'],
  },
  {
    icon: Clock, color: 'var(--wn)',
    title: 'Automatyczne naliczanie czasu',
    desc: 'TimeSignals — zegar sam się włącza i wyłącza.',
    bullets: ['Auto-detect: focus na ticket, sesja zdalna, GPS na lokalizacji klienta, telefon CRM', 'Sesje pracy linkowane do ticketów', 'Billing increments 15 / 30 / 60 min', 'Per-klient stawka / abonament / hybryda'],
  },
  {
    icon: Bot, color: 'var(--pri)',
    title: 'AI Copilot (Iris)',
    desc: 'Multi-turn chat z 8 narzędziami, Shadow Mode, Insights.',
    bullets: ['Twórz ticket, dopisz komentarz, oceń rozwiązanie — wszystko z czatu', 'Shadow Mode: AI proponuje, Ty zatwierdzasz, system uczy się', 'Insights: ticket velocity 7d, top failing devices, avg resolution time per kategoria', 'Modele Opus / Sonnet / Haiku do wyboru'],
  },
  {
    icon: Users, color: 'var(--ok)',
    title: 'CRM',
    desc: 'Kontakty, telefon, mail, KSeF — wszystko w jednym miejscu.',
    bullets: ['Activities: connect calls / emails / notes', 'IMAP sync skrzynki workspace', 'Kontakty + segmenty', 'Integracje API (CEIDG, GUS, biała lista MF)'],
  },
  {
    icon: Receipt, color: 'var(--pri)', scope: 'MSP',
    title: 'Per-klient billing (MSP)',
    desc: 'Każda firma osobny workspace z własnym modelem rozliczenia.',
    bullets: ['HOURLY / SUBSCRIPTION / HYBRID', 'Kwota miesięczna netto + stawka godzinowa', 'Increment 15 min default', 'Period MONTHLY / QUARTERLY / YEARLY', 'Plik kontraktu trzymany w workspace'],
  },
  {
    icon: ShieldCheck, color: 'var(--er)', scope: 'MSP',
    title: 'Multi-workspace (MSP)',
    desc: 'Każdy klient osobno, Ty widzisz wszystko jednym ekranem.',
    bullets: ['WorkspaceRelation: provider ↔ client', '7 capabilities per relation: canViewDevices / canViewUsers / canAccessCredentials / canCreateTicketsOnBehalf …', 'Status ACTIVE / SUSPENDED / TERMINATED', 'Cross-workspace alert visibility'],
  },
];

function ScreenshotFrame({ src, alt, caption, onZoom }: { src: string; alt: string; caption?: string; onZoom: () => void }) {
  return (
    <figure className="rounded-[var(--r-l)] overflow-hidden border group" style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}>
      <button
        type="button"
        onClick={onZoom}
        className="block relative w-full press cursor-zoom-in"
        aria-label={`Powiększ: ${alt}`}
      >
        <img src={src} alt={alt} className="block w-full h-auto transition-transform group-hover:scale-[1.02]" loading="lazy" />
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-[var(--r-xs)] text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
        >
          <ZoomIn className="h-3 w-3" />
          Powiększ
        </span>
      </button>
      {caption && (
        <figcaption className="px-4 py-2 text-[11px] text-tx3 border-t" style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function ScreenshotLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[96vw] max-w-[1400px] -translate-x-1/2 -translate-y-1/2 anim-scale"
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Close asChild>
            <button
              className="absolute -top-3 -right-3 md:top-3 md:right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center press"
              style={{ background: 'rgba(255,255,255,0.95)', color: '#000' }}
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
          <img
            src={src}
            alt={alt}
            className="block w-full h-auto rounded-[var(--r-l)] shadow-2xl"
            style={{ maxHeight: '92vh', objectFit: 'contain' }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ScreenshotEntry { src: string; alt: string; caption: string }

const ASYSTENT_SHOTS: ScreenshotEntry[] = [
  { src: '/screenshots/asystent/stan-systemu.png',   alt: 'Asystent — Stan systemu z circular gauge',         caption: 'Stan systemu — pracownik widzi kondycję komputera w 2 sekundy' },
  { src: '/screenshots/asystent/zgloszenia.png',     alt: 'Asystent — Formularz zgłoszenia',                  caption: 'Zgłoszenie ze screenem w 2 klikach — z urządzeniem już dopiętym' },
  { src: '/screenshots/asystent/bezpieczenstwo.png', alt: 'Asystent — Audyt bezpieczeństwa Score 75/100',     caption: 'Audyt 0-100 z one-click fix — BitLocker, RDP NLA, Defender, password policy…' },
];

export function JakToDzialaPage() {
  usePageMeta({
    title: 'Jak to działa',
    description: 'Zobacz scenariusze użycia: zarządzasz IT w jednej firmie czy obsługujesz wielu klientów (MSP). Asystent na każdej stacji + centralny panel.',
  });
  const [scenario, setScenario] = useState<Scenario>('INTERNAL');
  const [zoom, setZoom] = useState<ScreenshotEntry | null>(null);

  const filteredCapabilities = CAPABILITIES.filter((c) => !c.scope || c.scope === scenario);

  return (
    <div>
      {/* Hero */}
      <section className="px-5 pt-12 pb-6 md:pt-16">
        <div className="max-w-[1100px] mx-auto text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Jak to działa</p>
          <h1 className="text-[34px] md:text-[44px] font-bold tracking-tight mb-3">
            Wybierz swój scenariusz
          </h1>
          <p className="text-[14px] md:text-[15px] text-tx2 max-w-[640px] mx-auto">
            InfraDesk działa tak samo czy masz jedną firmę, czy dziesięciu klientów —
            ale różnie się go ustawia. Klikni który profil pasuje, dostaniesz historię dopasowaną pod Ciebie.
          </p>
        </div>
      </section>

      {/* Scenario picker */}
      <section className="px-5 pb-10">
        <div className="max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {SEGMENTS.map((s) => {
            const active = scenario === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScenario(s.key)}
                className="rounded-[var(--r-l)] p-6 border text-left transition-all press"
                style={active
                  ? { borderColor: 'var(--pri)', borderWidth: 2, background: 'var(--pri-l)' }
                  : { borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                    style={{ background: active ? 'var(--pri)' : 'var(--sf-h)', color: active ? 'white' : 'var(--tx2)' }}
                  >
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-0.5">{s.tagline}</p>
                    <h3 className="text-[16px] font-bold">{s.label}</h3>
                  </div>
                  {active && <Check className="h-4 w-4 text-pri ml-auto" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Block 1: Asystent na każdej stacji */}
      <section className="px-5 py-12" style={{ background: 'var(--sf)' }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Krok 1</p>
            <h2 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-3">
              Asystent na każdej stacji
            </h2>
            <p className="text-[14px] text-tx2 max-w-[680px] mx-auto">
              {scenario === 'INTERNAL'
                ? 'Twoi pracownicy widzą stan swoich komputerów. Klikają „Zgłoś problem" — Twój zespół IT dostaje ticket z urządzeniem już dopiętym.'
                : 'Każda stacja każdego klienta ma Asystenta. Pracownicy klienta zgłaszają problemy bezpośrednio do Twojego helpdesku — bez maili, bez telefonów.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {ASYSTENT_SHOTS.map((s) => (
              <ScreenshotFrame
                key={s.src}
                src={s.src}
                alt={s.alt}
                caption={s.caption}
                onZoom={() => setZoom(s)}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ASYSTENT_FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-start gap-3 p-3 rounded-[var(--r-s)] border"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf2)' }}
              >
                <div
                  className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}
                >
                  <f.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-bold mb-0.5">{f.label}</h4>
                  <p className="text-[12px] text-tx2 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Block 2: Co dostajesz w panelu */}
      <section className="px-5 py-14">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Krok 2</p>
            <h2 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-3">
              Centralny panel — wszystko jednym ekranem
            </h2>
            <p className="text-[14px] text-tx2 max-w-[680px] mx-auto">
              {scenario === 'INTERNAL'
                ? 'Tickety, urządzenia, audyty, alerty, sejf haseł, sesje pracy, raporty — bez przepinania się między aplikacjami.'
                : 'Wszyscy klienci jednym ekranem. Widzisz alerty od każdego, ale dane są ściśle izolowane (klient A nie widzi klienta B). Per-klient billing.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCapabilities.map((c) => (
              <div
                key={c.title}
                className="rounded-[var(--r-m)] p-4 border"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                    style={{ background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color }}
                  >
                    <c.icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-[14px] font-bold">{c.title}</h3>
                </div>
                <p className="text-[12px] text-tx2 leading-relaxed mb-2">{c.desc}</p>
                {c.bullets && (
                  <ul className="space-y-1">
                    {c.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5 text-[11px] text-tx3">
                        <Check className="h-3 w-3 mt-0.5 shrink-0" style={{ color: c.color }} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Block 3: Audyt 20 punktów */}
      <section className="px-5 py-14" style={{ background: 'var(--sf)' }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Krok 3</p>
              <h2 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-3">
                20 punktów audytu, codziennie
              </h2>
              <p className="text-[14px] text-tx2 mb-4 leading-relaxed">
                Asystent skanuje stację raz dziennie według checklisty.
                Większość problemów ma <strong>one-click fix</strong> — klikasz w panelu, audyt naprawia,
                logujemy zmianę.
              </p>
              <p className="text-[12px] text-tx3 mb-6">
                {scenario === 'INTERNAL'
                  ? 'Wynik widoczny dla całej Twojej floty — wiesz która stacja jest „red" zanim user zadzwoni.'
                  : 'Per-klient średni Audit Score widoczny w jednym dashboardzie. Sprzedajesz „raport bezpieczeństwa miesięczny" jako add-on.'}
              </p>
              <Link
                to="/cennik"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[var(--r-s)] text-[13px] font-semibold press"
                style={{ background: 'var(--pri)', color: 'white' }}
              >
                Zobacz pełen cennik <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div
              className="rounded-[var(--r-m)] p-4 border max-h-[440px] overflow-y-auto"
              style={{ borderColor: 'var(--bd)', background: 'var(--sf2)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-2">Lista checków</p>
              <ul className="space-y-1.5">
                {SECURITY_CHECKS.map((c, i) => (
                  <li key={c} className="flex items-start gap-2 text-[12px]">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}
                    >
                      {i + 1}
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Block 4: Akcje zdalne */}
      <section className="px-5 py-14">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Krok 4</p>
            <h2 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-3">
              Akcje zdalne z panelu
            </h2>
            <p className="text-[14px] text-tx2 max-w-[680px] mx-auto">
              {scenario === 'INTERNAL'
                ? 'Bez chodzenia po biurze i bez RDP-owania na każdą stację. Jednym kliknięciem.'
                : 'Bez wsiadania w samochód. Bez „czy mogę połączyć się o 14?". Klikasz, agent wykonuje, zwraca wynik.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {REMOTE_ACTIONS.map((a) => (
              <div
                key={a.label}
                className="rounded-[var(--r-m)] p-4 border"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <a.icon className="h-4 w-4 text-pri" />
                  <h4 className="text-[13px] font-bold">{a.label}</h4>
                </div>
                <p className="text-[12px] text-tx2 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Block 5: GPS + naliczanie czasu (jeden moduł, oba scenariusze ale inny opis) */}
      <section className="px-5 py-14" style={{ background: 'var(--sf)' }}>
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Krok 5</p>
            <h2 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-3">
              {scenario === 'INTERNAL' ? 'Sesje pracy = realny widok produktywności' : 'Naliczanie godzin samo się dzieje'}
            </h2>
            <p className="text-[14px] text-tx2 mb-4 leading-relaxed">
              <strong>TimeSignals</strong> — system sam wie kiedy ktoś pracuje.
              Focus na ticket = klok startuje. Sesja RustDesk = klok startuje.
              Telefon do klienta z CRM = klok startuje. GPS wjeżdża na lokalizację klienta = klok startuje.
            </p>
            <p className="text-[14px] text-tx2 mb-4 leading-relaxed">
              {scenario === 'INTERNAL'
                ? 'Twoi technicy nie wpisują czasu ręcznie. Raport miesięczny pokazuje gdzie czas idzie — bez stresu „zapomnieli kliknąć".'
                : 'Faktura dla klienta liczy się sama. Stawka godzinowa lub abonament + nadwyżka. Increment 15 / 30 / 60 min konfigurowalny per umowa.'}
            </p>
            <ul className="grid grid-cols-2 gap-2 text-[12px] text-tx2">
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Auto-clock-in z GPS</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Logi prac zdalnych (RustDesk)</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Logi prac lokalnych (delegacje)</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Połączenia telefoniczne z CRM</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Per-klient billing model</li>
              <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-ok mt-0.5 shrink-0" /> Kilometrówka z delegacji</li>
            </ul>
          </div>
          <div
            className="rounded-[var(--r-m)] p-5 border"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf2)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Plane className="h-5 w-5 text-pri" />
              <span className="text-[13px] font-bold">Delegacje serwisowe</span>
            </div>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-start gap-2"><Calendar className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Data + przypisany technik</li>
              <li className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Lokalizacja klienta</li>
              <li className="flex items-start gap-2"><Clock className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Estimated + actual hours</li>
              <li className="flex items-start gap-2"><Receipt className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Dystans + samochód</li>
              <li className="flex items-start gap-2"><Zap className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Auto-numerowane DEL-2026-0001</li>
              <li className="flex items-start gap-2"><Activity className="h-3.5 w-3.5 text-tx3 mt-0.5 shrink-0" /> Status PLANNED → IN_PROGRESS → DONE</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Block 6: Partner IT (coming soon) */}
      <section className="px-5 py-14">
        <div className="max-w-[1100px] mx-auto">
          <div
            className="rounded-[var(--r-l)] p-6 md:p-8 border"
            style={{ borderColor: 'var(--pri)', background: 'linear-gradient(135deg, var(--pri-l) 0%, var(--sf) 70%)' }}
          >
            <div className="flex items-start gap-4 flex-wrap">
              <div
                className="w-12 h-12 rounded-[var(--r-m)] flex items-center justify-center shrink-0"
                style={{ background: 'var(--pri)', color: 'white' }}
              >
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[20px] font-bold">Partner IT — wkrótce</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}>
                    W trakcie wdrożenia
                  </span>
                </div>
                <p className="text-[13px] text-tx2 leading-relaxed mb-3">
                  Współpracujesz z innymi firmami które Cię wspierają? Udzielisz im
                  <strong> dostępu do wybranych haseł, połączeń zdalnych i urządzeń konkretnego klienta na ograniczony czas</strong> —
                  bez tworzenia im konta, bez przekazywania haseł na maila.
                  Partner widzi tylko to co ustawisz, dostęp wygasa automatycznie.
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[12px] text-tx2">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-pri mt-0.5 shrink-0" /> Time-bounded share (np. „do piątku 17:00")</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-pri mt-0.5 shrink-0" /> Wybierasz konkretne hasła / urządzenia / połączenia</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-pri mt-0.5 shrink-0" /> Pełen audit log podejrzeń przez partnera</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-pri mt-0.5 shrink-0" /> Auto-revoke po wygaśnięciu</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {zoom && <ScreenshotLightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}

      {/* Final CTA */}
      <section className="px-5 py-16">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-[26px] md:text-[34px] font-bold tracking-tight mb-3">
            Zobacz to na własnym koncie
          </h2>
          <p className="text-[14px] text-tx2 mb-6 max-w-[600px] mx-auto">
            30 dni pełnego planu PRO bez podawania karty.
            Zainstalujesz Asystenta na 2-3 stacjach, skonfigurujesz pierwszy backup, wystawisz testowy ticket — i zobaczysz czy to dla Ciebie.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register?plan=PRO&cycle=monthly"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              Załóż konto za darmo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/kontakt"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press border"
              style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
            >
              Umów demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

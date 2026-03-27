import { useState } from 'react';
import { Download, Monitor, Server, Smartphone, ScreenShare, CheckCircle, ExternalLink, GitCompareArrows, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useQuery } from '@tanstack/react-query';

interface AppCard {
  icon: React.ReactNode;
  name: string;
  description: string;
  color: string;
  files: {
    label: string;
    url: string;
    badge?: string;
    size?: string;
    primary?: boolean;
  }[];
  notes?: string[];
}

function useAgentVersion() {
  return useQuery({
    queryKey: ['agent-version'],
    queryFn: async () => {
      const r = await fetch('/downloads/version.json', { cache: 'no-store' });
      const d = await r.json();
      return d.version as string;
    },
    staleTime: 60_000,
  });
}

const COLOR_MAP: Record<string, { bg: string; iconBg: string; iconColor: string; badgeBg: string; badgeColor: string; primaryBg: string; border: string }> = {
  indigo: {
    bg:         'rgba(99,102,241,0.06)',
    iconBg:     'rgba(99,102,241,0.15)',
    iconColor:  '#818CF8',
    badgeBg:    'rgba(99,102,241,0.15)',
    badgeColor: '#A5B4FC',
    primaryBg:  'linear-gradient(145deg, #6366F1, #4F46E5)',
    border:     'rgba(99,102,241,0.15)',
  },
  emerald: {
    bg:         'rgba(16,185,129,0.06)',
    iconBg:     'rgba(16,185,129,0.15)',
    iconColor:  '#34D399',
    badgeBg:    'rgba(16,185,129,0.15)',
    badgeColor: '#6EE7B7',
    primaryBg:  'linear-gradient(145deg, #10B981, #059669)',
    border:     'rgba(16,185,129,0.15)',
  },
  orange: {
    bg:         'rgba(249,115,22,0.06)',
    iconBg:     'rgba(249,115,22,0.15)',
    iconColor:  '#FB923C',
    badgeBg:    'rgba(249,115,22,0.15)',
    badgeColor: '#FDBA74',
    primaryBg:  'linear-gradient(145deg, #F97316, #EA580C)',
    border:     'rgba(249,115,22,0.15)',
  },
};

function AppCardView({ app }: { app: AppCard }) {
  const c = COLOR_MAP[app.color];
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
      <div className="flex items-center gap-4 px-6 py-5" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: c.iconBg, color: c.iconColor }}>
          {app.icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-white/90">{app.name}</h2>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{app.description}</p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Pobierz</h3>
          {app.files.map(f => {
            const isExternal = f.url.startsWith('http');
            const isComingSoon = f.badge === 'Wkrótce';
            return (
              <a
                key={f.label}
                href={isComingSoon ? undefined : f.url}
                download={!isExternal && !isComingSoon ? true : undefined}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={
                  isComingSoon
                    ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', opacity: 0.5, cursor: 'not-allowed' }
                    : f.primary
                      ? { background: c.primaryBg, border: '1px solid transparent', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }
                      : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }
                }
              >
                {isExternal
                  ? <ExternalLink className="h-4 w-4 flex-shrink-0" style={{ color: f.primary ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }} />
                  : <Download className="h-4 w-4 flex-shrink-0" style={{ color: f.primary ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }} />
                }
                <span className="text-sm font-medium flex-1" style={{ color: f.primary ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                  {f.label}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.size && (
                    <span className="text-xs" style={{ color: f.primary ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>{f.size}</span>
                  )}
                  {f.badge && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={
                        f.primary && !isComingSoon
                          ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                          : { background: c.badgeBg, color: c.badgeColor }
                      }>
                      {f.badge}
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>

        {app.notes && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Informacje</h3>
            <ul className="space-y-2">
              {app.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Agent Comparison Modal ──────────────────────────────────────────────── */
interface CompareRow { feature: string; client: string | boolean; server: string | boolean }

const COMPARE_DATA: CompareRow[] = [
  { feature: 'Tryb pracy',              client: 'Aplikacja w zasobniku (tray)', server: 'Usługa Windows (background)' },
  { feature: 'Wymaga logowania',         client: true,                          server: false },
  { feature: 'Auto-start z Windows',     client: true,                          server: true },
  { feature: 'Zgłoszenia serwisowe',     client: true,                          server: false },
  { feature: 'Okno klienta (kontakt)',   client: true,                          server: false },
  { feature: 'Wake-on-LAN',             client: true,                          server: true },
  { feature: 'RustDesk (zdalny pulpit)', client: true,                          server: false },
  { feature: 'Security Audit (0-100)',   client: true,                          server: true },
  { feature: 'Skanowanie sieci',         client: true,                          server: true },
  { feature: 'Monitoring S.M.A.R.T.',    client: false,                         server: true },
  { feature: 'Monitoring RAID',          client: false,                         server: true },
  { feature: 'Event Log Windows',        client: false,                         server: true },
  { feature: 'Certyfikaty SSL',          client: false,                         server: true },
  { feature: 'Hyper-V monitoring',       client: false,                         server: true },
  { feature: 'Backup (konfigurowalny)',  client: true,                          server: true },
  { feature: 'Auto-diagnostyka',         client: true,                          server: true },
  { feature: 'Przeznaczenie',           client: 'Komputery pracowników',       server: 'Serwery Windows' },
];

function CompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl"
        style={{ background: '#0E1527', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4" style={{ background: '#0E1527', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <GitCompareArrows className="h-5 w-5" style={{ color: '#818CF8' }} />
            <h3 className="text-[16px] font-semibold text-white/90">Agent Client vs Agent Server</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/10">
            <X className="h-5 w-5 text-white/40" />
          </button>
        </div>
        <div className="p-6">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th className="text-left py-3 pr-4 font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Funkcja</th>
                <th className="text-center py-3 px-3 font-semibold" style={{ color: '#818CF8' }}>
                  <div className="flex items-center justify-center gap-1.5"><Monitor className="h-3.5 w-3.5" /> Client</div>
                </th>
                <th className="text-center py-3 pl-3 font-semibold" style={{ color: '#34D399' }}>
                  <div className="flex items-center justify-center gap-1.5"><Server className="h-3.5 w-3.5" /> Server</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_DATA.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="py-2.5 pr-4" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.feature}</td>
                  <td className="py-2.5 px-3 text-center">
                    {typeof row.client === 'boolean'
                      ? row.client
                        ? <CheckCircle className="h-4 w-4 mx-auto" style={{ color: '#22C55E' }} />
                        : <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                      : <span style={{ color: 'rgba(255,255,255,0.5)' }}>{row.client}</span>}
                  </td>
                  <td className="py-2.5 pl-3 text-center">
                    {typeof row.server === 'boolean'
                      ? row.server
                        ? <CheckCircle className="h-4 w-4 mx-auto" style={{ color: '#22C55E' }} />
                        : <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                      : <span style={{ color: 'rgba(255,255,255,0.5)' }}>{row.server}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function DownloadsPage() {
  const { data: agentVersion } = useAgentVersion();
  const versionBadge = agentVersion ? `v${agentVersion}` : 'Najnowszy';
  const [compareOpen, setCompareOpen] = useState(false);

  const APPS: AppCard[] = [
    {
      icon: <Monitor className="h-7 w-7" />,
      name: 'InfraDesk Agent Client',
      description: 'Agent dla komputerów pracowników. Zgłoszenia, RustDesk, Wake-on-LAN, backup, Security Audit.',
      color: 'indigo',
      files: [
        { label: 'Instalator (zalecany)', url: '/downloads/InfraDesk%20Agent.exe', badge: versionBadge, primary: true, size: '~39 MB' },
        { label: 'Wersja Beta (v4.1.0 — auto-diagnostyka, backup)', url: '/downloads/InfraDesk-Agent-beta.exe', badge: 'Beta 4.1', size: '~39 MB' },
      ],
      notes: [
        'Wymaga Windows 10 lub nowszego',
        'Aplikacja w zasobniku systemowym (tray)',
        'Przy pierwszym uruchomieniu wpisz kod rejestracji',
        'Zgłoszenia, RustDesk, WoL, Security Audit',
      ],
    },
    {
      icon: <Server className="h-7 w-7" />,
      name: 'InfraDesk Agent Server',
      description: 'Agent dla serwerów Windows. Usługa Windows, S.M.A.R.T., RAID, Event Log, Hyper-V, SSL.',
      color: 'indigo',
      files: [
        { label: 'InfraDesk Agent Server — Windows', url: '/downloads/InfraDesk%20Server%20Agent.exe', badge: versionBadge, primary: true, size: '~40 MB' },
      ],
      notes: [
        'Działa jako usługa Windows (bez logowania)',
        'S.M.A.R.T., RAID, Event Log, certyfikaty SSL',
        'Security Audit 0-100, Hyper-V monitoring',
        'Instalacja: agent.exe --install-service',
      ],
    },
    {
      icon: <Smartphone className="h-7 w-7" />,
      name: 'InfraDesk TV — Android',
      description: 'Aplikacja dashboard dla Android TV. Wyświetla statystyki i zgłoszenia na dużym ekranie.',
      color: 'emerald',
      files: [
        { label: 'APK — Android TV', url: '/downloads/InfraDesk-TV.apk', badge: 'v1.0.0', primary: true, size: '~5 MB' },
      ],
      notes: [
        'Wymaga Android TV 5.0 lub nowszego',
        'Instalacja przez sideload (USB lub ADB: adb install InfraDesk-TV.apk)',
        'Po uruchomieniu zaloguj się danymi do panelu InfraDesk',
        'Dashboard odświeża się automatycznie co 30 sekund',
      ],
    },
    {
      icon: <ScreenShare className="h-7 w-7" />,
      name: 'RustDesk',
      description: 'Oprogramowanie do zdalnego pulpitu. Używane przez techników InfraDesk do bezpośredniego wsparcia.',
      color: 'orange',
      files: [
        { label: 'RustDesk InfraDesk — Windows (64-bit)', url: '/downloads/silers.msi', badge: 'v1.3.7', primary: true, size: '~29 MB' },
        { label: 'RustDesk — Android (Universal)', url: '/downloads/rustdesk.apk', size: '~68 MB' },
      ],
      notes: [
        'Podaj ID i hasło technikowi gdy poprosi o dostęp zdalny',
        'Połączenie jest szyfrowane end-to-end',
        'Wersja Windows skonfigurowana pod serwer InfraDesk — instalacja jednym klikiem',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Pobieranie"
        subtitle="Aplikacje i narzędzia dla klientów i techników InfraDesk"
      />

      <div className="space-y-5">
        {APPS.map((app, i) => (
          <div key={app.name}>
            <AppCardView app={app} />
            {i === 0 && (
              <div className="flex justify-center -mb-2 mt-3">
                <button onClick={() => setCompareOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'rgba(99,102,241,0.8)' }}>
                  <GitCompareArrows className="h-4 w-4" />
                  Porównaj Agent Client vs Server
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
}

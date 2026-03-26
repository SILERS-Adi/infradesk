import { Download, Monitor, Smartphone, ScreenShare, CheckCircle, ExternalLink } from 'lucide-react';
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

export function DownloadsPage() {
  const { data: agentVersion } = useAgentVersion();
  const versionBadge = agentVersion ? `v${agentVersion}` : 'Najnowszy';

  const APPS: AppCard[] = [
    {
      icon: <Monitor className="h-7 w-7" />,
      name: 'InfraDesk Agent',
      description: 'Aplikacja agenta dla systemu Windows. Umożliwia zdalne zarządzanie, zgłoszenia serwisowe i Wake on LAN.',
      color: 'indigo',
      files: [
        { label: 'Instalator (zalecany)', url: '/downloads/InfraDesk%20Agent.exe', badge: versionBadge, primary: true, size: '~39 MB' },
        { label: 'Wersja Beta (v4.1.0 — auto-diagnostyka, backup)', url: '/downloads/InfraDesk-Agent-beta.exe', badge: 'Beta 4.1', size: '~39 MB' },
      ],
      notes: [
        'Wymaga Windows 10 lub nowszego',
        'Przy pierwszym uruchomieniu wpisz kod rejestracji otrzymany od administratora',
        'Aplikacja uruchamia się automatycznie razem z Windows',
      ],
    },
    {
      icon: <Smartphone className="h-7 w-7" />,
      name: 'InfraDesk TV — Android',
      description: 'Aplikacja dashboard dla Android TV. Wyświetla statystyki i zgłoszenia na dużym ekranie.',
      color: 'emerald',
      files: [
        { label: 'APK — Android TV', url: '/downloads/InfraDesk-TV.apk', primary: true, size: '~5 MB' },
      ],
      notes: [
        'Wymaga Android TV 5.0 lub nowszego',
        'Instalacja przez sideload (USB lub ADB: adb install InfraDesk-TV.apk)',
        'Po uruchomieniu zaloguj się danymi do panelu InfraDesk',
        'Dashboard odświeża się automatycznie co 30 sekund',
        'Aplikacja sprawdza aktualizacje automatycznie przy starcie',
      ],
    },
    {
      icon: <ScreenShare className="h-7 w-7" />,
      name: 'RustDesk',
      description: 'Oprogramowanie do zdalnego pulpitu. Używane przez techników InfraDesk do bezpośredniego wsparcia.',
      color: 'orange',
      files: [
        { label: 'RustDesk InfraDesk — Windows (64-bit)', url: '/downloads/silers.msi', primary: true, size: '~29 MB' },
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
        {APPS.map(app => (
          <AppCardView key={app.name} app={app} />
        ))}
      </div>
    </div>
  );
}

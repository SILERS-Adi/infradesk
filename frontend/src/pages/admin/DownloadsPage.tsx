import { Download, Monitor, Smartphone, ScreenShare, CheckCircle, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';

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

const APPS: AppCard[] = [
  {
    icon: <Monitor className="h-7 w-7" />,
    name: 'InfraDesk Agent',
    description: 'Aplikacja agenta dla systemu Windows. Umożliwia zdalne zarządzanie, zgłoszenia serwisowe i Wake on LAN.',
    color: 'indigo',
    files: [
      { label: 'Instalator (zalecany)', url: '/downloads/InfraDesk%20Agent.exe', badge: 'Najnowszy', primary: true, size: '~29 MB' },
      { label: 'Wersja Setup', url: '/downloads/InfraDesk-Agent-Setup.exe', size: '~29 MB' },
      { label: 'Wersja Beta', url: '/downloads/InfraDesk-Agent-beta.exe', badge: 'Beta', size: '~29 MB' },
      { label: 'Paczka ZIP', url: '/downloads/InfraDesk-Agent.zip', size: '~29 MB' },
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
      { label: 'RustDesk — Android (Universal)', url: '/downloads/rustdesk.apk', primary: true, size: '~68 MB' },
      { label: 'RustDesk — Windows (64-bit)', url: '/downloads/rustdesk.exe', badge: 'Wkrótce' },
    ],
    notes: [
      'Podaj ID i hasło technikowi gdy poprosi o dostęp zdalny',
      'Połączenie jest szyfrowane end-to-end',
      'Nie musisz nic instalować — wersja portable działa bez instalacji',
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; icon: string; badge: string; primary: string; border: string }> = {
  indigo: {
    bg:      'bg-indigo-50',
    icon:    'text-indigo-600 bg-indigo-100',
    badge:   'bg-indigo-100 text-indigo-700',
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    border:  'border-indigo-200',
  },
  emerald: {
    bg:      'bg-emerald-50',
    icon:    'text-emerald-600 bg-emerald-100',
    badge:   'bg-emerald-100 text-emerald-700',
    primary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    border:  'border-emerald-200',
  },
  orange: {
    bg:      'bg-orange-50',
    icon:    'text-orange-600 bg-orange-100',
    badge:   'bg-orange-100 text-orange-700',
    primary: 'bg-orange-600 hover:bg-orange-700 text-white',
    border:  'border-orange-200',
  },
};

export function DownloadsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Pobieranie"
        subtitle="Aplikacje i narzędzia dla klientów i techników InfraDesk"
      />

      <div className="space-y-5">
        {APPS.map(app => {
          const c = COLOR_MAP[app.color];
          return (
            <div key={app.name} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className={`flex items-center gap-4 px-6 py-5 ${c.bg} border-b ${c.border}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${c.icon} flex-shrink-0`}>
                  {app.icon}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{app.name}</h2>
                  <p className="text-sm text-gray-600 mt-0.5">{app.description}</p>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Download buttons */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pobierz</h3>
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
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                          isComingSoon
                            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                            : f.primary
                              ? `${c.primary} border-transparent shadow-sm cursor-pointer`
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        {isExternal
                          ? <ExternalLink className={`h-4 w-4 flex-shrink-0 ${f.primary ? 'text-white/80' : 'text-gray-400'}`} />
                          : <Download className={`h-4 w-4 flex-shrink-0 ${f.primary ? 'text-white/80' : 'text-gray-400'}`} />
                        }
                        <span className={`text-sm font-medium flex-1 ${f.primary ? 'text-white' : 'text-gray-700'}`}>
                          {f.label}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {f.size && (
                            <span className={`text-xs ${f.primary ? 'text-white/70' : 'text-gray-400'}`}>{f.size}</span>
                          )}
                          {f.badge && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              f.primary && !isComingSoon ? 'bg-white/20 text-white' : c.badge
                            }`}>
                              {f.badge}
                            </span>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>

                {/* Notes */}
                {app.notes && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Informacje</h3>
                    <ul className="space-y-2">
                      {app.notes.map((note, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

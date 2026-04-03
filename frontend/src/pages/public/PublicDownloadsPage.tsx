import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Download, Monitor, Server, Smartphone, ScreenShare, CheckCircle,
  ExternalLink, ArrowLeft, KeyRound, Mail, Loader2, GitCompareArrows, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { downloadsApi } from '../../api/downloads';

function useAgentVersion() {
  return useQuery({
    queryKey: ['agent-version'],
    queryFn: async () => { const r = await fetch('/downloads/version.json', { cache: 'no-store' }); const d = await r.json(); return d.version as string; },
    staleTime: 60_000,
  });
}

interface AppCard {
  icon: React.ReactNode; name: string; description: string; color: string;
  files: { label: string; url: string; badge?: string; size?: string; primary?: boolean }[];
  notes?: string[];
}

const COLORS: Record<string, { accent: string; bg: string }> = {
  emerald: { accent: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  violet: { accent: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
  cyan:   { accent: '#22D3EE', bg: 'rgba(34,211,238,0.06)' },
  orange: { accent: '#FB923C', bg: 'rgba(251,146,60,0.06)' },
};

function AppCardView({ app }: { app: AppCard }) {
  const c = COLORS[app.color] ?? COLORS.violet;
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
          <div style={{ color: c.accent }}>{app.icon}</div>
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-white/85">{app.name}</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{app.description}</p>
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2.5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.25)' }}>Pobierz</h3>
          {app.files.map(f => {
            const isExternal = f.url.startsWith('http');
            const isComingSoon = f.badge === 'Wkrótce';
            return (
              <a key={f.label} href={isComingSoon ? undefined : f.url}
                download={!isExternal && !isComingSoon ? true : undefined}
                target={isExternal ? '_blank' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isComingSoon ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
                style={f.primary
                  ? { background: `linear-gradient(145deg, ${c.accent}, ${c.accent}99)`, color: '#fff', boxShadow: `0 2px 10px ${c.accent}25` }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
                {isExternal ? <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-60" /> : <Download className="h-4 w-4 flex-shrink-0 opacity-60" />}
                <span className="text-[13px] font-medium flex-1">{f.label}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {f.size && <span className="text-[11px] opacity-60">{f.size}</span>}
                  {f.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: f.primary ? 'rgba(255,255,255,0.15)' : `${c.accent}18`, color: f.primary ? '#fff' : c.accent }}>{f.badge}</span>}
                </div>
              </a>
            );
          })}
        </div>
        {app.notes && (
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.25)' }}>Informacje</h3>
            <ul className="space-y-2">
              {app.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }} />
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
  { feature: 'Tryb pracy',              client: 'Aplikacja w zasobniku (tray)', server: 'Aplikacja + usługa Windows' },
  { feature: 'Wymaga logowania',         client: true,                          server: false },
  { feature: 'Auto-start z Windows',     client: true,                          server: true },
  { feature: 'Zgłoszenia serwisowe',     client: true,                          server: true },
  { feature: 'Formularz ze screenshotami', client: false,                       server: true },
  { feature: 'Wake-on-LAN',             client: true,                          server: true },
  { feature: 'RustDesk (zdalny pulpit)', client: true,                          server: true },
  { feature: 'Security Audit (0-100)',   client: true,                          server: true },
  { feature: 'Skanowanie sieci',         client: true,                          server: true },
  { feature: 'Monitoring S.M.A.R.T.',    client: false,                         server: true },
  { feature: 'Monitoring RAID',          client: false,                         server: true },
  { feature: 'Event Log Windows',        client: false,                         server: true },
  { feature: 'Certyfikaty SSL',          client: false,                         server: true },
  { feature: 'Hyper-V monitoring',       client: false,                         server: true },
  { feature: 'Backup (konfigurowalny)',  client: true,                          server: true },
  { feature: 'Auto-diagnostyka',         client: true,                          server: true },
  { feature: 'Przeznaczenie',           client: 'Użytkownicy domowi',          server: 'Firmy i serwery' },
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
            <GitCompareArrows className="h-5 w-5" style={{ color: '#8B5CF6' }} />
            <h3 className="text-[16px] font-semibold text-white/90">Asystent Home vs Asystent Business</h3>
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
                <th className="text-center py-3 px-3 font-semibold" style={{ color: '#10B981' }}>
                  <div className="flex items-center justify-center gap-1.5"><Monitor className="h-3.5 w-3.5" /> Home</div>
                </th>
                <th className="text-center py-3 pl-3 font-semibold" style={{ color: '#8B5CF6' }}>
                  <div className="flex items-center justify-center gap-1.5"><Server className="h-3.5 w-3.5" /> Business</div>
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

export function PublicDownloadsPage() {
  const SESSION_KEY = 'downloadPinVerified';
  const [verified, setVerified] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true');
  const [pinInput, setPinInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const { data: agentVersion } = useAgentVersion();
  const versionBadge = agentVersion ? `v${agentVersion}` : 'Najnowszy';

  const handleVerify = async () => {
    if (!pinInput.trim()) return;
    setVerifying(true);
    try { const { data } = await downloadsApi.verifyPin(pinInput.trim()); if (data.valid) { sessionStorage.setItem(SESSION_KEY, 'true'); setVerified(true); } else toast.error('Nieprawidłowy lub wygasły PIN'); }
    catch { toast.error('Błąd weryfikacji PIN'); }
    finally { setVerifying(false); }
  };

  const handleRequestPin = async () => {
    if (!emailInput.trim() || !emailInput.includes('@')) { toast.error('Podaj poprawny adres e-mail'); return; }
    setRequesting(true);
    try { await downloadsApi.requestPin(emailInput.trim()); setEmailSent(true); }
    catch (err: unknown) { const msg = err && typeof err === 'object' && 'response' in err ? (err as any).response?.data?.error : null; toast.error(msg ?? 'Nie udało się wysłać PIN.'); }
    finally { setRequesting(false); }
  };

  const APPS: AppCard[] = [
    { icon: <Monitor className="h-6 w-6" />, name: 'Asystent Home', description: 'Dla użytkowników domowych. Monitoring, czyszczenie systemu, audyt bezpieczeństwa, pomoc zdalna. Bezpłatny.', color: 'emerald',
      files: [
        { label: 'Asystent Home — Windows', url: '/downloads/Asystent%20Home.exe', badge: 'v6.0.0', primary: true, size: '~40 MB' },
      ],
      notes: ['Wymaga Windows 10 lub nowszego', 'Monitoring, audyt, czyszczenie, pomoc zdalna', 'Bezpłatny dla użytkowników domowych'],
    },
    { icon: <Server className="h-6 w-6" />, name: 'Asystent Business', description: 'Dla firm. Monitoring sprzętu, S.M.A.R.T., RAID, Event Log, zgłoszenia serwisowe, pomoc zdalna.', color: 'violet',
      files: [
        { label: 'Asystent Business — Windows', url: '/downloads/Asystent%20Business.exe', badge: 'v1.0.0', primary: true, size: '~40 MB' },
      ],
      notes: ['Wymaga Windows 10 lub nowszego', 'S.M.A.R.T., RAID, Event Log, certyfikaty SSL', 'Formularz zgłoszeń ze screenshotami', 'Działa też jako usługa Windows (serwery)'],
    },
    { icon: <Smartphone className="h-6 w-6" />, name: 'InfraDesk TV — Android', description: 'Dashboard dla Android TV. Statystyki i zgłoszenia na dużym ekranie.', color: 'cyan',
      files: [{ label: 'APK — Android TV', url: '/downloads/InfraDesk-TV.apk', badge: 'v1.0.0', primary: true, size: '~5 MB' }],
      notes: ['Wymaga Android TV 5.0+', 'Instalacja: adb install InfraDesk-TV.apk', 'Auto-odświeżanie co 30 sekund'],
    },
    { icon: <ScreenShare className="h-6 w-6" />, name: 'RustDesk', description: 'Zdalny pulpit. Szyfrowane połączenie end-to-end.', color: 'orange',
      files: [
        { label: 'RustDesk InfraDesk — Windows (64-bit)', url: '/downloads/silers.msi', badge: 'v1.3.7', primary: true, size: '~29 MB' },
        { label: 'RustDesk — Android (Universal)', url: '/downloads/rustdesk.apk', size: '~68 MB' },
      ],
      notes: ['Podaj ID i hasło technikowi', 'Szyfrowanie end-to-end', 'Wersja Windows — konfiguracja InfraDesk'],
    },
  ];

  // ── PIN verification ─────────────────────────────────────────────────────
  if (!verified) {
    return (
      <div className="min-h-screen flex" style={{ background: '#040a16' }}>
        {/* Left */}
        <div className="hidden lg:flex lg:w-[48%] flex-col items-center justify-center p-12 relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #040a16 0%, #0F1B34 40%, #131E3A 70%, #0E1628 100%)' }}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[10%] left-[15%] w-[50%] h-[40%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.07), transparent 70%)' }} />
          </div>
          <div className="relative z-10 text-center max-w-md">
            <img src="/logo.png" alt="" className="h-20 mx-auto mb-6 opacity-90" />
            <h1 className="text-[32px] font-semibold text-white/90 mb-3">InfraDesk</h1>
            <p className="text-[13px] font-medium uppercase tracking-[0.15em] mb-10" style={{ color: 'rgba(139,92,246,0.6)' }}>Pliki do pobrania</p>
            <p className="text-[14px] leading-relaxed max-w-[320px] mx-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Pobierz Asystent Home, Asystent Business, Android TV i narzędzia do zdalnej pomocy.
            </p>
          </div>
          <p className="absolute bottom-6 text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>by SILERS · infradesk.pl</p>
        </div>

        {/* Right — PIN */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative" style={{ background: 'linear-gradient(160deg, #060B1A, #040a16)' }}>
          <div className="lg:hidden text-center mb-10">
            <img src="/logo.png" alt="" className="h-14 mx-auto mb-3" />
            <h1 className="text-[20px] font-semibold text-white/85">InfraDesk</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] mt-1" style={{ color: 'rgba(139,92,246,0.5)' }}>Pliki do pobrania</p>
          </div>
          <div className="w-full max-w-[420px]">
            <div className="rounded-[22px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)' }}>
              <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, transparent)' }} />
              <div className="p-8">
                <h2 className="text-[22px] font-semibold text-white/90 mb-1">Weryfikacja PIN</h2>
                <p className="text-[13px] mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>Wpisz PIN otrzymany od administratora</p>
                <div className="space-y-5">
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                    <input type="text" placeholder="Wpisz PIN" value={pinInput} onChange={e => setPinInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleVerify()}
                      className="w-full text-center text-2xl font-bold tracking-widest pl-12 pr-4 py-3.5 rounded-xl focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)' }} maxLength={50} />
                  </div>
                  <button onClick={handleVerify} disabled={verifying || !pinInput.trim()}
                    className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.15)' }}>
                    {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                    {verifying ? 'Sprawdzam...' : 'Sprawdź PIN'}
                  </button>
                  <div className="flex items-center gap-3"><div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} /><span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>lub</span><div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} /></div>
                  {emailSent ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
                      <CheckCircle className="h-4 w-4" style={{ color: '#22D3EE' }} />
                      <span className="text-[13px]" style={{ color: '#22D3EE' }}>Sprawdź e-mail — wysłaliśmy PIN</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                        <input type="email" placeholder="jan@firma.pl" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRequestPin()}
                          className="w-full pl-12 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
                      </div>
                      <button onClick={handleRequestPin} disabled={requesting}
                        className="w-full py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                        {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Wyślij PIN na e-mail
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-8 text-center">
                  <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-violet-400" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Powrót do logowania
                  </Link>
                </div>
                <p className="text-center text-[10px] mt-6" style={{ color: 'rgba(255,255,255,0.15)' }}>InfraDesk © {new Date().getFullYear()} · by SILERS</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Downloads view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#040a16' }}>
      <header className="sticky top-0 z-30" style={{ background: 'rgba(10,15,30,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-7" />
            <div>
              <span className="text-[14px] font-semibold text-white/70">InfraDesk</span>
              <span className="text-[11px] ml-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Pobieranie</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <CheckCircle className="h-3 w-3" style={{ color: '#22C55E' }} />
              <span className="text-[10px] font-medium" style={{ color: '#22C55E' }}>PIN OK</span>
            </div>
            <Link to="/login" className="text-[12px] flex items-center gap-1 transition-colors hover:text-violet-400" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Logowanie
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-[20px] font-semibold text-white/85">Aplikacje i narzędzia</h2>
          <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Pobierz oprogramowanie InfraDesk</p>
        </div>
        <div className="space-y-5">
          {APPS.map((app, i) => (
            <div key={app.name}>
              <AppCardView app={app} />
              {/* Compare button after first agent (between the two agent cards) */}
              {i === 0 && (
                <div className="flex justify-center -mb-2 mt-3">
                  <button onClick={() => setCompareOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.8)' }}>
                    <GitCompareArrows className="h-4 w-4" />
                    Porównaj Agent Client vs Server
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} />
      </main>
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
          InfraDesk © {new Date().getFullYear()} · by SILERS
        </div>
      </footer>
    </div>
  );
}

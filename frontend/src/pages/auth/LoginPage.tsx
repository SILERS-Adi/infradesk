import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Download, Smartphone, Monitor, Server, ArrowRight, Mail, Lock,
  ScreenShare, KeyRound, CheckCircle, Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../../api/auth';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { workspacesApi } from '../../api/workspaces';
import { subscribeToPush } from '../../utils/pushNotifications';
import { downloadsApi } from '../../api/downloads';
import { useTheme } from '../../store/themeStore';

function useIsMobile() {
  return useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
  }, []);
}

function useAgentVersion() {
  return useQuery({
    queryKey: ['agent-version-login'],
    queryFn: async () => {
      try { const r = await fetch('/downloads/version.json', { cache: 'no-store' }); const d = await r.json(); return d.version as string; }
      catch { return null; }
    },
    staleTime: 120_000,
  });
}

const schema = z.object({
  email: z.string().email('Podaj poprawny email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
});
type FormData = z.infer<typeof schema>;

/* ── Download items ──────────────────────────────────────────────────────── */
const DOWNLOADS = [
  {
    icon: <Monitor className="h-5 w-5" />,
    name: 'Asystent Home',
    desc: 'Windows',
    url: '/downloads/Asystent%20Home.exe',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.15)',
    showVersion: true,
  },
  {
    icon: <Server className="h-5 w-5" />,
    name: 'Asystent Business',
    desc: 'Windows',
    url: '/downloads/Asystent%20Business.exe',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.12)',
    showVersion: true,
  },
  {
    icon: <ScreenShare className="h-5 w-5" />,
    name: 'RustDesk',
    desc: 'Zdalny pulpit',
    url: '/downloads/silers.msi',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.08)',
    border: 'rgba(251,146,60,0.12)',
  },
];

/* ── PIN-gated Downloads Section ─────────────────────────────────────────── */
function DownloadsWithPin({ agentVersion, compact }: { agentVersion?: string | null; compact?: boolean }) {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const PIN_KEY = 'downloadPinVerified';
  const [verified, setVerified] = useState(() => sessionStorage.getItem(PIN_KEY) === 'true');
  const [pinInput, setPinInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleVerify = async () => {
    if (!pinInput.trim()) return;
    setVerifying(true);
    try {
      const { data } = await downloadsApi.verifyPin(pinInput.trim());
      if (data.valid) { sessionStorage.setItem(PIN_KEY, 'true'); setVerified(true); }
      else toast.error('Nieprawidłowy lub wygasły PIN');
    } catch { toast.error('Błąd weryfikacji PIN'); }
    finally { setVerifying(false); }
  };

  const handleRequestPin = async () => {
    if (!emailInput.trim() || !emailInput.includes('@')) { toast.error('Podaj poprawny adres e-mail'); return; }
    setRequesting(true);
    try { await downloadsApi.requestPin(emailInput.trim()); setEmailSent(true); }
    catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err ? (err as any).response?.data?.error : null;
      toast.error(msg ?? 'Nie udało się wysłać PIN.');
    } finally { setRequesting(false); }
  };

  /* Verified — show download links */
  if (verified) {
    return (
      <div className={compact ? '' : 'mt-6'}>
        <div className="flex items-center gap-2 mb-3">
          <Download className="h-4 w-4" style={{ color: 'rgba(139,92,246,0.5)' }} />
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--tm)' }}>
            Pliki do pobrania
          </h3>
          <div className="flex items-center gap-1 ml-auto px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <CheckCircle className="h-3 w-3" style={{ color: '#22C55E' }} />
            <span className="text-[9px] font-medium" style={{ color: '#22C55E' }}>PIN OK</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {DOWNLOADS.map(dl => (
            <a key={dl.name} href={dl.url} download
              className="group flex items-center gap-3 px-3.5 py-3 rounded-[12px] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: dl.bg, border: `1px solid ${dl.border}` }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${dl.color}15`, color: dl.color }}>
                {dl.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--t)', opacity: 0.8 }}>{dl.name}</span>
                  {dl.showVersion && agentVersion && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${dl.color}20`, color: dl.color }}>
                      v{agentVersion}
                    </span>
                  )}
                </div>
                <span className="text-[11px]" style={{ color: 'var(--tm)' }}>{dl.desc}</span>
              </div>
              <Download className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: dl.color }} />
            </a>
          ))}
        </div>
      </div>
    );
  }

  /* Not verified — show PIN form */
  return (
    <div className={compact ? '' : 'mt-6'}>
      <div className="flex items-center gap-2 mb-3">
        <Download className="h-4 w-4" style={{ color: 'rgba(139,92,246,0.5)' }} />
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--tm)' }}>
          Pliki do pobrania
        </h3>
      </div>
      <p className="text-[12px] mb-3" style={{ color: 'var(--tm)' }}>
        Wpisz PIN od administratora lub wyślij na e-mail
      </p>
      <div className="space-y-2.5">
        {/* PIN input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
            <input type="text" placeholder="Wpisz PIN" value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-[13px] text-center font-bold tracking-widest outline-none"
              style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--t)' }}
              maxLength={50} />
          </div>
          <button onClick={handleVerify} disabled={verifying || !pinInput.trim()}
            className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            OK
          </button>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--td)' }}>lub</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Email request */}
        {emailSent ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
            <CheckCircle className="h-3.5 w-3.5" style={{ color: '#22D3EE' }} />
            <span className="text-[12px]" style={{ color: '#22D3EE' }}>Sprawdź e-mail — PIN wysłany (ważny 24h)</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
              <input type="email" placeholder="jan@firma.pl" value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRequestPin()}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--t)' }} />
            </div>
            <button onClick={handleRequestPin} disabled={requesting}
              className="px-4 py-2.5 rounded-xl text-[12px] font-medium flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
              style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--ts)' }}>
              {requesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Wyślij
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function getReturnTo(): string | null {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('returnTo');
  if (!returnTo) return null;
  // Security: only allow infradesk.pl subdomains
  try {
    const url = new URL(returnTo.startsWith('http') ? returnTo : `https://${returnTo}`);
    if (url.hostname.endsWith('infradesk.pl') || url.hostname === 'infradesk.pl') return url.href;
  } catch {}
  return null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuth();
  const { setWorkspaces, markResolved } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [focused, setFocused] = useState('');
  const isMobile = useIsMobile();
  const { data: agentVersion } = useAgentVersion();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await authApi.login(data.email, data.password) as any;
      setTokens(response.accessToken, response.refreshToken);
      setUser(response.user);
      subscribeToPush().catch(() => {});
      // Fetch and set workspace BEFORE navigating (prevents data leaks)
      let myWorkspaces: any[] = [];
      try {
        const ws = await workspacesApi.getMyWorkspaces();
        if (ws && ws.length > 0) { setWorkspaces(ws); myWorkspaces = ws; }
        else { markResolved(); }
      } catch { markResolved(); }

      // Determine redirect destination
      const returnTo = getReturnTo();
      if (returnTo) {
        window.location.href = returnTo;
        return;
      }

      // Determine correct route — workspace orgType decides main panel, role decides permissions inside it
      const currentWs = myWorkspaces.find((w: any) => w.isDefault) || myWorkspaces[0];
      const userRole = currentWs?.role;
      const orgType = currentWs?.orgType;
      const isSuperAdmin = response.user?.isSuperAdmin;
      const isMspWorkspace = ['MSP', 'IT_OPERATOR', 'INTERNAL_IT'].includes(orgType);
      const isOperationalRole = ['OWNER', 'ADMIN', 'TECHNICIAN'].includes(userRole);
      // Superadmin always sees dashboard. Otherwise: MSP workspace + operational role → /dashboard, else /panel.
      const defaultRoute = isSuperAdmin || (isMspWorkspace && isOperationalRole) ? '/dashboard' : '/panel';
      const isPortalUser = defaultRoute === '/panel';

      if (isMobile && !isPortalUser) setShowVersionPicker(true);
      else navigate(defaultRoute);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message : null;
      toast.error(msg ?? 'Nieprawidłowy email lub hasło');
    } finally { setLoading(false); }
  };

  /* ── Version picker (mobile) ───────────────────────────────────────────── */
  if (showVersionPicker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'url(/tlo.png)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15 }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,25,0.3), rgba(8,13,25,0.9))' }} />
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" className="w-80 max-w-[85%] mb-6 drop-shadow-xl" />
          <p className="text-[13px] mb-10" style={{ color: 'var(--tm)' }}>Wybierz wersję interfejsu</p>
          <div className="w-full space-y-3">
            <button onClick={() => navigate('/m')}
              className="w-full flex items-center gap-4 p-5 rounded-[18px] active:scale-[0.98] transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div className="text-left"><p className="text-[15px] font-semibold text-gray-900">Wersja mobilna</p><p className="text-[12px] text-gray-500">Dotykowy interfejs</p></div>

            </button>
            <button onClick={() => navigate('/dashboard')}
              className="w-full flex items-center gap-4 p-5 rounded-[18px] active:scale-[0.98] transition-all duration-200"
              style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}>
                <Monitor className="h-6 w-6" style={{ color: 'var(--ts)' }} />
              </div>
              <div className="text-left"><p className="text-[15px] font-semibold" style={{ color: 'var(--t)', opacity: 0.85 }}>Wersja desktopowa</p><p className="text-[12px]" style={{ color: 'var(--tm)' }}>Pełny panel</p></div>
            </button>
          </div>
          <p className="text-[11px] mt-10" style={{ color: 'var(--td)' }}>Możesz zmienić w dowolnym momencie</p>
        </div>
      </div>
    );
  }

  /* ── Input style helper ────────────────────────────────────────────────── */
  const inputCls = (name: string, hasError?: string) => {
    const isFocused = focused === name;
    return {
      className: 'w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none transition-all duration-200 placeholder:opacity-30',
      style: {
        background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : isFocused ? 'rgba(139,92,246,0.35)' : 'var(--border)'}`,
        color: 'var(--t)',
        boxShadow: isFocused ? '0 0 0 3px rgba(139,92,246,0.08)' : 'none',
      } as React.CSSProperties,
    };
  };

  /* ── Main login ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

      {/* ── LEFT — branding ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: isLight ? 'linear-gradient(160deg, #e8ecf4 0%, #d8dff0 40%, #e0e5f0 70%, #dce3ee 100%)' : 'linear-gradient(160deg, #040a16 0%, #0F1B34 40%, #131E3A 70%, #0E1628 100%)' }}>

        {/* Ambient lights */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[50%] h-[40%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.07), transparent 70%)' }} />
          <div className="absolute top-[20%] right-[10%] w-[40%] h-[35%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.05), transparent 70%)' }} />
          <div className="absolute bottom-[15%] left-[20%] w-[30%] h-[25%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.04), transparent 70%)' }} />
        </div>

        <div className="relative z-10 text-center max-w-md flex flex-col items-center justify-center">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ width: 480, maxWidth: '90%', marginBottom: 40, filter: 'drop-shadow(0 0 50px rgba(139,92,246,0.2))' }} />
          <p className="text-[13px] font-medium uppercase tracking-[0.2em] mb-10"
            style={{ color: 'rgba(139,92,246,0.5)' }}>
            Zarządzanie infrastrukturą IT
          </p>
          <p className="text-[14px] leading-relaxed max-w-[340px] mx-auto" style={{ color: 'var(--tm)' }}>
            Zgłoszenia, inwentaryzacja, monitoring i helpdesk w jednym miejscu.
          </p>
        </div>

        <p className="absolute bottom-6 text-[11px] tracking-[0.05em]" style={{ color: 'var(--td)' }}>
          by SILERS · infradesk.pl
        </p>
      </div>

      {/* ── RIGHT — login + downloads ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">

        {/* BG */}
        <div className="absolute inset-0" style={{ background: isLight ? 'var(--bg)' : 'linear-gradient(160deg, #060B1A 0%, #040a16 50%, #0D1525 100%)' }} />
        <div className="absolute top-[15%] right-[10%] w-[45%] h-[35%] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.03), transparent 70%)' }} />

        {/* Mobile logo */}
        <div className="lg:hidden text-center mb-8 relative z-10">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" className="w-80 max-w-[85%] mx-auto mb-3 drop-shadow-xl" />
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] mt-1" style={{ color: 'rgba(139,92,246,0.5)' }}>
            Zarządzanie infrastrukturą IT
          </p>
        </div>

        {/* Content wrapper — scrollable on small screens */}
        <div className="w-full max-w-[460px] relative z-10 space-y-4 overflow-y-auto max-h-[calc(100vh-80px)] lg:max-h-none scrollbar-none">

          {/* ── Mobile: Downloads FIRST ─────────────────────────────── */}
          <div className="lg:hidden rounded-[18px] p-5" style={{
            background: isLight ? 'var(--bg-card)' : 'rgba(255,255,255,0.025)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(12px)',
          }}>
            <DownloadsWithPin agentVersion={agentVersion} compact />
          </div>

          {/* ── Login + Downloads card ──────────────────────────────── */}
          <div className="rounded-[22px] overflow-hidden" style={{
            background: isLight ? 'var(--bg-card)' : 'rgba(255,255,255,0.025)',
            border: '1px solid var(--border)',
            boxShadow: isLight ? '0 8px 32px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' : '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)',
            backdropFilter: 'blur(16px)',
          }}>
            {/* Accent line */}
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, rgba(37,99,235,0))' }} />

            <div className="p-6 sm:p-8">
              {/* ── Login form ─────────────────────────────────────── */}
              <h2 className="text-[22px] font-semibold tracking-[-0.01em] mb-1" style={{ color: 'var(--t)' }}>Zaloguj się</h2>
              <p className="text-[13px] mb-6" style={{ color: 'var(--ts)' }}>Wprowadź dane dostępowe do systemu</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--ts)' }}>
                    Adres e-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
                    <input type="email" placeholder="jan@firma.pl"
                      {...register('email')}
                      onFocus={() => setFocused('email')}
                      onBlur={() => setFocused('')}
                      {...inputCls('email', errors.email?.message)}
                    />
                  </div>
                  {errors.email && <p className="text-[11px] text-red-400/70 mt-1.5">{errors.email.message}</p>}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--ts)' }}>
                    Hasło
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
                    <input type="password" placeholder="••••••••"
                      {...register('password')}
                      onFocus={() => setFocused('password')}
                      onBlur={() => setFocused('')}
                      {...inputCls('password', errors.password?.message)}
                    />
                  </div>
                  {errors.password && <p className="text-[11px] text-red-400/70 mt-1.5">{errors.password.message}</p>}
                </div>

                {/* Forgot password */}
                <div className="text-right -mt-1">
                  <Link to="/forgot-password" className="text-[12px] font-medium transition-colors hover:text-violet-400"
                    style={{ color: 'var(--ts)' }}>
                    Nie pamiętam hasła
                  </Link>
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-[14px] rounded-[14px] text-[14px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)',
                    boxShadow: '0 2px 12px rgba(79,140,255,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}>
                  {loading ? (
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Zaloguj się <ArrowRight className="h-4 w-4 opacity-60" /></>
                  )}
                </button>
              </form>

              {/* ── Separator ──────────────────────────────────────── */}
              <div className="hidden lg:flex items-center gap-3 my-6">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--td)' }}>Pliki do pobrania</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              {/* ── Desktop: Downloads with PIN ─────────────────────── */}
              <div className="hidden lg:block">
                <DownloadsWithPin agentVersion={agentVersion} />
              </div>

              {/* Register tenant link */}
              <div className="text-center mt-4">
                <Link to="/register" className="text-[12px] font-medium text-violet-400/60 hover:text-violet-400 transition-colors">
                  Masz firmę IT? Utwórz własny panel →
                </Link>
              </div>

              {/* Footer */}
              <p className="text-center text-[10px] mt-6" style={{ color: 'var(--td)' }}>
                InfraDesk © {new Date().getFullYear()} · by SILERS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

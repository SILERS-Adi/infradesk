import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Download, Smartphone, Monitor, Server, ArrowRight, Mail, Lock,
  ScreenShare, FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../../api/auth';
import { useAuth } from '../../store/authStore';
import { subscribeToPush } from '../../utils/pushNotifications';

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
    name: 'InfraDesk Agent',
    desc: 'Windows',
    url: '/downloads/InfraDesk%20Agent.exe',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.15)',
    showVersion: true,
  },
  {
    icon: <Server className="h-5 w-5" />,
    name: 'Server Agent',
    desc: 'Windows Server',
    url: '/downloads/InfraDesk%20Server%20Agent.exe',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.12)',
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

/* ══════════════════════════════════════════════════════════════════════════ */

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [focused, setFocused] = useState('');
  const isMobile = useIsMobile();
  const { data: agentVersion } = useAgentVersion();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await authApi.login(data.email, data.password);
      setTokens(response.accessToken, response.refreshToken);
      setUser(response.user);
      subscribeToPush().catch(() => {});
      if (response.user.role === 'CLIENT') navigate('/portal');
      else if (isMobile) setShowVersionPicker(true);
      else navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message : null;
      toast.error(msg ?? 'Nieprawidłowy email lub hasło');
    } finally { setLoading(false); }
  };

  /* ── Version picker (mobile) ───────────────────────────────────────────── */
  if (showVersionPicker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: '#080D19' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'url(/tlo.png)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15 }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,25,0.3), rgba(8,13,25,0.9))' }} />
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          <img src="/logo.png" alt="" className="h-16 mb-4" />
          <h1 className="text-xl font-semibold text-white/90 mb-1">Witaj w InfraDesk</h1>
          <p className="text-[13px] text-white/40 mb-10">Wybierz wersję interfejsu</p>
          <div className="w-full space-y-3">
            <button onClick={() => navigate('/m')}
              className="w-full flex items-center gap-4 p-5 rounded-[18px] active:scale-[0.98] transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)' }}>
                <Smartphone className="h-6 w-6 text-white" />
              </div>
              <div className="text-left"><p className="text-[15px] font-semibold text-gray-900">Wersja mobilna</p><p className="text-[12px] text-gray-500">Dotykowy interfejs</p></div>
            </button>
            <button onClick={() => navigate('/dashboard')}
              className="w-full flex items-center gap-4 p-5 rounded-[18px] active:scale-[0.98] transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Monitor className="h-6 w-6 text-white/60" />
              </div>
              <div className="text-left"><p className="text-[15px] font-semibold text-white/85">Wersja desktopowa</p><p className="text-[12px] text-white/40">Pełny panel</p></div>
            </button>
          </div>
          <p className="text-white/25 text-[11px] mt-10">Możesz zmienić w dowolnym momencie</p>
        </div>
      </div>
    );
  }

  /* ── Input style helper ────────────────────────────────────────────────── */
  const inputCls = (name: string, hasError?: string) => {
    const isFocused = focused === name;
    return {
      className: 'w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none transition-all duration-200 placeholder:text-white/20',
      style: {
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : isFocused ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.06)'}`,
        color: 'rgba(255,255,255,0.9)',
        boxShadow: isFocused ? '0 0 0 3px rgba(139,92,246,0.08)' : 'none',
      } as React.CSSProperties,
    };
  };

  /* ── Downloads section (reusable for mobile + desktop) ─────────────────── */
  const DownloadsSection = ({ compact }: { compact?: boolean }) => (
    <div className={compact ? '' : 'mt-6'}>
      <div className="flex items-center gap-2 mb-3">
        <Download className="h-4 w-4" style={{ color: 'rgba(139,92,246,0.5)' }} />
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Pliki do pobrania
        </h3>
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
                <span className="text-[13px] font-semibold text-white/80">{dl.name}</span>
                {dl.showVersion && agentVersion && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${dl.color}20`, color: dl.color }}>
                    v{agentVersion}
                  </span>
                )}
              </div>
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{dl.desc}</span>
            </div>
            <Download className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: dl.color }} />
          </a>
        ))}
      </div>
    </div>
  );

  /* ── Main login ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex" style={{ background: '#080D19' }}>

      {/* ── LEFT — branding ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0A0F1E 0%, #0F1B34 40%, #131E3A 70%, #0E1628 100%)' }}>

        {/* Ambient lights */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[10%] left-[15%] w-[50%] h-[40%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.07), transparent 70%)' }} />
          <div className="absolute top-[20%] right-[10%] w-[40%] h-[35%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.05), transparent 70%)' }} />
          <div className="absolute bottom-[15%] left-[20%] w-[30%] h-[25%] rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.04), transparent 70%)' }} />
        </div>

        <div className="relative z-10 text-center max-w-md">
          <img src="/logo.png" alt="" className="h-20 mx-auto mb-6 opacity-90" />
          <h1 className="text-[32px] font-semibold text-white/90 tracking-[-0.02em] mb-3">InfraDesk</h1>
          <p className="text-[13px] font-medium uppercase tracking-[0.15em] mb-10"
            style={{ color: 'rgba(139,92,246,0.6)' }}>
            Zarządzanie infrastrukturą IT
          </p>
          <p className="text-[14px] leading-relaxed max-w-[340px] mx-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Zarządzanie infrastrukturą IT, zgłoszeniami i urządzeniami w jednym miejscu.
          </p>
        </div>

        <p className="absolute bottom-6 text-[11px] tracking-[0.05em]" style={{ color: 'rgba(255,255,255,0.15)' }}>
          by SILERS · infradesk.pl
        </p>
      </div>

      {/* ── RIGHT — login + downloads ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">

        {/* BG */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0C1220 0%, #0A0F1E 50%, #0D1525 100%)' }} />
        <div className="absolute top-[15%] right-[10%] w-[45%] h-[35%] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.03), transparent 70%)' }} />

        {/* Mobile logo */}
        <div className="lg:hidden text-center mb-8 relative z-10">
          <img src="/logo.png" alt="" className="h-14 mx-auto mb-3" />
          <h1 className="text-[20px] font-semibold text-white/85">InfraDesk</h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] mt-1" style={{ color: 'rgba(139,92,246,0.5)' }}>
            Zarządzanie infrastrukturą IT
          </p>
        </div>

        {/* Content wrapper — scrollable on small screens */}
        <div className="w-full max-w-[460px] relative z-10 space-y-4 overflow-y-auto max-h-[calc(100vh-80px)] lg:max-h-none scrollbar-none">

          {/* ── Mobile: Downloads FIRST ─────────────────────────────── */}
          <div className="lg:hidden rounded-[18px] p-5" style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
          }}>
            <DownloadsSection compact />
          </div>

          {/* ── Login + Downloads card ──────────────────────────────── */}
          <div className="rounded-[22px] overflow-hidden" style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)',
            backdropFilter: 'blur(16px)',
          }}>
            {/* Accent line */}
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, rgba(37,99,235,0))' }} />

            <div className="p-6 sm:p-8">
              {/* ── Login form ─────────────────────────────────────── */}
              <h2 className="text-[22px] font-semibold text-white/90 tracking-[-0.01em] mb-1">Zaloguj się</h2>
              <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>Wprowadź dane dostępowe do systemu</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Adres e-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
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
                  <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Hasło
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                    <input type="password" placeholder="••••••••"
                      {...register('password')}
                      onFocus={() => setFocused('password')}
                      onBlur={() => setFocused('')}
                      {...inputCls('password', errors.password?.message)}
                    />
                  </div>
                  {errors.password && <p className="text-[11px] text-red-400/70 mt-1.5">{errors.password.message}</p>}
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-[14px] rounded-[14px] text-[14px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(145deg, #6D28D9, #2563EB)',
                    boxShadow: '0 2px 12px rgba(109,40,217,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
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
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>Pliki do pobrania</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* ── Desktop: Downloads inside card ─────────────────── */}
              <div className="hidden lg:block">
                <div className="grid grid-cols-3 gap-2">
                  {DOWNLOADS.map(dl => (
                    <a key={dl.name} href={dl.url} download
                      className="group flex flex-col items-center gap-2 p-3.5 rounded-[14px] text-center transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]"
                      style={{ background: dl.bg, border: `1px solid ${dl.border}` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${dl.color}18`, color: dl.color }}>
                        {dl.icon}
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-white/80 leading-tight">{dl.name}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {dl.desc}
                          {dl.showVersion && agentVersion ? ` · v${agentVersion}` : ''}
                        </p>
                      </div>
                      <Download className="h-3.5 w-3.5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: dl.color }} />
                    </a>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <p className="text-center text-[10px] mt-6" style={{ color: 'rgba(255,255,255,0.15)' }}>
                InfraDesk © {new Date().getFullYear()} · by SILERS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

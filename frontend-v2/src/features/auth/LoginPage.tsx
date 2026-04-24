import { useState, useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const schema = z.object({
  email: z.string().email('Nieprawidłowy email'),
  password: z.string().min(1, 'Podaj hasło'),
  twoFactorCode: z.string().optional(),
});
type LoginForm = z.infer<typeof schema>;

interface WorkspaceHint {
  workspace: null | {
    slug: string;
    name: string;
    type: 'MSP' | 'CLIENT' | 'INTERNAL_IT';
    branding: { logoUrl: string | null; primaryColor: string | null };
  };
  subdomain: string | null;
}

export function LoginPage() {
  const { user, setSession } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextUrl = searchParams.get("next");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [hint, setHint] = useState<WorkspaceHint['workspace']>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    api.get<WorkspaceHint>('/public/workspace').then((r) => setHint(r.data.workspace)).catch(() => {});
  }, []);

  if (user) { if (nextUrl && nextUrl.startsWith("/")) { window.location.href = nextUrl; return null; } return <Navigate to="/" replace />; }

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post('/auth/login', data);
      setSession(res.data.user, res.data.accessToken, res.data.defaultWorkspaceId);
      toast.success('Zalogowano');
      if (nextUrl && nextUrl.startsWith("/")) { window.location.href = nextUrl; } else { navigate("/"); };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const code = axiosErr.response?.data?.error;
      const message = axiosErr.response?.data?.message ?? 'Błąd logowania';
      if (code === 'two_factor_required') {
        setTwoFactorRequired(true);
        toast('Podaj kod 2FA');
        return;
      }
      toast.error(message);
    }
  };

  const inpCls = 'w-full px-4 py-3 rounded-[var(--r)] text-[14px] text-tx placeholder:text-tx3 bg-sf2 border border-bd focus:outline-none transition-all';
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--bd-f)';
    e.target.style.boxShadow = '0 0 0 4px var(--pri-glow)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--bd)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="absolute rounded-full"
        style={{ width: 600, height: 600, filter: 'blur(120px)', opacity: 0.25, background: 'var(--pri)', top: '-15%', left: '-8%' }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 400, height: 400, filter: 'blur(100px)', opacity: 0.15, background: '#a855f7', bottom: '-15%', right: '-5%' }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 300, height: 300, filter: 'blur(80px)', opacity: 0.1, background: '#06b6d4', top: '40%', right: '20%' }}
      />

      <div className="absolute top-6 right-6 z-20"><ThemeToggle /></div>

      <div className="w-full max-w-[400px] relative z-10 anim-scale">
        <div className="glass rounded-[var(--r-xl)] p-8" style={{ boxShadow: 'var(--sh4)' }}>
          <div className="flex flex-col items-center mb-8">
            <img
              src={hint?.branding.logoUrl || '/logo.png'}
              alt={hint?.name || 'InfraDesk'}
              className="h-14 w-auto mb-3"
            />
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-tx3">
              {hint?.name ? `Logowanie · ${hint.name}` : 'v2 · IT helpdesk dla MSP'}
            </p>
          </div>

          <h2 className="text-[22px] font-bold text-tx mb-1">Zaloguj się</h2>
          <p className="text-[12px] text-tx3 mb-6">
            {hint ? 'Do panelu firmy' : 'Do swojej firmy'}
          </p>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="anim-up" style={{ animationDelay: '80ms' }}>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" placeholder="twoj@email.pl" className={inpCls} {...register('email')} onFocus={onFocus} onBlurCapture={onBlur} />
              {errors.email && <p className="text-[11px] text-er mt-1">{errors.email.message}</p>}
            </div>
            <div className="anim-up" style={{ animationDelay: '160ms' }}>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="password">Hasło</label>
              <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" className={inpCls} {...register('password')} onFocus={onFocus} onBlurCapture={onBlur} />
              {errors.password && <p className="text-[11px] text-er mt-1">{errors.password.message}</p>}
            </div>

            {twoFactorRequired && (
              <div className="anim-up">
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="twoFactorCode">Kod 2FA</label>
                <input id="twoFactorCode" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={inpCls} {...register('twoFactorCode')} onFocus={onFocus} onBlurCapture={onBlur} />
              </div>
            )}

            <div className="anim-up" style={{ animationDelay: '240ms' }}>
              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                {isSubmitting ? <Loader2 className="w-5 h-5" style={{ animation: 'spin .6s linear infinite' }} /> : <>Zaloguj <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </div>
          </form>
        </div>
        <p className="text-center text-[10px] mt-5 font-medium text-tx3 anim-up" style={{ animationDelay: '320ms' }}>
          InfraDesk v2.0.0 · alpha · Powered by Silers
        </p>
      </div>
    </div>
  );
}

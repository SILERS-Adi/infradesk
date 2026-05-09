import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const schema = z.object({
  password: z.string().min(10, 'Min. 10 znaków').max(128),
  confirm:  z.string(),
}).refine((d) => d.password === d.confirm, { message: 'Hasła się nie zgadzają', path: ['confirm'] });
type Form = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  // Strip token from URL after reading — keeps it out of browser history + Referer.
  useEffect(() => {
    if (token && window.history.replaceState) {
      window.history.replaceState({}, '', '/reset-password');
    }
  }, [token]);

  if (!token) return <Navigate to="/forgot-password" replace />;

  async function onSubmit(data: Form) {
    try {
      await api.post('/auth/password-reset/confirm', { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      const code = ax.response?.data?.error;
      if (code === 'reset_invalid') {
        toast.error('Link wygasł lub został już użyty. Wygeneruj nowy.');
      } else if (code === 'weak_password') {
        toast.error(ax.response?.data?.message ?? 'Hasło jest za słabe');
      } else {
        toast.error(ax.response?.data?.message ?? 'Coś poszło nie tak');
      }
    }
  }

  const inpCls = 'w-full px-4 py-3 rounded-[var(--r)] text-[14px] text-tx placeholder:text-tx3 bg-sf2 border border-bd focus:outline-none transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="absolute rounded-full" style={{ width: 600, height: 600, filter: 'blur(120px)', opacity: 0.25, background: 'var(--pri)', top: '-15%', left: '-8%' }} />
      <div className="absolute top-6 right-6 z-20"><ThemeToggle /></div>

      <div className="w-full max-w-[400px] relative z-10 anim-scale">
        <div className="glass rounded-[var(--r-xl)] p-7" style={{ boxShadow: 'var(--sh4)' }}>
          {done ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}>
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Hasło zmienione</h2>
              <p className="text-[13px] text-tx2">Za chwilę przekierujemy Cię do logowania…</p>
            </div>
          ) : (
            <>
              <KeyRound className="h-7 w-7 text-pri mb-3" />
              <h2 className="text-[20px] font-bold text-tx mb-1">Ustaw nowe hasło</h2>
              <p className="text-[12px] text-tx3 mb-5">
                Min. 10 znaków. Po zmianie wszystkie aktywne sesje zostaną wylogowane.
              </p>
              <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                  <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Nowe hasło</label>
                  <input id="password" type="password" autoComplete="new-password" placeholder="••••••••••" className={inpCls} {...register('password')} />
                  {errors.password && <p className="text-[11px] text-er mt-1">{errors.password.message}</p>}
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Powtórz hasło</label>
                  <input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••••" className={inpCls} {...register('confirm')} />
                  {errors.confirm && <p className="text-[11px] text-er mt-1">{errors.confirm.message}</p>}
                </div>
                <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Zmień hasło <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
              <p className="text-[11px] text-tx3 text-center mt-4 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-tx3" />
                <span>Link wygasa w ciągu 1 godziny od wysłania.</span>
              </p>
              <p className="text-center text-[12px] text-tx3 mt-3">
                <Link to="/login" className="hover:text-tx press">Anuluj i wróć do logowania</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

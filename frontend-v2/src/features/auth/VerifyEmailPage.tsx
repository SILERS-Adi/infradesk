import { useEffect, useState } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuthStore } from '@/store/auth';

type State = 'loading' | 'success' | 'invalid' | 'expired' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.post('/auth/verify-email', { token })
      .then(() => { if (!cancelled) setState('success'); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const ax = err as { response?: { data?: { error?: string; message?: string } } };
        const code = ax.response?.data?.error;
        const msg = ax.response?.data?.message;
        setErrorMsg(msg ?? null);
        if (code === 'verify_expired') setState('expired');
        else if (code === 'verify_invalid') setState('invalid');
        else setState('error');
      });
    return () => { cancelled = true; };
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="absolute rounded-full" style={{ width: 600, height: 600, filter: 'blur(120px)', opacity: 0.25, background: 'var(--pri)', top: '-15%', left: '-8%' }} />
      <div className="absolute top-6 right-6 z-20"><ThemeToggle /></div>

      <div className="w-full max-w-[400px] relative z-10 anim-scale">
        <div className="glass rounded-[var(--r-xl)] p-7 text-center" style={{ boxShadow: 'var(--sh4)' }}>
          {state === 'loading' && (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--sf-h)' }}>
                <Loader2 className="h-6 w-6 animate-spin text-pri" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Weryfikacja…</h2>
              <p className="text-[13px] text-tx2">Sprawdzamy Twój link.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}>
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Email potwierdzony</h2>
              <p className="text-[13px] text-tx2 mb-5">
                Twoje konto jest aktywne. {user ? 'Możesz wrócić do panelu.' : 'Możesz się zalogować.'}
              </p>
              <Link
                to={user ? '/dashboard' : '/login'}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press w-full"
                style={{ background: 'var(--pri)', color: 'white' }}
              >
                {user ? 'Wróć do panelu' : 'Zaloguj się'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}

          {state === 'expired' && (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}>
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Link wygasł</h2>
              <p className="text-[13px] text-tx2 mb-5">
                Linki weryfikacyjne wygasają po 24h. Zaloguj się żeby otrzymać nowy email.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press w-full border"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                Przejdź do logowania
              </Link>
            </>
          )}

          {(state === 'invalid' || state === 'error') && (
            <>
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--er-l)', color: 'var(--er)' }}>
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Nieprawidłowy link</h2>
              <p className="text-[13px] text-tx2 mb-5">
                {errorMsg ?? 'Link jest niepoprawny lub został już użyty.'}
              </p>
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                Spróbuj ponownie
              </Button>
            </>
          )}
        </div>
        <p className="text-center text-[10px] mt-5 font-medium text-tx3">InfraDesk v2 · Powered by SILERS</p>
      </div>
    </div>
  );
}

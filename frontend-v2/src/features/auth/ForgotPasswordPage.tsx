import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const schema = z.object({ email: z.string().email('Nieprawidłowy email') });
type Form = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    try {
      await api.post('/auth/password-reset/request', { email: data.email });
      setSent(data.email);
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { message?: string } } };
      if (ax.response?.status === 429) {
        toast.error('Za dużo prób. Spróbuj ponownie za chwilę.');
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
          <Link to="/login" className="inline-flex items-center gap-1 text-[12px] text-tx3 hover:text-tx press mb-4">
            <ArrowLeft className="h-3.5 w-3.5" /> Wróć do logowania
          </Link>

          {sent ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}>
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-[20px] font-bold text-tx mb-2">Sprawdź skrzynkę</h2>
              <p className="text-[13px] text-tx2 leading-relaxed">
                Wysłaliśmy email do <strong>{sent}</strong> z linkiem do zresetowania hasła.
                Link wygasa za 1 godzinę.
              </p>
              <p className="text-[11px] text-tx3 mt-4">
                Nie ma maila? Sprawdź spam, albo{' '}
                <button type="button" onClick={() => setSent(null)} className="text-pri hover:underline font-semibold">
                  spróbuj jeszcze raz
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <Mail className="h-7 w-7 text-pri mb-3" />
              <h2 className="text-[20px] font-bold text-tx mb-1">Resetuj hasło</h2>
              <p className="text-[12px] text-tx3 mb-5">
                Podaj swój email — wyślemy Ci link do ustawienia nowego hasła.
              </p>
              <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div>
                  <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Email</label>
                  <input id="email" type="email" autoComplete="email" placeholder="twoj@email.pl" className={inpCls} {...register('email')} />
                  {errors.email && <p className="text-[11px] text-er mt-1">{errors.email.message}</p>}
                </div>
                <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Wyślij link <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

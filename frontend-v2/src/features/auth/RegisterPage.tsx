import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, ArrowRight, Sparkles, Search, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const schema = z.object({
  firstName: z.string().min(1, 'Podaj imię').max(100),
  lastName:  z.string().min(1, 'Podaj nazwisko').max(100),
  email:     z.string().email('Nieprawidłowy email').max(255),
  password:  z.string().min(10, 'Min. 10 znaków').max(128),
  taxId:     z.string().regex(/^[0-9]{10}$/, 'NIP musi mieć 10 cyfr').optional().or(z.literal('')),
  workspaceName: z.string().min(2, 'Podaj nazwę firmy').max(120),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Wymagana akceptacja' }) }),
});
type RegisterForm = z.infer<typeof schema>;

interface CompanyLookup {
  name: string;
  taxId: string;
  regon: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  source: 'mf' | 'ceidg';
}

interface PlanDisplay { label: string; monthly: number | null; trial: number | null }
const PLAN_INFO: Record<string, PlanDisplay> = {
  START:      { label: 'Start',      monthly: 49,   trial: null },
  TEAM:       { label: 'Team',       monthly: 149,  trial: null },
  PRO:        { label: 'Pro',        monthly: 399,  trial: 30 },
  ENTERPRISE: { label: 'Enterprise', monthly: null, trial: null },
};

function priceLine(plan: PlanDisplay, cycle: string): string {
  if (plan.monthly == null) return 'cena indywidualna';
  if (cycle === 'yearly') {
    const yearly = Math.round(plan.monthly * 12 * 0.8);
    const yearlyMonthly = Math.round(plan.monthly * 0.8);
    return `${yearlyMonthly} zł netto/mc · ${yearly.toLocaleString('pl-PL')} zł netto/rok`;
  }
  return `${plan.monthly} zł netto/mc`;
}

export function RegisterPage() {
  const { user, setSession } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planKey = (searchParams.get('plan') ?? '').toUpperCase();
  const cycle   = (searchParams.get('cycle') ?? 'monthly').toLowerCase();
  const planMeta = useMemo(() => PLAN_INFO[planKey] ?? null, [planKey]);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
  });

  const taxIdValue = watch('taxId');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookup, setLookup] = useState<CompanyLookup | null>(null);

  async function fetchCompanyData() {
    const nip = (taxIdValue ?? '').replace(/[^0-9]/g, '');
    if (nip.length !== 10) {
      toast.error('Wpisz poprawny NIP (10 cyfr)');
      return;
    }
    setLookingUp(true);
    setLookup(null);
    try {
      const r = await api.get<{ found: boolean; data?: CompanyLookup }>('/public/company-lookup', { params: { nip } });
      if (!r.data.found || !r.data.data) {
        toast.error('Nie znaleziono firmy o podanym NIP');
        return;
      }
      const d = r.data.data;
      setLookup(d);
      setValue('workspaceName', d.name, { shouldValidate: true });
      toast.success(`Pobrano dane (${d.source === 'mf' ? 'MF biała lista' : 'CEIDG'})`);
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { message?: string } } };
      if (ax.response?.status === 429) {
        toast.error('Za dużo zapytań — spróbuj za chwilę');
      } else {
        toast.error(ax.response?.data?.message ?? 'Błąd pobrania danych');
      }
    } finally {
      setLookingUp(false);
    }
  }

  useEffect(() => {
    document.title = planMeta
      ? `Rejestracja — Plan ${planMeta.label} · InfraDesk`
      : 'Rejestracja · InfraDesk';
  }, [planMeta]);

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (data: RegisterForm) => {
    try {
      const taxId = (data.taxId ?? '').replace(/[^0-9]/g, '') || undefined;
      const payload: Record<string, unknown> = {
        firstName: data.firstName.trim(),
        lastName:  data.lastName.trim(),
        email:     data.email.trim().toLowerCase(),
        password:  data.password,
        workspaceName: data.workspaceName.trim(),
        ...(taxId ? { taxId } : {}),
        ...(lookup
          ? {
              regon: lookup.regon ?? undefined,
              addressLine1: lookup.addressLine1 ?? undefined,
              postalCode: lookup.postalCode ?? undefined,
              city: lookup.city ?? undefined,
            }
          : {}),
      };
      const res = await api.post('/auth/register', payload);
      setSession(res.data.user, res.data.accessToken, res.data.defaultWorkspaceId);
      toast.success('Konto założone — witaj w InfraDesk!');
      navigate('/dashboard');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      const code = ax.response?.data?.error;
      const msg = ax.response?.data?.message;
      if (code === 'email_taken' || msg?.toLowerCase().includes('email')) {
        toast.error('Ten email jest już zarejestrowany — zaloguj się');
      } else {
        toast.error(msg ?? 'Nie udało się założyć konta');
      }
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

      <div className="absolute top-6 right-6 z-20"><ThemeToggle /></div>

      <div className="w-full max-w-[440px] relative z-10 anim-scale">
        <div className="glass rounded-[var(--r-xl)] p-7" style={{ boxShadow: 'var(--sh4)' }}>
          <div className="flex flex-col items-center mb-5">
            <Link to="/" aria-label="InfraDesk">
              <img src="/logo.png" alt="InfraDesk" className="h-12 w-auto mb-3" />
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-tx3">
              Załóż konto · 30 dni za darmo
            </p>
          </div>

          {planMeta && (
            <div
              className="rounded-[var(--r-s)] p-3 mb-5 border flex items-center gap-3"
              style={{ borderColor: 'var(--pri)', background: 'var(--pri-l)' }}
            >
              <Sparkles className="h-5 w-5 text-pri shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-tx3 uppercase tracking-wider font-semibold">Wybrany plan</p>
                <p className="text-[14px] font-bold">{planMeta.label}</p>
                <p className="text-[12px] text-tx2 mt-0.5">{priceLine(planMeta, cycle)}</p>
              </div>
              {planMeta.trial && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full self-start" style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}>
                  {planMeta.trial} dni za darmo
                </span>
              )}
            </div>
          )}

          <h2 className="text-[20px] font-bold text-tx mb-1">Zaczynamy</h2>
          <p className="text-[12px] text-tx3 mb-5">
            Każde nowe konto startuje na 30-dniowym trialu PRO. Bez podawania karty.
          </p>

          <form className="space-y-3.5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="firstName">Imię</label>
                <input id="firstName" type="text" autoComplete="given-name" className={inpCls} {...register('firstName')} onFocus={onFocus} onBlurCapture={onBlur} />
                {errors.firstName && <p className="text-[11px] text-er mt-1">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="lastName">Nazwisko</label>
                <input id="lastName" type="text" autoComplete="family-name" className={inpCls} {...register('lastName')} onFocus={onFocus} onBlurCapture={onBlur} />
                {errors.lastName && <p className="text-[11px] text-er mt-1">{errors.lastName.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="email">Email służbowy</label>
              <input id="email" type="email" autoComplete="email" placeholder="adam@firma.pl" className={inpCls} {...register('email')} onFocus={onFocus} onBlurCapture={onBlur} />
              {errors.email && <p className="text-[11px] text-er mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="password">Hasło</label>
              <input id="password" type="password" autoComplete="new-password" placeholder="min. 10 znaków" className={inpCls} {...register('password')} onFocus={onFocus} onBlurCapture={onBlur} />
              {errors.password && <p className="text-[11px] text-er mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="taxId">
                NIP <span className="text-tx3 normal-case font-medium">(opcjonalnie — dane z GUS)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="taxId"
                  type="text"
                  inputMode="numeric"
                  placeholder="1234567890"
                  maxLength={13}
                  className={inpCls + ' font-mono'}
                  {...register('taxId')}
                  onFocus={onFocus}
                  onBlurCapture={onBlur}
                />
                <button
                  type="button"
                  onClick={fetchCompanyData}
                  disabled={lookingUp}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-[var(--r)] text-[12px] font-semibold press disabled:opacity-50"
                  style={{ background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
                  title="Pobierz dane z MF białej listy / CEIDG"
                >
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  GUS
                </button>
              </div>
              {errors.taxId && <p className="text-[11px] text-er mt-1">{errors.taxId.message}</p>}
              {lookup && (
                <div
                  className="mt-2 rounded-[var(--r-s)] p-2 border text-[11px] flex items-start gap-2"
                  style={{ borderColor: 'var(--ok)', background: 'var(--ok-l)' }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-tx truncate">{lookup.name}</p>
                    {(lookup.addressLine1 || lookup.city) && (
                      <p className="text-tx3 truncate">
                        {[lookup.addressLine1, [lookup.postalCode, lookup.city].filter(Boolean).join(' ')]
                          .filter(Boolean).join(', ')}
                      </p>
                    )}
                    {lookup.regon && (
                      <p className="text-tx3 font-mono">REGON: {lookup.regon}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2" htmlFor="workspaceName">Nazwa firmy</label>
              <input id="workspaceName" type="text" autoComplete="organization" placeholder="np. Twoja Firma Sp. z o.o." className={inpCls} {...register('workspaceName')} onFocus={onFocus} onBlurCapture={onBlur} />
              {errors.workspaceName && <p className="text-[11px] text-er mt-1">{errors.workspaceName.message}</p>}
            </div>

            <label className="flex items-start gap-2 text-[11px] text-tx2 cursor-pointer pt-1">
              <input type="checkbox" {...register('acceptTerms')} className="mt-0.5 accent-[color:var(--pri)]" />
              <span>
                Akceptuję{' '}
                <Link to="/regulamin" target="_blank" rel="noopener noreferrer" className="text-pri hover:underline">regulamin</Link>{' '}i{' '}
                <Link to="/prywatnosc" target="_blank" rel="noopener noreferrer" className="text-pri hover:underline">politykę prywatności</Link>.
              </span>
            </label>
            {errors.acceptTerms && <p className="text-[11px] text-er">{errors.acceptTerms.message}</p>}

            <Button type="submit" size="lg" disabled={isSubmitting} className="w-full mt-1">
              {isSubmitting
                ? <Loader2 className="w-5 h-5" style={{ animation: 'spin .6s linear infinite' }} />
                : <>Załóż konto <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <p className="text-center text-[12px] text-tx3 mt-5">
            Masz już konto?{' '}
            <Link to="/login" className="text-pri font-semibold hover:underline">
              Zaloguj się
            </Link>
          </p>
        </div>
        <p className="text-center text-[10px] mt-5 font-medium text-tx3">
          InfraDesk v2 · Powered by SILERS
        </p>
      </div>
    </div>
  );
}

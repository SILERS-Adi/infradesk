import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Monitor, Building2, Server, ArrowRight, ArrowLeft, Loader2, CheckCircle, Copy, User } from 'lucide-react';
import { tenantApi } from '../../api/tenant';

type AccountType = 'PERSONAL' | 'BUSINESS' | 'MSP';

const TYPES: { id: AccountType; name: string; subtitle: string; icon: any; color: string; features: string[] }[] = [
  {
    id: 'PERSONAL', name: 'InfraDesk Personal', subtitle: 'Monitoruj swoje urządzenia za darmo',
    icon: User, color: '#10B981',
    features: ['Do 3 urządzeń', 'Monitoring systemu', 'Czyszczenie pamięci', 'Pomoc zdalna (płatna)'],
  },
  {
    id: 'BUSINESS', name: 'InfraDesk Business', subtitle: 'Zarządzaj infrastrukturą swojej firmy',
    icon: Building2, color: '#3B82F6',
    features: ['Nieograniczone urządzenia', 'Zgłoszenia serwisowe', 'Zapraszanie partnerów IT', 'Backup i monitoring'],
  },
  {
    id: 'MSP', name: 'InfraDesk MSP', subtitle: 'Zarządzaj infrastrukturą klientów',
    icon: Server, color: '#8B5CF6',
    features: ['Tworzenie kont klientów', 'Pełna kontrola modułów', 'CRM i rozliczenia', 'Wielopoziomowe zarządzanie'],
  },
];

const schema = z.object({
  name: z.string().min(2, 'Min. 2 znaki'),
  slug: z.string().max(50).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Tylko małe litery, cyfry i myślniki').optional().or(z.literal('')),
  ownerFirstName: z.string().min(1, 'Wymagane'),
  ownerLastName: z.string().min(1, 'Wymagane'),
  ownerEmail: z.string().email('Podaj poprawny email'),
  ownerPassword: z.string().min(8, 'Min. 8 znaków, wielka litera, cyfra, znak specjalny'),
  phone: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function RegisterTenantPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'type' | 'form' | 'done'>('type');
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ slug: string; tenantKey: string } | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  const slugValue = watch('slug');

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const payload: any = { ...data, tenantType: accountType };
      // PERSONAL accounts don't need a subdomain — backend auto-generates slug
      if (accountType === 'PERSONAL') delete payload.slug;
      const res = await tenantApi.register(payload);
      setResult({ slug: res.slug, tenantKey: res.tenantKey });
      setStep('done');
      toast.success('Konto utworzone!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd rejestracji');
    } finally {
      setLoading(false);
    }
  };

  const copyKey = () => {
    if (result?.tenantKey) { navigator.clipboard.writeText(result.tenantKey); toast.success('Skopiowano'); }
  };

  // ── Step: done ──
  if (step === 'done' && result) {
    const tp = TYPES.find(t => t.id === accountType)!;
    return (
      <div className="min-h-screen bg-[#040a16] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#060B1A] rounded-2xl border border-[#1E293B] p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${tp.color}15` }}>
            <CheckCircle className="h-8 w-8" style={{ color: tp.color }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Gotowe!</h1>
          <p className="text-zinc-400 mb-2">{tp.name}</p>
          {accountType === 'PERSONAL' ? (
            <p className="text-lg text-emerald-400 font-medium mb-6">
              Zaloguj się na infradesk.pl
            </p>
          ) : (
            <a href={`https://${result.slug}.infradesk.pl`} className="text-lg font-mono text-violet-400 hover:text-violet-300 block mb-6">
              {result.slug}.infradesk.pl
            </a>
          )}
          {accountType !== 'PERSONAL' && (
            <div className="bg-[#131B2E] rounded-xl border border-[#1E293B] p-4 mb-6 text-left">
              <p className="text-xs text-zinc-500 mb-1">Klucz powiązania agentów</p>
              <div className="flex items-center gap-2">
                <code className="text-sm text-amber-400 font-mono flex-1 break-all">{result.tenantKey}</code>
                <button onClick={copyKey} className="p-1.5 hover:bg-white/5 rounded-lg"><Copy className="h-4 w-4 text-zinc-400" /></button>
              </div>
            </div>
          )}
          <button onClick={() => navigate('/login')}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-90">
            Zaloguj się
          </button>
        </div>
      </div>
    );
  }

  // ── Step: type selection ──
  if (step === 'type') {
    return (
      <div className="min-h-screen bg-[#040a16] flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Utwórz konto InfraDesk</h1>
            <p className="text-zinc-400">Wybierz typ konta dopasowany do Twoich potrzeb</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TYPES.map(tp => {
              const Icon = tp.icon;
              const selected = accountType === tp.id;
              return (
                <button key={tp.id} onClick={() => setAccountType(tp.id)}
                  className="text-left rounded-2xl p-6 transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    background: selected ? `${tp.color}10` : 'rgba(255,255,255,0.025)',
                    border: selected ? `2px solid ${tp.color}40` : '2px solid rgba(255,255,255,0.06)',
                    boxShadow: selected ? `0 0 24px ${tp.color}15` : 'none',
                  }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${tp.color}15` }}>
                    <Icon className="h-6 w-6" style={{ color: tp.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{tp.name}</h3>
                  <p className="text-sm text-zinc-400 mb-4">{tp.subtitle}</p>
                  <ul className="space-y-1.5">
                    {tp.features.map(f => (
                      <li key={f} className="text-xs text-zinc-500 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: tp.color }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {tp.id === 'PERSONAL' && (
                    <div className="mt-4 text-xs font-bold px-3 py-1 rounded-full inline-block" style={{ background: `${tp.color}15`, color: tp.color }}>
                      Darmowe
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300">Mam już konto</Link>
            <button onClick={() => { if (accountType) setStep('form'); else toast.error('Wybierz typ konta'); }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 12px rgba(79,140,255,0.2)' }}>
              Dalej <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: form ──
  const tp = TYPES.find(t => t.id === accountType)!;
  return (
    <div className="min-h-screen bg-[#040a16] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#060B1A] rounded-2xl border border-[#1E293B] p-8">
        <button onClick={() => setStep('type')} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
          <ArrowLeft className="h-4 w-4" /> Zmień typ konta
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${tp.color}15` }}>
            <tp.icon className="h-5 w-5" style={{ color: tp.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{tp.name}</h1>
            <p className="text-sm text-zinc-400">{tp.subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">{accountType === 'PERSONAL' ? 'Twoje imię / nick' : 'Nazwa firmy'}</label>
            <input {...register('name')} className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              placeholder={accountType === 'PERSONAL' ? 'Jan Kowalski' : 'Nazwa firmy'} />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
          </div>

          {accountType !== 'PERSONAL' && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Subdomena</label>
              <div className="flex items-center">
                <input {...register('slug')} className="flex-1 px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-l-xl text-white placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
                  placeholder="mojafirma" />
                <span className="px-3 py-2.5 bg-[#1E293B] border border-[#1E293B] rounded-r-xl text-zinc-400 text-sm">.infradesk.pl</span>
              </div>
              {errors.slug && <p className="text-xs text-red-400 mt-1">{errors.slug.message}</p>}
              {slugValue && !errors.slug && <p className="text-xs text-zinc-500 mt-1">Panel: <span className="text-violet-400">{slugValue}.infradesk.pl</span></p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Imię</label>
              <input {...register('ownerFirstName')} className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white focus:border-violet-500 focus:outline-none" />
              {errors.ownerFirstName && <p className="text-xs text-red-400 mt-1">{errors.ownerFirstName.message}</p>}
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Nazwisko</label>
              <input {...register('ownerLastName')} className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white focus:border-violet-500 focus:outline-none" />
              {errors.ownerLastName && <p className="text-xs text-red-400 mt-1">{errors.ownerLastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <input {...register('ownerEmail')} type="email" className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white focus:border-violet-500 focus:outline-none" placeholder="email@domena.pl" />
            {errors.ownerEmail && <p className="text-xs text-red-400 mt-1">{errors.ownerEmail.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Hasło</label>
            <input {...register('ownerPassword')} type="password" className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white focus:border-violet-500 focus:outline-none" placeholder="Min. 8 znaków, A-z, 0-9, @!#" />
            {errors.ownerPassword && <p className="text-xs text-red-400 mt-1">{errors.ownerPassword.message}</p>}
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Telefon (opcjonalnie)</label>
            <input {...register('phone')} className="w-full px-4 py-2.5 bg-[#131B2E] border border-[#1E293B] rounded-xl text-white focus:border-violet-500 focus:outline-none" placeholder="+48 123 456 789" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? 'Tworzenie...' : 'Utwórz konto'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 mt-4">
          Masz już konto? <Link to="/login" className="text-violet-400 hover:text-violet-300">Zaloguj się</Link>
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

type PlanKey = 'START' | 'TEAM' | 'PRO' | 'ENTERPRISE';
type BillingCycle = 'monthly' | 'yearly';

const YEARLY_DISCOUNT = 0.2;

interface PublicPlan {
  key: PlanKey;
  label: string;
  tagline: string;
  monthly: number | null;
  color: string;
  popular?: boolean;
  trialDays?: number;
  features: string[];
  limits: Array<{ label: string; value: string }>;
}

const PLANS: PublicPlan[] = [
  {
    key: 'START',
    label: 'Start',
    tagline: 'Solo / mała firma',
    monthly: 49,
    color: 'var(--tx2)',
    features: [
      'Tickety, Urządzenia, Sesje',
      'Sejf haseł',
      'Dysk plików (5 GB)',
      'Email support',
    ],
    limits: [
      { label: 'Użytkownicy', value: '3' },
      { label: 'Urządzenia', value: '25' },
      { label: 'Dysk plików', value: '5 GB' },
      { label: 'AI calls / mc', value: '100' },
    ],
  },
  {
    key: 'TEAM',
    label: 'Team',
    tagline: 'Rosnąca ekipa',
    monthly: 149,
    color: 'var(--ok)',
    features: [
      'Wszystko ze Start +',
      'CRM, Zamówienia, Delegacje',
      'Monitoring + Audit Score',
      'Asystent Desktop',
      'Multi-klient (MSP)',
      'Integracje API',
    ],
    limits: [
      { label: 'Użytkownicy', value: '10' },
      { label: 'Urządzenia', value: '100' },
      { label: 'Dysk plików', value: '25 GB' },
      { label: 'Backupy', value: '10 GB' },
      { label: 'AI calls / mc', value: '500' },
      { label: 'Klienci (MSP)', value: '5' },
    ],
  },
  {
    key: 'PRO',
    label: 'Pro',
    tagline: 'MSP i średnie firmy',
    monthly: 399,
    color: 'var(--pri)',
    popular: true,
    trialDays: 30,
    features: [
      'Wszystko z Team +',
      'Backupy z alertami',
      'AI Copilot (Iris)',
      'Priority support',
      'Shadow Mode AI',
    ],
    limits: [
      { label: 'Użytkownicy', value: '30' },
      { label: 'Urządzenia', value: '500' },
      { label: 'Dysk plików', value: '100 GB' },
      { label: 'Backupy', value: '50 GB' },
      { label: 'AI calls / mc', value: '2 000' },
      { label: 'Klienci (MSP)', value: '25' },
    ],
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    tagline: 'Duże organizacje, on-prem',
    monthly: null,
    color: 'var(--wn)',
    features: [
      'Wszystko z Pro +',
      'SLA 99,9%',
      'GPS Field Service',
      'Shadow AI Mode',
      'On-premise opcja',
      'Dedykowany CSM',
    ],
    limits: [
      { label: 'Użytkownicy', value: '∞' },
      { label: 'Urządzenia', value: '∞' },
      { label: 'Dysk plików', value: '500 GB+' },
      { label: 'AI calls / mc', value: '∞' },
      { label: 'Klienci (MSP)', value: '∞' },
    ],
  },
];

function priceFor(p: PublicPlan, cycle: BillingCycle): { display: string; suffix: string; annualTotal: string | null } {
  if (p.monthly == null) return { display: 'Indywidualnie', suffix: '', annualTotal: null };
  if (cycle === 'monthly') return { display: `${p.monthly} zł`, suffix: 'mc netto', annualTotal: null };
  const yearlyMonthly = Math.round(p.monthly * (1 - YEARLY_DISCOUNT));
  const yearlyTotal = Math.round(p.monthly * 12 * (1 - YEARLY_DISCOUNT));
  return {
    display: `${yearlyMonthly} zł`,
    suffix: 'mc netto · rocznie',
    annualTotal: `${yearlyTotal.toLocaleString('pl-PL')} zł netto / rok`,
  };
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Czy mogę zmieniać plan w dowolnym momencie?',
    a: 'Tak. Upgrade działa od razu, downgrade na koniec bieżącego okresu rozliczeniowego. Bez utraty danych.',
  },
  {
    q: 'Co dokładnie znaczy „nielimitowane urządzenia" w Enterprise?',
    a: 'Brak ograniczenia w aplikacji. Cena jest ustalana indywidualnie wg liczby techników i wolumenu danych — napisz do nas.',
  },
  {
    q: 'Czy AI Iris przetwarza moje dane przez OpenAI?',
    a: 'Iris działa na własnym kontenerze z modelem dobranym pod Twój workspace. Promptów ani danych klientów nie wysyłamy do publicznych API bez Twojej zgody (Shadow Mode).',
  },
  {
    q: 'Czy mogę wystawić fakturę VAT?',
    a: 'Tak — Twoja faktura VAT jest zgodna z KSeF. Moduł Fakturowanie (do wystawiania własnych faktur dla Twoich klientów) jest dostępny jako oddzielnie płatny add-on.',
  },
  {
    q: 'Co po wygaśnięciu 30-dniowego triala PRO?',
    a: 'Workspace przechodzi automatycznie na plan Start (49 zł/mc) — żadne dane nie znikają, niektóre moduły wymagają wyższego planu i się chowają.',
  },
];

export function CennikPage() {
  usePageMeta({
    title: 'Cennik',
    description: 'START 49 zł/mc · TEAM 149 zł/mc · PRO 399 zł/mc (30 dni za darmo) · ENTERPRISE indywidualnie. Roczna płatność -20%.',
  });
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <div className="px-5 py-12 md:py-16">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Cennik</p>
          <h1 className="text-[34px] md:text-[44px] font-bold tracking-tight mb-3">
            Cztery plany. Bez ukrytych kosztów.
          </h1>
          <p className="text-[15px] text-tx2 max-w-[680px] mx-auto">
            Płać tylko za to co używasz. Roczne rozliczenie −20%.
            PRO za darmo przez 30 dni przy rejestracji.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex items-center rounded-[var(--r-s)] border p-0.5"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'monthly'}
              onClick={() => setCycle('monthly')}
              className="px-4 py-2 text-[13px] font-semibold rounded-[var(--r-xs)] transition-colors"
              style={{
                background: cycle === 'monthly' ? 'var(--sf)' : 'transparent',
                color: cycle === 'monthly' ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: cycle === 'monthly' ? 'var(--sh1)' : 'none',
              }}
            >
              Miesięcznie
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'yearly'}
              onClick={() => setCycle('yearly')}
              className="px-4 py-2 text-[13px] font-semibold rounded-[var(--r-xs)] transition-colors flex items-center gap-2"
              style={{
                background: cycle === 'yearly' ? 'var(--sf)' : 'transparent',
                color: cycle === 'yearly' ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: cycle === 'yearly' ? 'var(--sh1)' : 'none',
              }}
            >
              Rocznie
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--ok-l)', color: 'var(--ok)' }}
              >
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {PLANS.map((p) => {
            const price = priceFor(p, cycle);
            return (
              <div
                key={p.key}
                className="rounded-[var(--r-m)] p-5 border flex flex-col relative"
                style={p.popular
                  ? { borderColor: p.color, borderWidth: 2, background: `color-mix(in srgb, ${p.color} 4%, var(--sf))` }
                  : { borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                {p.popular && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: p.color, color: 'white' }}
                  >
                    Polecany
                  </div>
                )}
                <div className="mb-3">
                  <div className="text-[18px] font-bold mb-0.5" style={{ color: p.color }}>{p.label}</div>
                  <div className="text-[11px] text-tx3">{p.tagline}</div>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-[28px] font-bold tabular-nums">{price.display}</span>
                </div>
                <div className="text-[11px] text-tx3 mb-1">{price.suffix || ' '}</div>
                {price.annualTotal ? (
                  <div className="text-[11px] font-semibold tabular-nums mb-4" style={{ color: 'var(--ok)' }}>
                    = {price.annualTotal}
                  </div>
                ) : (
                  <div className="mb-4" />
                )}
                {p.trialDays && (
                  <div
                    className="self-start mb-4 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1"
                    style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}
                  >
                    <Sparkles className="h-3 w-3" />
                    {p.trialDays} dni za darmo
                  </div>
                )}
                <ul className="space-y-1.5 mb-4">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12px]">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: p.color }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div
                  className="rounded-[var(--r-s)] p-2 mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]"
                  style={{ background: 'var(--sf-h)', border: '1px solid var(--bd)' }}
                >
                  {p.limits.map((l) => (
                    <div key={l.label} className="flex items-baseline justify-between gap-1">
                      <span className="text-tx3">{l.label}</span>
                      <span className="font-semibold tabular-nums">{l.value}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to={p.monthly == null
                    ? '/kontakt'
                    : `/register?plan=${p.key}&cycle=${cycle}`}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 h-10 rounded-[var(--r-s)] text-[13px] font-semibold press w-full"
                  style={p.popular
                    ? { background: p.color, color: 'white' }
                    : { background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--bd)' }}
                >
                  {p.monthly == null ? 'Skontaktuj się' : 'Wypróbuj plan'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Notes about pricing */}
        <div
          className="rounded-[var(--r-s)] border p-4 mb-12 max-w-[900px] mx-auto"
          style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
        >
          <ul className="space-y-1.5 text-[12px] text-tx2 leading-relaxed">
            <li>
              <strong>Wszystkie ceny netto.</strong> Do faktury doliczamy 23% VAT.
            </li>
            <li>
              <strong>Roczne rozliczenie</strong> — płatne jednorazowo z góry, kwota zielona pod ceną miesięczną.
              Rabat 20% naliczany automatycznie.
            </li>
            <li>
              <strong>Moduł Fakturowanie</strong> (KSeF + faktury VAT dla Twoich klientów) jest dodatkowym, oddzielnie płatnym modułem.
              <span className="text-tx3"> Integracje API z różnymi platformami (CEIDG, GUS, biała lista MF, KSeF read-only) są wliczone w cenę planu.</span>
            </li>
            <li>
              <strong>Faktura VAT</strong> wystawiana automatycznie po rejestracji.
              Płatność: przelew, BLIK, karta — czekamy na potwierdzenie zaksięgowania.
            </li>
          </ul>
        </div>

        {/* FAQ */}
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-[22px] font-bold tracking-tight text-center mb-6">Najczęstsze pytania</h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="rounded-[var(--r-s)] border p-4 group"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <summary className="cursor-pointer text-[14px] font-semibold list-none flex items-center justify-between">
                  <span>{item.q}</span>
                  <span className="text-tx3 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-[13px] text-tx2 mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

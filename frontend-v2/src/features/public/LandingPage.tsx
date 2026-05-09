import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Sparkles, Zap, Activity, Bot, HardDrive, Ticket as TicketIcon,
  Users, Briefcase, Cloud, Lock, Check, Headset,
} from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

interface Feature {
  icon: typeof TicketIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: TicketIcon, title: 'Helpdesk z SLA',         desc: 'Zgłoszenia od klientów i wewnętrzne, automatyczne kategorie, kalendarz wizyt, rozliczenia czasu.' },
  { icon: HardDrive,  title: 'Inwentaryzacja sprzętu', desc: 'Wszystkie urządzenia klientów w jednym miejscu — IP, OS, użytkownik, gwarancja, sesje zdalne jednym kliknięciem.' },
  { icon: Bot,        title: 'Asystent Desktop',       desc: 'Klient na Windows z AI — głosowe komendy, screenshoty zgłoszeń, bezpieczny zdalny dostęp przez RustDesk.' },
  { icon: Activity,   title: 'Monitoring 24/7',        desc: 'Audit Score, alerty od dysków, zasobów i certyfikatów. Cisza nocna i grupowanie.' },
  { icon: Sparkles,   title: 'AI Copilot (Iris)',      desc: 'Diagnoza zgłoszeń, automatyczne odpowiedzi, baza wiedzy. Działa na Twoich danych — nigdy nie wycieka na zewnątrz.' },
  { icon: ShieldCheck,title: 'Sejf haseł',             desc: 'Credentiale per urządzenie, audit trail, rozdział praw. Brak haseł w mailach i Notesie.' },
];

const PILLARS = [
  { icon: Briefcase, title: 'Dla MSP',           desc: 'Wielu klientów w jednej instalacji, izolacja workspace, rozliczenia per umowa.' },
  { icon: Users,     title: 'Dla zespołów IT',   desc: 'Wewnętrzny helpdesk z onboardingiem, delegacjami, sesjami pracy i kalendarzem.' },
  { icon: Cloud,     title: 'Cloud lub on-prem', desc: 'Wersja w chmurze (infradesk.pl) albo wdrożenie u Ciebie z pełną kontrolą.' },
];

export function LandingPage() {
  usePageMeta({}); // używa defaultów (jest stroną główną)
  return (
    <div>
      {/* Hero */}
      <section className="px-5 pt-14 pb-12 md:pt-20 md:pb-16">
        <div className="max-w-[1100px] mx-auto text-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold mb-6"
            style={{ background: 'var(--pri-l)', color: 'var(--pri)', border: '1px solid var(--pri)' }}
          >
            <Zap className="h-3 w-3" />
            Wersja 2.0 · 30 dni próbne PRO
          </div>
          <h1
            className="text-[34px] md:text-[52px] font-bold tracking-tight leading-[1.05] mb-5"
            style={{ color: 'var(--tx)' }}
          >
            Helpdesk i monitoring IT,<br />
            <span style={{ background: 'linear-gradient(135deg, var(--pri), #6D5DFF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              wzmocnione AI
            </span>
          </h1>
          <p className="text-[16px] md:text-[18px] text-tx2 max-w-[680px] mx-auto leading-relaxed mb-8">
            Jedno narzędzie dla MSP i wewnętrznych zespołów IT.
            Tickety, urządzenia, zdalny dostęp, monitoring i CRM — bez przepinania
            się między aplikacjami. Asystent na każdej stacji robotniczej.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register?plan=PRO&cycle=monthly"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              Wypróbuj 30 dni za darmo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/cennik"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press border"
              style={{ borderColor: 'var(--bd)', background: 'var(--sf)', color: 'var(--tx)' }}
            >
              Zobacz cennik
            </Link>
          </div>
          <p className="text-[12px] text-tx3 mt-4">
            Bez karty kredytowej · Anuluj w dowolnym momencie · Polskie wsparcie
          </p>
        </div>
      </section>

      {/* Pillars: dla kogo */}
      <section className="px-5 py-10 md:py-12" style={{ background: 'var(--sf)' }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="rounded-[var(--r-m)] p-5 border"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf2)' }}
              >
                <p.icon className="h-7 w-7 mb-3" style={{ color: 'var(--pri)' }} />
                <h3 className="text-[15px] font-bold text-tx mb-1.5">{p.title}</h3>
                <p className="text-[13px] text-tx2 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-5 py-14 md:py-20">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Co dostajesz</p>
            <h2 className="text-[28px] md:text-[36px] font-bold tracking-tight mb-3">
              Wszystkie narzędzia, jedna baza danych
            </h2>
            <p className="text-[14px] text-tx2 max-w-[600px] mx-auto">
              Bez integracji, bez kopiowania, bez logowania na trzy panele.
              Każdy moduł włączasz na zawołanie z poziomu „Plan i moduły".
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-[var(--r-m)] p-5 border hover:border-[var(--pri)] transition-colors"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
              >
                <div
                  className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center mb-3"
                  style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-bold mb-1.5">{f.title}</h3>
                <p className="text-[13px] text-tx2 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="px-5 py-14" style={{ background: 'var(--sf)' }}>
        <div className="max-w-[1100px] mx-auto text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Cennik</p>
          <h2 className="text-[28px] md:text-[36px] font-bold tracking-tight mb-3">
            Od 49 zł/miesiąc
          </h2>
          <p className="text-[14px] text-tx2 max-w-[640px] mx-auto mb-6">
            Cztery plany: <strong>Start</strong>, <strong>Team</strong>, <strong>Pro</strong>, <strong>Enterprise</strong>.
            Płatność roczna z 20% rabatem. PRO 30 dni za darmo przy rejestracji.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap mb-6 text-[12px] text-tx2">
            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-ok" /> Bez ograniczeń projektów</span>
            <span className="text-tx3">·</span>
            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-ok" /> Polski support</span>
            <span className="text-tx3">·</span>
            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-ok" /> Faktura VAT (KSeF)</span>
          </div>
          <Link
            to="/cennik"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press"
            style={{ background: 'var(--pri)', color: 'white' }}
          >
            Pełny cennik <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Trust strip */}
      <section className="px-5 py-10">
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <Lock className="h-6 w-6 mx-auto mb-2 text-tx3" />
            <p className="text-[12px] text-tx2"><strong className="text-tx">RLS</strong> + audit trail<br />pełna izolacja</p>
          </div>
          <div>
            <Cloud className="h-6 w-6 mx-auto mb-2 text-tx3" />
            <p className="text-[12px] text-tx2"><strong className="text-tx">Cloud lub on-prem</strong><br />Twój wybór</p>
          </div>
          <div>
            <Bot className="h-6 w-6 mx-auto mb-2 text-tx3" />
            <p className="text-[12px] text-tx2"><strong className="text-tx">AI Iris</strong><br />Twoje dane, nie OpenAI</p>
          </div>
          <div>
            <Headset className="h-6 w-6 mx-auto mb-2 text-tx3" />
            <p className="text-[12px] text-tx2"><strong className="text-tx">Polski support</strong><br />pn-pt 9-17</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-5 py-16">
        <div
          className="max-w-[1100px] mx-auto rounded-[var(--r-l)] px-8 py-10 md:py-14 text-center border"
          style={{
            background: 'linear-gradient(135deg, var(--pri-l) 0%, var(--sf) 60%)',
            borderColor: 'var(--pri)',
          }}
        >
          <h2 className="text-[26px] md:text-[34px] font-bold tracking-tight mb-3">
            Zacznij dziś, opłać kiedy będziesz pewny
          </h2>
          <p className="text-[14px] text-tx2 mb-6 max-w-[600px] mx-auto">
            30 dni pełnego PRO bez podawania karty. Po triala automatycznie schodzisz na Start
            (49 zł/mc) — bez utraty danych.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register?plan=PRO&cycle=monthly"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              Załóż konto
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/kontakt"
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press border"
              style={{ borderColor: 'var(--bd)', background: 'var(--sf)', color: 'var(--tx)' }}
            >
              Porozmawiaj z nami
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

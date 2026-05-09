import { Mail, Phone, MapPin, Clock, Building2 } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

export function KontaktPage() {
  usePageMeta({
    title: 'Kontakt',
    description: 'Skontaktuj się z InfraDesk. Tel +48 575 662 664, email biuro@silers.pl. Garwolin (siedziba) + Warszawa (oddział). Pn-Pt 9:00-17:00.',
  });
  return (
    <div className="px-5 py-12 md:py-16">
      <div className="max-w-[1000px] mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-pri mb-2">Kontakt</p>
          <h1 className="text-[34px] md:text-[42px] font-bold tracking-tight mb-3">
            Porozmawiajmy
          </h1>
          <p className="text-[14px] text-tx2 max-w-[600px] mx-auto">
            Najszybciej mailem albo telefonem. Odpowiadamy w godzinach pracy
            zwykle w ciągu kilku godzin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Kontakt operacyjny */}
          <div
            className="rounded-[var(--r-l)] p-6 border"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
          >
            <h2 className="text-[18px] font-bold mb-4">Sprzedaż i wsparcie</h2>
            <ul className="space-y-4 text-[13px]">
              <li className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-pri shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">E-mail</div>
                  <a href="mailto:biuro@silers.pl" className="font-semibold text-tx hover:text-pri press">
                    biuro@silers.pl
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-0.5 text-pri shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">Telefon</div>
                  <a href="tel:+48575662664" className="font-semibold text-tx hover:text-pri press">
                    +48 575 662 664
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="h-4 w-4 mt-0.5 text-pri shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">Godziny pracy</div>
                  <div className="font-semibold text-tx">Pn-Pt 9:00 — 17:00</div>
                  <div className="text-tx3 text-[11px] mt-0.5">Awarie krytyczne 24/7 dla planów PRO i ENT</div>
                </div>
              </li>
            </ul>
          </div>

          {/* Dane firmy */}
          <div
            className="rounded-[var(--r-l)] p-6 border"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
          >
            <h2 className="text-[18px] font-bold mb-4">Dane firmy</h2>
            <ul className="space-y-4 text-[13px]">
              <li className="flex items-start gap-3">
                <Building2 className="h-4 w-4 mt-0.5 text-pri shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">Wystawca faktury</div>
                  <div className="text-tx2 text-[12px] mt-0.5">NIP <span className="font-mono">826 194 10 94</span></div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-0.5 text-pri shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">Siedziba</div>
                  <div className="font-semibold text-tx">ul. Żeromskiego 28</div>
                  <div className="text-tx2 text-[12px]">08-400 Garwolin · Polska</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-0.5 text-tx3 shrink-0" />
                <div>
                  <div className="text-tx3 text-[11px] uppercase tracking-wider font-semibold">Oddział Warszawa</div>
                  <div className="font-semibold text-tx">ul. Piaskowa 1E</div>
                  <div className="text-tx2 text-[12px]">05-110 Jabłonna · Polska</div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Quick actions */}
        <div
          className="mt-6 rounded-[var(--r-l)] p-6 border text-center"
          style={{ borderColor: 'var(--pri)', background: 'var(--pri-l)' }}
        >
          <h3 className="text-[16px] font-bold mb-2">Chcesz zobaczyć jak system działa?</h3>
          <p className="text-[13px] text-tx2 mb-4">
            Załóż konto i przez 30 dni masz pełen plan PRO bez podawania karty.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/register"
              className="inline-flex items-center h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              Załóż konto za darmo
            </a>
            <a
              href="https://meet.google.com/landing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center h-10 px-5 rounded-[var(--r-s)] text-[13px] font-semibold press border"
              style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
            >
              Umów demo (15 min)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

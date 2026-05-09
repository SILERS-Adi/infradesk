import { useLocation, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';

type LegalKey = 'regulamin' | 'prywatnosc' | 'rodo';

const TABS: Array<{ key: LegalKey; path: string; label: string }> = [
  { key: 'regulamin',  path: '/regulamin',  label: 'Regulamin' },
  { key: 'prywatnosc', path: '/prywatnosc', label: 'Polityka prywatności' },
  { key: 'rodo',       path: '/rodo',       label: 'RODO' },
];

function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] md:text-[34px] font-bold tracking-tight mb-4">{children}</h1>;
}
function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-[18px] font-bold mt-6 mb-2">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-tx2 leading-relaxed mb-3">{children}</p>;
}
function Ul({ children }: { children: ReactNode }) {
  return <ul className="text-[14px] text-tx2 leading-relaxed mb-3 ml-5 list-disc space-y-1">{children}</ul>;
}

function Regulamin() {
  return (
    <article>
      <H1>Regulamin świadczenia usług InfraDesk</H1>
      <P>Wersja obowiązująca od 22 kwietnia 2026 r.</P>

      <H2>§1. Postanowienia ogólne</H2>
      <P>
        Niniejszy regulamin określa warunki korzystania z usługi InfraDesk
        świadczonej drogą elektroniczną przez podmiot z siedzibą przy
        ul. Żeromskiego 28, 08-400 Garwolin (oddział: ul. Piaskowa 1E, 05-110 Jabłonna),
        NIP 8261941094.
      </P>

      <H2>§2. Definicje</H2>
      <Ul>
        <li><strong>Usługa</strong> — aplikacja InfraDesk dostępna pod adresem infradesk.pl wraz z modułami uruchamianymi w ramach abonamentu.</li>
        <li><strong>Workspace</strong> — wyizolowane środowisko klienta zawierające jego dane, użytkowników, urządzenia i konfigurację.</li>
        <li><strong>Plan</strong> — wariant rozliczenia (Start, Team, Pro, Enterprise) określający limity i dostępne moduły.</li>
        <li><strong>Trial</strong> — bezpłatny 30-dniowy okres testowy planu Pro.</li>
      </Ul>

      <H2>§3. Zawarcie umowy</H2>
      <P>
        Umowa zostaje zawarta z chwilą rejestracji workspace przez Klienta i akceptacji niniejszego regulaminu.
        Rejestrując konto, Klient otrzymuje 30 dni bezpłatnego dostępu do planu Pro.
        Po zakończeniu triala konto przechodzi automatycznie na plan Start (49 zł netto / mc),
        chyba że Klient wybierze inny plan.
      </P>

      <H2>§4. Płatności i fakturowanie</H2>
      <P>
        Opłaty są naliczane z góry — miesięcznie albo rocznie (z 20% rabatem).
        Faktura VAT wystawiana jest w pierwszym dniu okresu rozliczeniowego, dostępna w panelu klienta i wysyłana przez KSeF.
        Brak płatności w terminie 14 dni skutkuje wstrzymaniem dostępu do modułów płatnych — dane pozostają zachowane przez 90 dni.
      </P>

      <H2>§5. Wypowiedzenie</H2>
      <P>
        Klient może wypowiedzieć umowę w dowolnym momencie z poziomu panelu (Plan i moduły → Anuluj).
        Środki za niewykorzystany okres nie są zwracane, ale dostęp pozostaje aktywny do końca opłaconego cyklu.
      </P>

      <H2>§6. Odpowiedzialność i SLA</H2>
      <P>
        Dla planów Start i Team usługa jest świadczona w trybie best-effort bez gwarancji dostępności.
        Dla planu Pro stosujemy SLA 99,5%, dla Enterprise — 99,9%, z karami umownymi szczegółowo opisanymi w odrębnej umowie SLA.
        Usługodawca nie odpowiada za szkody pośrednie, utratę zysków oraz przerwy spowodowane czynnikami niezależnymi.
      </P>

      <H2>§7. Postanowienia końcowe</H2>
      <P>
        Regulamin może być zmieniany za 14-dniowym uprzedzeniem mailowym.
        Spory rozstrzyga sąd właściwy dla siedziby Usługodawcy.
        W sprawach nieuregulowanych stosuje się prawo polskie.
      </P>
    </article>
  );
}

function Prywatnosc() {
  return (
    <article>
      <H1>Polityka prywatności</H1>
      <P>Wersja z 22 kwietnia 2026 r.</P>

      <H2>1. Administrator danych</H2>
      <P>
        Administratorem Twoich danych jest podmiot prowadzący InfraDesk (NIP 8261941094),
        z siedzibą przy ul. Żeromskiego 28, 08-400 Garwolin.
        Kontakt: <a className="text-pri hover:underline" href="mailto:biuro@silers.pl">biuro@silers.pl</a>,
        tel. <a className="text-pri hover:underline" href="tel:+48575662664">+48 575 662 664</a>.
      </P>

      <H2>2. Jakie dane zbieramy</H2>
      <Ul>
        <li>Dane konta: imię, nazwisko, adres e-mail, telefon (opcjonalnie).</li>
        <li>Dane firmy: nazwa, NIP, adres — wykorzystywane do faktur.</li>
        <li>Dane techniczne: adres IP, przeglądarka, znaczniki czasowe logowań — w celach bezpieczeństwa i audytu.</li>
        <li>Dane przetwarzane w ramach Twojego workspace (zgłoszenia, urządzenia, hasła w sejfie) — pozostają Twoją własnością. Usługodawca jest tylko procesorem.</li>
      </Ul>

      <H2>3. Cookies</H2>
      <P>
        Używamy wyłącznie cookies niezbędnych do działania serwisu (sesja, preferencje motywu).
        Nie stosujemy cookies marketingowych ani nie przekazujemy danych firmom trzecim w celach reklamowych.
      </P>

      <H2>4. Subprocesorzy</H2>
      <P>
        W zakresie infrastruktury i komunikacji korzystamy z:
      </P>
      <Ul>
        <li>Mailgun — wysyłka maili transakcyjnych (powiadomienia, faktury)</li>
        <li>Anthropic / OpenAI — opcjonalnie, jeśli włączysz moduł AI Iris (możesz wyłączyć)</li>
        <li>Hetzner — serwery w Niemczech (UE)</li>
      </Ul>
      <P>Wszyscy podpisali umowy DPA. Lista jest aktualizowana — zapytaj o aktualną wersję mailem.</P>

      <H2>5. Twoje prawa</H2>
      <Ul>
        <li>Dostęp do danych — w panelu / mailem.</li>
        <li>Sprostowanie i usunięcie — z poziomu panelu albo na życzenie mailowe.</li>
        <li>Eksport — pełen dump JSON Twojego workspace dostępny na zlecenie (kontakt mailowy).</li>
        <li>Skarga do PUODO (Prezes Urzędu Ochrony Danych Osobowych) — przy podejrzeniu naruszenia.</li>
      </Ul>
    </article>
  );
}

function Rodo() {
  return (
    <article>
      <H1>Klauzula informacyjna RODO</H1>
      <P>(zgodnie z art. 13 RODO)</P>

      <H2>Administrator</H2>
      <P>
        Podmiot prowadzący InfraDesk, NIP 8261941094,
        z siedzibą przy ul. Żeromskiego 28, 08-400 Garwolin.
        Oddział: ul. Piaskowa 1E, 05-110 Jabłonna.
      </P>

      <H2>Cele przetwarzania</H2>
      <Ul>
        <li>Świadczenie usługi InfraDesk (art. 6 ust. 1 lit. b RODO — wykonanie umowy).</li>
        <li>Wystawianie faktur VAT (art. 6 ust. 1 lit. c RODO — obowiązek prawny).</li>
        <li>Marketing własnych usług na podstawie zgody (art. 6 ust. 1 lit. a RODO — możesz cofnąć w dowolnym momencie).</li>
        <li>Bezpieczeństwo i audyt (art. 6 ust. 1 lit. f RODO — uzasadniony interes).</li>
      </Ul>

      <H2>Okres przechowywania</H2>
      <Ul>
        <li>Dane konta — przez czas trwania umowy + 90 dni grace period.</li>
        <li>Faktury — 5 lat (obowiązek księgowy).</li>
        <li>Logi audytowe — 12 miesięcy.</li>
      </Ul>

      <H2>Powierzenie i transfery</H2>
      <P>
        Wszystkie dane są przetwarzane w UE.
        Jeśli aktywujesz moduł AI Iris z dostawcą zewnętrznym (np. Anthropic) — niektóre prompty mogą być
        wysyłane poza EOG. Możesz to wyłączyć w ustawieniach workspace.
      </P>

      <H2>Twoje prawa</H2>
      <Ul>
        <li>Prawo dostępu, sprostowania, usunięcia, ograniczenia przetwarzania.</li>
        <li>Prawo do przenoszenia danych (eksport JSON workspace).</li>
        <li>Prawo do wniesienia sprzeciwu i skargi do PUODO.</li>
      </Ul>

      <P>
        Kontakt w sprawach RODO: <a className="text-pri hover:underline" href="mailto:rodo@silers.pl">rodo@silers.pl</a>
      </P>
    </article>
  );
}

const LEGAL_META: Record<LegalKey, { title: string; description: string }> = {
  regulamin:  { title: 'Regulamin',            description: 'Regulamin świadczenia usług InfraDesk. Plany, płatności, SLA, wypowiedzenie.' },
  prywatnosc: { title: 'Polityka prywatności', description: 'Jakie dane zbieramy, kto je przetwarza, Twoje prawa zgodnie z RODO.' },
  rodo:       { title: 'RODO',                 description: 'Klauzula informacyjna RODO — administrator, cele, okres przechowywania, prawa.' },
};

export function LegalPage() {
  const { pathname } = useLocation();
  const activeKey: LegalKey = pathname.includes('rodo')
    ? 'rodo'
    : pathname.includes('prywatnosc')
      ? 'prywatnosc'
      : 'regulamin';
  usePageMeta(LEGAL_META[activeKey]);

  return (
    <div className="px-5 py-12 md:py-16">
      <div className="max-w-[860px] mx-auto">
        <div
          className="inline-flex rounded-[var(--r-s)] border p-0.5 mb-8 flex-wrap"
          style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
          role="tablist"
        >
          {TABS.map((t) => {
            const active = t.key === activeKey;
            return (
              <Link
                key={t.key}
                to={t.path}
                role="tab"
                aria-selected={active}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-[var(--r-xs)] transition-colors"
                style={{
                  background: active ? 'var(--sf)' : 'transparent',
                  color: active ? 'var(--tx)' : 'var(--tx3)',
                  boxShadow: active ? 'var(--sh1)' : 'none',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <div
          className="rounded-[var(--r-l)] p-6 md:p-10 border"
          style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}
        >
          {activeKey === 'regulamin'  && <Regulamin />}
          {activeKey === 'prywatnosc' && <Prywatnosc />}
          {activeKey === 'rodo'       && <Rodo />}
        </div>

        <p className="text-[11px] text-tx3 text-center mt-6">
          Masz pytanie? Napisz na <a className="text-pri hover:underline" href="mailto:biuro@silers.pl">biuro@silers.pl</a> — odpowiadamy w 1-2 dni robocze.
        </p>
      </div>
    </div>
  );
}

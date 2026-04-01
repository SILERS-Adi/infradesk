import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

type Tab = 'regulamin' | 'prywatnosc' | 'rodo' | 'platnosci';

const COMPANY = {
  name: 'SILERS — Błaszczykowski Adrian',
  address: 'ul. Żeromskiego 29, 08-400 Garwolin',
  nip: '826-194-10-94',
  regon: '142599930',
  email: 'kontakt@infradesk.pl',
  rodoEmail: 'rodo@silers.pl',
  iod: 'Adrian Błaszczykowski',
};

export default function LegalPage() {
  const location = useLocation();
  const path = location.pathname.replace('/', '');
  const [tab, setTab] = useState<Tab>(
    path === 'prywatnosc' ? 'prywatnosc' : path === 'rodo' ? 'rodo' : path === 'platnosci' ? 'platnosci' : 'regulamin'
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'regulamin', label: 'Regulamin' },
    { id: 'prywatnosc', label: 'Polityka prywatności' },
    { id: 'rodo', label: 'RODO' },
    { id: 'platnosci', label: 'Płatności' },
  ];

  return (
    <div className="min-h-screen bg-[#040a16] text-white">
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-5xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-white/50 hover:text-white/80 text-sm">
          <ChevronLeft className="h-4 w-4" /> Strona główna
        </Link>
        <Link to="/login" className="text-sm text-white/40 hover:text-white/60">Zaloguj się</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 md:px-12 py-8">
        <div className="flex gap-1 p-1 rounded-xl mb-8" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all text-center"
              style={{
                background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: tab === t.id ? '#A78BFA' : 'rgba(255,255,255,0.4)',
              }}>{t.label}</button>
          ))}
        </div>

        <div className="prose prose-invert prose-sm max-w-none" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {tab === 'regulamin' && <Regulamin />}
          {tab === 'prywatnosc' && <Prywatnosc />}
          {tab === 'rodo' && <Rodo />}
          {tab === 'platnosci' && <Platnosci />}
        </div>
      </div>

      <footer className="px-6 py-8 text-center text-xs text-white/20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        © {new Date().getFullYear()} {COMPANY.name}. Wszelkie prawa zastrzeżone.
      </footer>
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) { return <h1 className="text-2xl font-bold text-white/85 mb-6">{children}</h1>; }
function H2({ children }: { children: React.ReactNode }) { return <h2 className="text-lg font-semibold text-white/75 mt-8 mb-3">{children}</h2>; }
function P({ children }: { children: React.ReactNode }) { return <p className="mb-3 leading-relaxed">{children}</p>; }

function Regulamin() {
  return (<>
    <H1>Regulamin świadczenia usług InfraDesk</H1>
    <P>Obowiązuje od: 28 marca 2026 r.</P>

    <H2>§1. Postanowienia ogólne</H2>
    <P>1. Niniejszy Regulamin określa zasady świadczenia usług drogą elektroniczną za pośrednictwem platformy InfraDesk (dalej: „Platforma") dostępnej pod adresem infradesk.pl.</P>
    <P>2. Operatorem Platformy jest {COMPANY.name}, z siedzibą pod adresem {COMPANY.address}, NIP: {COMPANY.nip}, REGON: {COMPANY.regon} (dalej: „Operator").</P>
    <P>3. Korzystanie z Platformy oznacza akceptację niniejszego Regulaminu.</P>

    <H2>§2. Definicje</H2>
    <P>a) <strong>Platforma</strong> — serwis internetowy InfraDesk wraz z aplikacją agenta desktopowego.</P>
    <P>b) <strong>Użytkownik</strong> — osoba fizyczna, prawna lub jednostka organizacyjna korzystająca z Platformy.</P>
    <P>c) <strong>Konto</strong> — indywidualny profil Użytkownika umożliwiający korzystanie z usług.</P>
    <P>d) <strong>Agent</strong> — oprogramowanie instalowane na urządzeniu Użytkownika w celu monitorowania i zarządzania.</P>
    <P>e) <strong>Tenant</strong> — wydzielone środowisko Użytkownika w ramach Platformy.</P>
    <P>f) <strong>Plan</strong> — wybrany przez Użytkownika pakiet funkcjonalności (Personal, Business, MSP).</P>

    <H2>§3. Rodzaje kont</H2>
    <P>1. <strong>InfraDesk Personal</strong> — bezpłatne konto dla użytkowników indywidualnych. Obejmuje monitoring do 3 urządzeń, audyt bezpieczeństwa, optymalizację systemu oraz dostęp do płatnej pomocy zdalnej.</P>
    <P>2. <strong>InfraDesk Business</strong> — płatne konto dla firm zarządzających własną infrastrukturą IT. Obejmuje nieograniczoną liczbę urządzeń, zgłoszenia serwisowe, backup, CRM i możliwość zapraszania partnerów IT.</P>
    <P>3. <strong>InfraDesk MSP</strong> — płatne konto dla firm IT (Managed Service Provider). Obejmuje tworzenie kont klientów, kontrolę modułów, wielopoziomowe zarządzanie.</P>

    <H2>§4. Rejestracja i konto</H2>
    <P>1. Rejestracja wymaga podania adresu e-mail, hasła oraz danych identyfikacyjnych.</P>
    <P>2. Hasło musi spełniać wymagania bezpieczeństwa: min. 8 znaków, wielka i mała litera, cyfra, znak specjalny.</P>
    <P>3. Użytkownik zobowiązuje się do podania prawdziwych danych.</P>
    <P>4. Operator zastrzega prawo do zawieszenia lub usunięcia konta w przypadku naruszenia Regulaminu.</P>

    <H2>§5. Agent desktopowy</H2>
    <P>1. Agent jest oprogramowaniem instalowanym dobrowolnie przez Użytkownika.</P>
    <P>2. Agent zbiera dane o systemie operacyjnym, sprzęcie, metrykach wydajności, zainstalowanym oprogramowaniu oraz stanie bezpieczeństwa.</P>
    <P>3. Dane są przesyłane szyfrowanym połączeniem do serwerów Operatora.</P>
    <P>4. Użytkownik może w każdej chwili odinstalować Agenta.</P>

    <H2>§6. Płatności</H2>
    <P>1. Płatności za usługi płatne realizowane są za pośrednictwem systemu Paynow (mBank S.A.).</P>
    <P>2. Ceny podane na Platformie są cenami brutto (zawierają podatek VAT).</P>
    <P>3. Płatności za usługi pomocy zdalnej (AI Care, AI Repair, Technik Live) są jednorazowe.</P>
    <P>4. Płatności za plany abonamentowe (Business, MSP) rozliczane są miesięcznie.</P>
    <P>5. Operator wystawia fakturę VAT na żądanie Użytkownika.</P>

    <H2>§7. Pomoc zdalna i AI</H2>
    <P>1. Usługi AI Care i AI Repair wykorzystują sztuczną inteligencję do diagnostyki i naprawy problemów.</P>
    <P>2. AI może wykonywać skrypty PowerShell na urządzeniu Użytkownika wyłącznie po jego wyraźnej zgodzie.</P>
    <P>3. Operator nie ponosi odpowiedzialności za skutki działania skryptów zatwierdzonych przez Użytkownika.</P>
    <P>4. Szacowany czas i koszt naprawy mają charakter orientacyjny.</P>

    <H2>§8. Odpowiedzialność</H2>
    <P>1. Operator dokłada wszelkich starań aby zapewnić ciągłość i jakość usług.</P>
    <P>2. Operator nie ponosi odpowiedzialności za przerwy wynikające z przyczyn niezależnych (siła wyższa, awarie infrastruktury zewnętrznej).</P>
    <P>3. Odpowiedzialność Operatora ograniczona jest do wartości opłat uiszczonych przez Użytkownika w okresie ostatnich 3 miesięcy.</P>

    <H2>§9. Reklamacje</H2>
    <P>1. Reklamacje należy zgłaszać na adres {COMPANY.email}.</P>
    <P>2. Operator rozpatruje reklamacje w terminie 14 dni roboczych.</P>

    <H2>§10. Postanowienia końcowe</H2>
    <P>1. Operator zastrzega prawo do zmiany Regulaminu. O zmianach Użytkownicy zostaną poinformowani drogą elektroniczną z 14-dniowym wyprzedzeniem.</P>
    <P>2. W sprawach nieuregulowanych niniejszym Regulaminem zastosowanie mają przepisy prawa polskiego.</P>
    <P>3. Spory rozstrzyga sąd właściwy dla siedziby Operatora.</P>
  </>);
}

function Prywatnosc() {
  return (<>
    <H1>Polityka prywatności</H1>
    <P>Obowiązuje od: 28 marca 2026 r.</P>

    <H2>1. Administrator danych</H2>
    <P>Administratorem danych osobowych jest {COMPANY.name}, {COMPANY.address}, NIP: {COMPANY.nip}.</P>

    <H2>2. Kontakt w sprawie danych osobowych</H2>
    <P>Inspektor Ochrony Danych: {COMPANY.iod}, e-mail: {COMPANY.rodoEmail}.</P>

    <H2>3. Jakie dane zbieramy</H2>
    <P><strong>Dane konta:</strong> imię, nazwisko, adres e-mail, numer telefonu, nazwa firmy, NIP.</P>
    <P><strong>Dane z agenta:</strong> nazwa komputera, system operacyjny, wersja Windows, model CPU/GPU/RAM, adresy IP i MAC, lista zainstalowanych programów, metryki wydajności (CPU, RAM, dysk, temperatura), wyniki audytu bezpieczeństwa, skan sieci lokalnej.</P>
    <P><strong>Dane płatności:</strong> przetwarzane przez Paynow (mBank S.A.) — nie przechowujemy numerów kart.</P>
    <P><strong>Logi systemowe:</strong> adresy IP, daty logowania, aktywność w systemie.</P>

    <H2>4. Cele przetwarzania</H2>
    <P>a) Świadczenie usług Platformy (art. 6 ust. 1 lit. b RODO)</P>
    <P>b) Monitoring i zarządzanie infrastrukturą IT (art. 6 ust. 1 lit. b RODO)</P>
    <P>c) Diagnostyka i naprawa problemów (art. 6 ust. 1 lit. a RODO — zgoda)</P>
    <P>d) Rozliczenia i faktury (art. 6 ust. 1 lit. c RODO)</P>
    <P>e) Marketing własny (art. 6 ust. 1 lit. f RODO — uzasadniony interes)</P>

    <H2>5. Okres przechowywania</H2>
    <P>Dane konta: do momentu usunięcia konta + 30 dni.</P>
    <P>Dane agenta (metryki): 90 dni od zebrania.</P>
    <P>Dane rozliczeniowe: 5 lat (obowiązek podatkowy).</P>
    <P>Logi systemowe: 12 miesięcy.</P>

    <H2>6. Udostępnianie danych</H2>
    <P>Dane mogą być udostępniane:</P>
    <P>a) Paynow (mBank S.A.) — w celu realizacji płatności</P>
    <P>b) Anthropic — w celu realizacji diagnostyki AI (anonimizowane dane techniczne)</P>
    <P>c) Firmom IT partnerskim — wyłącznie dane urządzeń udostępnionych przez Użytkownika</P>
    <P>d) Organom państwowym — na podstawie przepisów prawa</P>

    <H2>7. Pliki cookies</H2>
    <P>Platforma wykorzystuje pliki cookies w celu utrzymania sesji logowania i preferencji interfejsu. Brak cookies reklamowych.</P>

    <H2>8. Bezpieczeństwo</H2>
    <P>Dane przesyłane są szyfrowanym połączeniem TLS. Hasła przechowywane w postaci skrótu bcrypt. Dostęp do danych ograniczony jest do uprawnionych pracowników.</P>

    <H2>9. Prawa Użytkownika</H2>
    <P>Zgodnie z RODO, Użytkownik ma prawo do: dostępu do danych, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu, cofnięcia zgody. Wnioski: {COMPANY.rodoEmail}.</P>
  </>);
}

function Rodo() {
  return (<>
    <H1>Klauzula informacyjna RODO</H1>
    <P>Obowiązuje od: 28 marca 2026 r.</P>

    <P>Zgodnie z art. 13 ust. 1 i 2 Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO), informujemy:</P>

    <H2>1. Administrator danych osobowych</H2>
    <P>{COMPANY.name}, {COMPANY.address}, NIP: {COMPANY.nip}, REGON: {COMPANY.regon}.</P>

    <H2>2. Inspektor Ochrony Danych</H2>
    <P>{COMPANY.iod}, kontakt: {COMPANY.rodoEmail}.</P>

    <H2>3. Cele i podstawy przetwarzania</H2>
    <P>a) <strong>Realizacja umowy</strong> (art. 6 ust. 1 lit. b) — świadczenie usług platformy InfraDesk, monitoring infrastruktury, obsługa zgłoszeń.</P>
    <P>b) <strong>Obowiązek prawny</strong> (art. 6 ust. 1 lit. c) — prowadzenie dokumentacji podatkowej i rachunkowej.</P>
    <P>c) <strong>Zgoda</strong> (art. 6 ust. 1 lit. a) — diagnostyka AI, wykonywanie skryptów naprawczych, newsletter.</P>
    <P>d) <strong>Uzasadniony interes</strong> (art. 6 ust. 1 lit. f) — bezpieczeństwo systemu, analityka, dochodzenie roszczeń.</P>

    <H2>4. Kategorie danych</H2>
    <P>Dane identyfikacyjne (imię, nazwisko, e-mail, telefon, NIP), dane techniczne (parametry sprzętowe, adresy sieciowe, oprogramowanie), dane rozliczeniowe.</P>

    <H2>5. Odbiorcy danych</H2>
    <P>Paynow/mBank S.A. (płatności), Anthropic PBC (diagnostyka AI — dane zanonimizowane), podmioty partnerskie IT (wyłącznie za zgodą użytkownika), organy państwowe (na podstawie prawa).</P>

    <H2>6. Przekazywanie poza EOG</H2>
    <P>Dane techniczne mogą być przekazywane do Anthropic PBC (USA) na podstawie standardowych klauzul umownych (art. 46 ust. 2 lit. c RODO). Dane są anonimizowane przed przekazaniem.</P>

    <H2>7. Okres przechowywania</H2>
    <P>Dane konta: czas trwania umowy + 30 dni. Metryki: 90 dni. Dane podatkowe: 5 lat. Logi: 12 miesięcy.</P>

    <H2>8. Prawa osoby, której dane dotyczą</H2>
    <P>Prawo dostępu (art. 15), sprostowania (art. 16), usunięcia (art. 17), ograniczenia przetwarzania (art. 18), przenoszenia (art. 20), sprzeciwu (art. 21), cofnięcia zgody (art. 7 ust. 3).</P>
    <P>Realizacja praw: {COMPANY.rodoEmail}. Termin odpowiedzi: 30 dni.</P>

    <H2>9. Prawo do skargi</H2>
    <P>Użytkownik ma prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).</P>

    <H2>10. Zautomatyzowane podejmowanie decyzji</H2>
    <P>Platforma wykorzystuje AI do diagnostyki problemów technicznych i szacowania kosztów naprawy. Decyzje AI mają charakter rekomendacyjny — ostateczna decyzja należy do Użytkownika.</P>

    <H2>11. Dobrowolność podania danych</H2>
    <P>Podanie danych jest dobrowolne, lecz niezbędne do korzystania z Platformy. Instalacja Agenta i udostępnienie danych technicznych jest dobrowolne.</P>
  </>);
}

function Platnosci() {
  return (<>
    <H1>Regulamin płatności</H1>
    <P>Obowiązuje od: 28 marca 2026 r.</P>

    <H2>§1. Operator płatności</H2>
    <P>1. Płatności za usługi świadczone za pośrednictwem platformy InfraDesk realizowane są przez Paynow — usługę płatniczą udostępnianą przez mBank S.A. z siedzibą w Warszawie (ul. Prosta 18, 00-850 Warszawa), wpisany do rejestru przedsiębiorców KRS pod nr 0000025237, NIP: 526-021-50-88.</P>
    <P>2. Sprzedawcą usług i stroną umowy z Użytkownikiem jest {COMPANY.name}, {COMPANY.address}, NIP: {COMPANY.nip}.</P>

    <H2>§2. Dostępne metody płatności</H2>
    <P>1. Przelew online (pay-by-link) — natychmiastowy przelew z banku Użytkownika.</P>
    <P>2. BLIK — płatność kodem BLIK z aplikacji mobilnej banku.</P>
    <P>3. Karta płatnicza — Visa, Mastercard (obsługiwana przez Paynow/mBank).</P>
    <P>4. Operator zastrzega prawo do zmiany dostępnych metod płatności.</P>

    <H2>§3. Rodzaje opłat</H2>
    <P><strong>Jednorazowe (pay-per-use):</strong></P>
    <P>a) AI Care (diagnostyka) — od 9 zł brutto</P>
    <P>b) AI Repair (diagnostyka + automatyczna naprawa) — od 29 zł brutto</P>
    <P>c) Technik Live (zdalna pomoc technika) — od 89 zł brutto + ewentualna dopłata za czas ponad szacunkowy wg stawki godzinowej</P>
    <P><strong>Abonamentowe (cykliczne):</strong></P>
    <P>a) InfraDesk Business — od 49 zł brutto/miesiąc</P>
    <P>b) InfraDesk MSP — od 149 zł brutto/miesiąc</P>
    <P>Dokładne ceny zależą od wybranego planu i liczby zasobów.</P>

    <H2>§4. Realizacja płatności</H2>
    <P>1. Po wybraniu usługi Użytkownik jest przekierowywany na stronę płatności Paynow.</P>
    <P>2. Transakcja jest ważna przez czas określony na stronie płatności (domyślnie 60 minut).</P>
    <P>3. Usługa jest aktywowana po otrzymaniu potwierdzenia płatności (status CONFIRMED).</P>
    <P>4. W przypadku błędu płatności (status ERROR, REJECTED) usługa nie jest aktywowana. Środki nie są pobierane.</P>

    <H2>§5. Ceny i waluta</H2>
    <P>1. Wszystkie ceny podane na Platformie są cenami brutto wyrażonymi w złotych polskich (PLN) i zawierają podatek VAT.</P>
    <P>2. Operator zastrzega prawo do zmiany cen. Zmiana nie dotyczy transakcji już opłaconych ani aktywnych abonamentów do końca bieżącego okresu rozliczeniowego.</P>

    <H2>§6. Faktury</H2>
    <P>1. Na żądanie Użytkownika Operator wystawia fakturę VAT.</P>
    <P>2. Żądanie wystawienia faktury należy zgłosić na adres {COMPANY.email} podając dane do faktury.</P>
    <P>3. Faktura jest udostępniana w formie elektronicznej (PDF).</P>

    <H2>§7. Zwroty i reklamacje</H2>
    <P>1. Użytkownik będący konsumentem ma prawo do odstąpienia od umowy w terminie 14 dni od dnia zakupu, chyba że usługa została w pełni wykonana za wyraźną zgodą konsumenta.</P>
    <P>2. W przypadku usług AI Care / AI Repair — jeśli diagnoza/naprawa została rozpoczęta, prawo odstąpienia nie przysługuje (art. 38 pkt 1 ustawy o prawach konsumenta).</P>
    <P>3. Reklamacje dotyczące płatności należy kierować na adres {COMPANY.email}. Termin rozpatrzenia: 14 dni roboczych.</P>
    <P>4. Reklamacje dotyczące samej transakcji płatniczej (np. podwójne obciążenie) należy zgłaszać do Paynow/mBank zgodnie z ich regulaminem.</P>

    <H2>§8. Bezpieczeństwo płatności</H2>
    <P>1. Platforma InfraDesk nie przechowuje danych kart płatniczych. Wszystkie dane płatnicze przetwarzane są bezpośrednio przez Paynow (mBank S.A.).</P>
    <P>2. Połączenie z bramką płatności zabezpieczone jest protokołem TLS.</P>
    <P>3. Paynow spełnia wymagania standardu PCI DSS.</P>

    <H2>§9. Postanowienia końcowe</H2>
    <P>1. Niniejszy regulamin płatności stanowi integralną część Regulaminu świadczenia usług InfraDesk.</P>
    <P>2. W sprawach nieuregulowanych zastosowanie mają przepisy ustawy o świadczeniu usług drogą elektroniczną, ustawy o prawach konsumenta oraz Kodeksu cywilnego.</P>
  </>);
}

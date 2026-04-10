import {
  LayoutDashboard, Ticket, Monitor, MapPin, KeyRound, Users, ShoppingCart,
  Phone, ClipboardList, Calendar, Route, Timer, Settings, Shield, Download,
  HardDrive, Activity, Receipt, Share2, Bell, BarChart3, Inbox, Globe,
  Smartphone, FileText, Wrench, UserCheck, Eye, PlusCircle, Search,
  Filter, ArrowUpDown, Pencil, Trash2, Send, Lock, Star, Clock,
  Building2, Cpu, Wifi, RefreshCw, FolderOpen, Tag,
} from 'lucide-react';
import type { HelpPanelProps } from '../components/ui/HelpPanel';

/* ═══════════════════════════════════════════════════════════════════
   Centralna baza treści pomocy — po polsku, szczegółowo.
   Każdy klucz odpowiada ścieżce strony.
   ═══════════════════════════════════════════════════════════════════ */

export const helpContent: Record<string, HelpPanelProps> = {

  /* ── DASHBOARD ──────────────────────────────────────────────────── */
  dashboard: {
    description: 'Panel główny to Twoje centrum dowodzenia. Widzisz tutaj najważniejsze statystyki, ostatnie zgłoszenia, aktywne zadania i stan infrastruktury. Wszystko w jednym miejscu, żebyś nie musiał przeskakiwać między stronami.',
    sections: [
      { icon: <BarChart3 size={14} />, title: 'Statystyki i liczniki', content: 'Na górze strony widzisz kafelki ze statystykami: liczba otwartych zgłoszeń, aktywnych urządzeń, zadań do wykonania i sesji. Kliknij dowolny kafelek, żeby przejść do szczegółów.' },
      { icon: <Ticket size={14} />, title: 'Ostatnie zgłoszenia', content: 'Lista najnowszych zgłoszeń serwisowych. Widzisz tytuł, priorytet, status i kto jest przypisany. Kliknij zgłoszenie, aby zobaczyć szczegóły i dodać komentarz.' },
      { icon: <ClipboardList size={14} />, title: 'Zadania do wykonania', content: 'Twoje najbliższe zadania z terminami. Zadania są powiązane ze zgłoszeniami — gdy ukończysz zadanie, zgłoszenie automatycznie zmieni status na „Zakończone".' },
      { icon: <Activity size={14} />, title: 'Aktywność systemu', content: 'Na dole strony znajdziesz ostatnią aktywność: kto co zrobił, jakie zmiany wprowadzono. Pomaga śledzić pracę zespołu.' },
    ],
    tips: [
      'Dashboard odświeża się automatycznie co 30 sekund — nie musisz ręcznie odświeżać strony.',
      'Kafelki statystyk są klickalne — prowadzą do odpowiednich stron z pełną listą.',
      'Jeśli widzisz czerwone liczniki, oznacza to przeterminowane zgłoszenia wymagające pilnej uwagi.',
    ],
  },

  /* ── ZGŁOSZENIA ─────────────────────────────────────────────────── */
  tickets: {
    description: 'Tutaj zarządzasz wszystkimi zgłoszeniami serwisowymi. Możesz tworzyć nowe, przypisywać technikom, śledzić postępy i komunikować się z klientami. Każde zgłoszenie ma priorytet, status i termin SLA.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Tworzenie zgłoszenia', content: 'Kliknij „Nowe zgłoszenie" w prawym górnym rogu. Wybierz lokalizację, urządzenie (opcjonalnie), typ problemu, priorytet i opisz szczegółowo problem. Im dokładniejszy opis, tym szybciej technik rozwiąże sprawę.' },
      { icon: <Filter size={14} />, title: 'Zakładki i filtrowanie', content: 'Zgłoszenia są podzielone na zakładki: Oczekujące (nowe, bez technika), Przydzielone (ktoś pracuje), Zakończone i Anulowane. Użyj pola wyszukiwania, aby szybko znaleźć konkretne zgłoszenie po tytule, numerze lub lokalizacji.' },
      { icon: <UserCheck size={14} />, title: 'Przypisywanie technika', content: 'W zakładce „Oczekujące" przy każdym zgłoszeniu widzisz przycisk „Przydziel pracownika". Kliknij, wybierz technika z listy — dostanie powiadomienie. Możesz też zmienić przypisanie w szczegółach zgłoszenia.' },
      { icon: <ArrowUpDown size={14} />, title: 'Sortowanie i kolumny', content: 'Kliknij nagłówek kolumny, aby posortować tabelę. Przycisk „Kolumny" pozwala wybrać, które kolumny są widoczne, i zmienić ich kolejność przeciągając.' },
      { icon: <Clock size={14} />, title: 'SLA i terminy', content: 'Kolumna SLA pokazuje ile czasu zostało do terminu. Zielone „OK" = dotrzymano. Żółta liczba = mało czasu. Czerwone „PRZETERMINOWANE" = przekroczono termin — wymaga natychmiastowej uwagi.' },
      { icon: <Star size={14} />, title: 'Ocena klienta', content: 'Po zakończeniu zgłoszenia klient może wystawić ocenę 1-3 gwiazdki z opcjonalnym komentarzem. Oceny widzisz w kolumnie „Ocena" — pomagają monitorować jakość obsługi.' },
    ],
    tips: [
      'Możesz wyszukiwać po numerze zgłoszenia (np. TKT-2026-0042), tytule lub nazwie lokalizacji.',
      'Priorytet „Krytyczny" oznacza awarię krytycznej infrastruktury — reaguj natychmiast.',
      'Komentarze oznaczone kłódką (🔒) są wewnętrzne — klient ich nie widzi.',
    ],
  },

  /* ── KOLEJKA ZGŁOSZEŃ ───────────────────────────────────────────── */
  ticketsQueue: {
    description: 'Poczekalnia to widok nowych zgłoszeń, które nie mają jeszcze przypisanego technika. Tutaj szybko przydzielasz pracowników do kolejnych spraw.',
    sections: [
      { icon: <Inbox size={14} />, title: 'Jak działa poczekalnia', content: 'Gdy klient lub system tworzy nowe zgłoszenie, trafia tutaj. Zgłoszenia są posortowane według priorytetu (krytyczne na górze) i czasu utworzenia. Twoim zadaniem jest przydzielić każde zgłoszenie odpowiedniemu technikowi.' },
      { icon: <UserCheck size={14} />, title: 'Przydzielanie', content: 'Kliknij „Przydziel pracownika" przy zgłoszeniu, wybierz technika z listy rozwijanej. Po przydzieleniu zgłoszenie znika z poczekalni i przechodzi do zakładki „Przydzielone" na liście zgłoszeń.' },
      { icon: <RefreshCw size={14} />, title: 'Odświeżanie', content: 'Lista odświeża się automatycznie co 30 sekund. Możesz też kliknąć ikonę odświeżania w prawym górnym rogu, żeby sprawdzić natychmiast.' },
    ],
    tips: [
      'Kolorowy pasek po lewej stronie karty oznacza priorytet: czerwony = krytyczny, pomarańczowy = wysoki.',
      'Kliknij tytuł zgłoszenia, aby otworzyć jego pełne szczegóły w nowej stronie.',
    ],
  },

  /* ── SZCZEGÓŁY ZGŁOSZENIA ───────────────────────────────────────── */
  ticketDetail: {
    description: 'Szczegóły zgłoszenia to pełen widok jednego zgłoszenia. Widzisz opis problemu, wiadomości, historię zmian i możesz zarządzać przypisaniem i statusem.',
    sections: [
      { icon: <Send size={14} />, title: 'Wiadomości i komentarze', content: 'Sekcja „Wiadomości" służy do komunikacji. Wpisz tekst i kliknij „Wyślij". Zaznacz „Notatka wewnętrzna" (ikona kłódki), żeby wiadomość była widoczna tylko dla zespołu, nie dla klienta.' },
      { icon: <Lock size={14} />, title: 'Notatki wewnętrzne', content: 'Wiadomości oznaczone żółtą ramką z kłódką to notatki wewnętrzne — klient ich nie widzi. Używaj do komunikacji technicznej między sobą.' },
      { icon: <UserCheck size={14} />, title: 'Zmiana technika', content: 'W panelu po prawej „Przypisz technika" wybierz inną osobę z listy i kliknij „Przypisz". Aktualny technik jest wyświetlony fioletową ramką powyżej.' },
      { icon: <Activity size={14} />, title: 'Historia zmian', content: 'Sekcja „Historia" pokazuje chronologicznie wszystkie zdarzenia: kto utworzył, kto zmienił status, kto skomentował. Pomaga śledzić przebieg obsługi.' },
    ],
    tips: [
      'Możesz edytować lub usunąć swoje komentarze — użyj ikonek ołówka i kosza.',
      'Przycisk „Anuluj zgłoszenie" jest nieodwracalny — zgłoszenie trafi do archiwum.',
    ],
  },

  /* ── RAPORTY ZGŁOSZEŃ ───────────────────────────────────────────── */
  ticketReports: {
    description: 'Raporty pomagają analizować wydajność obsługi serwisowej. Widzisz statystyki zgłoszeń w czasie, rozkład priorytetów i średni czas rozwiązywania.',
    sections: [
      { icon: <BarChart3 size={14} />, title: 'Wykres miesięczny', content: 'Wykres słupkowy pokazuje liczbę zgłoszeń w każdym miesiącu. Pozwala zauważyć trendy — np. czy liczba awarii rośnie, czy maleje.' },
      { icon: <BarChart3 size={14} />, title: 'Liczniki podsumowujące', content: 'Na górze widzisz karty: łączna liczba zgłoszeń, otwarte, rozwiązane. Pomagają szybko ocenić bieżący stan obsługi.' },
    ],
    tips: [
      'Regularnie sprawdzaj raporty, żeby wcześnie wykryć problematyczne lokalizacje lub urządzenia.',
    ],
  },

  /* ── URZĄDZENIA ─────────────────────────────────────────────────── */
  devices: {
    description: 'Baza urządzeń to inwentaryzacja Twojej infrastruktury IT. Każde urządzenie ma przypisaną lokalizację, dane techniczne, status gwarancji i opcjonalnie zdalny dostęp.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Dodawanie urządzenia', content: 'Kliknij „Dodaj urządzenie" i przejdź przez kreator krok po kroku: 1) Wybierz lub utwórz lokalizację, 2) Wpisz nazwę, tag i status urządzenia, 3) Uzupełnij dane techniczne (producent, model, numer seryjny, IP, MAC). Krok 3 jest opcjonalny — możesz go pominąć i uzupełnić później.' },
      { icon: <Search size={14} />, title: 'Wyszukiwanie', content: 'Pole wyszukiwania filtruje po nazwie urządzenia, nazwie lokalizacji, adresie IP, tagu, numerze seryjnym i nazwie hosta. Wpisz cokolwiek — wyniki filtrują się na bieżąco.' },
      { icon: <Cpu size={14} />, title: 'Szczegóły urządzenia', content: 'Kliknij wiersz w tabeli, aby otworzyć kartę urządzenia. Widzisz tam: dane techniczne, lokalizację na mapie, powiązane zgłoszenia, hasła z sejfu i metryki agenta (jeśli zainstalowany).' },
      { icon: <Wifi size={14} />, title: 'Status agenta', content: 'Zielona kropka przy urządzeniu oznacza, że agent InfraDesk jest zainstalowany i online. Szara = offline lub brak agenta. Agent umożliwia zdalne komendy i monitoring w czasie rzeczywistym.' },
      { icon: <Tag size={14} />, title: 'Tag i filtrowanie', content: 'Każde urządzenie może mieć unikalny tag (np. PC-BIURO-001). Tagi pomagają szybko identyfikować sprzęt. Możesz filtrować urządzenia po statusie i krytyczności.' },
    ],
    tips: [
      'Urządzenia oznaczone jako „Krytyczne" powinny mieć przypisaną osobę kontaktową i aktualną gwarancję.',
      'Zainstaluj agenta InfraDesk Business na komputerach, aby mieć zdalny dostęp i monitoring hardware.',
      'Numer seryjny jest kluczowy przy zgłoszeniach gwarancyjnych — zawsze go uzupełniaj.',
    ],
  },

  /* ── LOKALIZACJE ────────────────────────────────────────────────── */
  locations: {
    description: 'Lokalizacje to fizyczne miejsca, w których znajduje się Twoja infrastruktura — biura, serwerownie, magazyny, oddziały. Każde urządzenie i zgłoszenie jest powiązane z lokalizacją.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Dodawanie lokalizacji', content: 'Kliknij „Dodaj lokalizację". Wpisz nazwę (np. „Biuro Warszawa"), typ (biuro, magazyn, serwerownia...), adres i dane kontaktowe osoby odpowiedzialnej. Adres służy do wyświetlania na mapie i nawigacji techników.' },
      { icon: <MapPin size={14} />, title: 'Geolokalizacja', content: 'Po wpisaniu adresu możesz kliknąć „Geokoduj" — system automatycznie ustawi współrzędne GPS. Lokalizacja pojawi się na mapie, co pomaga technikom w planowaniu tras.' },
      { icon: <Monitor size={14} />, title: 'Powiązane urządzenia', content: 'Na karcie lokalizacji widzisz listę wszystkich urządzeń w tym miejscu. Możesz też dodać nowe urządzenie bezpośrednio z poziomu lokalizacji.' },
      { icon: <Ticket size={14} />, title: 'Powiązane zgłoszenia', content: 'Każde zgłoszenie jest przypisane do lokalizacji. Na karcie widzisz aktywne zgłoszenia dla tego miejsca — pomaga to monitorować problematyczne lokalizacje.' },
    ],
    tips: [
      'Dobrze nazwij lokalizacje — „Biuro Warszawa ul. Marszałkowska 10" jest lepsze niż „Biuro 1".',
      'Osoba kontaktowa to ktoś na miejscu, kto może pomóc technikowi (np. otworzyć drzwi, wskazać sprzęt).',
    ],
  },

  /* ── SEJF HASEŁ ─────────────────────────────────────────────────── */
  vault: {
    description: 'Sejf haseł to bezpieczne miejsce na przechowywanie poświadczeń — loginów, haseł, kluczy API, certyfikatów. Hasła są szyfrowane i dostępne tylko dla upoważnionych osób.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Dodawanie hasła', content: 'Kliknij „Dodaj wpis". Wybierz typ dostępu (np. SSH, RDP, Panel admina, VPN), wpisz nazwę, login, hasło, adres URL/host i opcjonalnie port. Możesz też przypisać hasło do konkretnej lokalizacji lub urządzenia.' },
      { icon: <Eye size={14} />, title: 'Podgląd hasła', content: 'Hasła są domyślnie ukryte (●●●●●●). Kliknij ikonkę oka, żeby odsłonić hasło na kilka sekund. Każde odsłonięcie jest bezpieczne — hasła nie są logowane.' },
      { icon: <FolderOpen size={14} />, title: 'Typy dostępu', content: 'Typy dostępu (np. SSH, RDP, WiFi) pomagają kategoryzować wpisy. Możesz tworzyć własne typy z niestandardowymi ikonami i kolorami.' },
      { icon: <Share2 size={14} />, title: 'Udostępnianie klientowi', content: 'Zaznacz „Udostępnij klientowi" przy wpisie, a hasło będzie widoczne w panelu klienta. Użyj tego np. dla haseł WiFi czy paneli drukarek, które klient powinien znać.' },
    ],
    tips: [
      'Używaj opisowych nazw, np. „Router biuro Warszawa — admin panel" zamiast „router1".',
      'Przypisz hasła do urządzeń — technik zobaczy je bezpośrednio na karcie urządzenia.',
      'Regularnie aktualizuj hasła, zwłaszcza po odejściu pracownika z firmy.',
    ],
  },

  /* ── UŻYTKOWNICY ────────────────────────────────────────────────── */
  users: {
    description: 'Zarządzanie członkami workspace — pracownikami (administratorzy, technicy) i użytkownikami klientów. Tutaj przypisujesz role, uprawnienia i kontrolujesz dostęp do systemu.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Dodawanie użytkownika', content: 'Kliknij „Dodaj użytkownika" i przejdź przez kreator: 1) Wybierz typ — pracownik lub klient, 2) Wpisz dane: imię, nazwisko, email, telefon, hasło, 3) Przypisz rolę i uprawnienia. Email musi być unikalny — służy jako login do systemu.' },
      { icon: <Shield size={14} />, title: 'Role i uprawnienia', content: 'Pracownicy mogą mieć rolę: Administrator (pełny dostęp) lub Technik (zgłoszenia, zadania, urządzenia). Klienci mają domyślnie dostęp tylko do swoich zgłoszeń. Możesz rozszerzyć uprawnienia klienta o: widok wszystkich zgłoszeń firmy, zamówienia, rozliczenia.' },
      { icon: <UserCheck size={14} />, title: 'Status aktywności', content: 'Przełącznik „Aktywny" kontroluje, czy użytkownik może się zalogować. Zamiast usuwać konto, dezaktywuj je — historia zgłoszeń zostanie zachowana.' },
      { icon: <KeyRound size={14} />, title: 'PIN pobierania', content: 'PIN pobierania to 4-cyfrowy kod, który chroni dostęp do plików do pobrania w panelu. Przydatny, gdy chcesz udostępnić instalator tylko konkretnej osobie.' },
    ],
    tips: [
      'Każdy użytkownik może mieć zdjęcie profilowe — pomaga identyfikować osoby w komentarzach.',
      'Dezaktywowany użytkownik nie może się zalogować, ale jego historia jest zachowana.',
      'Klientowi z uprawnieniem „Widok wszystkich" będą widoczne zgłoszenia całej firmy, nie tylko jego własne.',
    ],
  },

  /* ── ZAMÓWIENIA ──────────────────────────────────────────────────── */
  orders: {
    description: 'Zamówienia to lista sprzętu i usług zamawianych dla klientów. Śledź status każdego zamówienia od złożenia, przez akceptację, realizację, aż do montażu.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Tworzenie zamówienia', content: 'Użyj kreatora zamówień. Wybierz lokalizację, dodaj pozycje (nazwa, ilość, cena), ustaw priorytet i termin. Zamówienie dostaje automatyczny numer (ORD-YYYY-NNNN).' },
      { icon: <ArrowUpDown size={14} />, title: 'Statusy zamówień', content: 'Zamówienie przechodzi przez etapy: Nowe → Oczekuje na akceptację → W realizacji → Zamontowane. Na każdym etapie możesz przesunąć zamówienie do następnego statusu przyciskiem „→". Możesz też anulować zamówienie w dowolnym momencie.' },
      { icon: <Filter size={14} />, title: 'Filtrowanie', content: 'Zakładki statusów na górze pozwalają filtrować zamówienia. Kliknij „Wszystkie" aby zobaczyć pełną listę, lub wybierz konkretny status.' },
      { icon: <Settings size={14} />, title: 'Kolumny', content: 'Przycisk „Kolumny" otwiera edytor — włączaj/wyłączaj kolumny i przeciągaj je, żeby zmienić kolejność. Twoje ustawienia zapamiętują się w przeglądarce.' },
    ],
    tips: [
      'Kwota zamówienia oblicza się automatycznie z pozycji (ilość × cena).',
      'Zamówienie „Zamontowane" oznacza, że sprzęt jest już na miejscu i działa.',
    ],
  },

  /* ── CRM ─────────────────────────────────────────────────────────── */
  crm: {
    description: 'CRM to rejestr aktywności sprzedażowo-kontaktowych z klientami. Zapisuj rozmowy telefoniczne, spotkania, wyceny i korespondencję mailową w jednym miejscu.',
    sections: [
      { icon: <Phone size={14} />, title: 'Rozmowa telefoniczna', content: 'Zapisz notatkę z rozmowy: z kim rozmawiałeś, o czym, czy wymaga follow-upu. Wybierz osobę kontaktową i wpisz kluczowe ustalenia.' },
      { icon: <Send size={14} />, title: 'Korespondencja email', content: 'Zanotuj ważnego maila: temat, streszczenie, data. Pomaga śledzić komunikację bez przeszukiwania skrzynki.' },
      { icon: <Users size={14} />, title: 'Spotkanie', content: 'Zaplanuj lub zanotuj spotkanie: tytuł, miejsce, uczestnicy, notatki. Dobre do podsumowań po wizytach u klienta.' },
      { icon: <Receipt size={14} />, title: 'Wycena', content: 'Stwórz wpis wyceny: opis, wartość w zł, przypisany handlowiec. Pomaga śledzić pipeline sprzedażowy.' },
    ],
    tips: [
      'Zaznacz „Wymaga follow-upu" przy rozmowach i mailach, żeby nie zapomnieć o odpowiedzi.',
      'Kolumny można konfigurować tak samo jak w zamówieniach i zgłoszeniach.',
    ],
  },

  /* ── ZADANIA ─────────────────────────────────────────────────────── */
  tasks: {
    description: 'Zadania to konkretne prace do wykonania, powiązane ze zgłoszeniami. Każde zadanie ma technika, termin i status. Gdy zadanie jest „Zrealizowane", powiązane zgłoszenie automatycznie się zamyka.',
    sections: [
      { icon: <PlusCircle size={14} />, title: 'Tworzenie zadania', content: 'Kliknij „Nowe zadanie". Wpisz tytuł, opis, przypisz technika i ustaw termin. Możesz też podać szacowany czas realizacji w minutach — pomaga w planowaniu kalendarza.' },
      { icon: <ClipboardList size={14} />, title: 'Lista zadań', content: 'Zadania są pogrupowane po statusie: Nowe, W trakcie, Zrealizowane. Dla każdego widzisz: numer, tytuł, technika, termin, klienta i priorytet powiązanego zgłoszenia.' },
      { icon: <Monitor size={14} />, title: 'Szybkie akcje', content: 'Z poziomu listy możesz: zmienić status (Rozpocznij / Zakończ), otworzyć zdalny dostęp (RustDesk), zmienić termin lub przypisanie.' },
      { icon: <Calendar size={14} />, title: 'Widok kalendarza', content: 'Przełącz na widok kalendarza (zakładka Kalendarz), żeby zobaczyć zadania na osi czasu. Zadania bez terminu pojawią się w panelu „Nieprzypisane" po lewej — przeciągnij je na konkretny dzień.' },
    ],
    tips: [
      'Zadania mogą być grupowane po urządzeniu — włącz przełącznik „Grupuj po urządzeniu" na górze.',
      'Szacowany czas (np. 2h 30m) pomaga w planowaniu dnia pracy techników.',
      'Zrealizowanie zadania automatycznie zamyka powiązane zgłoszenie.',
    ],
  },

  /* ── KALENDARZ ──────────────────────────────────────────────────── */
  calendar: {
    description: 'Kalendarz wizualizuje zadania i sesje pracy na osi czasu. Przeciągaj zadania z panelu bocznego na konkretne dni, żeby zaplanować pracę zespołu.',
    sections: [
      { icon: <Calendar size={14} />, title: 'Widoki kalendarza', content: 'Przełączaj między widokiem miesięcznym, tygodniowym i dziennym za pomocą przycisków w prawym górnym rogu kalendarza.' },
      { icon: <ClipboardList size={14} />, title: 'Panel nieprzypisanych', content: 'Po lewej stronie widzisz zadania bez terminu. Chwyć zadanie za ikonkę uchwytu (⠿) i przeciągnij na konkretny dzień w kalendarzu — automatycznie ustawisz mu termin.' },
      { icon: <Timer size={14} />, title: 'Sesje pracy', content: 'Fioletowe bloki na kalendarzu to zarejestrowane sesje pracy techników. Zielone pulsujące = aktywna sesja (technik pracuje teraz).' },
    ],
    tips: [
      'Możesz przenosić zadania między dniami — po prostu przeciągnij blok na inny dzień.',
      'Kliknij zadanie na kalendarzu, żeby zobaczyć szczegóły w wyskakującym oknie.',
      'Legenda kolorów: niebieski = nowe zadanie, żółty = w trakcie, zielony = zrealizowane.',
    ],
  },

  /* ── DELEGACJE ──────────────────────────────────────────────────── */
  delegations: {
    description: 'Delegacje to planowane wyjazdy serwisowe techników do klientów. Śledź kto, kiedy i do kogo jedzie.',
    sections: [
      { icon: <Route size={14} />, title: 'Lista delegacji', content: 'Każda delegacja zawiera: cel podróży, przypisanego technika, termin i notatki. Użyj listy, żeby koordynować wyjazdy zespołu.' },
      { icon: <PlusCircle size={14} />, title: 'Tworzenie delegacji', content: 'Kliknij „Dodaj delegację". Podaj adres celu, datę i godzinę, przypisz technika i dodaj opis tego, co jest do zrobienia na miejscu.' },
    ],
    tips: [
      'Delegacje pomagają planować logistykę — jeśli dwóch techników jedzie w ten sam rejon, mogą się skoordynować.',
    ],
  },

  /* ── SESJE ──────────────────────────────────────────────────────── */
  sessions: {
    description: 'Sesje pracy rejestrują czas poświęcony na obsługę klientów. Rozpocznij sesję, gdy zaczynasz pracę nad zgłoszeniem, i zakończ, gdy skończysz.',
    sections: [
      { icon: <Timer size={14} />, title: 'Jak działają sesje', content: 'Sesja rejestruje: klienta, powiązane zgłoszenie, czas rozpoczęcia i zakończenia. Po zakończeniu sesji system oblicza czas trwania. Sesje pojawiają się też na kalendarzu.' },
      { icon: <BarChart3 size={14} />, title: 'Podsumowania', content: 'Na liście sesji widzisz łączny czas pracy i rozkład po klientach. Przydatne do rozliczeń i analizy obciążenia zespołu.' },
    ],
    tips: [
      'Aktywna sesja (zielona) oznacza, że technik teraz pracuje nad zgłoszeniem.',
      'Możesz edytować czas sesji po fakcie, jeśli zapomnisz ją włączyć/wyłączyć.',
    ],
  },

  /* ── USTAWIENIA ──────────────────────────────────────────────────── */
  settings: {
    description: 'Ustawienia workspace — tutaj konfigurujesz nazwę firmy, dane kontaktowe, logo, integracje z Google Drive i inne parametry systemowe.',
    sections: [
      { icon: <Building2 size={14} />, title: 'Dane firmy', content: 'Wpisz nazwę firmy, NIP, adres, telefon i email. Te dane pojawiają się na dokumentach i w panelu klienta.' },
      { icon: <Settings size={14} />, title: 'Integracje', content: 'Skonfiguruj integrację z Google Drive do backupów, klucze API i inne połączenia z zewnętrznymi usługami.' },
    ],
    tips: [
      'Logo firmy pojawi się w panelu klienta i na dokumentach — użyj pliku PNG z przezroczystym tłem.',
    ],
  },

  /* ── PORTAL SETTINGS ────────────────────────────────────────────── */
  portalSettings: {
    description: 'Konfiguracja portalu klienta i obsługi zgłoszeń — formularze, kategorie, reguły SLA, udostępnianie i powiadomienia.',
    sections: [
      { icon: <Globe size={14} />, title: 'Ogólne', content: 'Podstawowe ustawienia portalu klienta: co widzi klient, jakie ma opcje, jak wygląda formularz zgłoszeniowy.' },
      { icon: <Clock size={14} />, title: 'SLA', content: 'Ustaw terminy SLA dla różnych priorytetów. System automatycznie oblicza termin realizacji zgłoszenia i ostrzega, gdy się zbliża.' },
      { icon: <Share2 size={14} />, title: 'Udostępnianie', content: 'Zarządzaj relacjami z firmami klientów — kto jest Twoim klientem, jakie ma uprawnienia w portalu.' },
    ],
    tips: [
      'SLA to Service Level Agreement — umowa o poziomie usług. Np. priorytet „Krytyczny" = 2h na reakcję.',
    ],
  },

  /* ── BACKUP ─────────────────────────────────────────────────────── */
  backups: {
    description: 'Zarządzanie automatycznymi kopiami zapasowymi baz danych i plików klientów. Konfiguruj harmonogramy, monitoruj status i przywracaj dane w razie potrzeby.',
    sections: [
      { icon: <HardDrive size={14} />, title: 'Konfiguracje backupów', content: 'Każda konfiguracja definiuje: co backupować, jak często, gdzie przechowywać. Możesz mieć wiele konfiguracji dla różnych serwerów i baz danych.' },
      { icon: <Clock size={14} />, title: 'Harmonogramy', content: 'Ustaw, jak często ma się wykonywać backup: codziennie, co tydzień, co godzinę. System automatycznie uruchamia kopie w tle.' },
      { icon: <BarChart3 size={14} />, title: 'Wizualizacje', content: 'Wykresy pokazują: zajętość dysku, status ostatnich kopii i oś czasu wykonań. Czerwony status = ostatni backup się nie powiódł.' },
    ],
    tips: [
      'Zawsze miej przynajmniej dwie konfiguracje backupu — lokalną i zdalną (off-site).',
      'Regularnie testuj przywracanie — backup, którego nie można przywrócić, jest bezwartościowy.',
    ],
  },

  /* ── MONITORING ──────────────────────────────────────────────────── */
  monitoring: {
    description: 'Monitoring infrastruktury w czasie rzeczywistym. Sprawdzaj status agentów, metryki serwerów, alerty bezpieczeństwa i wydajność urządzeń.',
    sections: [
      { icon: <Activity size={14} />, title: 'Metryki systemowe', content: 'Widzisz zużycie CPU, RAM, dysku i sieci dla urządzeń z zainstalowanym agentem. Dane odświeżają się co minutę.' },
      { icon: <Shield size={14} />, title: 'Audyt bezpieczeństwa', content: 'Agent sprawdza: aktualizacje systemu, status antywirusa, konfigurację firewalla. Czerwone flagi oznaczają problemy wymagające uwagi.' },
      { icon: <Wifi size={14} />, title: 'Status online/offline', content: 'Lista wszystkich agentów z informacją, kiedy ostatnio się odezwały. Zielone = online (< 5 min temu), szare = offline.' },
    ],
    tips: [
      'Ustaw alerty, żeby dostawać powiadomienia gdy agent przestanie odpowiadać.',
      'Wysoki load CPU może oznaczać złośliwe oprogramowanie — sprawdź procesy na urządzeniu.',
    ],
  },

  /* ── POBIERANIE ──────────────────────────────────────────────────── */
  downloads: {
    description: 'Zarządzanie plikami do pobrania dla klientów i pracowników. Udostępniaj instalatory, dokumentację, sterowniki i inne pliki.',
    sections: [
      { icon: <Download size={14} />, title: 'Lista plików', content: 'Widzisz wszystkie pliki dostępne do pobrania. Możesz dodawać nowe pliki, edytować opisy i kontrolować, kto ma do nich dostęp.' },
      { icon: <Shield size={14} />, title: 'Kontrola dostępu', content: 'Pliki mogą być publiczne (dostępne dla każdego z linkiem) lub chronione PIN-em (wymagają kodu z konta użytkownika).' },
    ],
    tips: [
      'Używaj opisowych nazw plików — klient powinien wiedzieć co pobiera bez otwierania.',
    ],
  },

  /* ── AKTYWNOŚĆ ──────────────────────────────────────────────────── */
  activityLogs: {
    description: 'Dziennik aktywności systemowej. Każda zmiana w systemie jest tu rejestrowana: kto, co i kiedy zrobił. Przydatne do audytu i rozwiązywania problemów.',
    sections: [
      { icon: <Activity size={14} />, title: 'Filtrowanie logów', content: 'Filtruj po typie encji (zgłoszenie, urządzenie, użytkownik...) i typie akcji (utworzenie, edycja, usunięcie, zmiana statusu). Pomaga szybko znaleźć konkretne zdarzenie.' },
      { icon: <Clock size={14} />, title: 'Oś czasu', content: 'Logi są sortowane chronologicznie od najnowszych. Przy każdym widzisz: kto wykonał akcję, co się zmieniło i kiedy.' },
    ],
    tips: [
      'Jeśli klient pyta „kto zmienił moje zgłoszenie", sprawdź tutaj — każda zmiana jest logowana.',
    ],
  },

  /* ── UDOSTĘPNIANIE ──────────────────────────────────────────────── */
  sharing: {
    description: 'Udostępnianie zasobów między workspace\'ami. Zarządzaj relacjami z firmami klientów i dostawcami usług.',
    sections: [
      { icon: <Share2 size={14} />, title: 'Relacje', content: 'Widzisz firmy, z którymi masz aktywną relację — jako dostawca lub klient. Relacja daje dostęp do wspólnych zasobów: zgłoszeń, urządzeń, haseł.' },
    ],
    tips: [
      'Każda relacja jest dwustronna — obie strony muszą zaakceptować połączenie.',
    ],
  },

  /* ── BILLING ────────────────────────────────────────────────────── */
  billing: {
    description: 'Rozliczenia z klientami i dostawcami. Śledź płatności, subskrypcje i koszty usług.',
    sections: [
      { icon: <Receipt size={14} />, title: 'Przegląd rozliczeń', content: 'Widzisz aktywne subskrypcje, historię płatności i bieżące saldo. Możesz też zarządzać metodami płatności.' },
    ],
    tips: [
      'Sprawdzaj regularnie rozliczenia, żeby uniknąć niespodziewanych kosztów.',
    ],
  },

  /* ── FIRMA ──────────────────────────────────────────────────────── */
  myCompany: {
    description: 'Dane Twojej firmy — nazwa, NIP, adres, logo. Te informacje pojawiają się na dokumentach, fakturach i w panelu klienta.',
    sections: [
      { icon: <Building2 size={14} />, title: 'Edycja danych', content: 'Wypełnij wszystkie pola — im więcej danych, tym bardziej profesjonalnie wyglądają Twoje dokumenty. Logo wgraj w formacie PNG z przezroczystym tłem.' },
    ],
    tips: [
      'NIP jest wymagany do wystawiania faktur z modułu fakturowania.',
    ],
  },

  /* ═══════════════════════════════════════════════════════════════════
     PORTAL KLIENTA
     ═══════════════════════════════════════════════════════════════════ */

  portalDashboard: {
    description: 'Panel klienta — przegląd Twoich zgłoszeń, urządzeń i zamówień. Tutaj widzisz stan obsługi Twojej firmy przez dostawcę IT.',
    sections: [
      { icon: <Ticket size={14} />, title: 'Twoje zgłoszenia', content: 'Widzisz listę swoich zgłoszeń serwisowych z aktualnym statusem. Kliknij zgłoszenie, żeby zobaczyć szczegóły lub dodać komentarz.' },
      { icon: <PlusCircle size={14} />, title: 'Nowe zgłoszenie', content: 'Kliknij „Nowe zgłoszenie" lub przejdź do zakładki „Nowa prośba". Opisz problem szczegółowo — im więcej informacji, tym szybciej technik go rozwiąże.' },
    ],
    tips: [
      'Sprawdzaj statusy swoich zgłoszeń — „Przypisane" oznacza, że technik już nad tym pracuje.',
      'Komentarze pod zgłoszeniem to najszybszy sposób komunikacji z technikiem.',
    ],
  },

  portalNewRequest: {
    description: 'Formularz nowego zgłoszenia serwisowego. Opisz problem, a technik zajmie się nim jak najszybciej.',
    sections: [
      { icon: <FileText size={14} />, title: 'Jak wypełnić zgłoszenie', content: 'Wybierz typ (awaria, prośba serwisowa, konserwacja), lokalizację, opcjonalnie urządzenie. Wpisz krótki tytuł i szczegółowy opis. Im więcej szczegółów podasz, tym szybciej technik zrozumie problem.' },
      { icon: <Wrench size={14} />, title: 'Typy zgłoszeń', content: '„Awaria / Incydent" = coś się zepsuło i nie działa. „Zgłoszenie serwisowe" = potrzebujesz czegoś nowego lub zmiany. „Konserwacja" = planowany przegląd. „Inne" = wszystko inne.' },
    ],
    tips: [
      'W opisie podaj: co się dzieje, kiedy się zaczęło, ile osób dotyczy, czy próbowałeś coś naprawić.',
      'Jeśli wiesz, którego urządzenia dotyczy problem, wybierz je z listy — przyspiesza obsługę.',
    ],
  },

  portalTickets: {
    description: 'Lista Twoich zgłoszeń serwisowych. Śledź status obsługi i komunikuj się z technikiem.',
    sections: [
      { icon: <Ticket size={14} />, title: 'Statusy zgłoszeń', content: '„Oczekuje" = zgłoszenie wpłynęło, czeka na technika. „Przypisane" = technik jest przydzielony. „W trakcie" = trwają prace. „Zakończone" = problem rozwiązany. „Anulowane" = zgłoszenie zostało anulowane.' },
      { icon: <Send size={14} />, title: 'Dodawanie komentarza', content: 'Otwórz zgłoszenie i wpisz wiadomość na dole strony. Technik dostanie powiadomienie. Możesz dopytać o status lub dodać nowe informacje.' },
    ],
    tips: [
      'Jeśli Twoje zgłoszenie jest zakończone, możesz wystawić ocenę technikowi — 1-3 gwiazdki.',
    ],
  },

  /* ═══════════════════════════════════════════════════════════════════
     MOBILE
     ═══════════════════════════════════════════════════════════════════ */

  mobileDashboard: {
    description: 'Mobilny panel — szybki dostęp do zgłoszeń, zadań i urządzeń z telefonu. Zoptymalizowany pod ekran dotykowy.',
    sections: [
      { icon: <Smartphone size={14} />, title: 'Nawigacja', content: 'Używaj dolnego paska nawigacji, żeby przełączać między: Główna, Zgłoszenia, Zadania, Urządzenia, Skan QR. Wszystko działa na dotyk.' },
    ],
    tips: [
      'Użyj skanera QR, żeby szybko znaleźć urządzenie — po prostu zeskanuj naklejkę na sprzęcie.',
    ],
  },
};

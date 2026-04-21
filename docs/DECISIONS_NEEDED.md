# DECISIONS_NEEDED — pytania do Adriana

Lista decyzji biznesowych które tylko Adrian może odpowiedzieć. Do czasu odpowiedzi używam **defaultu** (podany obok). Każda decyzja zmienia kod — więc im wcześniej odpowie, tym mniej późniejszej pracy.

---

## A. Pricing i plany

### A1. Finalna cennik PLN
Propozycja:
- Starter: **299 PLN/tech/mies.** (max 3 techs, 100 endpointów, Copilot light)
- Pro: **499 PLN/tech/mies.** (unlimited, full AI, KSeF)
- Enterprise: **799 PLN/tech/mies.** (white-label, SOC-2, voice agent)

**Pytanie**: akceptujesz ten cennik czy chcesz inne kwoty?
**Default (jeśli brak odpowiedzi)**: jak wyżej, zapisuję w kodzie jako placeholder easy-to-change.

### A2. Trial
**Pytanie**: 14 dni, 30 dni, czy freemium "Free forever 1 tech"?
**Default**: 14 dni trial na Pro bez karty, potem downgrade do Starter lub upgrade.

### A3. Annual discount
**Pytanie**: 10%, 15%, czy 20%?
**Default**: 20% (marketingowo atrakcyjne, standard branży).

---

## B. Branding i marka

### B1. Nazwa produktu dla SaaS
Obecnie: "InfraDesk by SILERS". Dla sprzedaży SaaS:
- Opcja 1: Zostaje "InfraDesk" (zrzucamy "by SILERS")
- Opcja 2: Rebrand (nowa nazwa, .io domena)

**Default**: Zostaje **InfraDesk** — SEO już robi się wokół tego + Adrian wpłaca energię w to od dawna.

### B2. Domena
- `infradesk.pl` (obecna) — zostaje produkcyjna
- `infradesk.io` / `.com` — dokupienie dla międzynarodowej ekspansji?
- Custom domain per workspace klienta (np. `it.wismont.pl` prowadzi do ich portalu)?

**Default**: `infradesk.pl` zostaje. Custom domain per workspace = feature Enterprise (post-MVP).

### B3. Logo
**Pytanie**: obecne logo zostaje czy chcesz rebrand?
**Default**: Obecne logo zostaje 1:1.

---

## C. Business rules — Tickety

### C1. Auto-close po RESOLVED
Po rozwiązaniu ticketu klient ma X dni na feedback ("potwierdzam" / "problem dalej jest"):
- 3 dni → CLOSED jeśli brak reakcji
- 7 dni?
- 14 dni?

**Default**: **3 dni** (szybki flow, klient dostaje email z przyciskiem "potwierdzam").

### C2. Maksymalna liczba reopeny
Klient kliknął "problem dalej jest" → IN_PROGRESS. Ile razy można?
**Default**: **2 razy**. Po trzecim reopen — wymagana decyzja technika (nowy ticket + escalation).

### C3. SLA response times per priority (domyślne)
- CRITICAL: **15 min response, 2h resolve**
- HIGH: **2h response, 8h resolve**
- MEDIUM: **8h response, 24h resolve**
- LOW: **24h response, 72h resolve**

**Pytanie**: pasują? Czy chcesz inne?
**Default**: jak wyżej, konfigurowalne per workspace w Enterprise.

### C4. Priorytety — kto ustawia
- AI classify od razu → auto-apply jeśli confidence > 0.8, propozycja inaczej
- Klient może sam ustawić priorytet przy tworzeniu ticketu?
- Technik zawsze może zmienić?

**Default**: AI classify + klient widzi jako podpowiedź, ale nie może ustawić (uniknijmy "wszystko CRITICAL" problemu).

### C5. Publiczny portal zgłoszeń (bez logowania)
Obecnie jest `/public/tickets/:workspaceSlug` dla anonymous ticket submission. Zostaje czy wyłączamy?
**Default**: Zostaje, ale z rate limit + CAPTCHA + tylko LOW/MEDIUM priority.

---

## D. Business rules — Monitoring alerts

### D1. Dedup window
Obecnie 6h. Zostaje?
**Default**: **6h** — sprawdzone, działa dla Silers.

### D2. Auto-ticket threshold
Kiedy alert → ticket:
- CRITICAL severity → natychmiast ticket
- HIGH severity → ticket po 2 alertach w 24h (obecnie? trzeba sprawdzić)
- MEDIUM / LOW → nie tworzy ticketu (tylko dashboard)

**Default**: jak wyżej.

### D3. Stale alert auto-close
Po ilu dniach bez update alert → auto-resolved?
**Default**: **7 dni** (obecna wartość, sprawdzona).

---

## E. Business rules — WorkSessions (billing time)

### E1. Auto-end paused session
Sesja PAUSED > X h → auto-END z czasem do pauzy.
**Default**: **2h paused** (realnie technik zapomina — aktualnie widać sesje paused 24h+).

### E2. Minimum billing increment
Krótka sesja 7 min → billing 7 min czy round-up do 15?
**Default**: **15 min** (zaokrąglanie w górę do kwadransa, standardowo w MSP).

### E3. Bulk close ticketów przy end session
Limit ile ticketów można zamknąć jednym session?
**Default**: Brak hard limit, ale > 10 — UI ostrzega "na pewno wszystkie rozwiązałeś?".

---

## F. Permissions — defaults per rola

### F1. OWNER
- Widzi wszystko
- Edytuje wszystko
- Jedyny który może: usunąć workspace, zmienić plan, dodać OWNER-a

### F2. ADMIN (default permissions)
- Widzi wszystko oprócz: billing szczegółów (planu, faktur)
- Edytuje wszystko oprócz: settings.plan, workspace.delete
- Może: invite users, assign roles MEMBER

### F3. MEMBER (default permissions)
**Pytanie kluczowe**: MEMBER to **klient końcowy** (portal) czy **pracownik klienta** (widzi firmowe dane)?

**Default**: MEMBER = **pracownik** (widzi swoje tickety + urządzenia firmy + może zgłaszać nowe). Nie widzi: vault, rozliczeń, innych userów, ustawień.

### F4. Access granular (SCOPED scope)
Wprowadzam `AccessGrant` dla `scope=SCOPED`:
- User może być ograniczony do konkretnych device'ów / lokalizacji
- Przykład: Mariusz obsługuje tylko PKS + Wismont, nie widzi Dominex

**Default**: Feature exists (schema), ale UI dostępny tylko w Pro+ tier.

---

## G. Onboarding klienta

### G1. Jak klient trafia do systemu?
- **Opcja 1**: Adrian/MSP tworzy workspace + user, wysyła email invite
- **Opcja 2**: Klient rejestruje sam przez `/signup`, dostaje trial
- **Opcja 3**: Obie (MSP może invite, klient może sam signup — scenariusze zależne od tier)

**Default**: **Obie**. MVP startujemy z MSP-driven invite (szybsze). Self-signup dodajemy po MVP.

### G2. Email verification — wymagane do logowania?
Obecnie: pole `emailVerified` istnieje, ale enforcement brakuje.
**Default**: **Tak, wymagane**. Po rejestracji link w emailu, 7 dni na potwierdzenie. Potem login zablokowany.

### G3. 2FA — kto musi mieć?
- Wymagane dla OWNER i ADMIN w Enterprise tier?
- Opcjonalne dla wszystkich?

**Default**: Opcjonalne dla wszystkich. **Mocno zachęcamy** OWNER/ADMIN (banner "chcesz 2FA?"). W Enterprise tier: **wymagane**.

---

## H. Dane wrażliwe — obsługa

### H1. Vault encryption key — gdzie?
- **Opcja 1**: Klucz per workspace w osobnej tabeli, szyfrowany master key w env
- **Opcja 2**: AWS KMS / Google Cloud KMS (external)
- **Opcja 3**: HashiCorp Vault

**Default**: **Opcja 1** na start (najprostsza, działa on-prem). Migracja do KMS gdy Enterprise klient zapyta.

### H2. Audit log retention
Ile trzymać AuditEvent?
**Default**: **12 miesięcy** on-line, potem archiwizacja do cold storage. Enterprise tier: **5 lat** (compliance).

### H3. GDPR right to erasure
Po zażądaniu usunięcia:
- Soft delete natychmiast (niewidoczne w UI)
- Hard delete po **30 dniach** (możliwość wycofania w razie pomyłki)
- Anonymize w AuditEvent (replace imię/email na hash)

**Default**: jak wyżej.

---

## I. Integracje (które w MVP?)

### I1. Email → Ticket (IMAP)
Mail butler (obecny P1) zostaje w MVP?
**Default**: **Tak**, ale cleanup — obecna implementacja kopii 1:1.

### I2. Slack/Teams/Discord notifications
- Wysyłanie notyfikacji o ticketach na kanał?
- Tworzenie ticketu z reakcji/command w kanale?

**Default**: **Post-MVP**. Zbyt dużo roboty dla dnia 1.

### I3. Google Drive (obecnie backup)
Zostaje?
**Default**: **Tak**, bez zmian.

### I4. RustDesk (zdalny dostęp)
Obecnie integracja — sesje pracy importowane. Zostaje?
**Default**: **Tak**, bez zmian.

### I5. KSeF (e-faktury)
- MVP: schema FA(3)-ready, UI fakturowania NIE
- Post-MVP: pełna integracja z KSeF 2.0 API

**Default**: jak wyżej.

---

## J. Platforma — host / deployment

### J1. Gdzie hosting produkcyjny?
Obecnie: VPS ovh.pl (188.68.236.166), Docker Compose.
- Zostaje?
- Migracja do Hetzner / Scaleway / AWS RDS?
- Kubernetes?

**Default**: **Zostaje obecny VPS** dla MVP. Kubernetes gdy 50+ klientów.

### J2. Backups
Obecnie: `pg_dump` codziennie o 3:00, retention 30 dni.
**Default**: zostaje, ale kopiujemy do zewnętrznego S3 (encrypted).

### J3. Monitoring własnego systemu
- Sentry dla errors?
- Uptime monitor (UptimeRobot)?
- Custom dashboard?

**Default**: **Sentry** (free tier starcza na start) + UptimeRobot dla uptime checks.

---

## K. AI features — które na start?

### K1. LLM provider
- **Anthropic Claude** (Opus 4.7 dla premium, Haiku 4.5 dla klasyfikacji)
- OpenAI?
- Mieszane?

**Default**: **Anthropic Claude** (już masz credentials + ID CORE integration). Haiku dla szybkich/tanich zadań (klasyfikacja), Opus dla skomplikowanych (podsumowania, reasoning).

### K2. LLM cost monitoring
Każdy token = pieniądze. Śledzić per workspace żeby nie przepalić limitu?
**Default**: **Tak**, tabela `LlmUsage` (workspace, model, tokens, cost_pln, createdAt). Limit miesięczny per plan.

### K3. LLM features — priorytet na start
Propozycja kolejności:
1. Auto-classify ticketów (MVP)
2. AI Copilot drawer z RAG (MVP)
3. Conversational ticket creation (MVP)
4. Voice-to-ticket (Q4 2026)
5. Auto-KB generation (Q4 2026)
6. Predictive maintenance (2027)
7. Voice callback na critical (Enterprise, 2027)

**Default**: jak wyżej.

---

## L. Migracja danych

### L1. Co migrować z v1 do v2?
- Wszystkie `Workspace` (po dedupie, bez `default-ws`)
- Wszystkie `User` (po usunięciu seed/test)
- `Membership` (remapowane role: OWNER→OWNER, ADMIN→ADMIN, TECHNICIAN→MEMBER z full permissions, MEMBER→MEMBER, VIEWER→MEMBER z VIEW)
- `Ticket` (tylko nie-CANCELLED w ostatnim 12 miesięcy?)
- `Device` (wszystkie po dedupie)
- `AgentRegistration` (tylko ACTIVE)
- `WorkSession` (tylko ACTIVE/COMPLETED w ostatnim 12 miesięcy)
- `MonitoringAlert` (tylko unresolved)
- `Credential` (wszystkie)
- `ActivityLog` → `AuditEvent` (tylko ostatnie 6 miesięcy)

**Pytanie**: zgadzasz się? Czy chcesz 100% historii?
**Default**: jak wyżej (cleanup przy migracji). Pełna historia v1 zostaje w snapshot backup.

### L2. Rollout pilotowy
- Silers (Ty) pierwszy
- Po dniu bez problemów: 1 klient pilotowy (Dominex? Wismont?)
- Po tygodniu bez problemów: pozostali klienci

**Default**: Silers + **Dominex** jako pilot (Iwona aktywnie używa panelu).

---

## Jak odpowiadać

Możesz odpowiedzieć w dowolnym formacie:
1. Edycja tego pliku bezpośrednio na VPS (`/home/adrian/infradesk/docs/DECISIONS_NEEDED.md`)
2. Wiadomość do Iris: "A1: 349/599/899, C1: 7 dni, F3: klient końcowy, pozostałe defaults OK"
3. Podczas sesji z Claude: "decyzje od A1 do L2 według defaults, oprócz C1 zmień na 7 dni"

Każda decyzja bez odpowiedzi = używam defaultu i oznaczam w kodzie komentarzem `// DEFAULT: awaiting Adrian decision (see DECISIONS_NEEDED.md § X)`.

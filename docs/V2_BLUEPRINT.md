# InfraDesk V2 — Product Blueprint

**Status:** draft do zatwierdzenia przez Adriana
**Data:** 2026-04-21
**Autor:** Claude (na podstawie inwentaryzacji V1 + decyzji biznesowych Adriana)

Ten dokument jest **jedynym źródłem prawdy** przed rozpoczęciem kodowania. Każda decyzja zostaje tu spisana. Co nie jest w tym dokumencie — nie istnieje w V2 przy pierwszym rollout.

---

## 0. DECYZJE BIZNESOWE (ustalone z Adrianem)

| Decyzja | Wartość |
|---|---|
| **Migracja V1→V2** | Pilot: Adrian testuje pustkę + ręcznie dodaje 1 nowego klienta poza listą V1 → dopiero wtedy migracja reszty (11 firm) |
| **Subdomeny klientów** | Wildcard per-klient: `silers.infradesk.pl`, `dworosmolice.infradesk.pl`, `wismont.infradesk.pl` itd. (jak w V1) |
| **Scope V2 Phase 1** | OPERACJE + KLIENCI + Infrastruktura IT + Sejf haseł + AI. **FINANSE zostają w V1** jako osobna aplikacja (coexistence) |
| **Mobile native / Android TV** | Poza scope V2. Responsive web starczy |
| **Backend core** | **Zostaje** (rebuild-v2, 98 testów, RLS) — uzupełniam o brakujące modele |
| **Frontend** | **Piszę od zera** pod ten blueprint, nie modułami |

---

## 1. WIZJA V2 w 5 zdaniach

1. V2 to **ten sam produkt co V1** (helpdesk IT dla MSP), tylko **bez chaosu uprawnień** i z AI od fundamentów.
2. **Żadnej funkcji V1 nie gubimy** — wszystkie się przeniosą, każda lepiej uporządkowana.
3. **Dodajemy 4 pionierskie feature'y**: Shadow Mode, Client Risk Score, Invisible Time Tracking, Failure DNA — wszystkie działają „cicho w tle" i same się dowodzą wartością zanim klient je włączy.
4. **GPS Field Service** dla Mariusza i przyszłych terenowych techników (auto-checkin przez geofence, proximity alerts do pobliskich zgłoszeń).
5. **Polski rynek pierwszy**: KSeF FA(3)-ready schema, GUS/REGON, RODO-first, polska terminologia UI.

---

## 2. ROLE, SUBDOMENY I PANELE

### 2.1 Hierarchia workspace

```
┌──────────────────────────────────────────────────────┐
│  PLATFORMA (infradesk.pl)                            │
│  ┌────────────────────────────────────────────────┐  │
│  │  SuperAdmin (panel globalny)                    │  │
│  │  - zarządza wszystkimi workspace'ami            │  │
│  │  - billing platform, SMTP, konfiguracja global  │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  MSP workspace (`silers.infradesk.pl`)          │  │
│  │  type: MSP                                       │  │
│  │  - Owner: Adrian                                 │  │
│  │  - Admini: (opcja)                               │  │
│  │  - Technicy: Mariusz + kolejni                   │  │
│  │  - OBSŁUGUJE klientów poniżej                    │  │
│  └────────────────────────────────────────────────┘  │
│         │                                              │
│         ▼  WorkspaceRelation (MSP ↔ Klient)            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ CLIENT ws    │  │ CLIENT ws    │  │ CLIENT ws   │  │
│  │ dworosmolice │  │ wismont      │  │ metbud      │  │
│  │ .infradesk.pl│  │ .infradesk.pl│  │ .infradesk.pl│ │
│  │              │  │              │  │              │ │
│  │ OwnerKlient  │  │ OwnerKlient  │  │ OwnerKlient  │ │
│  │ Pracownicy   │  │ Pracownicy   │  │ Pracownicy   │ │
│  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  INTERNAL_IT workspace (dla firm IT in-house)   │  │
│  │  type: INTERNAL_IT                               │  │
│  │  - Firma sama obsługuje swoje IT (bez MSP)       │  │
│  │  - Te same funkcje co MSP ale bez multi-client   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 2.2 Subdomeny

- `infradesk.pl` → strona marketingowa (landing)
- `v2.infradesk.pl` → **logowanie globalne** dla wszystkich (po zalogowaniu redirect do własnej subdomeny klienta)
- `silers.infradesk.pl` → panel MSP Silers (Adrian i technicy)
- `<slug>.infradesk.pl` → panel klienta (OwnerKlient + pracownicy tej firmy)
- `admin.infradesk.pl` → panel SuperAdmin (platformowy)

Nginx wildcard + dynamiczny routing po `Host` header. Identyczny mechanizm jak V1.

### 2.3 Role (6 ról, zamiast V1 chaosu z 5+aliasy)

| Rola | Gdzie | Opis |
|---|---|---|
| **SUPER_ADMIN** | Platformowa | Tylko Adrian + wybrane konta. Dostęp do `admin.infradesk.pl`. Widzi wszystkie workspace'y |
| **OWNER_MSP** | MSP workspace | Właściciel firmy MSP (Adrian dla Silers). Pełne uprawnienia |
| **ADMIN_MSP** | MSP workspace | Admin operacyjny, wszystko oprócz billingu i delete workspace |
| **TECHNICIAN** | MSP workspace | Terenowy/zdalny technik. Tickety, sesje, urządzenia, lokalizacje, GPS. Nie widzi rozliczeń, vaulta (chyba że override), audytu |
| **OWNER_CLIENT** | Client workspace | Właściciel firmy-klienta. Widzi TYLKO swoje dane, może dodawać pracowników swojej firmy |
| **EMPLOYEE_CLIENT** | Client workspace | Pracownik firmy-klienta. Zgłasza problemy, widzi tickety na SWOJE urządzenia (albo wszystkie jeśli OwnerKlient nadał) |

**UWAGA:** `VIEWER` z V1 = wariant `EMPLOYEE_CLIENT` z permission override do VIEW only. `MEMBER` z V1 = nieużywane → usuwamy.

**Nadanie uprawnień:** rola = podstawa, `PermissionOverride[]` = per-moduł tuning, `AccessGrant[]` = per-resource (device, lokalizacja).

---

## 3. SITEMAP — kompletna

### 3.1 Platforma `admin.infradesk.pl` (SUPER_ADMIN)

```
/login
/dashboard              → KPI całej platformy: workspaces, userzy, MRR, agenty online
/workspaces             → lista wszystkich WS (MSP / CLIENT / INTERNAL_IT) z filtrowaniem
/workspaces/:id         → szczegóły workspace (plan, usage, members, invoices)
/users                  → globalny rejestr userów + szukaj po emailu
/email                  → konfiguracja SMTP platformy
/billing                → subskrypcje platform, przychody, faktury B2B
/settings               → global config (payment gateway, Google OAuth keys, RODO retention)
/audit                  → globalny audit log
```

### 3.2 MSP panel `silers.infradesk.pl` (OWNER_MSP / ADMIN_MSP / TECHNICIAN)

```
/login
/                       → Dashboard operacyjny (Kokpit)
                          - greeting dynamiczny ("Dzień dobry Adrian!")
                          - 4 KPI: otwarte tickety | krytyczne | sesje aktywne | klienci online
                          - Hero-gauge: % SLA zgodność
                          - Ostatnie 10 zdarzeń (timeline)

📂 OPERACJE
/tickets                → Lista zgłoszeń
                          - dual-view (wizualnie/tabelarycznie)
                          - filtry: status, priorytet, klient, przypisany, źródło, daty
                          - 3-tryby dodawania (Formularz/Wizard/Z AI)
                          - bulk assign, bulk close
/tickets/:id            → Szczegóły (info, timeline, komentarze, załączniki, akcje)
/tickets/queue          → Queue view — szybka obsługa
/tickets/reports        → Raporty zgłoszeń (SLA, kategorie, trend)
/tasks                  → Zadania (nie są ticketami — to jak todos techników)
/tasks/:id              → Szczegóły zadania
/calendar               → Kalendarz zespołu (FullCalendar) — zadania + sesje + delegacje
/sessions               → Sesje pracy (aktywne + historia)
/sessions/:id           → Szczegóły sesji + bulk-close modal
/billing                → Rozliczenia czasu pracy techników (godziny × stawki → gotowe do faktury → FINANSE w V1)
/alerts                 → Alerty monitoringu (CPU/RAM/disk/service/temp)
/orders                 → Zamówienia klientów (części / zakupy)
/orders/:id             → Szczegóły zamówienia
/delegations            → Delegacje (planowane wyjazdy techników)
/portal-settings        → Konfiguracja portalu klienta (custom pola formularza zgłoszeń)

📂 KLIENCI
/clients                → Firmy klientów (karty + tabela, wizualnie/tabelarycznie)
/clients/:id            → Szczegóły klienta: lokalizacje, urządzenia, kontakty, tickety, sesje, rozliczenia, Client Risk Score, GPS historia, backup status
/contacts               → Osoby kontaktowe (osoby fizyczne w firmach-klientach)
/contacts/:id           → Szczegóły kontaktu (historia rozmów, powiązane tickety)
/locations              → Lokalizacje (biura/oddziały klientów)
/locations/:id          → Szczegóły lokalizacji + mapa + urządzenia + geofence settings
/partners               → Partnerzy IT (MSP→MSP subcontracting, enterprise-only)

📂 INFRASTRUKTURA IT
/devices                → Urządzenia (workstations, serwery, routery, drukarki...)
/devices/:id            → Szczegóły: telemetria agenta, zakładki (info/sessions/tickets/credentials/activity/backup)
/agents                 → Asystenci (desktop agents) PENDING→approve, ACTIVE z heartbeatem, INACTIVE (ostatnie online > 30d)
/agents/:id             → Szczegóły agenta + commands + logi
/monitoring             → Audyt i sieć — health score per urządzenie, mapa sieci, alerty
/backups                → Kopie zapasowe — konfigy + historia uruchomień
/backups/:id            → Szczegóły backup config + wizard edycji

📂 SEJF HASEŁ
/vault                  → Wszystkie credentials (filter po kategorii/visibility)
/vault/mine             → Moje (prywatne — tylko ja)
/vault/shared           → Współdzielone (widoczne dla mojej roli)
/vault/:id              → Szczegóły (reveal password → audit log wpis)

📂 ASYSTENT AI (IRIS)
/ai                     → Czat i komendy (gdzie rozmawiasz z Iris)
/ai/shadow              → Shadow Mode raport — co by AI zrobiła
/ai/insights            → Failure DNA klastery + Client Risk Score dashboard
/ai/time                → Invisible Time Tracking — sygnały → TimeSlot do akceptacji
/ai/usage               → Cost tracking LlmUsage (PLN per feature)

📂 MOJA FIRMA (MSP Silers)
/my-company             → Dane firmy, logo, NIP, adres
/users                  → Moi pracownicy (technicy, admini), invite, role, overrides
/users/:id              → Szczegóły pracownika: uprawnienia, historia, urlopy
/plan-and-modules       → Plan subskrypcji + moduły włączone
/activity-logs          → Audyt aktywności wewnętrznej (kto, kiedy, co)
/settings               → Ustawienia workspace, SMTP klienta, branding portalu
```

### 3.3 Klient panel `<slug>.infradesk.pl` (OWNER_CLIENT / EMPLOYEE_CLIENT)

```
/login
/                       → Dashboard klienta
                          - greeting
                          - moje otwarte zgłoszenia (count)
                          - moje urządzenia (count)
                          - SLA status (jeżeli widoczny)
                          - kto mnie dziś obsługuje (Mariusz / technik)
/tickets                → Moje zgłoszenia (wszystkie dla OwnerKlient / tylko moje dla Employee)
/tickets/new            → Nowe zgłoszenie (3-tryby)
/tickets/:id            → Szczegóły (read-only komentarze publiczne, można dodać komentarz)
/devices                → Moje urządzenia (co mamy i gdzie)
/devices/:id            → Szczegóły (telemetria, historia serwisowa)
/locations              → Moje lokalizacje
/vault                  → Moje hasła (jeśli mam uprawnienie — OwnerKlient widzi wszystkie credentials klienta, Employee tylko przypisane)
/orders                 → Moje zamówienia (wyceny od MSP do akceptacji, historia zakupów)
/billing                → Faktury i rozliczenia (widok read-only, dane z V1 FINANSE)
/users                  → Moi pracownicy (OwnerKlient może zapraszać, Employee nie widzi)
/settings               → Dane firmy (OwnerKlient), moje dane (Employee)
```

---

## 4. MODELE DANYCH — PEŁNY KATALOG

### 4.1 Co jest już w backend-v2 (zostaje)

**Auth:** User, RefreshToken, PasswordResetToken
**Workspace:** Workspace, WorkspaceRelation, Membership, AccessGrant, PermissionOverride
**Core:** Location, Device, AgentRegistration
**Tickets:** Ticket, TicketComment, TicketEvent, Attachment
**Sesje:** WorkSession, SessionTimeEntry, TicketSessionLink
**Monitoring:** MonitoringAlert
**Vault:** Credential, CredentialViewLog
**CRM:** Contact
**Orders:** Order, OrderItem
**Invoice:** Invoice, InvoiceItem (schema KSeF-ready — używać tylko dla coexistence z V1 FINANSE)
**Audit:** AuditEvent
**AI:** LlmUsage, KbArticle, VectorEmbedding (pgvector)
**Mail:** MailboxConfig, InboundMessage
**Notif:** NotificationSubscription
**GPS:** TechnicianLocationLog, LocationVisit, TechnicianGpsConsent
**Pioneer AI:** ShadowDecision, ClientRiskScore

### 4.2 Braki do uzupełnienia (nowa migracja V2)

```prisma
// TASKS — zadania operacyjne (osobne od ticketów, jak todo)
model Task {
  id               String   @id @default(uuid())
  workspaceId      String
  taskNumber       String   // "TSK-2026-0001"
  title            String
  description      String?  @db.Text
  status           TaskStatus  @default(NEW)  // NEW | IN_PROGRESS | DONE | CANCELLED
  priority         TicketPriority  @default(MEDIUM)
  assignedToUserId String?
  createdByUserId  String
  linkedTicketId   String?   // można przypiąć do ticketu
  dueAt            DateTime?
  estimatedMinutes Int?
  travelKm         Float?
  scheduledAt      DateTime?   // pokazuje się na kalendarzu
  completedAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@unique([workspaceId, taskNumber])
  @@index([workspaceId, status])
  @@index([assignedToUserId])
}
enum TaskStatus { NEW IN_PROGRESS DONE CANCELLED }

// DELEGATIONS — delegacje techników (planowane wyjazdy)
model Delegation {
  id               String   @id @default(uuid())
  workspaceId      String
  delegationNumber String   // "DEL-2026-0001"
  title            String
  createdByUserId  String
  assignedToUserId String
  clientWorkspaceId String?   // dla którego klienta
  locationId       String?    // gdzie
  scheduledAt      DateTime
  estimatedHours   Float?
  distanceKm       Float?
  notes            String?  @db.Text
  status           DelegationStatus @default(PLANNED)  // PLANNED | IN_PROGRESS | DONE | CANCELLED
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([workspaceId, delegationNumber])
  @@index([assignedToUserId, scheduledAt])
}
enum DelegationStatus { PLANNED IN_PROGRESS DONE CANCELLED }

// CALENDAR EVENT — zdarzenia kalendarza (meta nad Task + Delegation + WorkSession)
// nie przechowujemy osobno — view komponujemy ad-hoc z Task/Delegation/WorkSession
// tabela CrmActivity (spotkania) zostaje jako osobny model bo ma quoteStatus itp.

model CrmActivity {
  id               String   @id @default(uuid())
  workspaceId      String
  createdByUserId  String
  assignedToUserId String?
  contactId        String?
  type             CrmActivityType   // PHONE | EMAIL | MEETING | QUOTE
  title            String
  notes            String?  @db.Text
  scheduledAt      DateTime?
  completedAt      DateTime?
  followUpRequired Boolean  @default(false)
  linkedTicketId   String?
  quoteValueNet    Decimal? @db.Decimal(12,2)
  quoteStatus      QuoteStatus?   // DRAFT | SENT | ACCEPTED | REJECTED
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([workspaceId, type])
}
enum CrmActivityType { PHONE EMAIL MEETING QUOTE OTHER }
enum QuoteStatus { DRAFT SENT ACCEPTED REJECTED }

// BACKUP — backup klientów
model BackupConfig {
  id               String    @id @default(uuid())
  workspaceId      String
  agentRegistrationId String?
  deviceId         String?
  name             String
  type             BackupType    // SQL_MYSQL | SQL_POSTGRES | SQL_MSSQL | FOLDER
  sqlHost          String?
  sqlPort          Int?
  sqlDatabase      String?
  sqlUsername      String?
  sqlPasswordEnc   String?    // encrypted
  folderPath       String?
  googleDriveFolder String?
  useInfradeskCloud Boolean @default(false)
  localBackupPath  String?
  ftpHost          String?
  ftpUsername      String?
  ftpPasswordEnc   String?
  cronSchedule     String     // "0 2 * * *"
  retentionDays    Int        @default(30)
  encryptBackups   Boolean    @default(true)
  encryptionKeyEnc String?
  lastStatus       BackupStatus?  // SUCCESS | FAILED | RUNNING | NEVER_RAN
  lastRunAt        DateTime?
  nextRunAt        DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  @@index([workspaceId])
}
enum BackupType { SQL_MYSQL SQL_POSTGRES SQL_MSSQL FOLDER }
enum BackupStatus { SUCCESS FAILED RUNNING NEVER_RAN }

model BackupHistory {
  id              String   @id @default(uuid())
  backupConfigId  String
  status          BackupStatus
  startedAt       DateTime
  completedAt     DateTime?
  sizeBytes       BigInt?
  googleDriveId   String?
  errorMessage    String?  @db.Text
  cloudPath       String?
  createdAt       DateTime @default(now())
  @@index([backupConfigId, startedAt(sort: Desc)])
}

// ACTIVITY LOG — szczegółowy audit (kto, co, kiedy, gdzie, dlaczego)
// już istnieje AuditEvent ale tylko dla backend-critical. Activity log to user-facing.
model ActivityLog {
  id              String   @id @default(uuid())
  workspaceId     String
  entityType      String    // "ticket", "device", "location", "credential", "user", ...
  entityId        String
  actionType      String    // "created", "updated", "deleted", "assigned", "revealed_credential", ...
  description     String
  performedByUserId String?
  ipAddress       String?
  userAgent       String?
  metadata        Json?
  createdAt       DateTime @default(now())
  @@index([workspaceId, entityType, entityId, createdAt(sort: Desc)])
  @@index([performedByUserId, createdAt(sort: Desc)])
}

// SLA POLICY — reguły SLA per workspace/plan
model SlaPolicy {
  id               String    @id @default(uuid())
  workspaceId      String
  name             String
  priority         TicketPriority
  responseTimeMin  Int        // minuty do pierwszej odpowiedzi
  resolveTimeMin   Int        // minuty do rozwiązania
  businessHoursOnly Boolean  @default(false)
  isDefault        Boolean   @default(false)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@unique([workspaceId, priority])
}

// INVISIBLE TIME — signals → timeslots (pionier #2, Phase 3)
model TimeSignal {
  id          String    @id @default(uuid())
  workspaceId String
  userId      String
  source      SignalSource
  startedAt   DateTime
  endedAt     DateTime?
  context     Json      // source-specific: process name, ticket id, device id, recipient
  createdAt   DateTime  @default(now())
  @@index([workspaceId, userId, startedAt(sort: Desc)])
}
enum SignalSource { DESKTOP_AGENT GPS_VISIT TICKET_COMMENT SSH MAIL }

model TimeSlot {
  id            String    @id @default(uuid())
  workspaceId   String
  userId        String
  startedAt     DateTime
  endedAt       DateTime
  minutes       Int
  aiGuess       Json      // { ticketId, deviceId, confidence, reasoning }
  approvedBy    String?
  approvedAt    DateTime?
  workSessionId String?   @unique
  createdAt     DateTime  @default(now())
  @@index([workspaceId, userId, startedAt(sort: Desc)])
}

// FAILURE DNA — klastery podobnych ticketów (pionier #3, Phase 4)
model FailureCluster {
  id              String   @id @default(uuid())
  workspaceId     String
  label           String
  description     String   @db.Text
  ticketCount     Int
  affectedClients Int
  opportunityPln  Decimal? @db.Decimal(10,2)
  status          ClusterStatus  @default(ACTIVE)
  dismissedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  members         FailureClusterMember[]
  @@index([workspaceId, status])
}
enum ClusterStatus { ACTIVE DISMISSED RESOLVED }

model FailureClusterMember {
  clusterId  String
  ticketId   String
  similarity Float
  cluster    FailureCluster @relation(fields: [clusterId], references: [id], onDelete: Cascade)
  @@id([clusterId, ticketId])
}

// SUBSCRIPTIONS (klient: Netflix/ubezpieczenie itp.) — V1 miał osobną tabelę
// Pomijamy w Phase 1 jako mało używane. Przenosimy w Phase 2 jeśli okaże się potrzebne.

// WORKSPACE MODULE — jakie moduły włączone per workspace
model WorkspaceModule {
  id          String    @id @default(uuid())
  workspaceId String
  moduleKey   String    // "operacje", "klienci", "infrastruktura", "vault", "ai", "finanse"
  enabled     Boolean   @default(true)
  plan        Plan      // wymagany plan żeby mieć dostęp
  updatedAt   DateTime  @updatedAt
  @@unique([workspaceId, moduleKey])
}

// WORKSPACE SETTING — dowolne key-value per workspace (SMTP, branding, portale...)
model WorkspaceSetting {
  id          String    @id @default(uuid())
  workspaceId String
  key         String
  value       Json
  updatedAt   DateTime  @updatedAt
  @@unique([workspaceId, key])
}
```

### 4.3 Usunięte / nie przenosimy (ŚWIADOMIE)

- **WorkspaceManagement** — legacy MSP model, zastąpione przez WorkspaceRelation. **NIE PRZENOSIMY**
- **PlatformConfig** — przeniesione do WorkspaceSetting (klucze platformy) + env vars. **NIE PRZENOSIMY**
- **accountType / accessScope / allowedModules** — deprecated legacy. **NIE PRZENOSIMY**
- **UserMenuPreference** — użytkownik nie edytuje menu. V2 menu stałe per rola. **NIE PRZENOSIMY**
- **PackingSession / PickingSession / PackingBatch / Shipment / Courier / Carrier / AllegroAccount / Allego...** — cały moduł PAKOWANIE. **V1 ZOSTAJE, V2 BRAK**
- **InvoiceDocument / InvoicingContractor / InvoicingProduct / InvoicingPayment** — cała FINANSE. **V1 ZOSTAJE, V2 BRAK**
- **ServiceVehicle / ServiceInspection (SKP)** — osobny branch biznesowy. **V1 ZOSTAJE, V2 BRAK**

---

## 5. MATRYCA UPRAWNIEŃ (6 ról × 20 modułów × 4 levels)

Legenda: ❌ NONE | 👁 VIEW | ✏️ EDIT | 🗑 DELETE | 🔧 override-configurable

| Moduł | SUPER_ADMIN | OWNER_MSP | ADMIN_MSP | TECHNICIAN | OWNER_CLIENT | EMPLOYEE_CLIENT |
|---|---|---|---|---|---|---|
| **Dashboard** | 👁 | 👁 | 👁 | 👁 | 👁 | 👁 |
| **Tickets** | 🗑 | 🗑 | 🗑 | ✏️ | ✏️ | ✏️ (own) |
| **Tasks** | 🗑 | 🗑 | 🗑 | ✏️ | ❌ | ❌ |
| **Calendar** | 👁 | 👁 | 👁 | 👁 | ❌ | ❌ |
| **Sessions** | 🗑 | 🗑 | 🗑 | ✏️ (own) | 👁 (own client) | ❌ |
| **Billing (time)** | 🗑 | 🗑 | 👁 | ❌🔧 | 👁 (own) | ❌ |
| **Alerts** | 🗑 | 🗑 | ✏️ | 👁 | ❌ | ❌ |
| **Orders** | 🗑 | 🗑 | 🗑 | ❌🔧 | ✏️ (own) | 👁 (own) |
| **Delegations** | 🗑 | 🗑 | ✏️ | 👁 (own) | ❌ | ❌ |
| **Clients (lista firm)** | 🗑 | 🗑 | ✏️ | 👁 | ❌ | ❌ |
| **Contacts** | 🗑 | 🗑 | ✏️ | 👁🔧 | ✏️ (own) | 👁 (own) |
| **Locations** | 🗑 | 🗑 | ✏️ | 👁 | ✏️ (own) | 👁 (own) |
| **Partners (MSP)** | 🗑 | 🗑 | 👁 | ❌ | ❌ | ❌ |
| **Devices** | 🗑 | 🗑 | 🗑 | ✏️ | 👁 (own) | 👁 (own) |
| **Agents** | 🗑 | 🗑 | 🗑 | 👁 | ❌ | ❌ |
| **Monitoring** | 👁 | 👁 | 👁 | 👁 | 👁 (own) | ❌ |
| **Backups** | 🗑 | 🗑 | ✏️ | 👁🔧 | 👁 (own) | ❌ |
| **Vault** | 🗑 | 🗑 | ✏️ | ❌🔧 | 👁 (own) | ❌🔧 |
| **AI (Iris)** | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ |
| **Users (moi pracownicy)** | 🗑 | 🗑 | ✏️ | 👁 (own) | ✏️ (own client) | 👁 (self only) |
| **Workspace settings** | 🗑 | 🗑 | ✏️ | ❌ | ✏️ (own) | ❌ |
| **Activity log** | 👁 | 👁 | 👁 | ❌🔧 | 👁 (own) | ❌ |
| **Shadow Mode** | ✏️ | ✏️ | 👁 | ❌ | ❌ | ❌ |
| **Client Risk Score** | 👁 | 👁 | 👁 | ❌ | 👁 (own) | ❌ |
| **Invisible Time** | 👁 | 👁 | 👁 | ✏️ (own) | ❌ | ❌ |
| **Failure DNA** | 👁 | 👁 | 👁 | 👁 | 👁 (own) | ❌ |

**Kluczowe zasady egzekwowane w backendzie (canAccess + RLS):**
- TECHNICIAN widzi tylko tickety przypisane do niego LUB w workspace (nie widzi Billing nigdy domyślnie)
- OWNER_CLIENT widzi tylko dane swojego client-workspace (nie widzi innych klientów MSP)
- EMPLOYEE_CLIENT widzi tylko swoje urządzenia (ownerid = self) + tickety które utworzył
- Override `AccessGrant(resourceType=DEVICE, resourceId=X)` daje dostęp per-zasób

---

## 6. USER JOURNEYS (10 kluczowych scenariuszy)

### J1 — „Pracownik klienta zgłasza awarię przez portal"
1. Anna (EMPLOYEE_CLIENT) loguje się na `dworosmolice.infradesk.pl`
2. Klika „Nowe zgłoszenie" → wybiera zakładkę **Z AI**
3. Wkleja treść maila który wysłała do szefa: "Outlook mi nie działa od rana"
4. Iris rozpoznaje: kategoria=email, priorytet=średni, tytuł=„Outlook nie działa"
5. Anna zatwierdza → ticket T-2026-0017 utworzony → email confirmation
6. Ticket ląduje w panelu MSP Silers (queue), Adrian widzi notyfikację push
7. Adrian przypisuje Mariuszowi → status ASSIGNED → push do Mariusza

### J2 — „Onboarding nowego klienta"
1. Adrian (OWNER_MSP) idzie do `silers.infradesk.pl/clients` → **Dodaj klienta**
2. 3-tryby: Formularz / Wizard / **Z AI** (np. wkleja dane z maila klienta)
3. Tworzy się: Workspace typu CLIENT, subdomena `nowyklient.infradesk.pl` (auto wildcard nginx), WorkspaceRelation (Silers ↔ nowy klient)
4. Adrian dodaje ręcznie: lokalizacja główna, OwnerKlient (kontakt), kilka kontaktów
5. Wysyła invite email do OwnerKlient
6. OwnerKlient dostaje email → klika link → ustawia hasło → wchodzi na swoją subdomenę
7. Może dodać swoich pracowników (EMPLOYEE_CLIENT)

### J3 — „Mariusz w terenie u klienta"
1. Mariusz (TECHNICIAN, telefon w aucie) wjeżdża w promień 100m od Dwór Osmolice
2. System wykrywa geofence → push „Jesteś u Dwór Osmolice — rozpocząć sesję?"
3. Klika Tak → `LocationVisit` + `WorkSession` z autoStartedByGeofence=true, GPS stempel
4. Jeśli Mariusz ma przypisany T-2026-0017 na tym kliencie → ticket → IN_PROGRESS
5. Wieczorem wyjeżdża → oddali się > 150m przez 5min → push „Zakończyć sesję?"
6. Klika → **End session modal**: opis pracy, czas, **bulk-close innych ticketów urządzenia** (checkboxy)
7. Ticket → RESOLVED, klient dostaje maila „Potwierdź 😊/🙂/☹️"

### J4 — „Adrian sprawdza Client Risk Score"
1. Adrian wchodzi do `silers.infradesk.pl/clients`
2. Widzi tabelę z kolumną **Risk Score** — Wismont: 73, Metbud: 24, Dwór Osmolice: 12
3. Klika Wismont → widzi rozbicie: „2× late payment (20pkt) + 3× CRITICAL w 7 dniach (25pkt) + SLA breached 2× (15pkt) + 1 CRITICAL bez agenta (13pkt)"
4. System pokazuje trend: „score był 45 tydzień temu — wzrost o 28 pkt"
5. Adrian klika „Zadzwoń do OwnerKlient" (CRM activity) albo planuje delegację Mariusza

### J5 — „Agent desktop wykrywa awarię → auto-ticket"
1. Agent na `srv-prod-01` wysyła telemetry: dysk 98%
2. Backend widzi → **dedupuje z ostatnimi 60min** → jeśli nowe → `MonitoringAlert(severity=HIGH)`
3. Auto-tworzy `Ticket(source=AGENT, priority=HIGH, title="[HIGH] disk_full — srv-prod-01")`
4. Jeśli Adrian ma auto-assign rule → ticket przypisany do Mariusza
5. Mariusz dostaje push, Shadow Mode zapisuje „AI też by tak sklasyfikowała"

### J6 — „Koniec miesiąca, rozliczenie czasu Mariusza"
1. Adrian wchodzi do `silers.infradesk.pl/billing`
2. Wybiera miesiąc + Mariusz → system pokazuje:
   - Wszystkie WorkSession z billable=true
   - Suma minut × stawka godzinowa (z Membership)
   - Rozbicie per klient (co się wystawia na który klient)
3. Adrian klika „Zatwierdź i wyślij do fakturowania" → dane lądują w V1 FINANSE przez integration endpoint
4. Faktura wystawiana w V1 (gdzie jest moduł FINANSE), link wraca do V2 jako `Order.invoiceId`

### J7 — „Invisible Time Tracking: koniec dnia Mariusza"
1. Mariusz przez cały dzień działał: 2× GPS visit, 4× SSH do serwerów, 3× komentarze w ticketach, 1 telefon rozmowy (CrmActivity)
2. Każdy sygnał → `TimeSignal`
3. Iris nocą agreguje: "10:23-11:45 u Dwór Osmolice (82 min, ticket T-0017) • 12:30-13:15 SSH do srv-prod-01 (45 min, ticket T-0019) • ..."
4. Rano Mariusz widzi na `/ai/time` propozycje TimeSlot → klik „Zatwierdź wszystko" albo korektuje → wpada do `WorkSession` + billing

### J8 — „Shadow Mode weekly report"
1. Przez tydzień Iris robiła shadow decisions dla: ticket_classify, priority_guess, auto_resolve, auto_assign
2. W niedzielę wieczorem cron → Adrian dostaje raport: "Ten tydzień: 47 shadowed decisions. Accuracy 94% (niestety pod 95% więc auto-apply jeszcze niedostępne). Gdybym była włączona — zaoszczędziłabyś 6.2h roboty = 620 PLN."
3. Adrian klika „Pokaż przypadki gdzie się pomyliłaś" → widzi 3 konkretne tickety, może dać feedback
4. Po 4 tygodniach > 95% accuracy → toggle auto-apply się odblokowuje

### J9 — „Backup wykrył problem"
1. BackupConfig na Metbud srv-db-01 → Cron 02:00 → start `BackupHistory(status=RUNNING)`
2. Po 15 min fail → `BackupHistory(status=FAILED, errorMessage="Connection refused")`
3. Backend tworzy `MonitoringAlert(severity=HIGH)` i `Ticket(priority=HIGH, "Backup failed — Metbud srv-db-01")`
4. Mariusz dostaje push, rozwiązuje (może być po prostu nocny restart serwera), oznacza jako RESOLVED
5. Kolejny backup za dobę udany → alert się nie powtarza (dedup)

### J10 — „Failure DNA wykrywa wzorzec"
1. Przez 2 tygodnie w różnych ticketach pojawia się wzmianka „TP-Link TL-R480T+ resetuje się co 3 dni"
2. Nocą cron → embeddings + HDBSCAN → klaster wykryty
3. LLM weryfikuje → `FailureCluster(label="TP-Link TL-R480T+ reset after firmware 3.19", ticketCount=12, affectedClients=5, opportunityPln=18000)`
4. Adrian dostaje w poniedziałek email: "Wykryto wzorzec dotyczący 12 ticketów u 5 klientów. Szacowana wartość biznesowa: 18k PLN (upsell nowych routerów)."

---

## 7. WIREFRAMES tekstowe (kluczowe ekrany)

### 7.1 Dashboard MSP (kokpit)

```
┌──────────────────────────────────────────────────────────────────────┐
│  🌅 Dzień dobry Adrian!                                [↻ Odśwież]   │
│  Dziś: 3 otwarte zgłoszenia, 1 krytyczne, 2 sesje w toku              │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────────────────────────────┐            │
│  │  KPI gauge  │  │  Otwarte tickety: 12                  │            │
│  │  SLA 94%    │  │  Krytyczne: 1                         │            │
│  │   (radial)  │  │  Sesje aktywne: 2                     │            │
│  │             │  │  Klienci online: 8/11                 │            │
│  └─────────────┘  └──────────────────────────────────────┘            │
├──────────────────────────────────────────────────────────────────────┤
│  📋 Ostatnie zgłoszenia                        [Wszystkie →]          │
│  • 🔴 T-2026-0017 Outlook nie działa       Dwór Osmolice  15 min    │
│  • 🟡 T-2026-0016 Drukarka w sekretariacie Wismont         1 h       │
│  • 🟢 T-2026-0015 Hasło do domena AD      Metbud           2 h       │
├──────────────────────────────────────────────────────────────────────┤
│  📍 Kto teraz w terenie                                               │
│  • Mariusz Kowalski — Dwór Osmolice (od 10:23, 47 min)                │
├──────────────────────────────────────────────────────────────────────┤
│  🧠 Iris insight                                                      │
│  "Client Risk Score Wismont wzrósł z 45 do 73 w tym tygodniu.         │
│   3× CRITICAL + 2× late payment. Proponuję zadzwonić do Anny."        │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tickety — lista (dual-view)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Zgłoszenia                  [📊 Wizualnie | 📋 Tabelarycznie]  [+ Nowe]│
│  [🔍 Szukaj...] [Status ▾] [Priorytet ▾] [Klient ▾] [Przypisany ▾]    │
├──────────────────────────────────────────────────────────────────────┤
│ WIZUALNIE (karty):                                                    │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐             │
│  │ 🔴 T-0017       │ │ 🟡 T-0016       │ │ 🟢 T-0015       │             │
│  │ Outlook nie dz. │ │ Drukarka        │ │ Hasło domena    │             │
│  │ Dwór Osm.       │ │ Wismont         │ │ Metbud          │             │
│  │ Mariusz · 15min │ │ — · 1h          │ │ Adrian · 2h     │             │
│  └────────────────┘ └────────────────┘ └────────────────┘             │
│                                                                       │
│ TABELARYCZNIE:                                                        │
│  Nr      Tytuł          Status    Priorytet  Klient       Przypisany │
│  T-0017  Outlook...     OPEN      CRITICAL   Dwór Osm.    Mariusz    │
│  T-0016  Drukarka...    ASSIGNED  HIGH       Wismont      —          │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.3 Szczegóły ticketu

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Zgłoszenia      T-2026-0017       🔴 OPEN  CRITICAL     [⋮ Akcje]│
├──────────────────────────────────────────────────────────────────────┤
│  [ OPEN ] → [ ASSIGNED ] → [ IN_PROGRESS ] → [ RESOLVED ] → [ CLOSED ] │
│                                                                       │
│  Tytuł:     Outlook nie działa                                        │
│  Opis:      Od rana Outlook mi nie chce się otworzyć...               │
│  Klient:    Dwór Osmolice                                             │
│  Lokalizacja: Biuro główne, ul. Świętokrzyska 10                      │
│  Urządzenie: LAPTOP-ANNA-K (Dell Latitude 5530)                       │
│  Przypisany: Mariusz Kowalski [Zmień]                                 │
│  Utworzony: 2026-04-21 09:15 (Anna Nowak, via portal → AI)            │
│  SLA: response w 30 min ✓ | resolve w 4h → zostało 2h 45min           │
├──────────────────────────────────────────────────────────────────────┤
│  💬 Komentarze (3)                                                    │
│  [ Publiczne | Wewnętrzne ]                                           │
│  ─ Adrian (2h temu, wewn.): "Mariusz sprawdzi zdalnie najpierw"       │
│  ─ Mariusz (1h temu, publ.): "Jadę na miejsce"                        │
│  [ Dodaj komentarz... ]                           [□ Wewnętrzny] [Wyślij]│
├──────────────────────────────────────────────────────────────────────┤
│  📎 Załączniki (1)    •    🔗 Powiązane: T-0012, T-0011 (same device) │
│  🧠 Shadow Mode: AI by sklasyfikowała to tak samo ✓                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.4 Klienci — widok wizualny (karty)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Klienci                         [📊 Wizualnie] [📋 Tabela]  [+ Dodaj]│
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐        │
│  │ 🏢 Dwór Osmolice                              Risk: 🟢 12  │        │
│  │ 3 lokalizacje · 24 urządzenia · 5 otwartych zgłoszeń       │        │
│  │ Mariusz tam teraz (od 10:23)                                │        │
│  │ [Zobacz →]                                                  │        │
│  └────────────────────────────────────────────────────────────┘        │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │ 🏢 Wismont                                    Risk: 🟠 73  │        │
│  │ 2 lokalizacje · 18 urządzeń · 3 otwartych zgłoszeń         │        │
│  │ ⚠ Wzrost o 28 pkt w tym tygodniu — zadzwoń                 │        │
│  │ [Zobacz →]                                                  │        │
│  └────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.5 Szczegóły klienta

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Klienci     🏢 Dwór Osmolice                        [Edit] [⋮]  │
├──────────────────────────────────────────────────────────────────────┤
│  [ Info ] [ Lokalizacje ] [ Urządzenia ] [ Kontakty ] [ Zgłoszenia ] │
│  [ Sesje ] [ Rozliczenia ] [ Risk ] [ GPS ] [ Backup ] [ Historia ]  │
├──────────────────────────────────────────────────────────────────────┤
│  INFO:                                                                │
│  NIP: 123-456-78-90 · Slug: dworosmolice                              │
│  Subdomena: dworosmolice.infradesk.pl                                 │
│  Kontakt główny: Anna Nowak (anna@dworosmolice.pl, 501-234-567)       │
│  Plan: PRO · Relacja: HOURLY (150 PLN/h)                              │
│                                                                       │
│  STATS (ostatnie 30 dni):                                             │
│  • 23 zgłoszenia (12 rozwiązanych, 5 otwartych, 6 zamkniętych)        │
│  • 89h serwisowania · 13 350 PLN billable                              │
│  • SLA 96% · Rating 4.8/5                                              │
│  • 24 urządzenia · 18 online · 6 offline                               │
│                                                                       │
│  [🧠 Iris: wygeneruj raport miesięczny dla klienta]                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.6 Portal klienta — Dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dzień dobry, Anna!                 [Ja] [Profil] [Wyloguj]           │
│  Dwór Osmolice · Plan PRO · Powered by Silers MSP                     │
├──────────────────────────────────────────────────────────────────────┤
│  📋 Moje zgłoszenia                                                   │
│  🔴 T-2026-0017 Outlook nie działa        W toku · Mariusz jedzie     │
│  🟢 T-2026-0015 Hasło do domena AD        Rozwiązane — [Oceń 😊]      │
│  [+ Nowe zgłoszenie]                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  💻 Moje urządzenia (24, 18 online)                                   │
│  • srv-prod-01      🟢 Online · 98% dysk zajęty ⚠                    │
│  • LAPTOP-ANNA-K    🟢 Online                                         │
│  • drukarka-biuro   🟢 Online                                         │
├──────────────────────────────────────────────────────────────────────┤
│  🧠 Iris mówi:                                                        │
│  "Cześć Anno! Twoje srv-prod-01 ma 98% dysk — polecam zrobić           │
│   porządki w /var/log, mogę powiadomić Mariusza?" [Tak] [Nie teraz]   │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.7 Nowe zgłoszenie — modal 3-trybowy

```
┌──────────────────────────────────────────────────────────────────────┐
│  Nowe zgłoszenie                                              [✕]    │
│  [ 📋 Formularz ][ ✨ Wizard ][ 🧠 Z AI ]                              │
├──────────────────────────────────────────────────────────────────────┤
│ (AI mode — Twoja preferencja zapamiętana):                            │
│                                                                       │
│  Wklej email, opis problemu, cokolwiek:                               │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │ Od: Anna <anna@dworosmolice.pl>                            │        │
│  │ Dzień dobry, od rana nie mogę otworzyć Outlooka.           │        │
│  │ Potrzebuję to pilnie do końca dnia.                        │        │
│  └────────────────────────────────────────────────────────────┘        │
│                                                                       │
│  [🧠 Niech Iris stworzy draft]                                        │
│  ↓                                                                    │
│  ✨ Draft gotowy:                                                     │
│  • Tytuł: Outlook nie działa                                          │
│  • Priorytet: Wysoki (z „pilnie, do końca dnia")                      │
│  • Kategoria: email                                                   │
│  • Klient: Dwór Osmolice (z domeny nadawcy)                           │
│  • Urządzenie: LAPTOP-ANNA-K (z historii Anny)                        │
│                                                                       │
│  [Popraw ręcznie] [✓ Utwórz zgłoszenie]                               │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.8 GPS mapa terenowych techników (nowość vs V1)

```
┌──────────────────────────────────────────────────────────────────────┐
│  GPS Field Service                                      [Dziś ▾]      │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐        │
│  │                  🗺 MAPA POLSKI                            │        │
│  │                                                             │        │
│  │       📍 Mariusz (10:23, Dwór Osmolice)                     │        │
│  │       📍 Adrian (Silers HQ, Warszawa)                       │        │
│  │                                                             │        │
│  │     ──trasa Mariusza dziś: 47 km, 3 wizyty──                │        │
│  └────────────────────────────────────────────────────────────┘        │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │ Mariusz Kowalski — trasa dziś                               │        │
│  │ ✓ 08:15 Silers HQ                                           │        │
│  │ ✓ 09:30 Wismont (zakończono, 45 min)                        │        │
│  │ ● 10:23 Dwór Osmolice (aktywna, 47 min)                     │        │
│  │ · 13:00 Metbud (planowane)                                  │        │
│  └────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.9 Shadow Mode raport

```
┌──────────────────────────────────────────────────────────────────────┐
│  🧠 Shadow Mode — Tygodniowy raport                                   │
│  21–27 kwietnia 2026                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  📊 Co Iris by zrobiła                                                │
│                                                                       │
│  Feature          Total  Resolved  Matched  Accuracy  Status          │
│  ticket_classify    47     42        40       95.2%   ✓ Ready         │
│  priority_guess     47     42        38       90.5%   ~ 4 więcej tyg. │
│  auto_resolve       12     12        11       91.7%   ~ 4 więcej tyg. │
│  auto_assign        28     28        26       92.9%   ~ 4 więcej tyg. │
│                                                                       │
│  💰 Gdyby była włączona: +6.2h zaoszczędzone = 620 PLN                │
│  📈 Przez 4 tygodnie utrzyma 95%+ → unlock auto-apply                 │
│                                                                       │
│  [Pokaż 2 przypadki gdzie się pomyliłam]                              │
│  [Włącz ticket_classify w auto-apply] ← odblokowane dla tego feature  │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.10 Stany (empty / loading / error)

Dla **każdego** ekranu:

- **Empty**: ikona (lucide), tytuł („Brak [X]"), 1-zdaniowy opis, CTA primary („Dodaj pierwsze [X]")
- **Loading**: skeleton dla tabeli/kart (shimmer anim), spinner globalny tylko gdy > 3s
- **Error**: ikona danger, tytuł („Coś poszło nie tak"), detail (z `error.message`), przyciski „Spróbuj ponownie" + „Zgłoś problem"
- **Permission denied**: ikona lock, „Nie masz dostępu do tego modułu", link „Poproś OWNER-a o uprawnienie" (mailto)

---

## 8. DESIGN SYSTEM — zgodny ze standardem Adriana

Na podstawie `C:\Users\adria\infradesk\new_*.tsx` (PackHub standard) + istniejących ID PANEL tokens.

### 8.1 Tokens (CSS vars, 3 motywy)

```css
:root, [data-theme="light"] {
  /* Primary */
  --pri: #6366f1;              /* indigo-500 */
  --pri-h: #4f46e5;            /* hover */
  --pri-l: #eef2ff;            /* light bg */
  --pri-glow: rgba(99,102,241,.18);

  /* Surfaces */
  --bg:  #f0f2f5;              /* app bg */
  --sf:  #fff;                 /* card */
  --sf2: #f8f9fb;              /* input/secondary surface */
  --sf-h: #f3f4f6;             /* hover */

  /* Text 3-tier */
  --tx:  #111827;              /* primary */
  --tx2: #4b5563;              /* secondary */
  --tx3: #9ca3af;              /* muted/label */

  /* Semantic */
  --ok: #10b981; --ok-l: #ecfdf5;
  --wn: #f59e0b; --wn-l: #fffbeb;
  --er: #ef4444; --er-l: #fef2f2;
  --in: #3b82f6; --in-l: #eff6ff;

  /* Borders */
  --bd: #e5e7eb; --bd-l: #f3f4f6; --bd-f: #6366f1;

  /* Radii */
  --r: 14px; --r-s: 10px; --r-l: 18px; --r-xl: 24px;

  /* Shadows */
  --sh1: 0 1px 2px rgba(0,0,0,.04);
  --sh2: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --sh3: 0 4px 12px rgba(0,0,0,.07);
  --sh4: 0 12px 32px rgba(0,0,0,.1);
  --sh-glow: 0 0 24px var(--pri-glow);

  /* Glass */
  --glass: rgba(255,255,255,.72);
  --glass-bd: rgba(255,255,255,.5);
  --glass-blur: 16px;

  /* Sidebar */
  --side-bg: #fff;
  --side-bd: #e5e7eb;
  --side-act: #eef2ff;
  --side-act-tx: #4f46e5;
  --side-hv: #f3f4f6;
}

[data-theme="dark"] { /* … analogicznie dark-mode palette … */ }
[data-theme="auto"] { /* prefers-color-scheme: dark → fallback light */ }
```

### 8.2 Primitivy (components library)

| Komponent | Opis |
|---|---|
| `Button` | 4 variants (primary gradient / ghost / outline / danger) × 3 sizes |
| `Input` / `Textarea` / `Select` | Glass bg, focus ring 3px var(--pri-glow) |
| `Card` | sf bg + border + sh2, hover: translateY(-2px) + sh3 |
| `Badge` | 5 variants (neutral/accent/success/danger/warning) z ikoną lucide |
| `Modal` (Dialog) | Radix-based, sizes sm/md/lg/xl, ESC + backdrop close |
| `Tabs` | Radix-based, underline active |
| `DropdownMenu` | Radix-based, glass panel |
| `Toast` | react-hot-toast, glass bg z border accent |
| `Skeleton` | shimmer gradient, per-shape (card, row, circle, text) |
| `ViewToggle` | 📊 / 📋 toggle z persisted preference |
| `AddThreeWays` | Modal z 3 zakładkami (Formularz / Wizard / Z AI) |
| `ThemeToggle` | 3 opcje (Sun/Moon/Monitor) z kropkami active |
| `Gauge` (radial) | SVG radial, kolor zależy od %, animowany (800ms ease) |
| `StatCard` | Ikona + liczba + label + trend↑↓ |
| `Timeline` | Vertical list z icons + timestamps |
| `StatusPill` | Kropka + label (NEW/OPEN/RESOLVED itd.) |
| `PriorityDot` | 4 kolory (LOW gray / MEDIUM accent / HIGH warning / CRITICAL danger) |
| `DataTable` | Sortable cols, draggable cols, persisted cols, pagination, bulk select |

### 8.3 Typografia

- Font: **Inter** (400/500/600/700), z `font-feature-settings: "cv02","cv03","cv04","cv11"`
- Sizes: 10px label / 11px caption / 12px small / 13px body / 14px base / 15px lead / 18px h3 / 22px h2 / 28px h1
- Uppercase labels: letter-spacing 0.12em, font-weight 700

### 8.4 Animacje (per standard)

- `anim-up` 300ms ease-out (fade + 8px translate Y)
- `anim-scale` 300ms ease-out (scale 0.96 → 1)
- `anim-glow` 2s infinite (primary button)
- **Stagger** `stg > *` z kolejnymi delay 40ms — dla list i grid

### 8.5 Layout consistent

- Sidebar: **240px fixed left**, scrollable, ze sekcjami (icons + labels)
- TopBar: **52px sticky top**, glass, search left / notifications + user right
- Main content: padding 20px (p-5), max-width 1440px
- Responsive: sidebar collapsible < 1024px (hamburger)

---

## 9. INTEGRACJE — katalog

| Integracja | Status V1 | Plan V2 |
|---|---|---|
| **Mail butler** (IMAP polling → ticket) | Brak (zaplanowane) | **V2 Phase 1 must-have** — IMAP + regex parsing + Iris dla złożonych |
| **Desktop Agent** (telemetry + commands + backup) | ✅ v4.14.6 | Backend v2 compat, agent 5.0.0 pod `/api/v2/*` — Phase 1 |
| **RustDesk** (remote sessions sync) | ✅ | Phase 1 |
| **AnyDesk / TeamViewer / RDP / SSH / custom** | ✅ (linki na Device) | Phase 1 (bez zmian) |
| **QR codes** (device tagging + public ticket form) | ✅ | Phase 1 |
| **Web Push notifications** (VAPID) | ✅ | Phase 1 |
| **Google Drive backup** (OAuth2) | ✅ | Phase 1 |
| **InfraDesk Cloud backup** (własny storage) | ✅ | Phase 1 |
| **Google OAuth / Calendar / Gmail / Contacts** | ❌ (zaplanowane od miesięcy) | Phase 2 |
| **WhatsApp whatsapp-web.js** | ✅ | Phase 2 (może być adapter do Iris) |
| **KSeF** (oficjalne wystawianie faktur) | Brak (schema ready) | Zostaje w V1 FINANSE |
| **GUS/REGON** | ❌ | Phase 1 (nice-to-have przy dodawaniu klienta) |
| **Payment gateway mBank/Imoje** | ✅ (webhook + checkout) | Zostaje w V1 dla istniejących klientów, V2 na Stripe post-Phase1 |
| **Android TV dashboard** | ✅ | V1 zostaje, V2 pomijamy |
| **IDO (ID CORE) bridge** | ✅ HTTP bridge | V2: **IN-PROCESS** jako moduł AI/Iris (bez bridge) |

---

## 10. NADBUDÓWKA AI (po V1 feature parity)

**Kolejność wdrażania (sequenced):**

### Phase 2 (po feature parity):
1. **Shadow Mode** — record + weekly report UI + auto-apply toggle per feature
2. **Client Risk Score** — dashboard na `/clients` + szczegóły per klient + history chart
3. **GPS Field Service** — mapa + geofence checkin + proximity alerts + trasa dnia

### Phase 3:
4. **Invisible Time Tracking** — desktop agent plugin + backend aggregator + approval UI

### Phase 4:
5. **Failure DNA** — pgvector embeddings + HDBSCAN clustering nightly + raport + opportunity PLN

Każda feature ma osobny feature flag w `WorkspaceModule`, włączana per workspace.

---

## 11. PLAN ROLLOUTU

### Sprint 0 (przed kodem): **TO JEST TERAZ**
- Ten blueprint → Adrian akceptuje / koryguje
- 🔶 otwarte decyzje → Adrian zamyka

### Sprint 1 (foundations — 5 dni pracy)
- Backend: uzupełnić schema o brakujące modele (Task, Delegation, CrmActivity, BackupConfig+History, ActivityLog, SlaPolicy, WorkspaceModule, WorkspaceSetting, TimeSignal+Slot, FailureCluster)
- Backend: wildcard subdomain routing middleware (Host header → workspace resolution)
- Backend: Tickets enriched (assignedToUserId auto-notifications, bulk close)
- Frontend: design system (tokens + primitivy z new_*.tsx jako wzorzec)
- Frontend: AppShell (sidebar + topbar + motywy)

### Sprint 2 (Operacje — 5 dni)
- Tickets: lista dual-view + 3-tryby add + szczegóły + komentarze + transitions + bulk
- Tasks: lista + szczegóły + linkowanie do ticketów
- Sessions: lista + start/stop z ticket linking + end-session modal z bulk-close
- Alerts: lista + auto-ticket link
- Orders: lista + szczegóły
- Delegations: lista + szczegóły + kalendarz
- Calendar: FullCalendar integration (zadania + sesje + delegacje)
- Billing (time): rozliczenia czasu pracy per technik per miesiąc

### Sprint 3 (Klienci + Infra — 5 dni)
- Clients: lista + szczegóły (z zakładkami)
- Contacts: lista + szczegóły
- Locations: lista + szczegóły + mapa
- Partners: lista (enterprise)
- Devices: lista + szczegóły (z zakładkami)
- Agents: lista (PENDING/ACTIVE/INACTIVE) + approve/reject + telemetry + commands
- Monitoring: alerts + audit score history + network map
- Backups: lista + konfiguracja (wizard) + historia + now-run

### Sprint 4 (Sejf + Moja firma + AI Phase 1 — 5 dni)
- Vault: 3 widoki (all/mine/shared) + reveal + share + rotation
- My company + users + plan-and-modules + activity-logs + settings
- AI: czat Iris + integracja z ID CORE (in-process)
- Shadow Mode MVP
- Client Risk Score dashboard

### Sprint 5 (Klient portal — 5 dni)
- Subdomena routing end-to-end
- Portal klienta: dashboard + tickets (moje) + new-request + devices (moje) + locations + vault (moje) + orders + billing + users + settings
- Portal design: responsive, uproszczony

### Sprint 6 (Integracje + polerka — 5 dni)
- Mail butler (IMAP → Iris → ticket)
- Desktop agent 5.0.0 pod `/api/v2/*`
- RustDesk / AnyDesk / itd. links working
- GUS/REGON addon
- Web push notifications
- Google Drive + InfraDesk Cloud backup flows
- QR codes (public ticket form)

### Sprint 7 (AI Pioneer — 5 dni)
- GPS Field Service — mapa + geofence checkin + proximity alerts
- Invisible Time Tracking — pipeline + approval UI
- Failure DNA — nightly job + raport
- Voice notes → Iris → auto-summary w ticketach

### Sprint 8 (migracja + pilot — 3 dni)
- Skrypt migration v1→v2 (już istnieje, dopracować dla uzupełnionych modeli)
- Adrian testuje: logowanie + dodaje ręcznie 1 klienta poza listą V1
- OK → migracja 11 firm → pilot 2 tygodnie
- Coexistence V1 FINANSE (link z V2 do V1 dla faktur)

**Total: ~38 dni solidnej pracy** (Sprint 1-8)

---

## 12. OTWARTE DECYZJE 🔶 (do zatwierdzenia przez Adriana)

### ✓ D1 (APPROVED): Login globalny vs per-subdomain
**Rekomendacja:** `v2.infradesk.pl/login` jeden dla wszystkich, po zalogowaniu redirect na właściwą subdomenę (z listy Membership). 
**Alternatywa:** login na każdej subdomenie osobno (V1 tak działa). 
**Moja rekomendacja: GLOBALNE** — mniej confusion.

### ✓ D2 (APPROVED): OwnerKlient vs Adrian dla konta klienta
Kto zakłada konto: Adrian dla klienta (invite) czy klient sam z linku publicznego?
**Rekomendacja:** Adrian zakłada workspace + OwnerKlient dostaje invite mailem. Brak self-signup dla klientów (bezpieczeństwo).

### ✓ D3 (APPROVED): Czy EMPLOYEE_CLIENT widzi wszystkie tickety firmy czy tylko swoje?
**Rekomendacja:** Domyślnie **tylko swoje**, OwnerKlient może dać override „może widzieć wszystkie".

### ✓ D4 (APPROVED): Samodzielne konta wewnętrzne (INTERNAL_IT) — czy włączamy w Phase 1?
V1 ma flag `internal_it`. To firma która sama sobie robi IT (bez MSP). **Rekomendacja:** zostaje, ale Phase 1 tylko MSP — INTERNAL_IT w Phase 2.

### ✓ D5 (APPROVED): Billing time — stawki per user czy per workspace?
**Rekomendacja:** Stawka per Membership (user × workspace), bo Mariusz może mieć inną stawkę u różnych klientów.

### ✓ D6 (APPROVED): Backup encryption key — gdzie trzymamy?
**Rekomendacja:** Per-config zaszyfrowany master-keyem env (jak Vault). User nigdy nie widzi klucza.

### ✓ D7 (APPROVED): Kolejność sprintów
**Rekomendacja:** Sprint 1-4 (core MSP) → Sprint 5 (portal klienta) → Sprint 6-7 (integracje + AI) → Sprint 8 (migracja). 
**Alternatywa:** najpierw cały MSP + portal, potem dopiero integracje.

### ✓ D8 (APPROVED): Nazwa / branding portalu klienta
V1 ma "Portal i obsługa". Rekomendacja: **„Panel klienta"** dla klient-subdomena, każdy klient może nadpisać brandingiem (logo + kolor).

### ✓ D9 (APPROVED): Iris — głos, czat, czy oba?
V1 ma VoiceAssistant (głos) i AiCommandsPage (czat). **Rekomendacja:** Phase 1 czat + komendy (tekst), Phase 2 głos.

### ✓ D10 (APPROVED): Moduł „Partnerzy IT" (MSP-to-MSP)
V1 ma to jako enterprise upsell. **Rekomendacja:** Phase 2, bo Silers nie ma jeszcze tego use-case'u.

---

## 13. JAK TERAZ DZIAŁAMY

**Krok 1 (TERAZ — Adrian przegląda ten dokument):**
- Czytasz sekcję po sekcji
- 🔶 decyzje — akceptujesz albo zmieniasz
- Jeśli czegoś brakuje (pomysł / moduł / ekran / rola) — **dopisujesz albo mówisz mi dopisać**

**Krok 2 (blueprint finalizowany):**
- Wszystkie 🔶 zamknięte → dokument jest **OFICJALNYM kontraktem**
- Ten plik → `/home/adrian/infradesk/docs/V2_BLUEPRINT.md` w git

**Krok 3 (koduję zgodnie z blueprintem):**
- Sprint po sprincie, 5 dni każdy
- **Nie odchodzę od blueprintu bez Twojego OK**
- Cokolwiek robię jest w nim zapisane → łatwo weryfikujesz „robi to co miał zrobić?"

**Krok 4 (pilot):**
- Po Sprint 4 (core MSP) dostajesz środowisko testowe
- Sprawdzasz, dajesz feedback, wracam do blueprintu + kodu
- Dopiero pełny rollout gdy powiesz „jest"

---

**— KONIEC BLUEPRINT V2 —**

Ten dokument ma ~8000 słów. Każda sekcja jest niezależna — możesz czytać po kawałku. Do każdego punktu mogę wrócić i rozszerzyć / zmienić.

**Twoja decyzja:** czytasz i mówisz „zmień X" / „dodaj Y" / „jedź z tym" → zaczynam Sprint 1.

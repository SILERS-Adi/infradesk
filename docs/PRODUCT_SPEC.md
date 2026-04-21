# InfraDesk v2 — Product Specification (Source of Truth)

**Wersja:** 0.1 draft
**Data:** 2026-04-21
**Target:** Polski rynek MSP + wewnętrzne IT; pionierski AI-first SaaS

> Ten dokument jest **jedynym źródłem prawdy** o produkcie. Każda decyzja kodu, schematu DB, UI musi wynikać z tego co tu napisane. Jeśli implementacja nie pasuje do specyfikacji — poprawiamy kod, nie spec. Jeśli spec jest zły — aktualizujemy spec (z uzasadnieniem), potem kod.

---

## 1. Wizja produktu

**InfraDesk** to pionierski SaaS dla polskich firm IT (MSP) i wewnętrznych działów IT. Łączy ticketing + asset management + monitoring + AI assistant w jednym miejscu. W odróżnieniu od zachodnich konkurentów (ConnectWise, Atera, NinjaOne) celujemy w:

1. **Polski pierwszy** — KSeF-ready, NIP/REGON validation, BLIK/P24 płatności, 24/7 PL support, RODO-compliant by default.
2. **AI-first od dnia 1** — nie add-on, nie premium tier. Każdy użytkownik dostaje Copilot który klasyfikuje tickety, pisze raporty, generuje KB, asystuje w naprawach.
3. **Premium UX** — Linear-grade (Cmd+K, keyboard shortcuts, multi-panel workflow, real-time collaboration, zero loading spinners).
4. **Pioneer features 2050** — voice callback na critical alert, digital twin symulacja, multi-tenant LLM memory, outcome-based pricing.

### Target persona

- **Primary: Adrian (owner MSP SILERS)** — 5-15 techników, 50-500 endpointów, 10-30 klientów. Nie ma czasu na Kaseyę, nie stać na ConnectWise, Atera nudna.
- **Secondary: wewnętrzne IT średniej firmy** — 2-5 osób IT, 100-300 endpointów, zero klientów, własna infrastruktura.
- **Tertiary: klient końcowy** (Iwona Dominex, Kinga z PKS) — portal do zgłaszania problemów, przeglądania haseł, widzenia rozliczeń.

---

## 2. Pricing i plany (draft do zatwierdzenia)

| Plan | Cena netto PLN/tech/mies. (annual) | Limity |
|---|---|---|
| **Starter** | 299 PLN | 3 techs max, 100 endpointów, AI Copilot light, 1 workspace klient |
| **Pro** | 499 PLN | unlimited techs, unlimited endpoints, pełen AI, KSeF, voice assistant, 10 workspace klient |
| **Enterprise** | 799 PLN | white-label, SOC-2, digital twin, multi-tenant memory, 24/7 PL phone support, unlimited workspace |

Porównanie: Atera Pro + Copilot ~$274/tech/mies. (~1100 PLN), ConnectWise quote ~1500-2500 PLN/tech/mies. **Jesteśmy 2-3x taniej** przy podobnym feature set + polski rynek dedykowany.

Modele sprzedaży:
- Per-tech (main) — skaluje się z zespołem, nie karze za dużo endpointów
- Freemium trial 14 dni (bez CC)
- Annual discount 20% (kartka "oszczędzasz X,XXX PLN/rok")

---

## 3. Architektura techniczna

### Backend
- **Runtime:** Node.js 20 + TypeScript strict
- **Framework:** Express.js (zostaje z v1), podział na moduły
- **ORM:** Prisma 5 + Postgres 16
- **Security:** Row-Level Security (RLS) per `workspaceId` na każdej tabeli
- **Auth:** JWT (httpOnly cookies) + refresh token rotation + CSRF double-submit
- **Testing:** Jest + Supertest (integration) + Vitest (unit) — 80% coverage minimum
- **Observability:** OpenTelemetry + structured logging (JSON) + Sentry

### Frontend
- **React 18** + TypeScript + Vite
- **UI library:** shadcn/ui (Radix primitives + Tailwind) + ID PANEL tokens (CSS custom properties z `frontend/src/ui/tokens.ts`)
- **State:** Zustand (auth, workspace, theme) + TanStack Query (server state)
- **Routing:** React Router v6 + lazy loaded routes
- **Realtime:** Server-Sent Events (SSE) dla push updates
- **Design tokens:** **jedno źródło prawdy** — przeniesione 1:1 z v1

### AI layer
- **Provider:** Anthropic Claude (Opus 4.7 dla zadań premium, Haiku 4.5 dla taniej klasyfikacji)
- **Prompt management:** jeden plik `prompts/*.ts` per feature (`ticket-classify.ts`, `kb-generate.ts`, `copilot.ts`)
- **Vector store:** Postgres + pgvector (per-tenant index)
- **Voice:** Anthropic Claude via API + Whisper dla STT + ElevenLabs lub Azure Neural TTS

### Infrastructure
- VPS (obecny) + Docker Compose (zostaje)
- Postgres z pgvector extension
- Redis dla BullMQ (scheduled jobs)
- Nginx reverse proxy (zostaje)
- Backup: pg_dump codziennie o 3:00 AM, retention 30 dni

### Multi-tenant isolation (KRYTYCZNE)
- Każda tabela z danymi user-facing ma `workspaceId` NOT NULL
- RLS policy: `USING (workspace_id = current_setting('app.workspace_id')::uuid)`
- Middleware ustawia `SET app.workspace_id = '...'` na początku każdego requesta
- **Żadne query nie może pominąć workspace context** — runtime error jeśli próba

---

## 4. Data model (Prisma schema v2 draft)

### Core entities

```prisma
// User — global account
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  firstName     String
  lastName      String
  phone         String?
  passwordHash  String
  avatarUrl     String?
  emailVerified Boolean  @default(false)
  twoFactorEnabled Boolean @default(false)
  twoFactorSecret  String?
  locale        String   @default("pl-PL")
  timezone      String   @default("Europe/Warsaw")
  isActive      Boolean  @default(true)
  lockedUntil   DateTime?
  loginAttempts Int      @default(0)
  tokenVersion  Int      @default(0)  // for refresh token revocation
  isSuperAdmin  Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships   Membership[]
  // ... other relations
}

// Workspace — tenant (firma MSP / klient MSP / internal IT)
model Workspace {
  id          String   @id @default(uuid())
  slug        String   @unique  // URL-friendly, e.g. "silers"
  name        String
  taxId       String?  // NIP
  type        WorkspaceType  // MSP, CLIENT, INTERNAL_IT
  logoUrl     String?
  primaryColor String  @default("#3B82F6")
  isActive    Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  plan        Plan     @default(STARTER)
  planExpiresAt DateTime?
  trialEndsAt   DateTime?

  memberships   Membership[]
  tickets       Ticket[]
  devices       Device[]
  // ...
}

enum WorkspaceType { MSP CLIENT INTERNAL_IT }
enum Plan { STARTER PRO ENTERPRISE }

// Membership — user ↔ workspace relation
model Membership {
  id          String   @id @default(uuid())
  userId      String
  workspaceId String
  role        Role     // OWNER, ADMIN, MEMBER (3 only, nie 5)
  scope       Scope    @default(FULL)  // FULL, SCOPED
  isDefault   Boolean  @default(false)  // which workspace user opens on login
  status      MembershipStatus @default(ACTIVE)
  invitedBy   String?
  invitedAt   DateTime?
  acceptedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User      @relation(fields: [userId], references: [id])
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  grants      AccessGrant[]
  overrides   PermissionOverride[]

  @@unique([userId, workspaceId])
  @@index([workspaceId])
}

enum Role { OWNER ADMIN MEMBER }
enum Scope { FULL SCOPED }
enum MembershipStatus { ACTIVE INVITED REVOKED }

// AccessGrant — SCOPED user → specific resources
model AccessGrant {
  id           String @id @default(uuid())
  membershipId String
  resourceType ResourceType  // DEVICE, LOCATION, CLIENT_WORKSPACE
  resourceId   String
  level        AccessLevel   // VIEW, EDIT, DELETE
  createdAt    DateTime @default(now())

  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  @@index([membershipId])
  @@index([resourceType, resourceId])
}

// PermissionOverride — per-user module-level overrides
model PermissionOverride {
  id           String @id @default(uuid())
  membershipId String
  moduleKey    String  // "tickets", "devices", "vault", "invoicing", ...
  level        AccessLevel  // VIEW, EDIT, NONE (default: inherited from role)

  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  @@unique([membershipId, moduleKey])
}

enum AccessLevel { NONE VIEW EDIT DELETE }
enum ResourceType { DEVICE LOCATION CLIENT_WORKSPACE }
```

### Tickets (core)

```prisma
model Ticket {
  id           String @id @default(uuid())
  workspaceId  String
  ticketNumber String  // human-readable: "T-2026-0001"
  title        String
  description  String  @db.Text
  status       TicketStatus
  priority     TicketPriority
  category     String?  // AI-classified
  source       TicketSource  // EMAIL, PORTAL, AGENT, PHONE, AI_CHAT, MANUAL
  deviceId     String?
  locationId   String?
  assignedToUserId String?
  createdByUserId  String
  requesterName    String?  // if created by external email
  requesterEmail   String?
  requesterPhone   String?

  dueAt        DateTime?
  firstResponseAt DateTime?
  resolvedAt   DateTime?
  closedAt     DateTime?

  aiClassified Boolean @default(false)
  aiConfidence Float?  // 0-1
  aiSummary    String? @db.Text  // AI-generated short summary

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  device       Device?   @relation(fields: [deviceId], references: [id])
  comments     TicketComment[]
  events       TicketEvent[]  // audit trail
  attachments  Attachment[]
  sessions     WorkSession[]

  @@unique([workspaceId, ticketNumber])
  @@index([workspaceId, status])
  @@index([assignedToUserId])
}

enum TicketStatus { NEW OPEN ASSIGNED IN_PROGRESS WAITING RESOLVED CLOSED CANCELLED }
enum TicketPriority { LOW MEDIUM HIGH CRITICAL }
enum TicketSource { EMAIL PORTAL AGENT PHONE AI_CHAT MANUAL }
```

### Ticket state machine

```
            ┌─────────────────────────────────────────────┐
            │                                             │
NEW ──→ OPEN ──→ ASSIGNED ──→ IN_PROGRESS ──→ WAITING ──→ RESOLVED ──→ CLOSED
            │         │              │              │           │
            │         │              │              │           │ (reopen)
            │         │              │              └───────────┘
            │         │              │              
            └────────→ CANCELLED ←───┴───────────────────────────────────
```

**Reguły przejść:**
- `NEW → OPEN`: automatyczne po AI classification lub manual view przez technika
- `OPEN/ASSIGNED/IN_PROGRESS → WAITING`: technik zaznacza "waiting for client" + auto-reminder 24/48/72h
- `WAITING → IN_PROGRESS`: klient odpowiedział (email) lub technik kontynuuje
- `IN_PROGRESS → RESOLVED`: technik rozwiązał, klient dostaje email z 3-day review window
- `RESOLVED → CLOSED`: automatycznie po 3 dniach bez feedback lub klient kliknął "potwierdzam rozwiązanie"
- `RESOLVED → IN_PROGRESS`: klient kliknął "problem dalej jest" (max 2 reopeny, potem trzeba nowe ticket)
- `* → CANCELLED`: tylko OWNER/ADMIN, wymagana notatka z powodem

### Devices + Agents

```prisma
model Device {
  id           String @id @default(uuid())
  workspaceId  String
  locationId   String
  name         String
  hostname     String?
  category     DeviceCategory  // WORKSTATION, SERVER, ROUTER, PRINTER, ...
  criticality  Criticality     // LOW, MEDIUM, HIGH, CRITICAL
  status       DeviceStatus    // ACTIVE, INACTIVE, DECOMMISSIONED
  assetTag     String?
  serialNumber String?
  manufacturer String?
  model        String?
  qrCodeValue  String  @unique
  warrantyUntil DateTime?
  purchaseDate  DateTime?
  installationDate DateTime?
  assignedUserId String?   // end user na tym device
  managerId      String?   // responsible IT person
  notes        String?  @db.Text
  internalNotes String? @db.Text  // invisible to client

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  @@unique([workspaceId, name])
  @@index([workspaceId])
}

model AgentRegistration {
  id            String @id @default(uuid())
  workspaceId   String
  deviceId      String?  @unique  // 1:1 with Device after approval
  agentToken    String   @unique  // bcrypt'd
  agentVersion  String
  status        AgentStatus  // PENDING, ACTIVE, REJECTED, INACTIVE
  hostname      String
  lastSeen      DateTime?
  serverMetrics Json?    // latest telemetry snapshot
  approvedAt    DateTime?
  approvedBy    String?
  // ... contact fields if pending
}
```

### WorkSessions (billing time)

```prisma
model WorkSession {
  id           String @id @default(uuid())
  workspaceId  String
  technicianId String
  ticketId     String?  // related ticket (optional — can be ad-hoc session)
  deviceId     String?
  locationId   String?
  serviceMode  ServiceMode  // REMOTE, ONSITE
  status       SessionStatus  // ACTIVE, PAUSED, COMPLETED
  startedAt    DateTime
  endedAt      DateTime?
  durationMinutes Int?  // computed from entries
  notes        String? @db.Text
  aiSummary    String? @db.Text  // AI-generated from voice notes
  billable     Boolean @default(true)
  hourlyRate   Decimal? @db.Decimal(10,2)  // snapshot at session time

  timeEntries  SessionTimeEntry[]
  closedTickets TicketSessionLink[]  // bulk-closed tickets

  @@index([workspaceId, technicianId])
}

model SessionTimeEntry {
  id            String @id @default(uuid())
  workSessionId String
  startedAt     DateTime
  endedAt       DateTime?
  durationMinutes Int?
}

// Bulk close: when technician ends session and checks "also fixed these 3 tickets"
model TicketSessionLink {
  id            String @id @default(uuid())
  workSessionId String
  ticketId      String
  @@unique([workSessionId, ticketId])
}
```

### Monitoring & Alerts

```prisma
model MonitoringAlert {
  id           String @id @default(uuid())
  workspaceId  String
  deviceId     String
  type         String  // "disk_failing", "service_down", "score_drop", ...
  severity     AlertSeverity  // CRITICAL, HIGH, MEDIUM, LOW, INFO
  message      String  @db.Text
  rawData      Json?   // original metric snapshot
  resolved     Boolean @default(false)
  resolvedAt   DateTime?
  resolvedBy   String?  // userId or "auto"
  autoResolveReason String?  // "condition_cleared", "stale_7d", ...
  ticketId     String?  // auto-created ticket if severity >= HIGH
  createdAt    DateTime @default(now())

  @@index([workspaceId, resolved])
  @@index([deviceId, type])
}

enum AlertSeverity { INFO LOW MEDIUM HIGH CRITICAL }
```

**Business rules:**
- Dedup window: ten sam `deviceId + type` w ciągu 6h → update `updatedAt` na existing, nie twórz nowego
- Auto-resolve: scheduler co 15 min sprawdza czy warunek ustał w `serverMetrics` → `resolved = true`, reason `condition_cleared`
- Stale cleanup: alerty > 7 dni bez update → `resolved = true`, reason `stale_7d`
- Auto-ticket: severity CRITICAL → natychmiast ticket, HIGH → ticket po 2 alertach w 24h

### CRM + Orders (podstawa dla MSP obsługi klienta)

```prisma
// Contact — osoby u klienta (kadrowa, księgowa, dyrektor)
model Contact {
  id           String @id @default(uuid())
  workspaceId  String  // providerowy workspace (MSP), bo CRM należy do MSP
  clientWorkspaceId String  // do którego klienta ten kontakt należy
  firstName    String
  lastName     String
  email        String?
  phone        String?
  role         String?  // "Dyrektor", "Księgowość", "Kadrowa"
  isMainContact Boolean @default(false)
  notes        String? @db.Text
  tags         String[] @default([])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// Order — zamówienie sprzętu/licencji dla klienta
model Order {
  id            String @id @default(uuid())
  workspaceId   String
  clientWorkspaceId String  // dla kogo zamówienie
  orderNumber   String
  status        OrderStatus  // DRAFT, QUOTE_SENT, APPROVED, ORDERED, DELIVERED, INVOICED, CANCELLED
  title         String
  description   String? @db.Text
  items         OrderItem[]
  totalNet      Decimal @db.Decimal(12,2)
  totalGross    Decimal @db.Decimal(12,2)
  vatRate       Decimal @db.Decimal(5,2) @default(23)
  supplier      String?  // gdzie kupujemy (np. x-kom, Morele)
  expectedDeliveryDate DateTime?
  deliveredAt   DateTime?
  invoiceId     String?  // FK do faktury zakupowej (jeśli jest)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([workspaceId, orderNumber])
}

model OrderItem {
  id        String @id @default(uuid())
  orderId   String
  name      String
  quantity  Int
  unitNet   Decimal @db.Decimal(10,2)
  totalNet  Decimal @db.Decimal(12,2)
  linkedDeviceId String?  // po dostawie przypisz do stworzonego Device
}

enum OrderStatus { DRAFT QUOTE_SENT APPROVED ORDERED DELIVERED INVOICED CANCELLED }
```

### Vault (credentials storage)

```prisma
model Credential {
  id           String @id @default(uuid())
  workspaceId  String
  deviceId     String?
  locationId   String?
  category     CredentialCategory
  name         String  // "MikroTik Admin", "VPN Office"
  username     String?
  passwordEncrypted String  // AES-256-GCM
  passwordIv   String
  urlOrHost    String?
  notes        String? @db.Text
  expiresAt    DateTime?  // hasło do rotacji
  lastRotatedAt DateTime?
  createdByUserId String
  visibleToRoles Role[]  // widoczność per rola
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  viewLog      CredentialViewLog[]

  @@index([workspaceId])
}

model CredentialViewLog {
  id           String @id @default(uuid())
  credentialId String
  userId       String
  viewedAt     DateTime @default(now())
  ipAddress    String?
  userAgent    String?
}

enum CredentialCategory { WINDOWS VPN EMAIL APPLICATION DATABASE ROUTER WIFI SSH OTHER }
```

### Audit log

```prisma
model AuditEvent {
  id           String @id @default(uuid())
  workspaceId  String?  // null = platform-level event
  userId       String?  // null = system
  entityType   String  // "Ticket", "Device", "User", ...
  entityId     String
  action       String  // "CREATE", "UPDATE", "DELETE", "LOGIN", "VIEW_SECRET", ...
  description  String  @db.Text
  metadata     Json?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  @@index([workspaceId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
}
```

---

## 5. Permission model (jeden model, 3 warstwy)

### Warstwa 1: Role
3 role, nie więcej:
- **OWNER** — 1 per workspace, pełny dostęp, jedyny który może usunąć workspace
- **ADMIN** — pełen dostęp operacyjny, zarządzanie userami, bez billing/delete workspace
- **MEMBER** — dostęp domyślny: tylko moduły włączone w jego PermissionOverride

### Warstwa 2: Scope
- **FULL** — user widzi wszystkie dane w workspace
- **SCOPED** — user widzi tylko zasoby w `AccessGrant` (np. konkretne device/location)

### Warstwa 3: Module overrides
- `PermissionOverride.moduleKey` — klucz modułu: `tickets`, `devices`, `vault`, `invoicing`, `crm`, `orders`, `reports`, `users`, `settings`, ...
- `level`: `NONE` (ukryte) / `VIEW` (readonly) / `EDIT` (full)
- Default per rola (można override):
  - OWNER: wszystko EDIT
  - ADMIN: wszystko EDIT oprócz `settings.billing`
  - MEMBER: wszystko NONE — musi być jawnie nadane

### Jeden helper `canAccess(user, moduleKey, action)`

```ts
// Shared między frontend i backend (ten sam kod, identyczne zachowanie)
export function canAccess(
  ctx: { role: Role; scope: Scope; overrides: Map<string, AccessLevel>; isSuperAdmin: boolean },
  moduleKey: string,
  action: 'view' | 'edit' | 'delete'
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.role === 'OWNER') return true;
  if (ctx.role === 'ADMIN' && action !== 'delete') return true;

  const level = ctx.overrides.get(moduleKey) ?? 'NONE';
  if (level === 'NONE') return false;
  if (action === 'view') return level === 'VIEW' || level === 'EDIT' || level === 'DELETE';
  if (action === 'edit') return level === 'EDIT' || level === 'DELETE';
  if (action === 'delete') return level === 'DELETE';
  return false;
}
```

Używany w:
- **Backend middleware** `requireAccess(moduleKey, action)` — zwraca 403 jeśli !canAccess
- **Frontend route guard** `<RequireAccess module="tickets" action="view">`
- **Frontend button/menu** `const can = useCan('tickets', 'edit')` → disable/hide

**Jedna funkcja, 3 miejsca wywołania, identyczna logika.**

---

## 6. AI-first features

### MVP (włączone od dnia 1)
1. **Auto-classify ticketów** — LLM analizuje `title + description + requester history`, zwraca `{category, priority, suggestedAssignee, summary}`. Confidence > 0.8 → apply automatycznie, < 0.8 → propozycja w UI.
2. **Command palette Cmd+K** z AI search — nie tylko nawigacja, ale też "znajdź wszystkie tickety o druku z ostatnich 30 dni"
3. **AI Copilot drawer** (prawy panel, Cmd+/) — kontekstowy, wie jaka strona user jest, ma RAG do KB + aktualne dane workspace. Można pytać "co zrobić z tym ticketem" lub "pokaż podobne incydenty"
4. **Conversational ticket creation** — klient pisze "nie mam internetu na serwerze" → IDO pyta uzupełniające ("który serwer? kiedy zaczął?") → tworzy ticket z uzupełnionymi danymi

### Nice-to-have (Q4 2026)
5. **Voice-to-ticket documentation** — technik w terenie nagrywa voice note (PWA mobile), Whisper STT → Claude pisze raport → zapisany jako komentarz do ticketu
6. **Auto-generated KB** — nocny job: LLM analizuje zamknięte tickety z ostatnich 30 dni, grupuje podobne, proponuje artykuły KB (approval queue przed publikacją)
7. **Predictive maintenance light** — SMART dysków, trend RAM/CPU → "ten dysk padnie za ~X dni z 70% pewnością"
8. **Anomaly detection z reasoning** — LLM dostaje historyczny baseline + aktualny stan → "CPU 95% ale to normalny wzorzec dla tego usera o tej porze, ignoruj"

### Pioneer 2050 (Enterprise tier, Q1-Q2 2027)
9. **AI voice callback** na CRITICAL alert — Twilio + Claude Realtime; system dzwoni do klienta, tłumaczy problem, zbiera zgodę na remote actions
10. **Digital twin** — przed `rm -rf` AI symuluje na twin-ie, pokazuje efekt, wymaga 2-step confirmation
11. **Multi-tenant LLM memory** — pgvector per-tenant; AI pamięta że "Wismont ma legacy Windows 2008 na kasie, nie aktualizuj"
12. **Automated runbooks** — agentic AI wykonuje playbook naprawy (restart service, reinstall agent) → raport + option rollback
13. **Automated SOC-2 compliance** — AI zbiera logi, weryfikuje kontrole, generuje audit package dla klienta Enterprise

---

## 7. UX spec

### Layouty (jeden komponent, 2 warianty)

**MSP Panel (`/app/*`)** — dla techników i admin MSP
- Gęste tabele, keyboard-first, Cmd+K, multi-panel (lista + detail)
- Dark mode default
- Presence indicators (kto patrzy ten sam ticket)
- Wzór: **Linear + Vercel**

**Client Portal (`/panel/*`)** — dla klienta końcowego
- Kafelki, duży hero, minimalna nawigacja
- Light/Dark/Auto
- ID CORE orb animation na dashboardzie
- Wzór: **obecny ID PANEL** (przenosimy 1:1)

### Przyjęte wzorce

- **Command palette** (Cmd+K wszędzie) — akcje + nawigacja + AI query
- **Multi-panel** (lista po lewej, detail po prawej — brak modal reload)
- **Inline editing** (kliknij pole → edytuj, Enter → save)
- **Keyboard shortcuts** zwrócone standardem (G+T = tickety, G+D = devices, J/K = up/down w liście, / = search)
- **Timeline view** (każdy obiekt ma event log jak git log)
- **Zero loading spinners** (optimistic UI + skeleton + TanStack Query cache)
- **Real-time presence** (SSE, avatar ring gdy ktoś inny patrzy)

---

## 8. Polish market specifics

### KSeF (mandatory from 2026-04-01)
- Schema `invoice`, `invoice_line`, `ksef_submission` jako FA(3) XML-ready
- API integracja z KSeF 2.0 OpenAPI (SDK Java/Node)
- Odkładamy UI faktur do post-MVP, ale schema musi być gotowa

### GUS/REGON
- Przy onboardingu klienta: user wpisuje NIP → API GUS zwraca dane → pre-fill formularza
- Automatyczna weryfikacja płatnika VAT
- Cache 30 dni żeby nie walić API GUS

### Płatności
- Stripe (karta międzynarodowa) + Przelewy24 (BLIK + transfery) + tPay (backup)
- Faktury proforma generowane przy upgrade planu
- Dla enterprise: kontrakt + faktura VAT pre-paid

### RODO
- Audit log każdego VIEW_SECRET (kto, kiedy, skąd)
- Retention: 12 miesięcy, potem anonymization
- Right to erasure: user może zażądać usunięcia → soft delete + hard delete po 30 dniach
- DPO kontakt w stopce każdego emaila
- Export całych danych workspace w JSON na żądanie (RODO compliance)

---

## 9. Roadmap wdrożenia

### Faza 0 — Przygotowanie (DONE)
- [x] Snapshot produkcji
- [x] Audyt pełny (3 perspektywy)
- [x] Decision: REBUILD

### Faza 1 — Fundament (Tydzień 1)
- [ ] Branch `rebuild-v2`
- [ ] Katalog `backend-v2/` z TypeScript strict + ESLint + Prettier
- [ ] Prisma schema v2 (jak wyżej)
- [ ] RLS policies Postgres
- [ ] Auth (JWT + refresh + CSRF) przeniesione + testy
- [ ] Jest setup + 20 pierwszych testów integracyjnych
- [ ] CI/CD: GitHub Actions (build + test + lint)

### Faza 2 — Core backend (Tydzień 2)
- [ ] Users module + self-edit + invite flow
- [ ] Workspaces module + multi-tenant switcher + MSP↔client relations
- [ ] Permissions module (role + scope + overrides + `canAccess`)
- [ ] Tickets module + state machine + AI classifier
- [ ] Devices + AgentRegistration + legacy API compat (żeby 4.14.6 agent działał)
- [ ] WorkSessions + bulk close
- [ ] MonitoringAlert + dedup + auto-resolve scheduler
- [ ] Vault + AES-256 encryption + view log
- [ ] CRM Contacts + Orders
- [ ] AuditEvent dla wszystkiego
- [ ] 80% test coverage

### Faza 3 — Frontend (Tydzień 3)
- [ ] Katalog `frontend-v2/` z Vite + React + shadcn + Tailwind + ID PANEL tokens
- [ ] Jeden `AppLayout` (MSP mode + Client mode warunkowo)
- [ ] Routing + route guards z `canAccess`
- [ ] Command palette Cmd+K
- [ ] Views: Login, WorkspaceSwitcher, Dashboard, Tickets, Devices, Users, Vault, CRM, Orders
- [ ] AI Copilot drawer (Cmd+/)
- [ ] Real-time presence (SSE)
- [ ] Mobile responsive
- [ ] Accessibility audit (Lighthouse > 95)

### Faza 4 — Migracja (Tydzień 3.5-4)
- [ ] Script `migrate-v1-to-v2.ts` (czyści orphany, dedup, mapuje deprecated pola)
- [ ] Coexistence: `old.infradesk.pl` read-only + `infradesk.pl` v2
- [ ] Desktop agent `/api/v1/*` compat route
- [ ] Pilot rollout: Silers najpierw, potem Dominex/Wismont/PKS stopniowo
- [ ] Monitoring produkcji + alerts → Iris

### Post-MVP (po wakacjach Adriana)
- [ ] AI features nice-to-have (voice-to-ticket, auto-KB, predictive)
- [ ] KSeF integration pełna
- [ ] Stripe + Przelewy24 + onboarding self-service
- [ ] Mobile app (React Native lub Tauri)
- [ ] Pioneer features (voice callback, digital twin) — po osiągnięciu 10+ klientów

---

## 10. Governance — zasady pracy nad rebuildem

1. **Branch `rebuild-v2` nie idzie na produkcję bez OK Adriana.**
2. **Każda zmiana ma test** — brak testa = brak mergea.
3. **Spec przed kodem** — jeśli brakuje reguły biznesowej, pytam Iris, zapisuję w `DECISIONS_NEEDED.md`, używam defaultu, wracam gdy odpowiedź.
4. **Raport do Iris co ~4h pracy** — progres, blockery, decyzje.
5. **Memory zapisywana po każdej istotnej decyzji** — następna sesja łapie kontekst.
6. **Commit message w formacie**: `feat(module): opis + test(module): co sprawdza`.
7. **Zero silent failures** — każdy error loguje się w AuditEvent + Sentry.

---

## Appendix A — Zachowane z v1 (nie przebudowujemy)
- Desktop agent `Asystent Business 4.14.6` (dopiero co zbudowany, działa z auto-update)
- ID PANEL CSS tokens (`frontend/src/ui/tokens.ts`, `styles/panel/*.css`)
- Auth strategy (JWT + refresh + CSRF + httpOnly cookies)
- Mail butler P1 (biuro@silers.pl, oddzielny proces)
- ID CORE bridge (API integration, oddzielny repo `/home/adrian/idcore/`)
- Prisma migration workflow (tool OK)

## Appendix B — Wyrzucone z v1 (nie przenoszone)
- `accountType`, `accessScope`, `allowedModules`, `organizationType` (deprecated pola)
- `PlatformConfig`, `Setting` vs `AppSetting` (dead/duplikat)
- `default-ws` jako koncept (usunięty z bazy)
- 3 duplikaty vault pages → 1 komponent
- 2 users pages → 1
- 4 layouty → 2 warianty w jednym komponencie
- 41 menu items bez `module:` key (wszystko ma mieć moduł)
- Hardcoded `PERMISSION_TREE` w `routes.ts` → DB `PermissionNode` table

---

## Appendix C — Lista konkurencji do monitorowania
- **ConnectWise** — market leader, dużo funkcji, ciężki UX
- **Atera** — AI-first, per-tech model, $274/tech (z Copilot)
- **NinjaOne** — UX wzór, per-endpoint
- **SuperOps.ai** — najbliższy duchem, AI-native
- **HaloPSA** — najdeeper ITIL, enterprise-grade
- **Freshservice** — ITSM SaaS, pełen compliance
- **Kaseya** — legacy, zły post-breach percepcja

**Nasza pozycja**: polski rynek, AI-first od dnia 1, Linear UX, KSeF-native, 2-3x taniej od Atery/ConnectWise, 24/7 PL support jako differentiator.

---

**Wersja spec**: 0.1
**Następna aktualizacja**: po zakończeniu Fazy 1 (backend-v2 scaffold + auth)
**Kto może aktualizować**: Adrian (owner) → PR z uzasadnieniem, zmiana po akceptacji

---

## 12. GPS / FIELD SERVICE MODULE

### 12.1 Cel

Automatyczne tracking pracy terenowej serwisantów (Mariusz & spółka): kiedy wszedł do klienta, kiedy wyszedł, ile km przejechał, czy jadąc w terenie nie mija otwartego ticketu u sąsiedniego klienta.

### 12.2 Funkcje

1. **Geofence auto-checkin** — mobile app co 30 s (foreground) / 5 min (background) wysyła fixa. Gdy serwisant wejdzie w promień `Location.geofenceRadiusMeters` (default 100 m) na ≥ 2 min → backend tworzy `LocationVisit(checkInMethod=AUTO_GEOFENCE)` i pushuje powiadomienie „Jesteś u [Klient] — rozpocząć sesję?”. Akceptacja → `WorkSession` startuje z `autoStartedByGeofence=true` i stempluje `arrivalGpsLat/Lon`.
2. **Checkout** — gdy serwisant oddala się > `radius × 1.5` i przez 5 min brak bliskiego fixa → `LocationVisit.checkedOutAt=now()`, prompt „Zakończyć sesję?”.
3. **Proximity alert (the killer feature)** — gdy serwisant w ruchu (speed > 30 km/h), w godzinach pracy, backend co 60 s zapytuje otwarte tickety w workspace gdzie `Device.Location` ma GPS i dystans < 10 km, a kierunek heading serwisanta trafia w „stożek” 60° wokół wektora do celu → push „Jesteś 7 km od [klient] — ticket T-XXX [priority]. Dojedziesz?”. Akcje: Accept (auto-assign + Google Maps nav) / Later (mute 30 min) / Not me.
4. **Smart routing morning briefing** — `GET /api/v2/field-service/briefing` zwraca zoptymalizowaną kolejność ticketów na dziś, z ETA i sumą km. AI (Claude Haiku 4.5) bierze pod uwagę priorytet, SLA, lokalizację i dopasowuje trasę.

### 12.3 Dane (Prisma — już w schema.prisma)

- `TechnicianLocationLog` — surowy strumień fixów (retencja 30 dni default, potem tylko agregaty)
- `LocationVisit` — semantyczne wizyty (jestem/wyszedłem), 1:1 z opcjonalnym `WorkSession`
- `TechnicianGpsConsent` — preferencje + RODO consent per user (workingHoursStart/End, trackingOnWeekends, retentionDays, batteryThresholdPercent)
- Pola na `Location`: `geofenceRadiusMeters`, `autoCheckInEnabled`, `requireQrConfirmation`
- Pola na `WorkSession`: `autoStartedByGeofence`, `arrivalGps*`, `departureGps*`, `distanceTraveledKm`

### 12.4 RODO / compliance

1. Consent screen przy pierwszym uruchomieniu mobile — checkbox „Rozumiem, że pracodawca zobaczy moją lokalizację w godzinach pracy (08–17, Pn–Pt). Dane są trzymane 30 dni i potem anonimizowane. Mogę wyłączyć GPS w każdej chwili (toggle w topbarze)."
2. Status w topbarze: 🟢 GPS ON / 🔴 GPS OFF / 🟡 Off duty.
3. `AuditEvent` dla każdego wyświetlenia GPS innej osoby (RODO right-to-know).
4. Automatyczna anonimizacja po `retentionDays` — zostają tylko `total km`, `avg visit duration`, `visits count` per week.
5. Off-hours, weekendy, battery < 20% — default OFF (serwisant nie martwi się że nie wróci do domu).

### 12.5 Decyzje do Adriana (przed kodem)

- **Radius default**: 100 m OK dla biur; dla magazynów / małych lokali może być za duży (zostaje per-Location override).
- **Working hours default 08–17 Pn–Pt**: OK? Dodać „zawsze on-call" dla emergency.
- **Retention 30 dni**: OK z RODO + miesięczny payroll.
- **Routing provider**: Google Maps Directions ($200/mies dla 10k requests) vs OSRM self-hosted (darmowe, mniej dokładne) — **rekomendacja: OSRM na start, Google w Enterprise plan**.

---

## 13. AI PIONEER FEATURES — 4 confirmed + 1 deferred

Szczegółowa analiza wykonana 2026-04-20 (patrz conversation log). Z 5 pomysłów Adriana wybrane 4 do MVP rebuild-v2, piąty (Technician Brain Clone) odłożony.

### 13.1 Shadow Mode AI  (priorytet #1 — T7)

Każda decyzja AI (auto-resolve, priority guess, ticket classify) działa w tle i nagrywa do `ShadowDecision` table. Raz w tygodniu raport „gdyby Iris działała autonomicznie, zaoszczędziłbyś X godzin i Y PLN, ale Z decyzji byłoby błędnych". Gdy accuracy > 95 % przez 4 tyg — Adrian może włączyć auto-apply per moduł.

**Schema dodatek (Phase 2):**
```prisma
model ShadowDecision {
  id              String   @id @default(uuid())
  workspaceId     String
  feature         String   // "ticket_classify", "auto_resolve", "priority_guess"
  inputHash       String   // SHA-256 of input context
  aiOutput        Json
  humanOutput     Json?    // actual decision taken by human
  matched         Boolean? // AI == human?
  estimatedValue  Decimal? @db.Decimal(10, 2)  // PLN saved if auto-applied
  createdAt       DateTime @default(now())
  @@index([workspaceId, feature, createdAt(sort: Desc)])
}
```

### 13.2 Invisible Time Tracking  (priorytet #2 — T9-T11)

Multi-source signal aggregation (desktop agent active-window, GPS visits, ticket comments, ssh sessions, mail replies) → automatyczna `TimeSlot` z sugestią „30 min u PKS Garwolin na ticket T-1234, 15 min RDP na srv-prod-01". Serwisant zatwierdza 1-klikiem zamiast wypisywać godziny ręcznie.

**Schema dodatek (Phase 3):**
```prisma
model TimeSignal {
  id            String     @id @default(uuid())
  workspaceId   String
  userId        String
  source        SignalSource  // DESKTOP_AGENT, GPS_VISIT, TICKET_COMMENT, SSH, MAIL
  startedAt     DateTime
  endedAt       DateTime?
  context       Json       // source-specific: process name, ticket id, device id, recipient
  createdAt     DateTime   @default(now())
  @@index([workspaceId, userId, startedAt(sort: Desc)])
}

model TimeSlot {
  id            String   @id @default(uuid())
  workspaceId   String
  userId        String
  startedAt     DateTime
  endedAt       DateTime
  minutes       Int
  aiGuess       Json     // { ticketId, deviceId, confidence, reasoning }
  approvedBy    String?  // user who approved
  approvedAt    DateTime?
  workSessionId String?  @unique
  createdAt     DateTime @default(now())
  @@index([workspaceId, userId, startedAt(sort: Desc)])
}

enum SignalSource { DESKTOP_AGENT GPS_VISIT TICKET_COMMENT SSH MAIL }
```

### 13.3 Failure DNA  (priorytet #3 — T12+, Product-Market-Fit feature)

Embedding każdego `ResolvedTicket` → pgvector → HDBSCAN clustering nocą → LLM weryfikuje i etykietuje skupiska → „U 12 klientów mamy powtarzalny problem: router TP-Link resetuje połączenie co 7 dni po aktualizacji firmware 3.19. Propozycja: rollback + upsell nowszego modelu → 18k PLN opportunity". Raport w Insights tab, powiadomienie dla OWNER.

**Schema dodatek (Phase 4):**
```prisma
model FailureCluster {
  id             String   @id @default(uuid())
  workspaceId    String
  label          String   // AI-generated: "TP-Link reset after firmware 3.19"
  description    String   @db.Text
  ticketCount    Int
  affectedClients Int
  opportunityPln Decimal? @db.Decimal(10, 2)
  status         ClusterStatus  @default(ACTIVE)
  dismissedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  members        FailureClusterMember[]
  @@index([workspaceId, status])
}
model FailureClusterMember {
  clusterId  String
  ticketId   String
  similarity Float
  cluster    FailureCluster @relation(fields: [clusterId], references: [id], onDelete: Cascade)
  @@id([clusterId, ticketId])
}
enum ClusterStatus { ACTIVE DISMISSED RESOLVED }
```

### 13.4 Client Risk Score  (priorytet #4 — T7, równolegle z Shadow Mode)

Per-klient `ClientRiskScore 0–100` z rozbiciem na komponenty (payment delay, ticket volume spike, SLA breaches, device criticality mismatch, churn signals). Explainability — hover pokazuje „dlaczego 73? → 2× late payment + 3× CRITICAL w ostatnim tygodniu". Alert dla Owner gdy score spada > 15 punktów w 30 dni.

**Schema dodatek (Phase 2):**
```prisma
model ClientRiskScore {
  id               String   @id @default(uuid())
  workspaceId      String   // MSP workspace
  clientWorkspaceId String  // scored client
  score            Int      // 0–100
  trend7d          Int      // delta vs 7 days ago
  components       Json     // { payment: 20, tickets: 15, sla: 8, churn: 30, ... }
  factors          Json     // human-readable explanations
  computedAt       DateTime @default(now())
  @@unique([workspaceId, clientWorkspaceId, computedAt])
  @@index([workspaceId, score])
}
```

### 13.5 DEFERRED: Technician Brain Clone

Pomysł — system uczy się stylu serwisanta (język, kolejność diagnostyki, preferowane narzędzia) i klonuje go na innych. **Odrzucono w pełnej formie** ze względu na RODO (personality profiling pracownika), poor ROI (trudno rozróżnić „styl" od przypadkowej wariancji), i trudności z walidacją.  Pozostawiono jako opcjonalne Level 1: „pisz raporty w stylu X" — włączane świadomie per user.

---

## 14. ID CORE — BACKBONE v2 (nie bridge jak v1)

W v1 ID CORE był zewnętrznym projektem (`/home/adrian/idcore`), wołanym przez backend InfraDesk przez HTTP API. W v2 **ID CORE jest fundamentem, nie nadbudową**.

### 14.1 Architektura

```
          ┌─────────────────────────────────────────┐
          │     Frontend (ID PANEL + mobile)        │
          └──────┬───────────────────────────┬──────┘
                 │                           │
       ┌─────────▼──────────┐   ┌────────────▼────────────┐
       │  Public API        │   │  ID CORE Agent API      │
       │  /api/v2/*         │   │  /api/v2/ido/*          │
       └─────────┬──────────┘   └────────────┬────────────┘
                 │                           │
       ┌─────────▼───────────────────────────▼────────────┐
       │            DOMAIN MODULES                        │
       │  tickets, devices, sessions, vault, crm,         │
       │  orders, monitoring, agents, mail, gps, kb       │
       └─────────┬─────────────────────────────────┬──────┘
                 │                                 │
       ┌─────────▼──────────┐          ┌───────────▼────────┐
       │  Prisma + pgvector │          │  ID CORE Core      │
       │  Postgres 14+      │          │  ─ RAG memory      │
       │  Redis (BullMQ)    │          │  ─ Tool catalog    │
       └────────────────────┘          │  ─ Cost tracking   │
                                       │  ─ Shadow mode     │
                                       │  ─ Digital twin    │
                                       └────────────────────┘
```

### 14.2 Kluczowe komponenty ID CORE (in-process w backend-v2)

- **Multi-tenant RAG memory** — `VectorEmbedding(workspaceId, entityType, entityId, embedding vector(1536))`. Per-tenant isolation by RLS + `workspaceId` filter.
- **Tool catalog** — każde wywołanie Claude Tools jest RBAC-wrapowane: `canAccess(user, module, action)` sprawdzane przed wykonaniem każdego tool-calla. AI nigdy nie dostaje uprawnień ponad to co user.
- **Cost tracking** — każdy call do Anthropic zapisuje `LlmUsage(model, inputTokens, outputTokens, costPln, feature)` — OWNER widzi billing per feature w czasie rzeczywistym.
- **Shadow mode** — per-feature flag w `WorkspaceAiConfig`. Decyzje AI nagrywane do `ShadowDecision` do weryfikacji zanim user włączy auto-apply.
- **Digital twin** — przed destructive actions (np. „zamknij wszystkie tickety statusu X"), AI pokazuje what-if diff („zamknę 47 ticketów, z czego 12 ma otwarte sesje < 1h — zasugeruj wstrzymanie").

### 14.3 Różnica v1 vs v2

| Aspekt               | v1 (bridge)                     | v2 (backbone)                                |
|----------------------|----------------------------------|----------------------------------------------|
| Deployment           | Osobny proces (idcore:PORT)      | In-process w backend-v2 (`src/modules/ai`)   |
| Memory               | Globalna                         | Per-tenant z RLS                             |
| Tool security        | Manualne (trust the prompt)      | RBAC-wrapped (każdy tool sprawdza canAccess) |
| Cost visibility      | Logi, nie widoczne dla klienta   | LlmUsage → Billing tab live                  |
| Shadow mode          | Brak                             | Built-in dla każdego feature                 |
| Rollout              | Deploy całej monolity            | Feature flags per feature per workspace      |

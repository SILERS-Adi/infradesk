# InfraDesk v2 — Backend

**Status:** Alpha (rebuild in progress)
**Branch:** `rebuild-v2`
**Last updated:** 2026-04-21

## Cel

Clean rebuild backendu InfraDesk jako SaaS MSP IT helpdesk — polski pierwszy, AI-first, pioneer features na miarę 2050 roku.

Obecny v1 (`backend/`) zostaje w produkcji dla Silers + 11 klientów aż v2 będzie gotowe i pilotowane. Nie ruszamy v1.

## Kluczowe założenia

1. **Jedno źródło prawdy uprawnień**: `Role` (OWNER/ADMIN/MEMBER) + `Scope` (FULL/SCOPED) + `PermissionOverride` per moduł. Zero deprecated aliasów.
2. **Row-Level Security** na każdej user-facing tabeli — backup autoryzacji aplikacyjnej.
3. **80% test coverage od dnia 1** (Jest + Supertest integration + Vitest unit).
4. **AI-first**: `LlmUsage` tracking, `VectorEmbedding` (pgvector) per-tenant, `KbArticle` auto-generated.
5. **KSeF-ready**: `Invoice` + `InvoiceItem` FA(3) compatible (UI faktur post-MVP).
6. **GDPR-first**: soft delete + hard delete after 30d, AuditEvent retention, right to erasure.

## Struktura

```
backend-v2/
├── src/
│   ├── index.ts              # app entry
│   ├── app.ts                # Express setup (modular, NO inline endpoints)
│   ├── config.ts             # env loading + validation (zod)
│   ├── modules/              # domain modules (each self-contained)
│   │   ├── auth/             # login, register, refresh, 2FA, password reset
│   │   ├── workspaces/       # workspace CRUD, MSP relations
│   │   ├── users/            # user CRUD, invites
│   │   ├── memberships/      # role management
│   │   ├── permissions/      # tree + overrides + canAccess helper
│   │   ├── tickets/          # CRUD + state machine + AI classify
│   │   ├── devices/          # inventory + QR codes
│   │   ├── agents/           # AgentRegistration + telemetry + v1 compat
│   │   ├── sessions/         # WorkSession + bulk close
│   │   ├── monitoring/       # alerts + dedup + auto-resolve
│   │   ├── vault/            # credentials + encryption + audit
│   │   ├── crm/              # contacts
│   │   ├── orders/           # order + items
│   │   ├── mail/             # MailBox + inbound processing
│   │   ├── ai/               # LLM proxy, RAG, copilot
│   │   └── audit/            # AuditEvent query API
│   ├── middleware/
│   │   ├── auth.ts           # JWT verify
│   │   ├── rls.ts            # set Postgres session variable
│   │   ├── requireWorkspace.ts
│   │   ├── requireAccess.ts  # uses canAccess(user, module, action)
│   │   ├── rateLimit.ts
│   │   └── errorHandler.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── llm.ts            # Anthropic SDK wrapper + cost tracking
│   │   └── crypto.ts         # AES-256-GCM for Vault
│   ├── utils/
│   │   ├── canAccess.ts      # SHARED with frontend (one source of truth)
│   │   ├── ticketStateMachine.ts
│   │   └── logger.ts
│   └── jobs/                 # BullMQ workers
│       ├── autoResolve.ts
│       ├── slaChecker.ts
│       ├── mailIngest.ts
│       └── kbGenerator.ts
├── prisma/
│   ├── schema.prisma         # v2 schema (THIS is source of truth, not v1)
│   └── migrations/           # v2 migrations from scratch
├── tests/
│   ├── integration/          # Supertest full API tests
│   └── unit/                 # Vitest unit tests
├── package.json
├── tsconfig.json
├── jest.config.js
└── .env.example
```

## Development workflow

1. `cd backend-v2`
2. `npm install`
3. `cp .env.example .env` — ustaw `DATABASE_URL` na Postgres z pgvector
4. `npm run prisma:migrate:dev --name init` — aplikuj migracje
5. `npm run dev` — tsx watch (auto-reload)
6. `npm test` — uruchom testy

## Deploy (docelowo)

- **Produkcja**: obok v1, na `/var/www/infradesk-v2/` + `docker-compose-v2.yml`
- **Subdomain**: `v2.infradesk.pl` na start (dla pilotów). Gdy stabilny → DNS switch na `infradesk.pl`.
- **Coexistence period**: 30 dni (stary backend dalej działa na `old.infradesk.pl`)

## Migracja z v1

Script `scripts/migrate-v1-to-v2.ts` — czyta starego Prisma, pisze do nowego.

Zasady:
- Pomija orphany (Device bez workspace, Ticket bez device jeśli source=AGENT)
- Pomija seed users (@infradesk.pl bez aktywności)
- Dedup Device (workspaceId, name)
- Remap ról: `TECHNICIAN` → `MEMBER` + pełne PermissionOverride, `VIEWER` → `MEMBER` + VIEW-only overrides
- Remap `CANCELLED` ticketów: pomija (nie są wartościowe historycznie)

## API versioning

- v2 endpointy pod `/api/v2/*`
- v1 endpointy (`/api/*`) pozostają przez 90 dni dla Desktop agent backward-compat
- Desktop agent dostanie wersję 5.0.0 używającą `/api/v2/*` gdy v2 stabilne

## Referencje

- `../docs/PRODUCT_SPEC.md` — pełna specyfikacja produktu
- `../docs/DECISIONS_NEEDED.md` — lista pytań biznesowych do Adriana
- `../docs/REBUILD_DECISION.md` — uzasadnienie rebuildu
- `../docs/DESIGN_REFERENCE_nowypanel.png` — wizualna referencja UI

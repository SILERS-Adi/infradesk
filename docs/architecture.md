# Architecture

## Overview

InfraDesk to monolit-modularny SaaS. Pojedyncza baza Postgres, pojedynczy
proces backendu Node, statyczny frontend serwowany przez nginx, agent Windows
łączący się przez WebSocket.

```
                     ┌────────────────────────────────────────────┐
                     │ infradesk.pl (nginx)                       │
                     │  ┌─ /        → frontend-v2/dist (static)   │
                     │  ├─ /api/*   → pm2 infradesk-api :3000     │
                     │  └─ /uploads → static (logos only)         │
                     └────────────────┬───────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
   ┌────────▼────────┐    ┌──────────▼──────────┐    ┌─────────▼─────────┐
   │ Browser (React) │    │ Asystent Windows    │    │ Outside webhooks  │
   │  - access JWT   │    │  - WS Bearer token  │    │  - Paynow         │
   │    in-memory    │    │  - REST fallback    │    │  - SMTP bounces   │
   │  - refresh      │    │                     │    │                   │
   │    httpOnly cookie   │                     │    │                   │
   └─────────────────┘    └─────────────────────┘    └───────────────────┘
                                      │
                              ┌───────▼───────┐
                              │  Postgres 16  │
                              │  + RLS FORCE  │
                              └───────────────┘
```

## Workspace model

InfraDesk **NIE jest multi-tenant** w sensie "DB per tenant". Używamy
**workspace model** w jednej bazie z izolacją RLS.

- Jeden `Workspace` = jedna firma (MSP, klient MSP, lub internal IT).
- Każdy user ma `Membership[]` w wielu workspace'ach (z różnymi rolami).
- Owner Membership = OWNER role w workspace'ie.
- MSP relację z klientem ma `WorkspaceRelation` (provider ↔ client) z capabilitiesami:
  `canReceiveTickets`, `canManageDevices`, `canManagePayments`.

**Przykład:** "Silers" (MSP) ma 4 workspace'y klientów. Adminowie Silers widzą
ich tickety przez `WorkspaceRelation`, ale nie widzą ticketów innych MSP-ów.
Klient widzi tylko własny workspace.

## Izolacja: dwie linie obrony

### Linia 1 — aplikacyjna (kod)

**Każdy router workspace-scoped:**
```ts
const router = Router();
router.use(requireAuth, requireWorkspace);     // <- na górze
router.get('/', requireAccess(MODULES.X, 'view'), handler);
```

**`workspaceId` ZAWSZE z `req.workspaceId`** (ustawiany w `middleware/auth.ts`
po weryfikacji JWT + nagłówku `X-Workspace-Id`). Nigdy z `req.body`/`req.query`.

**Cross-workspace MSP** (provider widzi tickety klienta):
```ts
const visibleWs = await resolveAccessibleWorkspaceIds(req.workspaceId!);
const tickets = await prisma.ticket.findMany({
  where: { workspaceId: { in: visibleWs }, deletedAt: null },
});
```

### Linia 2 — Postgres RLS (FORCE)

DB user `infradesk_v2` ma `NOBYPASSRLS`. Każda tabela workspace-scoped ma:

```sql
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Ticket_tenant" ON "Ticket"
  FOR ALL
  USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
  WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
```

**Kontekst RLS** ustawiany przez Prisma `$extends` Strategy D:
- `requestContextStore` (AsyncLocalStorage) niesie `{userId, workspaceId, isSuperAdmin}`.
- Każdy query opakowany w `prisma.$transaction(SET LOCAL app.current_workspace = ...)`.

**Background jobs** używają `prismaBg` (DB user `infradesk_v2_bg` z BYPASSRLS)
ale ZAWSZE z jawnym `where: { workspaceId }` filter. Plik: `lib/prisma-bg.ts`.

## Auth flow

```
1. POST /auth/login {email, password}
   ↓
2. Backend bcrypt-verify
   ↓ (opcjonalnie 2FA TOTP)
3. Set refresh_token cookie (httpOnly, sameSite=lax, 7d)
   Return { user, accessToken (15min) }
   ↓
4. Frontend: accessToken w-memory (Zustand bez persist)
   Każdy request: Authorization: Bearer <accessToken>
   ↓
5. Po 15min: 401 → /auth/refresh (cookie wysyłana automatycznie)
   → nowy accessToken
   ↓
6. /auth/logout → cookie czyszczone, refreshToken revoked
```

Brak token w localStorage — XSS-safe. Tokens revocable przez `User.tokenVersion`
(increment przy zmianie hasła / logout-everywhere).

## Moduły backendu

`backend-v2/src/modules/`:

| Moduł | Opis |
|-------|------|
| `auth` | login, register, refresh, password reset, accept-invite, 2FA |
| `auth-google` | Per-user Google OAuth (Gmail + Calendar) |
| `auth-oidc` | OIDC provider (Nextcloud na dysk.silers.pl) |
| `workspaces` | CRUD workspace, logo upload, branding |
| `memberships` | Invite, role/scope changes, AccessGrant overrides |
| `users` | Profile, search, change password, sessions |
| `permissions` | Effective permissions per user (rola + overrides) |
| `tickets` | CRUD, comments, events, SLA, attachments, kanban |
| `tasks` | Standalone tasks linked to tickets, FK validation |
| `delegations` | Delegacje z budżetem KM/godzin |
| `clients` | Lista klientów workspace |
| `locations` | Lokalizacje per klient |
| `devices` | Sprzęt + zdalny dostęp |
| `vault` | Hasła AES-256-GCM, audit reveal |
| `crm` / `crm-email` | Kontakty + skrzynki IMAP per user |
| `iris` | AI assistant (Claude API) chat + embed |
| `monitoring` | Alerty z agentów + auto-create ticket |
| `agents` / `agents-ws` | Agent v5 register/heartbeat/WS dispatch |
| `agent-compat` | V1 (v4.x) backward compatibility |
| `backups` | BackupConfig + BackupHistory |
| `download-pins` | One-time + personal PIN do RustDesk |
| `partner-shares` | Czasowe share dla MSP-MSP |
| `billing` | Paynow checkout + webhook |
| `sla-policies` | SLA per priorytet (CRUD admin) |
| `settings` | Workspace-level config |

## Frontend

```
src/
├── App.tsx              Router (RequireAuth + RequireRole + AppShell)
├── components/
│   ├── layout/          AppShell, Sidebar (drawer mobile), Topbar
│   ├── ui/              Button, Card, Input, Dialog, ConfirmDialog, Skeleton, ...
│   └── iris/            IrisCore, IDCore (animowane orby AI)
├── features/
│   ├── auth/            Login, Register, Reset, Verify, AcceptInvite, RequireRole
│   ├── dashboard/       DashboardPage z Iris core + sla gauge
│   ├── tickets/         TicketsPage (list/table/kanban), TicketDetailPage
│   ├── tasks/           TasksPage, TaskDetailPage
│   ├── vault/           VaultPage
│   ├── devices/         DevicesPage, DeviceDetailPage
│   ├── monitoring/      MonitoringPage z agentami i alertami
│   ├── portal/          PortalPage (CLIENT-only widok)
│   └── ...
├── lib/
│   ├── api.ts           Axios + interceptors (refresh-on-401)
│   └── utils.ts
└── store/
    └── auth.ts          Zustand (user + workspaceId, accessToken in-memory)
```

**Routing convention:** trasy admin-only opakowane w `<RequireRole roles={ADMIN_ONLY}>`.

## Agent v5

```
agent/
├── InfraDesk Business v5.spec     PyInstaller build spec
├── ui/                            HTML dla pywebview
│   ├── business.html              Główne UI (wszystkie widoki)
│   ├── home.html (placeholder)
│   └── server.html (placeholder)
├── v5/
│   ├── main.py                    Entry point + single-instance Mutex
│   ├── core/
│   │   ├── config.py              DPAPI token storage, paths
│   │   ├── ws.py                  WebSocket client + dispatcher
│   │   ├── update.py              Self-update (SHA256 + Authenticode)
│   │   ├── backup.py              MySQL/Postgres/MSSQL dumps + Fernet encryption
│   │   ├── diagnostics.py         GPO checks, audity, disk speed test
│   │   ├── metrics.py             CPU/RAM/disk + log shipping
│   │   ├── remote.py              Test SQL connection (z whitelistą host)
│   │   ├── system.py              Windows Update, install RustDesk
│   │   ├── install.py             Service install/uninstall, autostart
│   │   └── utils.py               kill_other_instances, send_wol
│   └── variants/
│       ├── business.py            Pełen JS bridge (BusinessAPI) + WS dispatcher
│       ├── home.py (placeholder)
│       └── server.py (placeholder)
└── v5_version.txt                 Source-of-truth wersji (5.0.X)
```

**Komunikacja agent ↔ backend:**

1. **Bootstrap:** REST `POST /api/v2/agents/register` → otrzymuje `agentToken`.
2. **Heartbeat:** REST `POST /api/v2/agents/telemetry` co 30s (CPU/RAM/disk).
3. **WS push:** `wss://infradesk.pl/api/v2/agents-ws` z `Authorization: Bearer <token>`.
   - Backend → Agent: `restart_service`, `system_reboot`, `install_software`,
     `windows_update`, `schedule_task`, `submit_ticket`, `capture_screenshot`,
     `run_security_audit`, `do_self_update`.
   - Agent → Backend: `ack` z każdej komendy + asynchroniczne event'y (alert HIGH).

**Self-update:**
1. Agent czyta `https://infradesk.pl/downloads/version.json`.
2. Sprawdza czy `version > APP_VERSION`.
3. Pobiera EXE (max 200 MB streaming).
4. Verify SHA256 + Authenticode (warn-only dla niesignowanych w transition).
5. Atomowy swap (`InstallExe.bak` → `InstallExe`), spawn nowy proces.
6. Rollback watchdog (60s — jeśli nowy crashuje, restore `.bak`).

## Schedulers (background)

`backend-v2/src/jobs/` — uruchamiane w `index.ts` przy starcie pm2.

| Job | Interval | Co robi |
|-----|----------|---------|
| `agent-offline-watchdog` | 60min | Email do adminów gdy agent offline >24h |
| `renewal-reminder` | 24h | Powiadomienie przed wygaśnięciem planu |
| `rustdesk-health` | 10min | Sync sesji RustDesk |
| `sla-breach` | 5min | Oznacz `slaBreached=true` po deadline |
| `ticket-auto-close` | 6h | RESOLVED >7d → CLOSED z eventem |
| `trial-expiry` | 24h | Plan TEAM/PRO/ENT po expiry → START |

Każdy job ma try/catch wokół `loop`, używa `prismaBg`, loguje przez Pino.

## Baza danych

- ~50 modeli Prisma. Najważniejsze: `Workspace`, `User`, `Membership`,
  `Ticket`, `TicketComment`, `TicketEvent`, `Task`, `Order`, `Invoice`,
  `Device`, `Location`, `Credential`, `MonitoringAlert`, `AgentRegistration`.
- Soft-delete: `deletedAt DateTime?` na większości modeli.
- Cascade: `Workspace.tickets/invoices/...` mają `onDelete: Cascade` (uwaga przy delete WS!).
- ~14 migracji deployed (stan 2026-05).

Schema: [`backend-v2/prisma/schema.prisma`](../backend-v2/prisma/schema.prisma).
RLS policies: [`prisma/migrations/20260421010000_rls_policies/`](../backend-v2/prisma/migrations/20260421010000_rls_policies/migration.sql).

## Decyzje architektoniczne

### Dlaczego workspace model, nie multi-tenant DB?

- ~10× tańszy operacyjnie (1 DB do backupu, 1 schema do migracji).
- Łatwiejsze cross-workspace queries (MSP vs klient).
- RLS FORCE daje izolację porównywalną z separate DB.
- Tradeoff: wymaga dyscypliny w kodzie (dwie linie obrony).

### Dlaczego pojedynczy serwer?

- <3 klientów płatnych w 2026-Q2 → premature complexity.
- Kontrola = najlepsza nauka. Po 10 klientach: PG replica, Redis, k8s.
- Single-server backup strategy: codzienne pg_dump + planowany off-site Backblaze B2.

### Dlaczego Express, nie NestJS / Fastify?

- Mniej magic = łatwiejsze debugowanie (1 dev).
- Prisma + Zod + custom middleware daje większość benefitów NestJS bez DI.
- Migracja do Fastify/Hono w przyszłości jeśli wąskim gardłem.

### Dlaczego Anthropic Claude (nie GPT)?

- Lepsze tool use w polskim (Iris jako asystent klienta).
- Prompt caching → niższy koszt przy złożonych systemach.
- Brand alignment (premium IT services).

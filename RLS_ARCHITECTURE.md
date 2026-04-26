# RLS Architecture — InfraDesk v2

**Status:** Aktywne w produkcji od 2026-04-24 (Etap 5 RLS rollout zakończony).

Dokument opisuje jak workspace isolation jest enforce'owana na poziomie Postgres (druga linia obrony, uzupełnienie aplikacyjnego `requireWorkspace`).

---

## Warstwy izolacji

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Application middleware                                        │
│    requireAuth → requireWorkspace → requireAccess → handler       │
│    Rejects request before DB if user has no membership in ws     │
├──────────────────────────────────────────────────────────────────┤
│ 2. Prisma Extension (Strategy D) — src/lib/prisma.ts             │
│    Każde query opakowane w base.$transaction(tx => { ... })       │
│    SET LOCAL app.current_workspace/user/is_super_admin            │
│    Re-invoke operation on tx (same connection as SET LOCAL)       │
├──────────────────────────────────────────────────────────────────┤
│ 3. Postgres RLS — 53 policies + FORCE RLS                         │
│    infradesk_v2 user = NOBYPASSRLS                                │
│    Policies: workspaceId = app_current_workspace() OR super_admin │
└──────────────────────────────────────────────────────────────────┘
```

Każda warstwa niezależna. Jeśli aplikacja zapomni `requireWorkspace`, RLS nadal blokuje. Jeśli ALS context nie jest ustawiony, RLS zwraca empty set (fail-closed).

---

## Postgres — 53 policies na 52 tabelach

### Users

| User | BYPASSRLS | Użycie |
|---|---|---|
| `infradesk_v2` | **false** | Regular HTTP handler queries (po `requireAuth`/`requireWorkspace`) |
| `infradesk_v2_bg` | **true** | Background jobs, cron, pre-auth lookups, agent-token auth, system operations |
| `postgres` | superuser | Tylko migrations, pentest, admin |

### Helper functions (`pg_proc`)

```sql
app_current_workspace() RETURNS text  -- NULLIF(current_setting('app.current_workspace', true), '')
app_current_user()      RETURNS text  -- NULLIF(current_setting('app.current_user', true), '')
app_is_super_admin()    RETURNS bool  -- COALESCE(current_setting('app.is_super_admin', true), '0') = '1'
```

Gdy GUC nieustawione, funkcje zwracają `NULL` (workspace/user) lub `false` (super_admin). Policy `workspaceId = NULL` → nie match → **empty result** (secure fail-closed).

### Patterny policies

Wszystkie policies typu `ALL` (SELECT+INSERT+UPDATE+DELETE) chyba że zaznaczono inaczej.

**1. Direct workspace match (~34 tabele):**
```sql
USING      (app_is_super_admin() OR "workspaceId" = app_current_workspace())
WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace())
```
Tabele: ActivityLog, AgentRegistration, Attachment, Contact, Credential, CrmActivity, Delegation, Invoice, KbArticle, LlmUsage, LocationVisit, MailboxConfig, Order, ShadowDecision, SlaPolicy, Task, TechnicianGpsConsent, TechnicianLocationLog, TimeSignal, TimeSlot, VectorEmbedding, WorkSession, WorkspaceModule, WorkspaceSetting, AuditEvent, BackupConfig, ClientRiskScore, FailureCluster, ClientRiskScore, EmailMessage, UserEmailAccount, PermissionSchema.

**2. MSP cross-read extension (Device, Location, MonitoringAlert, DownloadFile):**
```sql
USING (app_is_super_admin()
       OR "workspaceId" = app_current_workspace()
       OR "workspaceId" IN (
         SELECT "WorkspaceRelation"."clientWorkspaceId"
         FROM "WorkspaceRelation"
         WHERE "providerWorkspaceId" = app_current_workspace()
           AND "can<FEATURE>" = true  -- canViewDevices / canViewLocations / canAccessAlerts
           AND status = 'ACTIVE'
       ))
WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace())
```
Pozwala MSP providerom czytać dane swoich klientów (feature), ale modyfikować tylko własne.

**3. Parent-child (rows z implicit workspaceId przez FK):**
```sql
-- Przykład dla TicketComment:
USING (app_is_super_admin() OR EXISTS (
  SELECT 1 FROM "Ticket" t
  WHERE t.id = "TicketComment"."ticketId" AND t."workspaceId" = app_current_workspace()
))
```
Tabele: BackupHistory, CredentialViewLog, FailureClusterMember, InboundMessage, InvoiceItem, OrderItem, SessionTimeEntry, TicketComment, TicketEvent, TicketSessionLink, AccessGrant (via Membership).

**4. User-self (NotificationSubscription, Membership):**
```sql
USING (app_is_super_admin() OR "userId" = app_current_user()
       OR "workspaceId" = app_current_workspace())
```

**5. Workspace (2 policies — SELECT vs ALL):**
```sql
Workspace_select USING: super_admin OR id = app_current_workspace()
  OR id IN (SELECT workspaceId FROM "Membership" WHERE userId = app_current_user() AND status='ACTIVE')

Workspace_modify USING + CHECK: super_admin OR id = app_current_workspace()
```
**Uwaga:** INSERT nowego Workspace fails pod NOBYPASSRLS bo WITH CHECK `id = app_current_workspace()` — nowo utworzony UUID ≠ pre-set kontekst. **Endpoint `POST /api/v2/workspaces/` musi używać `prismaBg`.**

---

## Prisma Extension — Strategy D

**Plik:** `src/lib/prisma.ts`

**Problem który rozwiązuje:** naive `base.$transaction(async tx => { SET LOCAL; return query(args) })` nie działa — `query(args)` jest bound do BASE clienta (nie tx), więc idzie na INNE połączenie z poolu, SET LOCAL niewidoczne. POC v2 potwierdził.

**Strategy D (POC v3 potwierdził):**

```typescript
export const prisma = base.$extends({
  query: {
    $allOperations: async ({ args, query, operation, model }) => {
      const ctx = getCurrentRequestContext();
      if (!ctx) return query(args);  // pass-through when no context

      return base.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true)`,
          'app.current_workspace', ctx.workspaceId ?? '',
          'app.current_user',      ctx.userId,
          'app.is_super_admin',    ctx.isSuperAdmin ? '1' : '0',
        );

        // Re-invoke on tx — same connection as SET LOCAL
        if (model && (tx as any)[model]?.[operation]) {
          return (tx as any)[model][operation](args);
        }
        // Raw queries, $transaction, etc.
        const txAny = tx as any;
        if (typeof txAny[operation] === 'function') {
          if (operation === '$queryRaw' || operation === '$executeRaw') {
            return txAny[operation](args);  // tagged template array
          }
          if (Array.isArray(args)) return txAny[operation](...args);
          return txAny[operation](args);
        }
        return query(args);  // defensive fallback
      });
    },
  },
});
```

**Pokrycie potwierdzone przez POC:**
- ✅ Model methods (`.findMany`, `.create`, etc.)
- ✅ `$queryRaw` / `$queryRawUnsafe` (bezpośrednio i wewnątrz `$transaction`)
- ✅ `$executeRaw` / `$executeRawUnsafe`
- ✅ `$transaction(callback)` — callback `tx` dziedziczy outer SET LOCAL
- ✅ `$transaction([batch])` — każde query batch opakowane w nested tx (savepoint)

---

## AsyncLocalStorage context

**Plik:** `src/lib/requestContext.ts`

```typescript
export interface RlsContext {
  userId: string;
  workspaceId: string | null;
  isSuperAdmin: boolean;
}

interface ContextBox { current: RlsContext; }

export const requestContextStore = new AsyncLocalStorage<ContextBox>();

export function getCurrentRequestContext(): RlsContext | null {
  return requestContextStore.getStore()?.current ?? null;
}

export function updateWorkspaceInContext(workspaceId: string): void {
  const box = requestContextStore.getStore();
  if (box) box.current.workspaceId = workspaceId;
}
```

**Mutable box pattern** — pozwala `requireWorkspace` zaktualizować `workspaceId` bez nowego `run()` frame. `requireAuth` zakłada pierwszy box z `workspaceId = null`; `requireWorkspace` wypełnia po DB lookupie.

### Middleware chain — standardowy flow

```
HTTP request
  ↓
requestId, cors, compression, cookieParser, globalLimiter
  ↓
resolveWorkspaceFromHost  (prismaBg — pre-auth DB lookup subdomain → workspace)
  ↓
requireAuth  (prisma for User — User bez RLS, OK)
             → req.auth = { sub, isSuperAdmin, ... }
             → requestContextStore.run({ userId: sub, workspaceId: null, isSuperAdmin }, next)
  ↓
requireWorkspace  (prisma for Membership — policy matches via app_current_user)
                  → req.workspaceId = X
                  → updateWorkspaceInContext(X)
  ↓
Router handler  →  prisma.ticket.findMany()
                ↓
                Extension $allOperations
                ↓
                base.$transaction(tx => {
                  SET LOCAL app.current_workspace = X
                  return tx.ticket.findMany(args);   -- RLS enforced
                })
                ↓
                Returns only tickets where workspaceId = X (plus MSP cross-read)
```

---

## `prismaBg` client

**Plik:** `src/lib/prisma-bg.ts`

```typescript
export const prismaBg = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_BG! } },
  log: ['warn', 'error'],
});
```

Connects as `infradesk_v2_bg` (BYPASSRLS). Pomija RLS całkowicie.

**Kiedy używać (w Etap 3 przepięte 12 plików):**
- `src/index.ts` — startup `$connect`/`$disconnect`
- `src/middleware/resolveWorkspace.ts` — pre-auth subdomain → workspace lookup
- `src/modules/auth/auth.service.ts` — login (pre-workspace context)
- `src/modules/auth-oidc/auth-oidc.service.ts` — OIDC issuer pre-session
- `src/modules/auth-google/google.service.ts`, `gmail-sync.ts` — OAuth + cron
- `src/modules/crm-email/imap-sync.ts` — cron bg, iteruje cross-workspace
- `src/modules/agent-compat/agent-compat.routes.ts` — V1 agent token auth (no JWT)
- `src/modules/agents-ws/agents-ws.server.ts` — WebSocket agent auth, heartbeat
- `src/modules/public/public.routes.ts` — publiczny GET /workspace
- `src/modules/agents/agents.routes.ts` — dual-import (bg dla `/register`, `/telemetry`; regular dla `adminRouter`)

**Kiedy NIE używać:**
- Handler który ma `req.auth` i `req.workspaceId` — zawsze regular `prisma` z ALS context
- `middleware/auth.ts::requireAuth` — User bez RLS, więc regular prisma wystarczy

**Zasada:** jeśli flow nie przechodzi przez `requireAuth + requireWorkspace` chain, to albo (a) bg, albo (b) wrap handlera w `requestContextStore.run(...)` po ręcznej weryfikacji auth.

---

## Edge cases (stan 2026-04-24)

### Do fixa (D-1 planowane)
1. **`workspaces.routes.ts POST /`** (create new workspace) — przepiąć na `prismaBg` (3-5 linii). Powód: WITH CHECK policy Workspace_modify fail na INSERT z nieustawionym app_current_workspace.
2. **`iris-chat.controller.ts`** — (a) `resolveIrisAuth` Membership lookups → `prismaBg.*` (4 miejsca); (b) `chatHandler` body wrap w `requestContextStore.run(...)` + dodatkowy 1 bg query dla `isSuperAdmin`. Powód: chat ma mixed auth (cookie/embed) bez `requireAuth` middleware → ALS pusty.

### Bezpieczne (zweryfikowane)
- `users.routes.ts` — wszystkie 4 endpointy czytają tylko User/RefreshToken (bez RLS)
- `workspaces.routes.ts GET /` — policy Membership match przez `app_current_user()`, nie wymaga workspaceId w kontekście

---

## Operational notes

### Test RLS ad-hoc (manual pentest)

```sql
-- TEST A: no context → 0 rows wszędzie (enforce działa)
BEGIN;
SET ROLE infradesk_v2;
SELECT set_config('app.current_workspace', '', true),
       set_config('app.current_user', '', true),
       set_config('app.is_super_admin', '0', true);
SELECT count(*) FROM "Ticket";  -- expect 0
RESET ROLE;
ROLLBACK;

-- TEST B: ws_A context → widzi ws_A, cross_ws_B = 0
BEGIN;
SET ROLE infradesk_v2;
SELECT set_config('app.current_workspace', '<WS_A_UUID>', true),
       set_config('app.current_user', '', true),
       set_config('app.is_super_admin', '0', true);
SELECT count(*) FROM "Ticket" WHERE "workspaceId" = '<WS_A_UUID>';  -- > 0
SELECT count(*) FROM "Ticket" WHERE "workspaceId" = '<WS_B_UUID>';  -- expect 0
RESET ROLE;
ROLLBACK;
```

**Ważne:** `BEGIN...ROLLBACK` wymagane — `set_config(..., is_local=true)` scopuje do transakcji. Bez jawnej tx, psql autocommituje po każdym statement → kontekst resetuje się → fałszywy alarm.

### Emergency rollback (jeśli RLS psuje produkcję)

```sql
-- Instant, 1-5 sekund, bez pm2 restart
ALTER USER infradesk_v2 BYPASSRLS;
```

Prisma connection pool honoruje flag on-the-fly (nie trzeba reload).

Po rollbacku: debug, fix, re-enable przez `ALTER USER infradesk_v2 NOBYPASSRLS`.

### Dodanie nowej tabeli z RLS

```sql
-- 1. Tabela musi mieć workspaceId NOT NULL (direct) or parent FK (indirect)
ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NewTable" FORCE ROW LEVEL SECURITY;

-- 2a. Direct workspace pattern:
CREATE POLICY "NewTable_tenant" ON "NewTable" FOR ALL
  USING      (app_is_super_admin() OR "workspaceId" = app_current_workspace())
  WITH CHECK (app_is_super_admin() OR "workspaceId" = app_current_workspace());

-- 2b. Parent-child pattern (brak workspaceId, jest parentId):
CREATE POLICY "NewTable_tenant" ON "NewTable" FOR ALL
  USING (app_is_super_admin() OR EXISTS (
    SELECT 1 FROM "Parent" p
    WHERE p.id = "NewTable"."parentId" AND p."workspaceId" = app_current_workspace()
  ))
  WITH CHECK (/* same */);

-- 3. Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON "NewTable" TO infradesk_v2, infradesk_v2_bg;
```

### POC skrypty

- `backend-v2/scripts/rls-poc-v3.ts` — reference implementation of Strategy D (3 test scenarios: direct query, $transaction callback, $transaction batch, $queryRaw/$executeRawUnsafe inside tx, SET LOCAL visibility + isolation)
- `backend-v2/scripts/rls-e4-verify.ts` — runtime verification of ALS + Extension integration with production `src/lib/prisma.ts`

Oba skrypty safe-to-run: używają `infradesk_v2_bg` credentials, bez modyfikacji danych.

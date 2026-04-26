# `backend-v2/scripts/` — Operational scripts

## Contents

| Skrypt | Przeznaczenie | Safety |
|---|---|---|
| `migrate-v1-to-v2.ts` | Pełna migracja danych v1 → v2 (tenants, users, clients, tickets, comments, …) | Idempotent, `--dry-run` dostępny |
| `migrate-remainder.ts` | Uzupełnienie migracji o encje pominięte w pierwszym przejściu | Idempotent |
| `migrate-rustdesk-ids.ts` | One-off sync RustDesk IDs z agent registrations | Read + update |
| `migrate-from-v1.ts` | Alias / earlier variant of migrate-v1-to-v2.ts (may be deprecated) | Idempotent |
| `sync-rustdesk-sessions.ts` | Cron-like bulk sync active RustDesk remote sessions | Read + upsert |
| `rls-poc-v3.ts` | **Reference POC** dla Strategy D (Prisma extension + SET LOCAL) | Read-only, BYPASSRLS user |
| `rls-e4-verify.ts` | Runtime verification — używa production `src/lib/prisma.ts` z AsyncLocalStorage | Read-only queries |

---

## v1 → v2 Migration

```bash
# Dry-run (no writes), check counts
V1_DATABASE_URL='postgresql://infradesk:PASSWORD@localhost:5432/infradesk' \
  npx tsx scripts/migrate-v1-to-v2.ts --dry-run

# Apply
V1_DATABASE_URL='postgresql://infradesk:PASSWORD@localhost:5432/infradesk' \
  npx tsx scripts/migrate-v1-to-v2.ts

# Single module
npx tsx scripts/migrate-v1-to-v2.ts --only=tickets,comments
```

Idempotent — re-runs są bezpieczne. Upserts by primary id; existing v2 rows są nie nadpisywane.

### Role remapping

| v1 role    | v2 role | Overrides applied                                                    |
|------------|---------|----------------------------------------------------------------------|
| OWNER      | OWNER   | none (full)                                                          |
| ADMIN      | ADMIN   | none (full)                                                          |
| TECHNICIAN | MEMBER  | tickets=DELETE, sessions=DELETE, devices=EDIT, gps=EDIT, vault=NONE  |
| VIEWER     | MEMBER  | everything=VIEW, vault/billing/settings/audit/invoices=NONE          |
| MEMBER     | MEMBER  | none (v2 defaults)                                                   |

### Password scheme

v1 uses bcrypt, v2 argon2id. Passwords są kopiowane as-is; `lib/password.ts`
wykrywa legacy `$2a$/$2b$/$2y$` hashes i weryfikuje z bcrypt, potem
opportunistycznie rehashuje do argon2id przy następnym udanym loginie.

### Skipped

- Users `@infradesk.pl` z brakiem `lastLoginAt` (seed accounts).
- `CANCELLED` tickets (low historical value — AuditEvent keeps trail if needed).
- v1-only deprecated tables: `PlatformConfig`, `WorkspaceManagement`,
  `UserPermissionOverride.accountType/accessScope/allowedModules` etc.

### Co-existence strategy

- v1 stays live na `api.infradesk.pl` przez 30 dni po v2 rollout.
- `POST /api/v2/admin/migrate` endpoint (TODO) uruchomi ten skrypt w
  pilot mode — one workspace at a time z jawnym approvalem.

---

## RLS POC scripts (Etap 4 — Strategy D)

### `rls-poc-v3.ts` — reference implementation

POC który udowodnił że `$extends({ query: { $allOperations }})` + `base.$transaction(tx => { SET LOCAL; re-invoke on tx })` pokrywa:
- Direct model methods (`user.findFirst`, etc.)
- `$transaction(callback)` — inner `tx.*` queries dziedziczą outer SET LOCAL
- `$transaction([batch])`
- `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, `$executeRawUnsafe`
- `SET LOCAL` widoczność wewnątrz transakcji + isolation między transakcjami

**Uruchomienie (read-only, używa `DATABASE_URL_BG`):**

```bash
cd /home/adrian/infradesk/backend-v2
npx tsx scripts/rls-poc-v3.ts
```

Wynik: sekwencja `[EXT] ...caught` logów + weryfikacja TEST 14-17.

**Kiedy uruchomić:** gdy upgradujesz Prisma do nowej major version — zweryfikować że extension API nie zmieniło semantyki.

### `rls-e4-verify.ts` — runtime verification

Używa **production `src/lib/prisma.ts`** (prawdziwa Strategy D extension) + simulated `requestContextStore.run(...)` — sprawdza integrację ALS + Extension end-to-end. Testuje:
- No context → pass-through
- Context set → SET LOCAL visible przez wrapper tx
- Model query → extension re-invoke na tx
- `$transaction(callback)` + batch
- Context isolation między concurrent `run()` frames

**Uruchomienie:**
```bash
cd /home/adrian/infradesk/backend-v2
npx tsx scripts/rls-e4-verify.ts
```

**Kiedy uruchomić:** po zmianach w `src/lib/prisma.ts`, `src/lib/requestContext.ts`, `src/middleware/auth.ts` lub `src/middleware/requireWorkspace.ts` — żeby potwierdzić że ALS context nadal przepływa przez extension.

Bez modyfikacji danych — tylko queries + `$queryRawUnsafe("SELECT current_setting(...)")`.

---

## RustDesk sync

`migrate-rustdesk-ids.ts` — one-time retrofit: dla każdej `AgentRegistration` bez rustdesk_id, resolve po hostname/MAC i zapisz.

`sync-rustdesk-sessions.ts` — poll RustDesk hbbs API, upsert aktywne sesje do `WorkSession`. Użycie: cron / manual.

---

## Pełna dokumentacja architektury RLS

Zobacz `/RLS_ARCHITECTURE.md` (root repo) — opisuje:
- Warstwy izolacji (app middleware → Prisma extension → Postgres RLS)
- Wszystkie 53 policies patterny (direct / MSP cross-read / parent-child / user-self / Workspace 2x)
- Strategy D szczegółowo + dlaczego naive wrapper nie działa
- Kiedy używać `prisma` vs `prismaBg`
- Edge cases i pentest queries

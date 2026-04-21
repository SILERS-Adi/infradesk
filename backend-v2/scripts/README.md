# v1 → v2 Migration

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

Idempotent — re-runs are safe. Upserts by primary id; existing v2 rows are not overwritten.

## Role remapping

| v1 role    | v2 role | Overrides applied                                                    |
|------------|---------|----------------------------------------------------------------------|
| OWNER      | OWNER   | none (full)                                                          |
| ADMIN      | ADMIN   | none (full)                                                          |
| TECHNICIAN | MEMBER  | tickets=DELETE, sessions=DELETE, devices=EDIT, gps=EDIT, vault=NONE  |
| VIEWER     | MEMBER  | everything=VIEW, vault/billing/settings/audit/invoices=NONE          |
| MEMBER     | MEMBER  | none (v2 defaults)                                                   |

## Password scheme

v1 uses bcrypt, v2 argon2id. Passwords are copied as-is; `lib/password.ts`
detects legacy `$2a$/$2b$/$2y$` hashes and verifies with bcrypt, then
opportunistically rehashes to argon2id on next successful login.

## Skipped

- Users `@infradesk.pl` with no `lastLoginAt` (seed accounts).
- `CANCELLED` tickets (low historical value — AuditEvent keeps trail if needed).
- v1-only deprecated tables: `PlatformConfig`, `WorkspaceManagement`,
  `UserPermissionOverride.accountType/accessScope/allowedModules` etc.

## Co-existence strategy

- v1 stays live on `api.infradesk.pl` for 30 days after v2 rollout.
- `POST /api/v2/admin/migrate` endpoint (TODO) will invoke this script in
  pilot mode — one workspace at a time with Adrian's explicit approval per
  workspace.

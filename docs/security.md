# Security Model

Bezpieczeństwo InfraDesk: workspace izolacja, secrets, rate limity, audit trail,
incident response.

## Zagrożenia (threat model)

| Aktor | Cel | Metoda | Mitigacja |
|-------|-----|--------|-----------|
| Klient MSP | Widzieć dane innego MSP | Cross-workspace request | Workspace+RLS dwie linie |
| Pracownik klienta | Przejąć panel admina | Brute-force / phishing | Login limiter + 2FA |
| Atakujący zewnętrzny | RCE na agencie | MITM update | SHA256 + Authenticode |
| Insider z DB access | Czytać hasła | Vault dump | AES-256-GCM + reveal audit |
| Bot rejestracyjny | Spam DB / mailbomb | Mass register | registerLimiter (5/h/IP) |
| LLM hallucination | Mass-create tickets via Iris | Prompt injection | mutation cap 8/chat |

## Workspace isolation (najważniejsze)

### Linia 1: aplikacyjna

**Rule #1:** `workspaceId` ZAWSZE z `req.workspaceId` (JWT-derived), NIGDY z body/query/params.

```ts
// ✅ POPRAWNIE
const ticket = await prisma.ticket.findFirst({
  where: { id: req.params.id, workspaceId: req.workspaceId! },
});

// ❌ ŹLE — body kontroluje workspaceId
const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
// Atakujący zna ID ticketu z innego workspace → wycieka ticket.
```

**Rule #2:** każdy router workspace-scoped MUSI mieć:
```ts
router.use(requireAuth, requireWorkspace);
```

**Rule #3:** Cross-workspace queries (MSP) używają helpera:
```ts
const visibleWs = await resolveAccessibleWorkspaceIds(req.workspaceId!);
```

**Rule #4:** FK z body (`assignedToUserId`, `clientWorkspaceId`, `deviceId`, etc.)
WALIDOWAĆ przed użyciem przez `findFirst({id, workspaceId})`. Patrz `tasks.routes.ts:validateTaskFKs`.

### Linia 2: Postgres RLS FORCE

DB user `infradesk_v2` (regular app queries):
- `NOBYPASSRLS` — RLS enforced.
- ~53 policies + FORCE RLS na ~52 tabelach.
- Pattern policy:
  ```sql
  CREATE POLICY "Tablename_tenant" ON "Tablename"
    FOR ALL
    USING ("workspaceId" = app_current_workspace() OR app_is_super_admin())
    WITH CHECK ("workspaceId" = app_current_workspace() OR app_is_super_admin());
  ```
- Funkcje pomocnicze: `app_current_workspace()`, `app_current_user()`, `app_is_super_admin()`.

DB user `infradesk_v2_bg` (background jobs):
- `BYPASSRLS` — pomija RLS (np. cron który widzi wszystkie workspaces).
- ZAWSZE z jawnym `where: { workspaceId }` filter w aplikacji.

**Strategy D (Prisma extends):**
```ts
// lib/prisma.ts
const prisma = base.$extends({
  query: {
    $allOperations: async ({ args, query }) => {
      const ctx = requestContextStore.getStore();
      if (!ctx) return query(args);  // background — używa prismaBg
      return base.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_workspace = '${ctx.workspaceId}'`);
        await tx.$executeRawUnsafe(`SET LOCAL app.current_user = '${ctx.userId}'`);
        await tx.$executeRawUnsafe(`SET LOCAL app.is_super_admin = '${ctx.isSuperAdmin ? 1 : 0}'`);
        return query.bind(tx)(args);  // re-bind do tx
      });
    },
  },
});
```

## Authentication

### Tokens

| Token | Storage | TTL | Revocable |
|-------|---------|-----|-----------|
| Access JWT | **In-memory** (Zustand bez persist) | 15 min | Przez `User.tokenVersion` increment |
| Refresh JWT | httpOnly cookie (`SameSite=Lax`, `Secure`) | 7 dni | `RefreshToken.revokedAt` |
| 2FA TOTP | DB encrypted | trwałe | `User.twoFactorEnabled = false` |
| Password reset | DB hash | 1h | one-shot (`PasswordResetToken.usedAt`) |
| Email verify / Invite | `User.emailVerifyToken` (hashed) | 7 dni | one-shot (po consume) |
| Agent | DB plaintext + hash | trwały | `AgentRegistration.status = REJECTED` |
| OIDC code | DB | 10 min | one-shot (`OauthAuthCode.used`) |

### Password policy

- **Min 10 znaków** (`validatePasswordStrength` w `lib/password.ts`)
- bcrypt z `salt rounds = 12`
- Legacy v1 hash wykrywany przez `isLegacyHash` → re-hash przy następnym login

### 2FA (TOTP)

- Setup: `POST /auth/2fa/setup` → QR code + backup codes
- Confirm: `POST /auth/2fa/confirm` z kodem TOTP
- Login flow: po pierwszym loginie z 2FA → response `error: 'two_factor_required'`
  → frontend pyta o kod → `POST /auth/login` z `twoFactorCode`

**Backup codes:** 10 jednorazowych kodów, hashowane (`User.twoFactorBackupCodes` JSON).

**TODO (P0 #6):** wymusić 2FA dla OWNER role automatycznie.

## Secrets management

### .env (nigdy w repo)

```bash
# Backend krytyczne
DATABASE_URL=postgresql://...@127.0.0.1:5432/infradesk_v2_dev
DATABASE_URL_BG=postgresql://...@127.0.0.1:5432/infradesk_v2_dev   # BYPASSRLS
JWT_SECRET=...                # 64+ char random
VAULT_MASTER_KEY=...           # AES-256 key dla vault credentials
ANTHROPIC_API_KEY=sk-ant-...
SMTP_PASS=...
PAY_INTERNAL_API_KEY=...       # HMAC key dla pay.infradesk.pl
PAY_WEBHOOK_SECRET=...
COOKIE_SECURE=true             # tylko prod
COOKIE_DOMAIN=.infradesk.pl
```

**Backend crashuje przy braku** (`lib/config.ts` używa `requireEnv`). Brak fallback.

### Rotacja secrets (TODO regular)

- DB password: kwartalnie (osobny runbook — patrz `memory/rca_password_rotation_2026_04_24.md`)
- JWT_SECRET: po incydencie + po wycieku
- VAULT_MASTER_KEY: NIGDY (zashardowałby zaszyfrowane vault entries) — chyba że re-encrypt cykl

### Klucze w DB

- `Vault.passwordEnc/Iv/AuthTag` — AES-256-GCM, klucz `VAULT_MASTER_KEY`.
- `User.googleTokens` — to samo szyfrowanie.
- `UserEmailAccount.imapPasswordEnc/...` — to samo (CRM email, nigdy plaintext).
- `BackupConfig.encryptionKey` — Fernet, ale przechowywany w DB plaintext (TODO: enc).

## Rate limiting

`backend-v2/src/middleware/rateLimit.ts`:

| Limiter | Window | Max | Co chroni |
|---------|--------|-----|-----------|
| `globalLimiter` | 1 min | 120 | Ogólny baseline |
| `loginLimiter` | 15 min | 10 (skip success) | Brute-force login |
| `registerLimiter` | 1 h | 5 | Spam rejestracji + mailbomb |
| `refreshLimiter` | 1 min | 30 | Refresh token spam |
| `passwordResetLimiter` | 1 h | 5 | Password reset spam |
| `tokenConsumeLimiter` | 1 h | 20 | verify-email/accept-invite/reset-confirm |
| `agentRegisterLimiter` | 1 min | 5 | Mass agent registration |
| `vaultRevealLimiter` | 1 min | 10 | Credential exfiltration |
| `irisLimiter` | 1 min | 30 | LLM cost spam (per user) |
| `downloadLimiter` | 1 min | 60 | Download spam |
| `pinLimiter` | 1 min | 5 | PIN brute-force (downloads/verify-pin) |

**Per-user:** vault, iris, refresh używają `keyGenerator` z `req.auth.sub`.
**Per-IP:** reszta.

**TODO P1:** Redis-based limiters (current = in-memory, nie pasuje przy multi-pm2).

## CORS

- Static allowlist: `infradesk.pl`, `www.infradesk.pl`, `faktura.infradesk.pl`,
  `pay.infradesk.pl`, `app.infradesk.pl`.
- Subdomain pattern `<slug>.infradesk.pl` weryfikowane przez DB lookup
  (`Workspace.slug` musi istnieć i być active). Cache 60s.
- `credentials: true` (cookie wysyłana automatycznie z tych origins).

**Risk pierwotny (przed fix 2026-05):** wildcard `*.infradesk.pl` = każda dangling subdomena
mogła czytać API z cookie. Naprawione DB-based whitelist.

## File uploads

### Logo workspace
- Path: `/uploads/logos/<wsId>-<ts>.<ext>`
- Public static (logo musi być widoczne na landing).
- Allowlist: jpeg/png/webp. **SVG zablokowany** (XSS przez embedded `<script>`).
- Max 2 MB.

### Ticket attachments
- Path: `/uploads/tickets/<random>.<ext>` (NIE w public static od fix 2026-05).
- Auth-gated download: `GET /api/v2/tickets/:id/attachments/:aid/file` (Bearer + workspace check).
- `fileFilter` blocklist: `.exe .bat .cmd .com .scr .pif .msi .ps1 .vbs .js .wsh .cpl .dll .jar .hta .lnk .reg .sh .app .svg`.
- Max 25 MB.
- `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

### Agent uploads (`/api/agent/upload`)
- Tylko ACTIVE agentów (status check).
- Audit-log w `ActivityLog` (`actionType: 'file_uploaded'`).
- TODO: link Attachment → Ticket (orphan cleanup planowany).

## Audit trail

### Backend (DB)

`ActivityLog` table — każda mutacja powinna logować:
```ts
await logActivity({
  workspaceId: req.workspaceId!,
  entityType: 'ticket' | 'order' | ...,
  entityId: ticket.id,
  actionType: 'created' | 'status_changed' | ...,
  description: 'Human readable',
  performedByUserId: req.auth!.sub,
  ...reqContext(req),     // ipAddress, userAgent
  metadata: { fromValue, toValue, ... },
});
```

Plus dedykowane `TicketEvent` dla pełnej historii ticketu.

### Agent v5 (Windows Event Log)

Krytyczne komendy WS dispatcher loguje przez `_audit_event(action, detail)` →
`eventcreate /T INFORMATION /ID 1000 /L APPLICATION /SO InfraDeskBusiness`.

Forensic recovery: `Get-WinEvent -ProviderName InfraDeskBusiness`.

### Logi pm2 → file

`/home/adrian/.pm2/logs/infradesk-api-*.log`. Rotacja: codzienna (logrotate w `/etc/logrotate.d/`).
**TODO:** ship do Loki/Grafana albo Sentry breadcrumbs.

## API hardening checklist

Przy nowym endpoint workspace-scoped:

- [ ] Router ma `requireAuth, requireWorkspace`
- [ ] Endpoint ma `requireAccess(MODULES.X, 'view'|'edit'|'delete')` jeśli sensitive
- [ ] Body przez Zod schema (max length na user-controlled stringach)
- [ ] Każdy FK z body waliduje workspace ownership
- [ ] `findFirst({id, workspaceId: req.workspaceId})` zamiast `findUnique`
- [ ] Errors przez `HttpError`, nie raw 500
- [ ] Critical mutation → `logActivity()`
- [ ] Rate limit (jeśli sensitive: vault, AI, costly)
- [ ] Test ręczny: login jako MEMBER innego workspace → 404/403

## Frontend hardening checklist

- [ ] Mutation ma `onError` toast (nie cichy fail)
- [ ] Forms: `react-hook-form` + Zod resolver
- [ ] Password fields: `autoComplete="new-password"` lub `"off" + data-1p-ignore`
- [ ] `target="_blank"` ZAWSZE z `rel="noopener noreferrer"`
- [ ] Token NIE w localStorage (tylko in-memory)
- [ ] Admin routes: opakowane w `<RequireRole>`
- [ ] Klient-only routes: opakowane w workspace.type guard
- [ ] User-controlled HTML: `_escapeHtml` lub React render (nie `dangerouslySetInnerHTML`)
- [ ] Markdown: tylko `SimpleMarkdown` (sanitized links, no scripts)

## Backup security

- pg_dump → gzip → `~/db-backups/`
- Integrity verify (`gunzip -t`) — corrupt = delete + alert
- Retention 14d
- **TODO P0:** off-site (Backblaze B2 + rclone), encryption (gpg)

## Incident response

Patrz [`docs/runbook.md`](runbook.md) dla pełnych playbooków.

**SLA wewnętrzny (cele):**
- P0 (down/data-loss): MTTD <5 min, MTTR <30 min
- P1 (degraded): MTTD <30 min, MTTR <4 h
- P2 (cosmetic): plan w sprincie

**Postmortem** OBOWIĄZKOWY w 24h dla P0/P1. Template w runbook.md.

## Zgodność (compliance)

### RODO / GDPR

- `User.deletedAt` — soft delete
- `User.erasureRequestedAt` — flaga "klient prosił o usunięcie"
- `User.dataExportedAt` — eksport danych
- **TODO:** cron który po 30d od `erasureRequestedAt` robi hard delete + cascade

### KSeF (planowany Q3 2026)

- `Invoice.ksefXml` (FA(3))
- `Invoice.ksefSubmittedAt`, `ksefReferenceNumber`, `ksefStatus`
- Integration via id-faktura

### Logi w UE
- Serwer DigitalOcean Frankfurt → DE.
- Klienci niemieccy/holenderscy: OK bez DPA (ten sam region).
- Klienci spoza UE: wymóg DPA + SCC.

## Procedury bezpieczeństwa (operations)

### Code review

Każdy security-sensitive commit:
1. Self-review pod kątem checklist powyżej
2. Test smoke (login, mutation, audit)
3. Po deploy: monitor pm2 logs 30 min

### Vulnerability scanning

- `npm audit --audit-level=high` — manual co tydzień (TODO Dependabot CI)
- `pip-audit` na agencie — manual co miesiąc
- `trivy` na obrazach Docker (gdy będą)

### Secret rotation triggers

- Pracownik odchodzi z dostępem → rotuj wszystko czego dotykał
- Wyciek w open source dependency → rotuj affected
- Co 6 miesięcy: DATABASE_URL + JWT_SECRET (nie VAULT_MASTER_KEY)

### Penetration testing

**TODO P1:** zewnętrzny pentest po 5-cim klientcie. Budget ~5k EUR.

## Reporting vulnerabilities

Wewnętrznie (na razie):
- Adrian Błaszczykowski: adrian@silers.pl, +48 604 292 831 (signal/whatsapp)

Publicznie (gdy projekt rośnie):
- `security@infradesk.pl` (TODO: setup forwarding)
- Bug bounty: HackerOne lub Intigriti (TODO P3)

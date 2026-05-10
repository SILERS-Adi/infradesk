# Changelog

Wszystkie istotne zmiany w InfraDesk. Format: [Keep a Changelog](https://keepachangelog.com/),
[Semantic Versioning](https://semver.org/) — luźno (nie wszystko ma version bump).

## [Unreleased]

### Roadmap (P0/P1)
- Sentry + UptimeRobot + status.infradesk.pl
- CI/CD pipeline (GitHub Actions) + staging environment
- Off-site DB backup (Backblaze B2 + rclone + encryption)
- 2FA wymuszone dla OWNER role
- PgBouncer + Redis (rate limits per cluster, session cache)

---

## 2026-05-09 — Security audit fixes (24 K + 25 W)

Pełny audyt 4-warstwowy + simplify pass. Commit `69963b3` + follow-up `aa099d5`.

### Backend hardening

- **K1:** brakujące migracje `DownloadFile`/`OauthClient`/`OauthAuthCode` (schema-DB drift)
- **K2:** RLS na `UserEmailAccount`/`EmailMessage`/`PermissionSchema` (decrypted email body cross-WS leak)
- **K3:** FK + indexy dla `Attachment`/`VectorEmbedding`/`MailboxConfig` (orphans po delete WS)
- **K4:** ticket attachments — `fileFilter` blocklist + auth-gated `GET /file` route, blok `/uploads/tickets/*` w static
- **K10:** personal download PIN min 4 → 8 znaków, public verify-pin limit 10 → 5/min
- **K11:** rate-limiter `registerLimiter` (5/h) na `/auth/register` + `POST /workspaces` + cap 5 OWNER WS/user
- **K12:** `validateTaskFKs` — pre-validation `assignedToUserId`/`clientWorkspaceId`/`locationId`/`deviceId` przy POST/PATCH `/tasks`
- `/users/search` zwraca `{exists, sameWorkspace?, displayName?}` — koniec PII enumeration cross-WS
- Monitoring auto-create-ticket: P2002 retry-loop z attempt offset
- HTML-escape w mailach watchdoga (`hostname`, `workspace.name`)
- Drop SVG z logo upload (stored XSS przez embedded `<script>`)
- Agent-WS: prefer Bearer header, log `?token=` query usage (v4 phase-out)
- Membership invite generuje token + email + nowy `POST /auth/accept-invite`
- Sessions/start: pre-validation cross-WS ticket przed `createMany`
- Iris-chat: cap 8 mutating tools per chat (LLM-loop protection)
- Billing/checkout: `Idempotency-Key` w nagłówku + sweeper cache
- CORS: explicit subdomain allowlist via DB lookup (60s cache)
- Agent compat `/upload`: wymóg `status==ACTIVE`, audit-log activity
- Agents `/telemetry`: cap `serverMetrics` 32KB
- Rate limiters: `/auth/refresh` (30/min), `/password-reset/confirm` + `/verify-email` (20/h)

### Frontend hardening

- **K8:** `accessToken` poza localStorage (tylko in-memory) — XSS exfil mitigated
- **K9:** `safeNext()` w LoginPage blokuje `//evil.com`/`\\path`/scheme-relative redirects
- meta `referrer="strict-origin-when-cross-origin"` w index.html
- **RequireRole** HOC + `ADMIN_ONLY`/`SUPER_ADMIN_ONLY` na `/storage`, `/users/*`, `/agents`, `/plan-and-modules`, `/design/*`
- PortalPage: redirect non-CLIENT workspaces do `/dashboard`
- Mobile: AppShell drawer + hamburger Topbar dla `<lg`, kropka powiadomień DYNAMICZNA
- Vault/Device password fields: `autoComplete="off"` + `data-1p/lp/bw-ignore`
- VaultPage `copy()`: try/catch + textarea fallback dla HTTP/iframe
- ResetPasswordPage / AcceptInvitePage: `history.replaceState` strips token z URL
- TicketDetailPage attachments: blob download via `api.get` (Bearer header), bez public `/uploads/`
- TicketsKanban: `aria-grabbed`/`aria-dropeffect` + Ctrl+Shift+Arrow keyboard fallback
- DashboardPage: `slaPct` z `/dashboard/summary` (gauge "brak danych" gdy null)
- AcceptInvitePage (NEW): `/accept-invite?token=` flow
- SimpleMarkdown: cap link href 2048 + text 200, `rel=noopener nofollow`
- RegisterPage: `rel="noopener noreferrer"` na legal links
- Drop TODO labels (`English (TODO)`, Stripe TODO comment, `/superadmin/pricing` 404)

### Agent v5 hardening

- **K5:** SQL injection — regex-validate `db`/`host`/`user` przed interpolacją do `BACKUP DATABASE [{db}]` i path
- **K6:** XSS w business.html ticket list — `_escapeHtml` na title/number/lab + `data-tid` zamiast inline onclick
- **K7:** Authenticode signature check w self-update (warn-only dla niesignowanych w transition) + 200MB stream cap
- `BusinessAPI.open_url` whitelist domen (blok `file://`/`javascript:`)
- `test_db_connection` whitelist `_is_local_host()` + lokalny env dict (no globalna mutacja `os.environ`)
- `capture_screenshot` cap 10 + slot validation
- `_run_windows_update schedule_time` regex `HH:MM`
- `_disk_speed_test` cleanup `infradesk_diskspeed.bin` w `finally`
- `core/metrics.py`: cursor regex-validate przed `[DateTime]` interpolation, `log_shipping` sanitize `password=`/`token=`/Bearer
- `_audit_event()` → Windows Event Log dla `restart_service`/`system_reboot`/`install_software`
- `main.py`: single-instance Mutex (win32event)
- `update.py`: PowerShell `$args[0]` zamiast f-string
- `core/utils.py`: kill_other_instances po pełnej ścieżce (anti-impersonation)

### Database

- 4 nowe migracje: `downloads_oauth_init`, `rls_email_permission_schemas`,
  `workspace_fk_attachment_vector_mailbox`, `softdelete_notif_fk`
- `Order`/`Invoice`/`Task`: `deletedAt` + `@@index([workspaceId, deletedAt])`
- `NotificationSubscription`: FK na `User.userId` (cascade) + index
- `Attachment` / `VectorEmbedding` / `MailboxConfig`: relacje `workspace`/`uploadedBy` + indexy

---

## 2026-05-04 — Pierwsza fala napraw audytu

- Pełny audyt 4-warstwowy: 96 findings (~25 BE + ~25 FE + ~25 agent + ~24 DB)
- Top 12 KRYTYCZNYCH naprawione w pierwszej turze
- Sub-agent infra audit: blocked SSH (sandbox)

## 2026-05-03 — Wielka tura ticket-flow

- **Backend:** ticket numbering `T-YYYY-NNNN`, dedup deletedAt, TicketEvent dla agent endpoints, agent cancel via state machine, auto-transition restrict OPEN+NEW only, POST `/tasks` cross-workspace fix, Iris CANCELLED bez closedAt
- **Edit modal action** (frontend nie używał istniejącego `PATCH /tickets/:id`)
- **Rating unified 1-5** (backend schema + UI 5-star + RateTicketCard guard tylko dla createdBy)
- **Powiadomienia email** — `sendTicketNotification` 4 typy (assigned/resolved/commented/reopened) + hooki na każdej mutacji
- **Email→ticket** auto-create w imap-sync (gdy from = znany contact/user, nie reply, nie auto-reply)
- **SLA apply** z policy w createTicket + `slaResponseMinutes`/`Resolve` na ticket
- **ticket-auto-close** scheduler (RESOLVED >7d → CLOSED z TicketEvent)
- **Bulk endpoints:** `/tickets/bulk-assign`, `/bulk-status`, `/bulk-delete` (max 200 ids)
- **Attachments:** `POST /tickets/:id/attachments` (multer 25MB)
- **WaitingType enum** (CLIENT/SUPPLIER/INTERNAL) + `Ticket.waitingType`/`waitingFor`/`parentTicketId`
- **Drag&drop kanban** (HTML5 drag/drop)
- **Markdown preview** w komentarzach (`SimpleMarkdown`)
- **Portal klienta MVP** (`/portal` route)
- **Mobile responsive** TicketDetailPage

## 2026-05-02 — Asystent v5.0.14 + DOM fixes + ServerServiceLoop parity

- Frontend: 8 `window.confirm` → `confirmDialog` (Radix-based, działa w iframe)
- `SecurityCheckRow` button-in-button DOM fix
- Agent v5.0.14: `ServerServiceLoop._on_ws` parity z BackgroundServices (`run_security_audit`, `run_security_fix`, `run_network_scan`, `run_full_inventory`, `run_server_metrics`)

## 2026-05-01 — Top 5 KRYTYCZNYCH security fix

1. **Backup DB pomijał `infradesk_v2_dev`** — fix `/home/adrian/backup-databases.sh`
2. **Iris AI cost leak** — `enforceAiCallLimit()` per workspace per miesiąc UTC
3. **Auto-update agent: pusty SHA256 = True** — HARD FAIL (RCE przez MITM)
4. **`Set-Clipboard` PowerShell injection** — `subprocess.run(input=text)` zamiast f-string
5. **Watchdog rollback** — agent self-update z fallback gdy crash >2s

## 2026-04-28 — SaaS overnight: marketing + auth + płatności

- Marketing pages: `/cennik`, `/jak-to-dziala`, `/pobieranie`, `/kontakt`
- Auth: signup z weryfikacją emaila, `Membership` invite flow, 2FA TOTP
- Płatności Paynow przez `pay.infradesk.pl` (HMAC-signed webhook + idempotency)
- Partner IT shares (czasowe udostępnianie zasobów)
- 4 schedulery aktywne: trial-expiry, rustdesk-health, renewal-reminder, agent-offline-watchdog
- READY FOR FIRST CUSTOMER

## 2026-04-24 — RLS rollout (FORCE)

- Postgres RLS `FORCE` na ~52 tabelach, ~53 policies
- DB user `infradesk_v2` (NOBYPASSRLS) + `infradesk_v2_bg` (BYPASSRLS dla bg jobs)
- Strategy D: Prisma `$extends` z `$transaction(SET LOCAL app.*)`
- Rotacja DB password (RCA: off-by-one awk + localhost vs 127.0.0.1)

## 2026-04-22 — Cutover v1 → v2

- Migracja danych z v1 (`/migrate-v1-to-v2.ts`)
- DNS swap: `infradesk.pl` → backend-v2
- Wygaszenie v1 backend
- Workspace model (zamiast multi-tenant DB)

## 2026-04-21 — Init v2

- `init_v2` migration (~50 modeli Prisma)
- AI features (Iris chat + embed)
- Sprint 1 schema: Tickets, Tasks, Devices, Vault, Backups, Monitoring, CRM
- Workspace types: MSP / CLIENT / INTERNAL_IT
- Roles: OWNER / ADMIN / MEMBER

---

[Unreleased]: https://github.com/SILERS-Adi/infradesk/compare/aa099d5...HEAD

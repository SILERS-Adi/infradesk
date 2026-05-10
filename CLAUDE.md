# InfraDesk — context for AI coding agents

InfraDesk to SaaS B2B do zarządzania infrastrukturą IT dla firm typu MSP.
Pierwszy klient: SILERS (sam owner). Ten plik jest kontekstem dla Claude Code
i innych AI agentów — czytaj zanim zaczniesz robić zmiany.

## Stack

| Warstwa | Technologia | Lokalizacja |
|---------|-------------|-------------|
| Backend | Node.js + TypeScript + Express + Prisma | `backend-v2/` |
| Frontend | React 18 + Vite + Tailwind + Radix UI + React Query | `frontend-v2/` |
| DB | PostgreSQL 16 + Row Level Security | DigitalOcean droplet, `127.0.0.1:5432` |
| Agent | Python 3 + PyInstaller + pywebview | `agent/v5/` |
| Faktury | osobny mini-app (Express + Prisma + Vite) | `id-faktura/` |
| Mailer | SMTP biuro@silers.pl (zewn. dostawca) | `backend-v2/src/lib/mailer.ts` |
| AI | Anthropic Claude API (Iris assistant) | `iris-chat.controller.ts` |

## Stan projektu (2026-05)

- Production live na `infradesk.pl`. ~59 agentów wdrożonych.
- Ukończony cutover v1 → v2 (2026-04-22), RLS włączone (2026-04-24).
- Zakończony pełny security audit (2026-05). 24 K + 25 W findings naprawione.
- Brak: monitoring (Sentry/uptime), CI, staging env, off-site backup, status page.

## Architektura — najważniejsze inwarianty

### Workspace model (NIE multi-tenant)

Każdy `Workspace` to jedna firma/organizacja. Izolacja: dwie linie obrony.

**Linia 1 — aplikacyjna:**
- Każdy model scoped: `workspaceId String` + `workspace Workspace @relation(...)` + index.
- `workspaceId` ZAWSZE z `req.workspaceId` (JWT + middleware), NIGDY z body/query/params.
- Każdy router workspace-scoped: `requireAuth → requireWorkspace → requireAccess(...)`.
- Cross-workspace MSP: przez `WorkspaceRelation` (provider ↔ client). Helper:
  `resolveAccessibleWorkspaceIds()` w `backend-v2/src/modules/tickets/tickets.service.ts`.

**Linia 2 — Postgres RLS (FORCE):**
- DB user `infradesk_v2` ma `NOBYPASSRLS`. ~53 policies + FORCE RLS na ~52 tabelach.
- Pattern policy: `workspaceId = app_current_workspace() OR app_is_super_admin()`.
- Kontekst RLS ustawiany przez AsyncLocalStorage (`requestContextStore` w `middleware/auth.ts`)
  → Prisma `$extends` Strategy D opakowuje query w `$transaction` z `SET LOCAL app.*`.
- **Plik:** `backend-v2/src/lib/prisma.ts` (RLS-aware) vs `prisma-bg.ts` (BYPASSRLS, dla bg jobs).

**Background jobs używają `prismaBg`** (BYPASSRLS user `infradesk_v2_bg`) z **jawnym** `workspaceId` filter w każdym query. Nie mieszać.

### Agent v5 (Python, Windows)

- 3 warianty: `business.py` (główny), `home.py`, `server.py` (placeholdery).
- Połączenie z backendem przez WebSocket (`ws://infradesk.pl/api/v2/agents-ws`)
  + REST fallback. Auth: token Bearer w headerze (NIE query) — po fix 2026-05.
- Self-update: pobiera `version.json`, weryfikuje SHA256 + Authenticode (po fix 2026-05),
  rolluje wstecz przy crashu (rollback watchdog).
- Komendy z panelu: dispatcher w `core/ws.py` + override per-variant w `business.py`.
- Krytyczne komendy mają audit trail w Windows Event Log (`_audit_event()`).
- **PowerShell injection guard:** wszystko przez `subprocess.run(args=[...])` lub
  `input=` (stdin) — NIGDY f-string interpolation do `-Command`.

### Schedulery (background jobs, plik per scheduler)

`backend-v2/src/jobs/`:
- `agent-offline-watchdog.ts` (60min, alert email gdy agent offline >24h)
- `renewal-reminder.ts` (codziennie, przed wygaśnięciem planu)
- `rustdesk-health.ts` (10min, sync sesji)
- `sla-breach.ts` (5min, oznacza ticket z minionym deadline)
- `ticket-auto-close.ts` (6h, RESOLVED >7d → CLOSED)
- `trial-expiry.ts` (codziennie, plan TEAM/PRO/ENT po expiry → START)

Wszystkie dodawane w `index.ts` przy starcie. Każdy używa `prismaBg` + try/catch + logger.

## Konwencje

### Backend

- Każdy router: `Router` + `router.use(requireAuth, requireWorkspace)` na górze.
- Endpoint admin-only: dodatkowo `requireAccess(MODULES.X, 'edit'|'view'|'delete')`.
- Walidacja: ZAWSZE Zod schema (`module/*.schemas.ts`).
- Workspace cross: `resolveAccessibleWorkspaceIds(req.workspaceId!)`.
- Errors: `HttpError.badRequest(msg, code)` / `HttpError.notFound()` / `HttpError.forbidden(msg, code)`.
- Logi: `logger.info/warn/error({...metadata}, '[module] message')`. Pino + pretty.
- Rate limity: `middleware/rateLimit.ts` — istnieją: global, login, register, refresh,
  passwordReset, tokenConsume, vaultReveal, iris, agentRegister, download.

### Frontend

- Routing: `App.tsx` → `RequireAuth` → `AppShell` (Sidebar + Topbar + Outlet).
- Admin-only routes: `<RequireRole roles={ADMIN_ONLY}><Page/></RequireRole>`.
- Mutations: ZAWSZE z `onError` toast (pattern w `features/*/Page.tsx`).
- QueryKey conventions: `['workspaces', 'current']`, `['users', 'me']`, `['tickets']`, etc.
- Auth: `accessToken` ONLY in-memory (`store/auth.ts` partialize bez tokenu), refresh w cookie httpOnly.
- Mobile: AppShell ma drawer dla `<lg`, sidebar fixed dla `lg+`.
- Toast: `react-hot-toast` (top-right).
- Forms: `react-hook-form` + Zod resolver.

### DB

- Schema w `backend-v2/prisma/schema.prisma`. Po edycji ZAWSZE `npx prisma validate`.
- Migracje: nowy folder `prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`.
- ZAWSZE idempotentne (`IF NOT EXISTS`, `DO $$ EXCEPTION WHEN duplicate_object`).
- Po dodaniu modelu workspace-scoped: dodać `workspace` relation + `@@index([workspaceId])`
  + RLS policy w nowej migracji (kopia pattern z `20260421010000_rls_policies/`).
- Cascade: `Workspace.tickets/invoices/...` mają `onDelete: Cascade`. **Uwaga:** delete WS = delete wszystko.

## Bezpieczeństwo (mandatory)

- **Token w cookie httpOnly + access token ONLY in memory** (XSS-safe).
- **Sekrety NIGDY w stdout/logach** (też nie "zredagowane"). Weryfikacja przez sha256/length/exit code.
- **DATABASE_URL zawsze `@127.0.0.1`** (nigdy `@localhost` — IPv4/IPv6 ambiguity).
- **Multer:** ZAWSZE `fileFilter` blocklist (.exe/.bat/.svg/etc) + max size.
- **Uploads:** prywatne pliki przez auth-gated route (`GET /tickets/:id/attachments/:aid/file`),
  nie przez `express.static`. Tylko logo + public assets na static.
- **Input validation:** każdy POST/PATCH/PUT — Zod schema. User-controlled stringi z `.max()`.
- **Cross-workspace FK:** każdy FK z body pre-validować przez `findFirst({id, workspaceId})`.

Pełen standard: `~/.claude/projects/C--Users-adria-infradesk/memory/security_standard.md`.

## Deploy

Production: pojedynczy serwer `188.68.236.166:2222`, ssh user `adrian`.
- `/home/adrian/infradesk-v2/` — kod, deploy z gita
- pm2 process `infradesk-api` (backend), nginx serwuje frontend z `frontend-v2/dist/`
- DB Postgres lokalna, port 5432
- Backup: `~/db-backups/` retention 14d, integrity verify (`gunzip -t`)

**Procedure (skrót):**
```bash
ssh -p 2222 adrian@188.68.236.166
cd /home/adrian/infradesk-v2 && git pull
cd backend-v2 && npm ci --omit=dev && npx prisma migrate deploy && pm2 restart infradesk-api
cd ../frontend-v2 && npm ci && npm run build && sudo nginx -s reload
```

Pełen procedure: `docs/deploy.md`. Smoke testy + rollback: `docs/runbook.md`.

**Asystent v5 osobno:** PyInstaller build lokalnie → scp → bump `version.json`. Auto-update u klientów <2h.

## Tone

- **Polish UI strings.** Backend logi i komentarze: PL/EN mix OK, WHY-comments PL, internal infrastruktura EN.
- **NIGDY "agent" w UI** — zawsze "asystent" lub "Asystent Business" (decyzja owner 2026-04).
- **Workspace, NIE multi-tenant.** Mówić "workspace isolation".
- **Branding:** logo w `frontend-v2/public/logo.png`. Kolory: niebieski (primary), pomarańczowy/złoty (accent).

## Co NIE robić bez zgody

- Migracji destrukcyjnych (DROP/ALTER COLUMN typu)
- Zmian w pliku `.env` na produkcji
- `git push --force` na `main`
- Restartu pm2 na produkcji bez ack
- Zmiany RLS policies (linia 2 obrony — błąd = data leak)
- Hard-delete (wszystko soft-delete via `deletedAt`)
- Code-signing w pipeline gdy nie ma certyfikatu
- Zmiany w `agent_release_pipeline` bez weryfikacji SHA256

## Pamięć z poprzednich sesji

`~/.claude/projects/C--Users-adria-infradesk/memory/MEMORY.md` zawiera index
do wszystkich notatek. Zaczerpnij z `project_infradesk.md`, `security_standard.md`,
`feedback_*.md` (preferencje ownera), `audit_*.md` (zakończone audyty).

## Komenda startowa po nowej sesji

1. Przeczytaj memory MEMORY.md
2. `git status` — zobacz uncommitted work
3. `git log -5` — ostatnie zmiany
4. Sprawdź `backend-v2/prisma/migrations/` — najnowsza migracja
5. Wszystko inne wynika z aktualnego promptu

Cel projektu: zbudować silny SaaS B2B dla MSP/IT, wynieść poza Silers (white-label
docelowo). Nie premature optimization, nie multi-region za wcześnie. Solidnie
i prosto.

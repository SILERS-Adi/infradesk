# InfraDesk

**SaaS B2B dla firm IT typu MSP** — zarządzanie klientami, infrastrukturą,
zgłoszeniami, monitoringiem i AI-asystentem w jednym panelu.

🌐 [infradesk.pl](https://infradesk.pl) · ✉️ biuro@silers.pl · 📞 +48 575 662 664

## Funkcje

- **Helpdesk / Tickety** — pełen workflow (NEW → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED), SLA, kanban, email→ticket
- **Klienci & Lokalizacje** — multi-workspace MSP (provider ↔ client)
- **Urządzenia (CMDB)** — inventory, zdalny dostęp (RustDesk), monitoring metryk
- **Asystent IT na Windows** — auto-update, audyty bezpieczeństwa, backupy SQL, restart usług, GPO checks
- **Vault haseł** — AES-256-GCM, audit log, rotacja
- **Sejf zamówień / faktury** — InvoiceItem, KSeF (planowane)
- **AI Iris** — Claude API, tworzy/anuluje tickety, sprawdza status, dodaje komentarze
- **Portal klienta** — okrojony widok dla pracowników klienta
- **Backupy** — MySQL/Postgres/MSSQL z agenta, Fernet encryption, retention

## Quick start (lokalny dev)

### Wymagania
- Node.js 20+
- PostgreSQL 16
- Python 3.11+ (tylko jeśli budujesz agenta)

### Backend

```bash
cd backend-v2
cp .env.example .env   # uzupełnij DATABASE_URL, JWT_SECRET, etc.
npm ci
npx prisma migrate dev
npx prisma db seed     # opcjonalnie — testowe dane
npm run dev            # http://localhost:3000
```

### Frontend

```bash
cd frontend-v2
npm ci
npm run dev            # http://localhost:5173
```

### Asystent (Windows tylko)

```powershell
cd agent
pip install -r v5/requirements.txt
python -m v5.main
# Build EXE: pyinstaller "InfraDesk Business v5.spec"
```

## Struktura monorepo

```
infradesk/
├── backend-v2/         Node + Express + Prisma (REST + WS)
│   ├── prisma/         schema.prisma + migrations
│   ├── src/
│   │   ├── modules/    routery per-feature (auth, tickets, vault, ...)
│   │   ├── jobs/       background schedulers
│   │   ├── lib/        prisma, mailer, logger, jwt, crypto
│   │   ├── middleware/ auth, requireWorkspace, rateLimit, ...
│   │   └── utils/      stałe, helpery, ticket state machine
│   └── scripts/        deploy, backfill, sync skrypty
│
├── frontend-v2/        React 18 + Vite + Tailwind + RQ
│   └── src/
│       ├── features/   strony per-feature (auth, tickets, dashboard, ...)
│       ├── components/ ui/, layout/ (Sidebar, AppShell, Topbar)
│       ├── lib/        api (axios), utils
│       └── store/      Zustand (auth, ui state)
│
├── agent/              Python + PyInstaller
│   ├── v5/             aktualny kod (modułowy)
│   │   ├── core/       backup, update, ws, diagnostics, metrics
│   │   ├── variants/   business, home, server
│   │   └── main.py
│   ├── ui/             HTML dla pywebview (business.html)
│   └── InfraDesk Business v5.spec
│
├── id-faktura/         Osobne mini-app: faktury (Express + Vite)
├── docs/               Dokumentacja techniczna
│   ├── architecture.md
│   ├── runbook.md
│   ├── deploy.md
│   └── security.md
├── CLAUDE.md           Kontekst dla AI agentów (Claude Code etc.)
├── CHANGELOG.md        Release notes
└── CONTRIBUTING.md     Konwencje i PR flow
```

## Stack

| Warstwa | Technologia |
|---------|-------------|
| Backend | Node.js 20, TypeScript, Express, Prisma, Pino |
| Frontend | React 18, Vite, TypeScript, Tailwind, Radix UI, React Query, Zustand |
| DB | PostgreSQL 16 + Row Level Security |
| Auth | JWT (15min access + 7d refresh httpOnly), 2FA TOTP |
| AI | Anthropic Claude API |
| Agent | Python 3.11, PyInstaller, pywebview, websockets |
| Płatności | Paynow (przez `pay.infradesk.pl`) |
| Mail | SMTP (Postfix lokalny) |

## Bezpieczeństwo

- **Workspace isolation** — dwie linie obrony (aplikacja + Postgres RLS FORCE)
- **TLS** — Let's Encrypt, A+ rating
- **Tokens** — access in-memory, refresh httpOnly cookie
- **Audit** — pełen ActivityLog per akcja, `audit-logs.routes.ts`
- **Secrets** — DATABASE_URL/JWT_SECRET/API keys przez env, nigdy w repo
- **Backupy** — codzienne pg_dump, retention 14d, integrity verify

Pełen security model: [`docs/security.md`](docs/security.md).

## Deployment

Pojedynczy serwer (DigitalOcean droplet, 188.68.236.166:2222).
Frontend serwowany przez nginx z `frontend-v2/dist/`. Backend pm2 (`infradesk-api`).

Procedure: [`docs/deploy.md`](docs/deploy.md). Incident playbook: [`docs/runbook.md`](docs/runbook.md).

## Roadmap (najbliższe)

- [ ] Sentry + UptimeRobot + status.infradesk.pl
- [ ] CI/CD (GitHub Actions) + staging env
- [ ] Off-site backup (Backblaze B2)
- [ ] PgBouncer + Redis
- [ ] Mobile drawer + Kanban a11y improvements
- [ ] DPA template + KSeF integration
- [ ] Multi-region (DE/NL) — gdy >10 klientów

Pełen [CHANGELOG.md](CHANGELOG.md).

## Wsparcie

- **Dokumentacja techniczna:** `docs/`
- **Wsparcie klienta:** biuro@silers.pl, +48 575 662 664
- **Issue / bug raport:** wewnętrznie do Silers (na razie nie ma publicznego repo)

## Licencja

Proprietary © 2026 Silers Adrian Błaszczykowski. Wszelkie prawa zastrzeżone.

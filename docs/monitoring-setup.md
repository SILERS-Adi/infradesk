# Monitoring & Observability — setup guide

## Stack

| Co | Narzędzie | Cost |
|----|-----------|------|
| Error tracking | **Sentry** (self-host albo SaaS) | Free 5k events/mc, $26/mc dla 50k |
| Uptime monitoring | **UptimeRobot** | Free 50 monitors, 5min interval |
| Status page | **Uptime Kuma** (self-host) | Free (~$0, na własnym serwerze) |
| Logs | pm2 logs (lokalne) | Free |
| **Future:** APM | Grafana + Loki | Free, $5/mc droplet jeśli osobno |

## 1. Sentry

Kod już wpięty w 3 miejscach (backend / frontend / agent v5). Pozostaje config.

### Setup (10 min)

1. **Załóż konto** na [sentry.io](https://sentry.io) (free, GitHub login OK)
2. **Create project — Backend (Node.js):**
   - Platform: Node.js
   - Project name: `infradesk-backend`
   - Skopiuj DSN (https://...@sentry.io/...)
3. **Create project — Frontend (React):**
   - Platform: React
   - Project name: `infradesk-frontend`
   - Skopiuj DSN
4. **Create project — Agent (Python):**
   - Platform: Python
   - Project name: `infradesk-agent`
   - Skopiuj DSN

### Konfiguracja env

**Backend:** dopisz w `.env` na produkcji:
```bash
SENTRY_DSN=https://...@sentry.io/...
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_RELEASE=infradesk-backend@$(git rev-parse --short HEAD)
```

**Frontend:** w `.env.production` (vite):
```bash
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_SENTRY_ENV=production
VITE_SENTRY_TRACES_RATE=0.1
```

**Agent v5:** dopisz `SENTRY_DSN_AGENT=...` w build env (`InfraDesk Business v5.spec` ma sekcję `os.environ` lub w runtime z installer).

### Test po deploy

1. Backend: w `iris-chat.controller.ts` dodaj tymczasowo `throw new Error('sentry-test')` w handler, kliknij Iris z UI → sprawdź czy event w Sentry.
2. Frontend: w przeglądarce DevTools console: `Sentry.captureMessage('test')` → zdarzenie w Sentry.

### Source maps (frontend)

Aby stack trace był czytelny, upload source maps do Sentry przy buildzie:

```bash
# .env.production
SENTRY_AUTH_TOKEN=sntrys_...   # z Sentry → Account → API → Auth Tokens

# Build (TODO: dodać do CI lub deploy.sh)
npm run build
npx @sentry/cli sourcemaps inject --org silers --project infradesk-frontend ./dist
npx @sentry/cli sourcemaps upload --org silers --project infradesk-frontend ./dist
```

## 2. UptimeRobot

Free 50 monitorów, 5min interval, 30s wystarcza dla SaaS na tej fazie.

### Setup

1. Załóż konto na [uptimerobot.com](https://uptimerobot.com) (free)
2. Add Monitor → HTTP(s) — DODAJ TE 8 monitorów:

| Friendly name | URL | Type | Interval |
|---------------|-----|------|----------|
| InfraDesk health | `https://infradesk.pl/health` | HTTP(s) keyword | 5min |
| InfraDesk login page | `https://infradesk.pl/login` | HTTP(s) | 5min |
| Faktura | `https://faktura.infradesk.pl/` | HTTP(s) | 5min |
| Pay gateway | `https://pay.infradesk.pl/health` | HTTP(s) | 5min |
| MX silers.pl | `silers.pl` | DNS (MX) | 5min |
| SSL infradesk.pl | `https://infradesk.pl/` | SSL/Cert | 1d (alert <30d) |
| SSL faktura | `https://faktura.infradesk.pl/` | SSL/Cert | 1d |
| Status page | `https://status.infradesk.pl/` | HTTP(s) | 5min |

   - **Keyword monitor** dla `/health`: oczekiwany keyword `"status":"ok"`.
3. **Alert contacts:** dodaj email biuro@silers.pl + SMS (jeśli chcesz)
4. **Public Status Page** w UptimeRobot: opcja, ale my mamy Uptime Kuma więc skip.

### Maintenance windows

Przed deployem: UptimeRobot → Maintenance Window → 30 min (zapobiega false alarm).

## 3. Uptime Kuma (status.infradesk.pl)

Self-hosted, ładny status page który pokazujemy klientom.

### Setup

```bash
# Z laptopa:
scp -P 2222 scripts/setup-status-page.sh adrian@188.68.236.166:~/

# SSH na serwer:
ssh -p 2222 adrian@188.68.236.166
chmod +x setup-status-page.sh
./setup-status-page.sh
```

### Po pierwszym uruchomieniu

1. **Przed DNS:** SSH tunnel z laptopa:
   ```bash
   ssh -p 2222 -L 3001:127.0.0.1:3001 adrian@188.68.236.166
   ```
   Otwórz `http://localhost:3001` → załóż konto admin.

2. **DNS:** A record `status.infradesk.pl` → `188.68.236.166`

3. **Cert + reload:**
   ```bash
   sudo certbot --nginx -d status.infradesk.pl
   sudo nginx -s reload
   ```

4. **Dodaj monitory** (te same co UptimeRobot — Uptime Kuma duplikuje, ale daje status page):
   - Settings → Notifications: dodaj email + Telegram (opcjonalnie)
   - Add New Monitor: HTTP(s) z URLami z tabeli wyżej
   - Settings → Status Pages → New Status Page → "InfraDesk Status"
   - Public URL: `https://status.infradesk.pl/status/infradesk` (lub `/`)

5. **Customize:**
   - Theme: branding kolory InfraDesk (#3B82F6 primary)
   - Logo: `infradesk.pl/logo.png`
   - Footer: "Dla pytań: biuro@silers.pl"

## 4. Logs (pm2 + journalctl)

### pm2 logs aktualnie

```bash
pm2 logs infradesk-api --lines 100      # ostatnie
pm2 logs infradesk-api --err            # tylko errory
pm2 flush                                # czyść (uwaga: traci historię)
```

Pliki: `~/.pm2/logs/infradesk-api-out.log` i `-error.log`.

### Logrotate (P1)

`/etc/logrotate.d/pm2`:
```
/home/adrian/.pm2/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

### Postgres slow query log

Już skonfigurowane (audit 2026-05-02): `log_min_duration_statement = 1000`.
Sprawdź:
```bash
sudo tail -f /var/log/postgresql/postgresql-*.log | grep "duration:"
```

## 5. Alert routing

| Severity | Channel | Action |
|----------|---------|--------|
| P0 (down/data loss) | UptimeRobot SMS + email + Sentry email | Adrian odbiera w 5 min |
| P1 (degraded) | UptimeRobot email + Sentry email | Reakcja w 30 min |
| P2 (warning) | Sentry email | Plan w sprint |

**Anti-fatigue:** mute alerty w godzinach 22:00-7:00 dla P2 (UptimeRobot Maintenance Window albo dedykowany rule).

## 6. Health checks

### Backend `/health` (już istnieje)

```ts
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'infradesk-backend-v2', version: '2.0.0-alpha.1' });
});
```

**TODO P1:** rozszerzyć o sprawdzenie DB:
```ts
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'fail' });
  }
});
```

### Agent v5 health

Backend wie że agent żyje przez `lastSeen` (heartbeat co 30s). Watchdog
`agent-offline-watchdog.ts` alertuje gdy >24h.

## 7. Co monitorować dalej (P1+)

- **Synthetic monitoring** — Playwright na CI co 1h: login → utworz ticket → close
- **APM** (application performance monitoring) — Grafana + Tempo, traces dla slow endpoints
- **Cost monitoring** — Anthropic API usage, DigitalOcean billing alert
- **Business metrics** — DAU/MAU, NPS, conversion rates
- **Error budget** — SLA 99.5% = 21min downtime/mc; track i alert przy 50%/80%

## Roczny budget monitoringu

- Sentry SaaS: $26/mc × 12 = $312/rok (jeśli przekroczymy free 5k events)
- UptimeRobot: free
- Uptime Kuma: free (na własnym serwerze, ~brak kosztu CPU/RAM)
- Domain status.infradesk.pl: w istniejącej domenie infradesk.pl

**Razem: ~$0-300/rok.** Bardzo niski koszt zysku jakiego daje observability.

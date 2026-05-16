# Runbook — Incident Response

Pierwsza pomoc gdy coś się sypie. Każdy playbook: **Symptoms → Diagnose → Fix → Postmortem**.

## Quick reference

| Incydent | Severity | Sekcja |
|----------|----------|--------|
| Backend nie odpowiada (5xx, timeout) | 🔴 P0 | [§1](#1-backend-nie-odpowiada) |
| Database padło / connection refused | 🔴 P0 | [§2](#2-database-padło) |
| Disk full | 🔴 P0 | [§3](#3-disk-full) |
| Agent v5 masowo offline | 🟠 P1 | [§4](#4-agent-v5-masowo-offline) |
| Email nie wychodzi (bounce/timeout) | 🟠 P1 | [§5](#5-mailer-fails) |
| SSL cert wygasł | 🟠 P1 | [§6](#6-ssl-cert-wygasł) |
| Slow queries / wysokie CPU | 🟡 P2 | [§7](#7-slow-queries--wysokie-cpu) |
| Spam rejestracji / brute-force | 🟡 P2 | [§8](#8-brute-force--spam-rejestracji) |
| AI Iris ratelimit / koszt | 🟡 P2 | [§9](#9-ai-iris-cost--ratelimit) |

**Server:** `ssh -p 2222 adrian@188.68.236.166`
**Logi:** `pm2 logs infradesk-v2-backend`
**DB:** `sudo -u postgres psql infradesk_v2_dev`
**PM2 process name:** `infradesk-v2-backend` (id 51, port 4250)
**Repo:** `/home/adrian/infradesk` (branch `main`)
**Frontend dist:** `/var/www/infradesk-v2/`
**Backupy DB:** `/home/adrian/backups/`

## Stan referencyjny (post-deploy 2026-05-10)

```
DB rozmiar: 16 MB · 60 tabel
Top tabele: WorkSession 494 · MonitoringAlert 395 · ActivityLog 281 · TicketEvent 263 · Ticket 240 · Device 59
PM2 RAM: ~170 MB · CPU: 0% idle · uptime stable
Health response time: ~55-60ms
```

## Recovery: OWNER zablokowany przez 2FA enforce

Jeśli OWNER (np. `biuro@silers.pl`) został zablokowany modal'em `ForceTwoFactorSetup`
i nie ma dostępu do TOTP:

```bash
ssh -p 2222 adrian@188.68.236.166
sudo -u postgres psql infradesk_v2_dev -c "UPDATE \"User\" SET \"twoFactorEnabled\" = false, \"twoFactorSecret\" = NULL WHERE email = 'biuro@silers.pl';"
# Zaloguj się normalnie. Modal pojawi się ponownie — masz drugą szansę
# z dostępem do TOTP (Google Authenticator / Authy / 1Password).
# WAŻNE: zapisz kody zapasowe!
```

## Quick health check (1 polecenie)

```bash
ssh -p 2222 adrian@188.68.236.166 'curl -s https://infradesk.pl/health; echo; pm2 list | grep infradesk-v2; df -h / | tail -1; free -h | head -2'
```

---

## 1. Backend nie odpowiada

**Symptoms:**
- `infradesk.pl` zwraca 502/504 z nginx
- Klient pisze "panel nie działa"
- UptimeRobot alert

**Diagnose:**
```bash
# 1. Czy pm2 process żyje?
pm2 status
# Jeśli "errored" / "stopped" → idź do Fix #A
# Jeśli "online" ale nie odpowiada → Fix #B

# 2. Logi ostatnich błędów
pm2 logs infradesk-api --err --lines 100
# Szukaj: stack trace, "Cannot find module", "ECONNREFUSED" (DB)

# 3. Memory / CPU
pm2 monit
# RSS >800MB = leak / bug w handlerze

# 4. Czy port 3000 listenuje?
ss -tlnp | grep 3000
```

**Fix:**

**A. Restart pm2:**
```bash
pm2 restart infradesk-api
# Czekaj 5s, ponów test
curl -I https://infradesk.pl/health
```

**B. Restart z fresh start (gdy memory leak):**
```bash
pm2 stop infradesk-api && pm2 delete infradesk-api
cd /home/adrian/infradesk-v2/backend-v2
pm2 start npm --name infradesk-api -- run start:prod
pm2 save
```

**C. Rollback ostatniego deploy:**
```bash
cd /home/adrian/infradesk-v2
git log -3 --oneline   # zobacz ostatnie commity
git reset --hard HEAD~1
cd backend-v2 && npm ci --omit=dev && pm2 restart infradesk-api
```

**Postmortem:** zapisz incydent w `~/incidents/YYYY-MM-DD-backend-down.md`.

---

## 2. Database padło

**Symptoms:**
- Backend logi: `ECONNREFUSED 127.0.0.1:5432`
- `psql: error: connection to server at "127.0.0.1"` failed

**Diagnose:**
```bash
# 1. Czy postgres żyje?
sudo systemctl status postgresql

# 2. Czy listenuje na 5432?
ss -tlnp | grep 5432

# 3. Disk full? (PG halt na disk full)
df -h /var/lib/postgresql

# 4. WAL ratio (jeśli problem z replication)
sudo -u postgres psql -c "SELECT * FROM pg_stat_wal_receiver;"

# 5. Korupcja?
sudo -u postgres psql infradesk_v2_dev -c "SELECT 1;"
# Jeśli error "relation does not exist" → patrz Fix #C
```

**Fix:**

**A. Restart PG:**
```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql
# Czekaj na "active (running)"
pm2 restart infradesk-api
```

**B. Disk full → cleanup:**
```bash
# Stary WAL
sudo -u postgres psql -c "CHECKPOINT;"
# Stare logi PG
sudo journalctl --vacuum-size=500M
# Sprawdź ~/db-backups/ — czy retention 14d zadziałało
ls -lh ~/db-backups/ | head -20
```

**C. Restore z backupu (LAST RESORT):**
```bash
# 1. Stop backendu
pm2 stop infradesk-api

# 2. Wybierz najnowszy backup
ls -lt ~/db-backups/*.sql.gz | head -5

# 3. Drop + restore
sudo -u postgres dropdb infradesk_v2_dev_corrupt
sudo -u postgres createdb infradesk_v2_dev_new
gunzip -c ~/db-backups/2026-XX-XX.sql.gz | sudo -u postgres psql infradesk_v2_dev_new

# 4. Test
sudo -u postgres psql infradesk_v2_dev_new -c "SELECT count(*) FROM \"User\";"

# 5. Swap nazw + restart
sudo -u postgres psql -c "ALTER DATABASE infradesk_v2_dev RENAME TO infradesk_v2_dev_corrupt;"
sudo -u postgres psql -c "ALTER DATABASE infradesk_v2_dev_new RENAME TO infradesk_v2_dev;"
pm2 start infradesk-api
```

**Postmortem:** sprawdź czy backup off-site jest skonfigurowany (`docs/deploy.md#backup`).
Jeśli nie — DODAJ TO TERAZ (Backblaze B2 + rclone).

---

## 3. Disk full

**Symptoms:**
- `df -h /` → 100%
- PG: `could not write to file "pg_wal/...": No space left on device`
- Backend: `ENOSPC: no space left on device, open ...`

**Diagnose:**
```bash
df -h
du -sh /var/* /home/adrian/* 2>/dev/null | sort -h | tail -10
# Najczęstsi winowajcy:
# - /var/log/journal (>4 GB) — vacuum
# - /home/adrian/.pm2/logs (rosną bez rotacji)
# - ~/db-backups (retention 14d powinien działać)
# - /var/log/nginx (rotacja codzienna)
```

**Fix:**
```bash
# 1. Quick wins
sudo journalctl --vacuum-time=7d           # zwykle 2-4 GB
pm2 flush                                   # wyczyści logi pm2
find /var/log/nginx/*.gz -mtime +30 -delete

# 2. Stare backupy (jeśli retention nie zadziałał)
find ~/db-backups -name "*.sql.gz" -mtime +14 -delete

# 3. Docker (jeśli używasz)
docker system prune -af --volumes

# 4. Stare buildy frontend
cd /home/adrian/infradesk-v2/frontend-v2
ls -lt dist/ | head    # zostaw najnowszy, usuń poprzednie jeśli były
```

**Prewencja:** dodać `logrotate` config dla pm2 + cron `backup-cleanup.sh`.

---

## 4. Agent v5 masowo offline

**Symptoms:**
- `[agent-offline-watchdog]` wysyła wiele alertów
- Backend logi: setki "WS connection error" jednocześnie
- Klienci: "Asystent zniknął z panelu"

**Diagnose:**
```sql
-- Ile agentów offline >24h
SELECT count(*) FROM "AgentRegistration"
WHERE "lastSeen" < now() - interval '24 hours'
  AND status = 'ACTIVE' AND "deletedAt" IS NULL;

-- Distribution wersji (czy to bad release?)
SELECT "agentVersion", count(*) FROM "AgentRegistration"
WHERE status = 'ACTIVE' AND "deletedAt" IS NULL
GROUP BY 1 ORDER BY 2 DESC;
```

**Najczęstsze przyczyny:**

**A. Bad release agenta** (np. 5.0.6-5.0.14 broken certifi):
- Agenci z bad version nie łączą się przez requests/HTTPS.
- Auto-update przez urllib (system cert) wciąż działa → eventual self-heal.
- Fix: wgraj nowy `version.json` z fix'em.

**B. Backend zmienił WS endpoint:**
- Agent v4 może używać `?token=` query (deprecated 2026-05).
- Sprawdź `pm2 logs infradesk-api | grep "agent-ws DEPRECATED"`.

**C. SSL cert wygasł:**
- Agent verify=True odrzuca → patrz §6.

**D. Klient wyłączył komputery (weekend / urlop):**
- Normalne. Brak akcji.

**Fix bad-release agentów (manual):**
- Klient może odpalić: `taskkill /F /IM "InfraDesk Business.exe"` → service auto-start
  z fresh check version → self-update do najnowszej.

---

## 5. Mailer fails

**Symptoms:**
- Klient: "Nie dostaję emaili rejestracyjnych / o ticketach"
- Backend logi: `[mailer] SMTP timeout`
- Bounce reports w skrzynce biuro@silers.pl

**Diagnose:**
```bash
# Test SMTP
echo "Subject: test\n\nbody" | sendmail biuro@silers.pl

# Postfix queue
mailq | tail -20

# Reverse DNS / SPF / DKIM
dig MX silers.pl
dig TXT silers.pl   # SPF i DKIM tutaj
```

**Fix:**

**A. SMTP_PASS źle:** sprawdź `.env` — `SMTP_PASS` musi pasować do hasła skrzynki.

**B. Reputation IP:** sprawdź na `mxtoolbox.com/blacklists.aspx` czy IP serwera jest na blackliście.

**C. Bounce flood:** klient zarejestrował `xxx@gmail.com` (typo) → bounce → backend retry → flood.
Fix: dodać `User.emailBounceCount` + skip wysyłki gdy >3.

**D. SMTP_FROM nie pasuje do domeny:** SPF fail → spam folder. Sprawdź `mailer.ts` → `from`.

---

## 6. SSL cert wygasł

**Symptoms:**
- Browser: "Twoje połączenie nie jest prywatne"
- Agent: `SSL: CERTIFICATE_VERIFY_FAILED`

**Diagnose:**
```bash
# Daty cert
openssl x509 -in /etc/letsencrypt/live/infradesk.pl/cert.pem -noout -dates

# Status certbot
sudo certbot certificates
sudo systemctl status certbot.timer
```

**Fix:**
```bash
# Manualny renew
sudo certbot renew --force-renewal -d infradesk.pl,www.infradesk.pl,faktura.infradesk.pl

# Reload nginx
sudo nginx -t && sudo nginx -s reload
```

**Prewencja:** `certbot.timer` powinien renewować >30d przed expiry. Jeśli nie odpalał — sprawdź `journalctl -u certbot.timer`.

---

## 7. Slow queries / wysokie CPU

**Symptoms:**
- Backend response time >2s
- pm2 monit: CPU >80%
- PG: aktywne connections >80

**Diagnose:**
```sql
-- Aktywne queries >1s
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '1 second'
ORDER BY duration DESC;

-- Top slow queries (jeśli log_min_duration_statement = 1000)
sudo tail -200 /var/log/postgresql/postgresql-*.log | grep "duration:"

-- Tables needing vacuum
SELECT relname, n_dead_tup, n_live_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC LIMIT 10;
```

**Fix:**

**A. Kill pojedynczego long-running query:**
```bash
sudo -u postgres psql infradesk_v2_dev -c "SELECT pg_cancel_backend(<pid>);"
# Jeśli ignoruje:
sudo -u postgres psql infradesk_v2_dev -c "SELECT pg_terminate_backend(<pid>);"
```

**B. VACUUM dużej tabeli:**
```sql
VACUUM ANALYZE "ActivityLog";
-- Jeśli >50% dead tuples:
VACUUM FULL "ActivityLog";  -- exclusive lock!
```

**C. Brak indexu na FK** (audit 2026-04-01 wykrywał takie):
```sql
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE n_distinct > 100 AND tablename IN (...)
  AND NOT EXISTS (SELECT 1 FROM pg_indexes ...);
-- Po znalezieniu: CREATE INDEX CONCURRENTLY ...
```

---

## 8. Brute-force / spam rejestracji

**Symptoms:**
- Backend logi: setki `[auth/register] rate_limited`
- DB rośnie szybko (`User.count()` skacze o 1000 dziennie)
- Mailer flood (verify emails do losowych adresów)

**Diagnose:**
```sql
-- Nowe konta z ostatnich 24h
SELECT count(*) FROM "User" WHERE "createdAt" > now() - interval '24 hours';

-- Czy są fałszywe (.test / +alias)
SELECT email FROM "User" WHERE "createdAt" > now() - interval '24 hours' LIMIT 30;

-- Bouncy w postfixie
mailq | grep "deferred" | wc -l
```

**Fix:**

**A. Banuj IP nginxem (na 1h):**
```bash
sudo tail -100 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head
# Najczęstsze IP →
sudo iptables -A INPUT -s <ip> -j DROP
```

**B. Tighten rate limit** (np. `registerLimiter` 5/h → 2/h):
```ts
// backend-v2/src/middleware/rateLimit.ts
export const registerLimiter = make({ windowMs: 60*60*1000, max: 2, ... });
```

**C. Wymuś reCAPTCHA** (longer fix):
- Frontend: Google reCAPTCHA v3 (invisible).
- Backend: weryfikuj `req.body.captchaToken` przed `service.register()`.

**D. Soft-delete fake kont:**
```sql
UPDATE "User" SET "deletedAt" = now()
WHERE "createdAt" > now() - interval '24 hours'
  AND email LIKE '%@example.com'
  AND "emailVerified" = false;
```

---

## 9. AI Iris cost / ratelimit

**Symptoms:**
- Anthropic console: monthly spend >$50
- User dostaje `plan_limit_exceeded`
- Backend logi: `[iris] Anthropic API 429`

**Diagnose:**
```sql
-- Top 10 workspaces po użyciu Iris (miesiąc)
SELECT "workspaceId", count(*), sum("totalTokens")
FROM "LlmUsage"
WHERE "createdAt" > date_trunc('month', now())
GROUP BY 1 ORDER BY 3 DESC LIMIT 10;

-- Top tools użytych
SELECT "toolName", count(*) FROM "LlmUsage"
WHERE "createdAt" > now() - interval '24 hours'
GROUP BY 1 ORDER BY 2 DESC;
```

**Fix:**

**A. Workspace abuses:** ban ich Iris przez `WorkspaceModule.disabled = true` dla `iris`.

**B. Konkretny user loop** (LLM hallucination):
- `enforceAiCallLimit` w `utils/planLimits.ts` blokuje powyżej miesięcznego limitu.
- `MUTATING_TOOLS` cap 8 mutacji/chat (od 2026-05).

**C. Anthropic API down:**
- Status: https://status.anthropic.com
- Fallback w `iris-chat.controller.ts`: graceful error message → klient ponawia.

**D. Cost spike:** disable Iris feature globalnie:
```ts
// app.ts: skip mount irisChatRouter
// LUB: zmień ANTHROPIC_API_KEY na pusty string → Iris samo wyłączy
```

---

## Eskalacja

Jeśli nie wiesz co robić:
1. **Zatrzymaj escalację** — disable feature który ma problem (lepiej brak feature niż data leak).
2. **Status page** — daj klientom znać że wiesz (`status.infradesk.pl`).
3. **Wymrozić kod** — `git tag pre-incident-YYYY-MM-DD` przed jakąkolwiek zmianą.
4. **Postmortem** w `~/incidents/YYYY-MM-DD-tytul.md` w 24h od resolve.

## Postmortem template

```markdown
# Incident: <title>
- Date: YYYY-MM-DD HH:MM CET
- Detected by: <UptimeRobot / klient / log review>
- Resolved at: HH:MM
- Severity: P0/P1/P2

## Impact
- Klienci: <ilu / którzy>
- Funkcje: <co nie działało>
- Data loss: tak/nie

## Timeline
- HH:MM — incydent zaczął się
- HH:MM — wykryto
- HH:MM — ...
- HH:MM — resolved

## Root cause
<jedno-zdaniowe wyjaśnienie>

## Fix
<co zrobiono>

## What went well
<2-3 punkty>

## What went wrong
<2-3 punkty>

## Action items
- [ ] <zapobiec że to się powtórzy>
- [ ] <ulepszyć detection>
- [ ] <ulepszyć runbook>
```

---

# Monitoring & Alerts — setup poza kodem

Te kroki **trzeba wykonać ręcznie w UI** (kod sam tego nie skonfiguruje).

## Sentry — alerty na 5xx i webhook fails

1. Wejdź na https://sentry.io → projekt `infradesk-backend-v2`
2. Settings → **Alerts** → **Create Alert Rule**
3. **Reguła #1 — "Każdy 5xx z prod":**
   - When: `An event is captured`
   - If: `event.level == error` AND `environment == production`
   - Then: email do `biuro@silers.pl` + Slack do `#incidents` (jeśli skonfigurowane)
   - Throttle: 1 powiadomienie per 15 min per fingerprint
4. **Reguła #2 — "Webhook signature reject":**
   - When: `Issue is first seen`
   - If: message contains `[billing] webhook signature reject`
   - Then: email natychmiast (to potencjalny atak — nie czekaj)
5. **Reguła #3 — "Mass plan downgrade":**
   - When: `Number of events > 5 in 1 hour`
   - If: tag `actionType:plan_auto_downgraded`
   - Then: email — >5 downgradeów na godzinę = coś jest źle z renewal flow

## UptimeRobot — uptime monitoring

1. https://uptimerobot.com → New Monitor
2. **Monitor 1 — liveness:**
   - URL: `https://infradesk.pl/health` · Interval: 5 min · SMS + email
3. **Monitor 2 — DB readiness:**
   - URL: `https://infradesk.pl/api/v2/health` · Expected: 200 (jeśli 503 → DB padło)
4. **Monitor 3 — landing page:**
   - URL: `https://infradesk.pl/` · Keyword: `InfraDesk`

Status page (opcjonalnie, gdy >5 klientów): `status.infradesk.pl` CNAME.

## Off-site backup do S3/R2

Aktualnie tylko local `~/db-backups/` (14d retention). Jeśli VPS padnie — backup pada razem z nim. Off-site to **must** dla SaaS.

```bash
# Setup jednorazowy:
sudo apt install awscli && aws configure   # klucz od Cloudflare R2 / AWS S3

# Test:
aws s3 cp ~/db-backups/infradesk_v2_$(date +%Y%m%d).sql.gz \
  s3://infradesk-backups/db/ --storage-class STANDARD_IA

# Cron (crontab -e):
# 4 0 * * *  /usr/bin/aws s3 cp /home/adrian/db-backups/infradesk_v2_$(date +\%Y\%m\%d).sql.gz s3://infradesk-backups/db/ --storage-class STANDARD_IA >> /var/log/s3-backup.log 2>&1

# Retention (lifecycle policy):
# 0-30d STANDARD_IA · 30-365d GLACIER · >365d delete
```

**Sugerowany provider:** Cloudflare R2 (zero egress, ~$0.015/GB/m-c). Backup DB ~50-200MB skompresowany → <1 PLN/m-c.

## RODO right to erasure — workflow ad hoc

Brak UI w MVP. Gdy klient zgłosi:

```sql
-- 1. Soft delete + mark
UPDATE "User" SET "erasureRequestedAt" = NOW(), "deletedAt" = NOW()
  WHERE email = 'klient@example.pl';

-- 2. Anonymize AuditEvent (zachowaj historię, usuń PII)
UPDATE "AuditEvent" SET "userId" = NULL, "ipAddress" = NULL, "userAgent" = NULL
  WHERE "userId" = (SELECT id FROM "User" WHERE email = 'klient@example.pl');

-- 3. Po 30 dniach grace — hard delete:
DELETE FROM "User" WHERE "erasureRequestedAt" < NOW() - INTERVAL '30 days';
```

Usunięcie workspace ownera = cascade na wszystkie dane workspace.

# Deploy procedure

Pełny procedure deployu na produkcję. Aktualnie ręczny — w P1 do CI/CD.

## Prerequisites

- Dostęp SSH do `188.68.236.166:2222` jako `adrian`
- Push access do `github.com/SILERS-Adi/infradesk`
- Lokalnie: Node.js 20+, npm 10+, git

## Architektura deployu

```
┌─────────────────────────────────────────────────────────┐
│  GitHub (main)                                          │
│  └─ ci/cd: BRAK (planowane GitHub Actions)              │
└────────────────┬────────────────────────────────────────┘
                 │ git pull
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Server 188.68.236.166                                  │
│  /home/adrian/infradesk-v2/                             │
│  ├── backend-v2/    pm2 process "infradesk-api" :3000   │
│  ├── frontend-v2/   build → /var/www/.../dist (nginx)   │
│  └── id-faktura/    pm2 process "id-faktura"           │
│                                                         │
│  /var/www/infradesk-v2/downloads/                       │
│  └── InfraDeskBusiness.exe + version.json (asystent)    │
│                                                         │
│  /home/adrian/db-backups/  (cron 03:00, retention 14d)  │
└─────────────────────────────────────────────────────────┘
```

## Pełny deploy procedure

### 1. Pre-deploy (lokalnie)

```bash
# Sanity check przed pushem
cd backend-v2 && npx tsc --noEmit          # 0 errors
npx prisma validate                         # OK
cd ../frontend-v2 && npx tsc --noEmit      # 0 errors
npm run build                               # czy build przechodzi

# Commit + push
git add -A
git commit -m "<conventional commit>"
git push origin main
```

### 2. Backup pre-deploy (krytyczne!)

```bash
ssh -p 2222 adrian@188.68.236.166

# Backup DB do snapshot
sudo -u postgres pg_dump infradesk_v2_dev | gzip > ~/db-backups/pre-deploy-$(date +%F-%H%M).sql.gz
ls -lh ~/db-backups/pre-deploy-*.sql.gz | tail -1
# >10MB ✓

# Backup current frontend dist (rollback bez rebuild)
cp -r /home/adrian/infradesk-v2/frontend-v2/dist /home/adrian/dist-backups/$(date +%F-%H%M)
```

### 3. Pull kodu

```bash
cd /home/adrian/infradesk-v2
git fetch origin
git log HEAD..origin/main --oneline   # zobacz co przyjdzie
git pull origin main
```

### 4. Backend update

```bash
cd backend-v2

# Dependencies (--omit=dev = production)
npm ci --omit=dev

# Prisma
npx prisma generate
npx prisma migrate deploy   # idempotentne, każda migracja w transakcji
# Sprawdź:
sudo -u postgres psql infradesk_v2_dev -c "SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"

# Restart backendu
pm2 restart infradesk-api

# Verify
sleep 3
pm2 logs infradesk-api --lines 50 --nostream | grep -iE 'error|listen|started'
# ❗ STOP gdy widzisz "Cannot find module" / "Environment variable not found"
curl -I https://infradesk.pl/health
# 200 OK ✓
```

### 5. Frontend update

```bash
cd ../frontend-v2

npm ci
npm run build
# Build powinien dać `dist/` w ~30s

# Reload nginx (frontend serwowany jest z dist/ — nginx ma do tego symlink)
sudo nginx -t && sudo nginx -s reload
```

### 6. Smoke testy (z laptopa)

```bash
# 1. Health check
curl -I https://infradesk.pl/health
# Expected: 200 OK

# 2. Open redirect zablokowany
curl -I "https://infradesk.pl/login?next=//evil.com"
# Frontend: powinien przejść do /dashboard, nie do evil.com (sprawdź w browser)

# 3. Static attachment ścieżka zablokowana
curl -I "https://infradesk.pl/uploads/tickets/test.exe"
# Expected: 404

# 4. Login flow w przeglądarce
# - DevTools → Application → Local Storage → idesk-auth
# - Pole "accessToken" NIE może istnieć
# - Tylko "user" i "workspaceId"

# 5. Permission check
# - Login jako MEMBER (nie OWNER/ADMIN)
# - Wpisz w URL /agents → powinno przekierować do /dashboard
# - Wpisz w URL /storage → tak samo

# 6. Tickets feature
# - Otwórz dowolny ticket → kliknij załącznik → blob download (nie /uploads/)
# - Spróbuj utworzyć ticket → SMS/email do klienta wysłany
```

### 7. Asystent v5 (osobno!)

Asystent ma własny pipeline — NIE deployuje się przy git pull.

```powershell
# Lokalnie (Windows)
cd C:\Users\adria\infradesk\agent

# Build
pyinstaller "InfraDesk Business v5.spec" --clean --noconfirm

# Verify
$h = (Get-FileHash -Algorithm SHA256 dist\InfraDeskBusiness.exe).Hash.ToLower()
Write-Host "SHA256: $h"

# Upload
scp -P 2222 dist\InfraDeskBusiness.exe `
  adrian@188.68.236.166:/var/www/infradesk-v2/downloads/InfraDeskBusiness.exe

# Update version.json
ssh -p 2222 adrian@188.68.236.166 "cat > /var/www/infradesk-v2/downloads/version.json" <<EOF
{
  "version": "5.0.18",
  "url": "https://infradesk.pl/downloads/InfraDeskBusiness.exe",
  "sha256": "$h",
  "silers_msi_sha256": ""
}
EOF
```

Po wgraniu `version.json`:
- Każdy agent online sprawdza co 2h → pobierze update.
- Forsowanie: klient `taskkill /F /IM "InfraDesk Business.exe"` → service auto-start z fresh check.

## Rollback

### Code rollback (najczęstszy)

```bash
ssh -p 2222 adrian@188.68.236.166
cd /home/adrian/infradesk-v2

# Identyfikuj problem commit
git log -5 --oneline
# np. ostatnie commity: aa099d5 (problem), 69963b3, a7b766e

# Cofnij się do bezpiecznego commita
git reset --hard 69963b3
# LUB git reset --hard HEAD~1

# Backend
cd backend-v2 && npm ci --omit=dev && pm2 restart infradesk-api

# Frontend
cd ../frontend-v2 && npm ci && npm run build && sudo nginx -s reload

# Migracje są IDEMPOTENTNE — nie trzeba cofać. Sprawdź:
# sudo -u postgres psql infradesk_v2_dev -c "SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
```

### DB rollback (rzadko, last resort)

Tylko gdy **migracja wprowadziła destrukcyjną zmianę** (rzadko — używamy
soft-delete + idempotency).

```bash
# 1. Zatrzymaj backend
pm2 stop infradesk-api

# 2. Restore z pre-deploy backup
gunzip -c ~/db-backups/pre-deploy-2026-XX-XX-HHMM.sql.gz | sudo -u postgres psql infradesk_v2_dev_restore

# 3. Verify
sudo -u postgres psql infradesk_v2_dev_restore -c "SELECT count(*) FROM \"User\";"

# 4. Swap (atomowo)
sudo -u postgres psql -c "ALTER DATABASE infradesk_v2_dev RENAME TO infradesk_v2_dev_broken;"
sudo -u postgres psql -c "ALTER DATABASE infradesk_v2_dev_restore RENAME TO infradesk_v2_dev;"

# 5. Start backend
pm2 start infradesk-api

# 6. Po sprawdzeniu — usuń _broken po 7 dniach
```

### Asystent rollback

```bash
# Po stronie serwera: cofnij version.json do poprzedniej wersji
ssh -p 2222 adrian@188.68.236.166
# Przywróć z poprzedniego scp lub git history (version.json może być w repo)
```

Agent NIE wykonuje downgrade automatycznie (rollback protection w `update.py` planowane).
Klient z bad-version musi `taskkill` → service auto-start → pobiera nową version.json.

## Backup strategy

### Codzienny backup DB

`/home/adrian/backup-databases.sh`:
```bash
#!/bin/bash
DATE=$(date +%F)
DEST=~/db-backups
mkdir -p $DEST

for DB in infradesk_v2_dev idcore idfaktura; do
    sudo -u postgres pg_dump $DB | gzip > $DEST/$DB-$DATE.sql.gz
    # Verify integrity
    if ! gunzip -t $DEST/$DB-$DATE.sql.gz; then
        rm $DEST/$DB-$DATE.sql.gz
        echo "CORRUPT backup $DB $DATE — DELETED" | mail -s "BACKUP FAIL" biuro@silers.pl
    fi
done

# Retention 14d
find $DEST -name "*.sql.gz" -mtime +14 -delete
```

Cron `0 3 * * *`. Sprawdź: `crontab -l` → `0 3 * * * /home/adrian/backup-databases.sh`.

### Off-site backup (TODO P1)

```bash
# Backblaze B2 (~$2/mc za 100GB)
rclone config            # interaktywnie: B2 + bucket
rclone copy ~/db-backups b2:infradesk-backups/$(date +%F)/

# Cron 4:00 (po lokalnym backup)
crontab -e
# 0 4 * * * rclone copy ~/db-backups b2:infradesk-backups/$(date +\%F)/
```

## SSL renewal

Certbot timer odpala renew automatically gdy <30d zostało.

```bash
# Status
sudo systemctl status certbot.timer
sudo certbot certificates

# Manual renew (jeśli timer nie odpalił)
sudo certbot renew --force-renewal
sudo nginx -s reload
```

## CI/CD plan (P1)

GitHub Actions workflow:

```yaml
# .github/workflows/deploy.yml (TODO)
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Backend tsc
        run: cd backend-v2 && npm ci && npx tsc --noEmit
      - name: Frontend tsc + build
        run: cd frontend-v2 && npm ci && npx tsc --noEmit && npm run build
      - name: Prisma validate
        run: cd backend-v2 && npx prisma validate
      - name: npm audit (HIGH)
        run: cd backend-v2 && npm audit --audit-level=high

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        run: |
          ssh ... "cd ~/infradesk-v2 && git pull && cd backend-v2 && npm ci --omit=dev && npx prisma migrate deploy && pm2 restart infradesk-api"
          ssh ... "cd ~/infradesk-v2/frontend-v2 && npm ci && npm run build && sudo nginx -s reload"
```

## Checklist po każdym deployu

- [ ] `pm2 logs infradesk-api --err --lines 100` — brak nowych errorów (oprócz znanych)
- [ ] UptimeRobot zielony
- [ ] Sentry: brak nowych unique errors
- [ ] Smoke test login + dashboard load
- [ ] Migracje deployed (sprawdź `_prisma_migrations`)
- [ ] Frontend bundle hash zmienił się (force refresh w browser)
- [ ] Disk usage <70% (`df -h /`)

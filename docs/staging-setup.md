# Staging environment setup

Staging = drugi pełen stack na **tym samym serwerze** co produkcja, ale na innych
portach + osobnej DB. Cost: ~0 zł (wykorzystuje istniejący droplet).

**Po co:**
- Test migracji DB bez ryzyka prod
- Sprawdzenie nowych features przed merge
- Onboarding klienta na demo (przed boardingiem na prod)

**Subdomena:** `staging.infradesk.pl`

## Checklist

- [ ] DNS: A record `staging.infradesk.pl` → `188.68.236.166`
- [ ] DB: utworzyć `infradesk_v2_staging`
- [ ] Backend pm2 process `infradesk-api-staging` na porcie `4201`
- [ ] Frontend build → `/var/www/infradesk-staging/dist/`
- [ ] Nginx vhost dla `staging.infradesk.pl`
- [ ] SSL (Let's Encrypt)
- [ ] Separate `.env` z dummy SMTP (nie chcemy testowych maili do prawdziwych klientów)

## 1. DNS

Dodaj w panelu DNS (Cloudflare/inny):
```
Type: A
Name: staging
Value: 188.68.236.166
TTL: 300
```

Sprawdź: `dig staging.infradesk.pl` powinien zwrócić IP w <5min.

## 2. Database

```bash
ssh -p 2222 adrian@188.68.236.166

# Create DB + permissions
sudo -u postgres psql <<EOF
CREATE DATABASE infradesk_v2_staging OWNER infradesk_v2;
GRANT ALL PRIVILEGES ON DATABASE infradesk_v2_staging TO infradesk_v2;
GRANT ALL PRIVILEGES ON DATABASE infradesk_v2_staging TO infradesk_v2_bg;
\c infradesk_v2_staging
CREATE EXTENSION IF NOT EXISTS vector;
EOF

# Migracje + seed (z tej samej schema.prisma)
cd /home/adrian/infradesk-staging/backend-v2   # po krokach 4
DATABASE_URL="postgresql://infradesk_v2:PASS@127.0.0.1:5432/infradesk_v2_staging" \
DATABASE_URL_BG="postgresql://infradesk_v2_bg:PASS@127.0.0.1:5432/infradesk_v2_staging" \
npx prisma migrate deploy
```

## 3. Folder structure

```bash
# Drugi clone repo
git clone git@github.com:SILERS-Adi/infradesk.git /home/adrian/infradesk-staging
cd /home/adrian/infradesk-staging
git checkout main   # lub `staging` branch jeśli go używamy
```

## 4. Backend setup

```bash
cd /home/adrian/infradesk-staging/backend-v2
cp .env.example .env
nano .env
```

Wymagana zawartość `.env`:
```bash
NODE_ENV=production
PORT=4201                      # ⚠️ inny niż prod (4200)
LOG_LEVEL=debug                # więcej logów dla testów

DATABASE_URL=postgresql://infradesk_v2:HASLO@127.0.0.1:5432/infradesk_v2_staging
DATABASE_URL_BG=postgresql://infradesk_v2_bg:HASLO@127.0.0.1:5432/infradesk_v2_staging

# Sekrety osobne od prod (nie współdziel JWT)
JWT_ACCESS_SECRET=<wygeneruj nowy 64-char random>
JWT_REFRESH_SECRET=<wygeneruj nowy 64-char random>
VAULT_MASTER_KEY=<nowy 32+ char>

COOKIE_DOMAIN=.staging.infradesk.pl
COOKIE_SECURE=true

CORS_ORIGIN=https://staging.infradesk.pl

# DUMMY SMTP — żeby testy nie wysyłały realnych maili
SMTP_HOST=localhost
SMTP_PORT=2525
SMTP_USER=test
SMTP_PASS=test
SMTP_FROM=staging@infradesk.pl

# AI — opcjonalne (wyłącz Iris w stagingu jeśli nie chcesz cost)
# ANTHROPIC_API_KEY=

# Sentry osobny project lub ten sam z env=staging
SENTRY_DSN=https://...@sentry.io/...
SENTRY_RELEASE=staging
```

```bash
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 start npm --name infradesk-api-staging -- run start:prod
pm2 save
```

## 5. Frontend

```bash
cd /home/adrian/infradesk-staging/frontend-v2

# Vite env
cat > .env.production <<EOF
VITE_API_URL=https://staging.infradesk.pl
VITE_SENTRY_DSN=...
VITE_SENTRY_ENV=staging
EOF

npm ci
npm run build

# Serve from /var/www/
sudo mkdir -p /var/www/infradesk-staging
sudo cp -r dist/* /var/www/infradesk-staging/
sudo chown -R www-data:www-data /var/www/infradesk-staging
```

## 6. Nginx vhost

```bash
sudo tee /etc/nginx/sites-available/staging.infradesk.pl <<'EOF'
server {
    listen 80;
    server_name staging.infradesk.pl;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$server_name$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name staging.infradesk.pl;

    ssl_certificate /etc/letsencrypt/live/staging.infradesk.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.infradesk.pl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Robots-disallow — staging nie powinien być indexed
    add_header X-Robots-Tag "noindex, nofollow" always;

    # Frontend (static)
    root /var/www/infradesk-staging;
    index index.html;
    try_files $uri /index.html;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads (logos)
    location /uploads/ {
        alias /home/adrian/infradesk-staging/backend-v2/uploads/;
    }

    # Block /uploads/tickets (auth-gated)
    location /uploads/tickets/ {
        return 404;
    }

    # Basic auth — żeby przypadkowy ruch nie indexował
    auth_basic "Staging — nie dla klientów";
    auth_basic_user_file /etc/nginx/.htpasswd-staging;
}
EOF

# Generate basic auth
sudo htpasswd -c /etc/nginx/.htpasswd-staging staging
# Hasło: <wpisz>

sudo ln -s /etc/nginx/sites-available/staging.infradesk.pl /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d staging.infradesk.pl
sudo nginx -s reload
```

## 7. Test

```bash
# Z laptopa
curl -u staging:HASLO https://staging.infradesk.pl/health
# Expected: {"status":"ok"}

# W przeglądarce: https://staging.infradesk.pl
# Browser pyta o basic auth → staging / <hasło>
# Powinieneś zobaczyć stronę logowania InfraDesk
# Załóż konto testowe → DB inna niż prod
```

## 8. Workflow developera

```bash
# Lokalnie commit + push do gałęzi feature
git push origin feature/xxx

# Deploy do staging:
ssh -p 2222 adrian@188.68.236.166
cd /home/adrian/infradesk-staging
git fetch origin
git checkout feature/xxx
cd backend-v2 && npm ci --omit=dev && npx prisma migrate deploy && pm2 restart infradesk-api-staging
cd ../frontend-v2 && npm ci && npm run build && sudo cp -r dist/* /var/www/infradesk-staging/

# Test na https://staging.infradesk.pl
# Jeśli OK: merge do main → deploy prod
```

## 9. Synchronizacja danych prod → staging (opcjonalne, do testów rzeczywistych)

**OSTRZEŻENIE:** zawiera dane klienta. Anonimizuj/maskuj PII przed użyciem.

```bash
# Dump prod
sudo -u postgres pg_dump infradesk_v2_dev > /tmp/prod-snapshot.sql

# Restore do staging
sudo -u postgres psql -c "DROP DATABASE IF EXISTS infradesk_v2_staging;"
sudo -u postgres psql -c "CREATE DATABASE infradesk_v2_staging OWNER infradesk_v2;"
sudo -u postgres psql infradesk_v2_staging < /tmp/prod-snapshot.sql

# Anonimizacja (TODO: skrypt)
sudo -u postgres psql infradesk_v2_staging <<EOF
UPDATE "User" SET email = 'user-' || id || '@example.com', firstName = 'Test', lastName = 'User';
UPDATE "Workspace" SET email = 'ws-' || id || '@example.com';
UPDATE "Contact" SET email = 'contact-' || id || '@example.com', phone = '+48000000000';
EOF
```

## 10. Cleanup (gdy staging psuje prod load)

```bash
# Stop staging
pm2 stop infradesk-api-staging
pm2 delete infradesk-api-staging

# Drop DB
sudo -u postgres dropdb infradesk_v2_staging

# Disable nginx
sudo rm /etc/nginx/sites-enabled/staging.infradesk.pl
sudo nginx -s reload
```

## Limity / koszty

- CPU/RAM: staging używa ~200MB extra RAM, 5% CPU. Pod małym ruchem OK.
- Disk: ~500MB extra (kod + node_modules + DB)
- Migration risk: separate DB → 0% risk dla prod

**Gdy będziemy mieli >5 klientów:** rozważyć osobny droplet ($6/mc) bo prod nie powinien
mieć "noise neighbors".

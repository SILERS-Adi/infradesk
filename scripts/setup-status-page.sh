#!/bin/bash
# Uptime Kuma — self-hosted status page i monitoring.
# Uruchom NA SERWERZE jako root (lub adrian z sudo).
#
# Po setupie:
#   1. Otwórz http://188.68.236.166:3001 (lub https://status.infradesk.pl po DNS+nginx)
#   2. Załóż konto admin (pierwszy login)
#   3. Dodaj monitory (lista poniżej)
#   4. Otwórz Status Pages → New → przypnij monitory → public

set -euo pipefail

DOCKER_NAME="uptime-kuma"
DATA_DIR="/home/adrian/uptime-kuma-data"
PORT="3001"

# 1) Docker if missing
if ! command -v docker >/dev/null; then
  echo "[setup] Docker nie zainstalowany. Instaluję..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker adrian
  echo "[setup] Wyloguj/zaloguj się żeby docker działał bez sudo"
fi

# 2) Volume directory
mkdir -p "$DATA_DIR"

# 3) Run container (idempotent)
if docker ps -a --format '{{.Names}}' | grep -q "^${DOCKER_NAME}$"; then
  echo "[setup] Container już istnieje. Restartuję..."
  docker restart "$DOCKER_NAME"
else
  docker run -d --restart=always \
    --name="$DOCKER_NAME" \
    -p 127.0.0.1:${PORT}:3001 \
    -v "${DATA_DIR}:/app/data" \
    louislam/uptime-kuma:1
fi

# 4) Nginx vhost (status.infradesk.pl)
NGINX_CONF="/etc/nginx/sites-available/status.infradesk.pl"
if [ ! -f "$NGINX_CONF" ]; then
  sudo tee "$NGINX_CONF" >/dev/null <<'EOF'
server {
    listen 80;
    server_name status.infradesk.pl;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$server_name$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name status.infradesk.pl;
    ssl_certificate /etc/letsencrypt/live/status.infradesk.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.infradesk.pl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/

  echo "[setup] DNS: dodaj A record 'status.infradesk.pl' → 188.68.236.166"
  echo "[setup] Po DNS propagation:"
  echo "  sudo certbot --nginx -d status.infradesk.pl"
  echo "  sudo nginx -s reload"
fi

echo ""
echo "✓ Uptime Kuma działa na http://127.0.0.1:3001"
echo "  → na razie dostępne tylko lokalnie. Po DNS+certbot+reload będzie publiczne."
echo ""
echo "Otwórz tunnel z laptopa:"
echo "  ssh -p 2222 -L 3001:127.0.0.1:3001 adrian@188.68.236.166"
echo "  → http://localhost:3001 w przeglądarce"

#!/bin/bash
# Off-site backup do Backblaze B2 z gpg encryption.
# Uruchamiane przez cron 4:00 (po lokalnym backup-databases.sh o 3:00).
#
# Setup jednorazowy (przed pierwszym uruchomieniem):
#   1. Zarejestruj konto na backblaze.com (free 10 GB, ~$2/mc po przekroczeniu)
#   2. Utwórz Application Key (Account → App Keys → Add → restricted to bucket)
#   3. Utwórz bucket "infradesk-backups" (private, lifecycle 90d)
#   4. apt install rclone gnupg
#   5. rclone config (interactive: B2 + key + secret)
#   6. gpg --gen-key (passphrase do osobnego sejfu — bez tego nie ma odzysku)
#   7. eksport public key: gpg --export adrian@silers.pl > /home/adrian/backup-pubkey.asc
#
# Test:
#   ./scripts/backup-offsite.sh --dry-run
#
# Cron (crontab -e):
#   0 4 * * * /home/adrian/infradesk-v2/scripts/backup-offsite.sh >> /home/adrian/.logs/backup-offsite.log 2>&1

set -euo pipefail

LOCAL_DIR="${HOME}/db-backups"
REMOTE="b2:infradesk-backups"
GPG_RECIPIENT="adrian@silers.pl"
RETENTION_DAYS=90

DATE=$(date +%F)
mkdir -p "${HOME}/.logs"

echo "[$(date -Iseconds)] backup-offsite start"

# 1) Sprawdź że dzisiejsze backupy istnieją (nie wysyłaj przedwczoraj)
TODAY_FILES=$(find "$LOCAL_DIR" -name "*-${DATE}.sql.gz" -newer "$LOCAL_DIR" 2>/dev/null || true)
if [ -z "$TODAY_FILES" ]; then
  echo "[ERROR] Brak dzisiejszych backupów w $LOCAL_DIR — pomijam upload"
  echo "Subject: BACKUP OFFSITE FAIL: brak dzisiejszych plików" | sendmail biuro@silers.pl
  exit 1
fi

# 2) Encryption + upload per-file
for f in $TODAY_FILES; do
  base=$(basename "$f")
  encrypted="${f}.gpg"

  echo "[backup] encrypting $base..."
  gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" --output "$encrypted" "$f"

  echo "[backup] uploading $base.gpg → $REMOTE/$DATE/"
  rclone copy "$encrypted" "$REMOTE/$DATE/" --no-traverse

  # Verify upload
  if ! rclone ls "$REMOTE/$DATE/$base.gpg" >/dev/null 2>&1; then
    echo "[ERROR] Upload nie powiódł się dla $base"
    echo "Subject: BACKUP OFFSITE FAIL: $base" | sendmail biuro@silers.pl
    rm -f "$encrypted"
    exit 1
  fi

  # Cleanup local encrypted (oryginał .sql.gz zostaje przez retention 14d)
  rm -f "$encrypted"
done

# 3) Retention — usuń stare prefixy (>RETENTION_DAYS)
echo "[backup] cleaning up >${RETENTION_DAYS}d remote..."
rclone lsd "$REMOTE/" 2>/dev/null | while read -r line; do
  prefix_date=$(echo "$line" | awk '{print $5}')
  # Tylko prefixy w formacie YYYY-MM-DD
  if [[ "$prefix_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    age_days=$(( ($(date +%s) - $(date -d "$prefix_date" +%s)) / 86400 ))
    if [ "$age_days" -gt "$RETENTION_DAYS" ]; then
      echo "  deleting $REMOTE/$prefix_date/ (age ${age_days}d)"
      rclone purge "$REMOTE/$prefix_date/"
    fi
  fi
done

# 4) Healthcheck — info do logu
SIZE=$(rclone size "$REMOTE/$DATE/" --json 2>/dev/null | grep -oP '"bytes":\s*\K\d+' || echo 0)
echo "[$(date -Iseconds)] backup-offsite done — uploaded ${SIZE} bytes for $DATE"

# 5) Optional: ping uptime healthcheck (BetterStack/HC.io)
if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 --retry 5 "$BACKUP_PING_URL" >/dev/null || true
fi

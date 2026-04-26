# Plan rotacji haseł DB — InfraDesk v2 (2026-04-24)

**Kontekst:** 2026-04-24 podczas Etapu 4 RLS wyciekły do stdout oba hasła:
- `infradesk_v2` → `de62b0...` (regular app user)
- `infradesk_v2_bg` → `f90d6c...` (bg jobs user)

Oba traktowane jako **skompromitowane**. DB dostępna tylko z `127.0.0.1`, ale polityka = rotacja niezależnie od ekspozycji.

**Cel planu:** procedura rotacji bez dalszych wycieków + testy bez ujawniania sekretów.

---

## Zasady bezpieczeństwa (warunki brzegowe)

1. **Żadne hasło nigdy nie trafia do stdout** — ani w clear, ani "zredagowane", ani przez grep/cat/echo
2. **Hasła generowane tylko w bash variable** w jednej SSH session, `unset` po użyciu
3. **Weryfikacja funkcjonalna, nie stringowa** — sprawdzamy CZY aplikacja działa, nie CO jest w env
4. **`umask 077`** w sesji rotacji — pliki tworzone jako `rw-------`
5. **Grep EXACT match:** `grep -E '^DATABASE_URL='` (z `=`) — NIE `grep ^DATABASE_URL` (łapie też `_BG`)
6. **Rollback dostępny lokalnie** — stare hasło w `.env.bak.pre-rotation-R-<timestamp>` przed zmianą

---

## Faza 0 — przygotowanie (bez zmian)

1. **SHA baseline:** zapisz aktualny git HEAD jako `etap_R_pre` w `/tmp/rls-rollback-shas.txt`
2. **Backup env** (przed rotacją, zachowuje stare hasło):
   ```bash
   TS=$(date +%F-%H%M)
   cp /home/adrian/infradesk/backend-v2/.env              /home/adrian/infradesk/backend-v2/.env.bak.pre-rotation-$TS
   cp /home/adrian/infradesk/backend-v2/.env.production   /home/adrian/infradesk/backend-v2/.env.production.bak.pre-rotation-$TS
   chmod 600 /home/adrian/infradesk/backend-v2/.env.bak.pre-rotation-$TS
   chmod 600 /home/adrian/infradesk/backend-v2/.env.production.bak.pre-rotation-$TS
   ```
3. **Snapshot DB:**
   ```bash
   PGPASSWORD=$(awk -F= '/^DATABASE_URL_BG=/{print substr($0, index($0,"://infradesk_v2_bg:")+19); exit}' .env | sed 's|@.*||') \
     pg_dump -h 127.0.0.1 -U infradesk_v2_bg -d infradesk_v2_dev | gzip > /var/backups/infradesk/pre-rotation-R-$TS.sql.gz
   ```
   Uwaga: używamy bg user (BYPASSRLS) żeby dump zawierał wszystkie dane.

**Weryfikacja fazy 0 (bez pokazywania sekretów):**
- `ls -la /var/backups/infradesk/pre-rotation-R-*.sql.gz` — plik istnieje
- `gzip -tv /var/backups/infradesk/pre-rotation-R-*.sql.gz` — integralność OK
- `ls -la .env.bak.pre-rotation-*` — uprawnienia `-rw-------`

---

## Faza 1 — rotacja `infradesk_v2_bg` (mniej krytyczne, robimy pierwsze)

**Dlaczego bg najpierw:** jeśli coś pójdzie źle, tylko bg flows przestaną działać (cron IMAP, public routes, resolveWorkspace, agent-compat). HTTP requesty użytkowników (regular prisma) wciąż działają — łatwiejszy rollback.

### Krok 1.1 — rotacja w DB + env (jedna sesja SSH, heredoc)

Plan komendy (przedstawiony, wykonany po GO):
```bash
ssh -p 2222 adrian@188.68.236.166 bash -s << 'REMOTE'
set -euo pipefail
umask 077
unset HISTFILE
set +o history

cd /home/adrian/infradesk/backend-v2

# Generate new password — only in-memory, never echoed
NEW_PASS=$(openssl rand -hex 24)

# Extract OLD pass from env (for sed replace) — also never echoed
OLD_PASS=$(awk -F= '/^DATABASE_URL_BG=/{
  s=substr($0, index($0,"://infradesk_v2_bg:")+19)
  sub(/@.*/, "", s)
  print s
}' .env)

# Safety check: old pass must be present in both env files
grep -qF "$OLD_PASS" .env || { echo "FAIL: old_bg not in .env"; exit 1; }
grep -qF "$OLD_PASS" .env.production || { echo "FAIL: old_bg not in .env.production"; exit 1; }

# ALTER in DB
sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d infradesk_v2_dev <<SQL
ALTER USER infradesk_v2_bg WITH PASSWORD '$NEW_PASS';
SQL

# Replace in env files (in-place, mode preserved)
sed -i "s|$OLD_PASS|$NEW_PASS|g" .env .env.production

# Verify replacement — WITHOUT printing values
if grep -qF "$OLD_PASS" .env .env.production; then
  echo "FAIL: old_bg still present after sed"
  exit 1
fi
if ! grep -qE '^DATABASE_URL_BG="postgresql://infradesk_v2_bg:[a-f0-9]{48}@' .env; then
  echo "FAIL: .env line malformed after rotation"
  exit 1
fi
echo "OK_bg: password rotated in DB + env files"

# Clear memory
unset NEW_PASS OLD_PASS
REMOTE
```

### Krok 1.2 — restart pm2 + funkcjonalny health check

```bash
ssh -p 2222 adrian@188.68.236.166 '
  pm2 stop infradesk-v2-backend 2>&1 | tail -1
  pm2 delete infradesk-v2-backend 2>&1 | tail -1
  cd /home/adrian/infradesk/backend-v2
  pm2 start dist/index.js --name infradesk-v2-backend 2>&1 | tail -2
  sleep 10
  # Functional verification — no secret disclosure
  curl -fsS -o /dev/null -w "health=%{http_code}\n" https://infradesk.pl/health
  pm2 info infradesk-v2-backend | grep -E "status|uptime|restarts " | head -3
  # Check for auth failures in last 30 lines — BG user is used for many ops
  pm2 logs infradesk-v2-backend --lines 100 --nostream 2>&1 | grep -c "Authentication failed" || true
  # Confirm pg_stat_activity shows both pools
  PGPASSWORD_HASH=$(awk -F= "/^DATABASE_URL_BG=/{s=substr(\$0, index(\$0, \"://infradesk_v2_bg:\")+19); sub(/@.*/, \"\", s); print s; exit}" .env)
  # Use PGPASSWORD in subshell only
  PGPASSWORD="$PGPASSWORD_HASH" psql -h 127.0.0.1 -p 5432 -U infradesk_v2_bg -d infradesk_v2_dev \
    -c "SELECT usename, count(*) AS conns FROM pg_stat_activity WHERE datname='"'"'infradesk_v2_dev'"'"' AND usename LIKE '"'"'infradesk_v2%'"'"' GROUP BY 1 ORDER BY 1"
  unset PGPASSWORD_HASH
'
```

**Kryterium sukcesu fazy 1:**
- `health=200`
- `pm2 info` → status online, restarts ≤ 1
- Liczba `Authentication failed` w logach = 0 (nie wzrosła)
- `pg_stat_activity` pokazuje **oba** usery (regular + bg) z conns ≥ 1

**Jeśli którykolwiek warunek fails → rollback fazy 1 (patrz niżej), przerwij.**

### Rollback fazy 1

```bash
ssh -p 2222 adrian@188.68.236.166 bash -s << 'REMOTE'
set -euo pipefail
umask 077
cd /home/adrian/infradesk/backend-v2

# Restore env files from backup
cp .env.bak.pre-rotation-<TS> .env
cp .env.production.bak.pre-rotation-<TS> .env.production

# Extract OLD pass from restored env
OLD_PASS=$(awk -F= '/^DATABASE_URL_BG=/{s=substr($0, index($0,"://infradesk_v2_bg:")+19); sub(/@.*/, "", s); print s}' .env)

# ALTER in DB back to old password
sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d infradesk_v2_dev <<SQL
ALTER USER infradesk_v2_bg WITH PASSWORD '$OLD_PASS';
SQL

# Restart
pm2 stop infradesk-v2-backend; pm2 delete infradesk-v2-backend
pm2 start dist/index.js --name infradesk-v2-backend
sleep 10
curl -fsS -o /dev/null -w "health=%{http_code}\n" https://infradesk.pl/health

unset OLD_PASS
REMOTE
```

---

## Faza 2 — rotacja `infradesk_v2` (regular app user)

**Kolejność:** tylko po stabilnym działaniu Fazy 1 przez minimum 5 minut.

**Analogicznie do Fazy 1**, ale:
- `awk` patter: `/^DATABASE_URL=/` (bez `_BG`)
- substr index: `://infradesk_v2:` → `+17` (nie `+19`)
- ALTER USER target: `infradesk_v2`
- Grep regex sanity: `^DATABASE_URL="postgresql://infradesk_v2:[a-f0-9]{48}@`

**Ryzyko Fazy 2:** główny user aplikacji — downtime przy restart pm2 (~10s). Wykonuje się:
- Poza godzinami szczytu (wieczór/noc)
- Z gotowym rollback command w drugim oknie SSH
- Z monitoringiem Twojego telefonu/Slacka żebyś miał info o błędach

**Kryterium sukcesu fazy 2:** identyczne jak Faza 1, plus:
- Manual login test przez UI: zaloguj się, otwórz listę ticketów → 200 OK z danymi

---

## Faza 3 — weryfikacja końcowa + cleanup

```bash
ssh -p 2222 adrian@188.68.236.166 '
  cd /home/adrian/infradesk/backend-v2

  # 1. Health
  curl -fsS -o /dev/null -w "health=%{http_code}\n" https://infradesk.pl/health

  # 2. No auth failures
  N=$(pm2 logs infradesk-v2-backend --lines 500 --nostream 2>&1 | grep -c "Authentication failed" || true)
  echo "auth_failures_in_500_lines=$N"

  # 3. Env file hashes changed (bez ujawnienia treści)
  echo -n "env-hash-now: "; grep -E "^DATABASE_URL(_BG)?=" .env | sha256sum
  echo -n "env-hash-pre: "; grep -E "^DATABASE_URL(_BG)?=" .env.bak.pre-rotation-* 2>/dev/null | sha256sum

  # 4. pm2 stable
  pm2 info infradesk-v2-backend | grep -E "status|uptime|restarts "
'
```

**Kryteria sukcesu:**
- `health=200`
- `auth_failures_in_500_lines=0`
- env-hash-now ≠ env-hash-pre (potwierdza rotacja)
- pm2 stable, unstable_restarts = 0

---

## Cleanup po 7-dniowym soak (osobna sesja)

Po tygodniu bez problemów:
```bash
# Usuń backupy env z rotacji
rm /home/adrian/infradesk/backend-v2/.env.bak.pre-rotation-*
rm /home/adrian/infradesk/backend-v2/.env.production.bak.pre-rotation-*

# Zostaw backup DB przez 30 dni (polityka)
ls -la /var/backups/infradesk/pre-rotation-R-*.sql.gz  # sprawdź
```

---

## Decyzja: kolejność rotacja vs Etap 5

Dwie opcje:

### Opcja R-then-5 (bezpieczniejsza)
1. Rotacja haseł (plan powyżej, ~30 min)
2. 24h obserwacja
3. Etap 5 w osobnym oknie serwisowym

**Plus:** wektor ryzyka izolowany (pass rotation vs NOBYPASSRLS)
**Minus:** dwa osobne okna serwisowe, więcej orchestracji

### Opcja R+5-jedno-okno
W jednym oknie (~1h):
1. Rotacja bg (5 min)
2. Funkcjonalny health — 2 min obserwacji
3. Rotacja regular (5 min)
4. Funkcjonalny health — 5 min obserwacji
5. `ALTER USER infradesk_v2 NOBYPASSRLS` (Etap 5) — 1 min
6. Pentest cross-workspace — 30 min

**Plus:** jeden serwisowy outage window
**Minus:** jeśli coś pada w Etapie 5, rollback musi odwrócić też rotację (więcej komplikacji w rollback)

### Rekomendacja
**Opcja R-then-5** — izolujemy awarię. Rotacja to operacja prosta i dobrze przewidywalna; Etap 5 (NOBYPASSRLS) jest nowy i może mieć niespodzianki. Mieszanie dwóch osobnych zmian w jednym oknie utrudnia diagnostykę gdyby coś padło.

---

## TODO Security (zapisane do memory `feedback_secrets_no_stdout.md`)

- ✅ Credentials must be rotated after accidental stdout exposure (ten plan)
- ✅ `grep ^DATABASE_URL` forbidden — zawsze `grep -E '^DATABASE_URL='`
- ✅ Używaj masked env checks only (sha256sum, length, grep -c)
- 📋 Po rotacji: memory review — czy są inne sekrety które mogły się pokazać w tej sesji
- 📋 Sprawdź czy `~/.bash_history` na serwerze ma ślady hasła (`history -c` nie czyści z dysku jeśli PROMPT_COMMAND nie jest odpowiedni)

---

## Następny krok — czekam na decyzję

1. **Kiedy wykonać rotację?** (godzina wieczorna, najlepiej poza 18-22 czas klientów)
2. **R-then-5 czy R+5 w jednym oknie?** (rekomendacja: R-then-5)
3. Po potwierdzeniu: wykonuję Fazę 0 + Fazę 1 (bg), zatrzymuję, pokazuję raport funkcjonalny, ty dajesz GO na Fazę 2 (regular).

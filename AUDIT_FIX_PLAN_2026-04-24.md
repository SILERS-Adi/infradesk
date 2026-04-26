# Plan naprawy InfraDesk v2 — 2026-04-24

Wygenerowany na podstawie pełnego audytu v2 (serwer produkcyjny + kod backend-v2/frontend-v2 + kontener v1).
Produkcja: `infradesk.pl` → backend v2 (pm2, port 4250) od cutover 2026-04-22.
v1 (kontener `infradesk-backend`) wciąż żyje równolegle, ale wildcard subdomeny są zepsute.

---

## Etap 1 — KRYTYCZNE (zrobić dziś, ~1h)

Bez tego produkcja kaleka (agenci się nie łączą, wildcard 502).

### 1.1 Redis na serwerze — naprawa ECONNREFUSED dla v2 backend ✅ **DONE 2026-04-24**
**Objaw:** setki `[redis] error connect ECONNREFUSED 127.0.0.1:6379`, 17 restartów pm2 w 5h, agenty `agent-ws closed` w pętli.
**Przyczyna:** v2 backend chodzi jako pm2 na hostcie, ale kontener `infradesk-redis` nie eksportuje portu 6379 na hosta.

**Wykonano:**
- Dodano `ports: ["127.0.0.1:6379:6379"]` do serwisu `redis` w `/home/adrian/infradesk/docker-compose.yml` (backup w `docker-compose.yml.bak.pre-redis-fix`)
- `docker compose up -d redis` → recreate
- `pm2 restart infradesk-v2-backend`
- Weryfikacja: `redis-cli ping` → `PONG`, logi pm2 po restarcie: **0 ECONNREFUSED**, uptime stabilny

**Bonus finding (osobny TODO):** IMAP sync dla `zgloszenia@silers.pl` (accountId `80e1fec7-a930-4e8a-8f95-6044e55c583c`) wywala `Decipheriv.final: Unsupported state or unable to authenticate data` w `backend-v2/src/lib/crypto.ts:32`. VAULT_MASTER_KEY nie pasuje do zapisanego cipher (rotacja klucza bez re-encrypt lub uszkodzony rekord). Wymaga re-saving IMAP password w UI lub skryptu migrującego.

### 1.2 nginx `infradesk-wildcard` → 502 dla `agent.infradesk.pl`, `api.infradesk.pl` ✅ **DONE 2026-04-24**
**Objaw:** wildcard proxy `localhost:3000` ale v1 backend w Docker network, nie na hostcie.
**Weryfikacja ruchu:** 0 requestów na wildcard subdomeny w `/var/log/nginx/access.log` + rotated logi (14 dni wstecz). Ruch na `ws-silers` był tylko do 2026-04-14 (przed cutover 2026-04-22).
**Wniosek:** wildcard był dead config.

**Wykonano:**
- Backup: `/etc/nginx/sites-available/infradesk-wildcard.bak.2026-04-24`
- Usunięto symlink z `sites-enabled/`
- `nginx -t` → ok, `systemctl reload nginx`
- Weryfikacja: `infradesk.pl/health` nadal 200 OK

**Uwaga:** wildcard był tylko na port 80, bez SSL → HTTPS subdomeny i tak nie działały. Jak w przyszłości będzie potrzeba `*.infradesk.pl`, trzeba wyrobić wildcard Let's Encrypt (DNS-01 challenge) i dodać `listen 443 ssl`.

### 1.3 Duplikat `import path`/`import fs` w `backend/src/app.ts` (lokalny v1 repo) ✅ **DONE 2026-04-24**
**Lokalizacja:** linie 283-284 (duplikat względem 6-7).
**Wykonano:** usunięte linie 283-284 w `C:\Users\adria\infradesk\backend\src\app.ts`. Licznik błędów TS v1: 72 → 68.

### 1.4 Regeneracja Prisma client po zmianach schemy (dev workflow) ✅ **DONE 2026-04-24**
Lokalnie klient był 10 dni nieaktualny → 171→72 błędy po `prisma generate`.
**Wykonano:**
- Lokalny v1 (`C:\Users\adria\infradesk\backend\package.json`):
  - `postinstall: prisma generate` (nowy)
  - `dev` i `build` prefixed z `prisma generate &&`
- v2 produkcja (`/home/adrian/infradesk/backend-v2/package.json`):
  - `postinstall: prisma generate` (nowy)
  - `build` prefixed z `prisma generate &&`
  - backup: `package.json.bak.pre-postinstall`

---

## Etap 2 — BEZPIECZEŃSTWO (ten tydzień, ~3h)

### 2.1 Porty Postgres prywatne (TODO z poprzedniego audytu) ✅ **DONE 2026-04-24**
**Wykonano:**
- Host Postgres 14 (`/etc/postgresql/14/main/postgresql.conf`): `listen_addresses='*'` → `'localhost'`, `systemctl restart postgresql@14-main`. Backup: `postgresql.conf.bak.2026-04-24`.
- `allegro-db`: `"5433:5432"` → `"127.0.0.1:5433:5432"` w `/home/adrian/Allegro-integracje/docker-compose.yml` + recreate. Backup: `docker-compose.yml.bak.2026-04-24`.
- `faktura-db`: `"5434:5432"` → `"127.0.0.1:5434:5432"` w `/home/adrian/faktura/docker-compose.yml` + recreate. Backup j.w.
- Weryfikacja: `ss -tlnp | grep 543` — wszystkie 3 porty tylko na `127.0.0.1`. v2 backend działa dalej (autoreconnect Prisma).

### 2.2 Rotacja hasła DB v2 ✅ **DONE 2026-04-24** (rename DB odłożone)
**Wykonano:**
- Wygenerowano nowe hasło: `openssl rand -hex 24` (24 bajty = 48 znaków hex)
- `ALTER USER infradesk_v2 WITH PASSWORD '<new>'`
- Update `.env` ORAZ `.env.production` (sed zastąpienie `v2_devpass_2026_silers`)
- `pm2 delete + pm2 start dist/index.js --name infradesk-v2-backend` (sam restart nie wystarczy — pm2 cache'uje env)
- Weryfikacja: `/health` 200 OK, 0 restartów po starcie

**Pułapka odkryta (warte dopisania do CLAUDE.md):**
- `.env` i `.env.production` były **niezsynchronizowane** — v2 backend faktycznie ładował tylko `.env` (dotenv default + Prisma CLI default).
- `.env.production` był **dead file** (3513B, aktualizowany ale nieczytany). Przed rotacją edytowałem go pierwszy i 502 bo realny env to `.env`.
- Rekomendacja: **usunąć `.env.production`** albo ustawić jawne `dotenv.config({ path: '.env.production' })` w `src/config.ts` jeśli ma być preferowany.

**Odłożone:** rename DB `infradesk_v2_dev` → `infradesk_v2` — wymaga zamknięcia wszystkich klientów, nie krytyczne.

### 2.3 Rate limits na wrażliwych endpointach v2 ✅ **DONE 2026-04-24**
**Dodano do `src/middleware/rateLimit.ts`:**
- `agentRegisterLimiter` — 5/min per IP
- `vaultRevealLimiter` — 10/min per user (keyGenerator: `req.auth.sub`)
- `irisLimiter` — 30/min per user (keyGenerator: `req.auth.sub`)
- `downloadLimiter` — 60/min per IP (zdefiniowany, nie podpięty — wymaga analizy 3 endpointów downloads)

**Podpięto:**
- `agent-compat/agent-compat.routes.ts` — `POST /register` z `agentRegisterLimiter`
- `vault/vault.routes.ts` — `POST /:id/reveal` z `vaultRevealLimiter`
- `iris/iris-chat.controller.ts` — `POST /chat` z `irisLimiter`

Rebuild + restart pm2. Weryfikacja: health 200, 0 błędów TS. Backup: `rateLimit.ts.bak.pre-limiters`.

### 2.4 RLS na 2 brakujących tabelach ⏸️ **WSTRZYMANE — patrz 2.4b**
```sql
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserEmailAccount" ENABLE ROW LEVEL SECURITY;
-- + policies analogicznie do pattern `*_tenant`
```
Wstrzymane: dodanie kolejnych RLS na 2 tabelach nic nie zmieni, dopóki nie naprawi się 2.4b.

### 2.4b 🚨 **KRYTYCZNE: RLS jest teatrem — BYPASSRLS + middleware niepodpięty**
**Odkryte podczas implementacji 2.4:**

1. `infradesk_v2` user ma `rolbypassrls = true` → **wszystkie 50 istniejących RLS policies są omijane** przez aplikację niezależnie od kontekstu
2. `src/middleware/rls.ts::applyRlsContext` jest zdefiniowany ale **nigdzie nie użyty** w app.ts (grep potwierdził: tylko sama definicja)
3. Izolacja workspace obecnie opiera się wyłącznie na aplikacyjnym middleware (`requireWorkspace`, `requireAccess`) — bez warstwy DB

**Ryzyko:** każdy bug w kodzie routingu (zapomniane `requireWorkspace`, `findUnique` zamiast `findFirst` z workspaceId) = cross-workspace data leak. Nie ma drugiej linii obrony.

**Naprawa (osobny epik, ~1-2 dni):**
1. `ALTER USER infradesk_v2 NOBYPASSRLS;`
2. `app.use(applyRlsContext)` w `src/app.ts` po `requireAuth` + `requireWorkspace`
3. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` na wszystkich tabelach (żeby bypass ownera też nie działał)
4. Osobny DB user `infradesk_v2_bg` z BYPASSRLS tylko dla background jobs (IMAP sync, scheduler, queues) — tam gdzie nie ma kontekstu użytkownika
5. Weryfikacja każdego cron/queue joba — czy używa user-scoped client czy bg-client
6. Test bezpieczeństwa: zalogować się jako user workspace A → próbować dostać zasób workspace B → oczekiwane 403/empty

**Do czasu naprawy 2.4b:** nie można polegać na warstwie DB izolacji. Security audit routes aplikacyjnych (grep findUnique, missing requireWorkspace) staje się krytyczny.

### 2.5 CORS v2 — dopasowanie do stanu po cutover ✅ **DONE 2026-04-24**
W `src/app.ts`:
- regex `^https?:\/\/[a-z0-9-]{3,40}\.infradesk\.pl$` nie łapiał `https://infradesk.pl` (root)
- dopuszczał `http://` — na produkcji powinno być tylko `https://`

**Wykonano:**
- `src/app.ts` (z backupem `.bak.pre-cors-fix`): regex → `/^https:\/\/([a-z0-9-]{3,40}\.)?infradesk\.pl$/`
- `.env.production` (backup `.bak.pre-cors-fix`): `CORS_ORIGIN=https://v2.infradesk.pl` → `https://infradesk.pl,https://v2.infradesk.pl`
- Rebuild + restart pm2
- Test: `curl -H "Origin: https://infradesk.pl"` → `Access-Control-Allow-Origin: https://infradesk.pl` ✅

### 2.6 v1 kontener: default JWT secrets
Kontener `infradesk-backend` ma:
```
JWT_SECRET=super-secret-jwt-key-change-in-production-min32chars!!
JWT_REFRESH_SECRET=super-secret-refresh-key-change-in-production-min32!!
ENCRYPTION_KEY=12345678901234567890123456789032
```
Jeśli v1 ma jeszcze żyć: wymienić. Jeśli nie: patrz Etap 5.1 (wygaszenie v1).

---

## Etap 3 — CZYSTOŚĆ KODU (weekend, ~1h)

### 3.1 frontend-v2: usunąć 88 plików `.js` z `src/` ✅ **DONE 2026-04-24**
Powstały pomyłkowo (tsc bez `noEmit`), konfliktują z `.tsx` w runtime.

**Wykonano:**
- `find src -name "*.js" -type f -delete` → 88 → 0, 84 `.tsx` zachowane
- `tsconfig.json`: dodane `"noEmit": true` (backup `tsconfig.json.bak.pre-noemit`)
- `.gitignore` dopisane: `src/**/*.js`, `src/**/*.js.map`
- Weryfikacja: `npx tsc --noEmit` → 0 błędów, `dist/` z poprzedniego builda nienaruszony (produkcja nie wymaga rebuildu frontendu)

### 3.2 Usunąć wszystkie `.bak` ✅ **DONE 2026-04-24**
**Usunięto 7 plików dev-backup (backend-v2 + frontend-v2):**
- `src/app.ts.bak`, `src/app.ts.bak.compat`, `src/config.ts.bak`
- `src/modules/crm-email/imap-sync.ts.bak`
- `src/modules/users/users.routes.ts.bak`
- `src/features/settings/SettingsPage.tsx.bak`
- `src/components/iris/IrisCore.tsx.bak_iter0`

**Odkrycie:** 2 pliki `.bak` były **trackowane w git** na branchu `rebuild-v2` (serwer):
- `backend/src/modules/agent/agent.service.ts.bak.20260420_062101`
- `backend/src/modules/panel/ido.ts.bak`
Wykonano `git rm --cached` (pliki zostają na dysku v1, usunięte z indeksu) — do skommitowania razem z resztą zmian rebuild-v2.

**Zachowane (rollback safety z tej sesji):**
- `backend-v2/src/app.ts.bak.pre-cors-fix`
- `backend-v2/src/middleware/rateLimit.ts.bak.pre-limiters`
- `backend-v2/.env.production.bak.pre-cors-fix`
- `backend-v2/.env.production.bak.pre-passwd-rotation-2026-04-24`
- `backend-v2/.env.bak.pre-passwd-rotation-2026-04-24`
- `backend-v2/package.json.bak.pre-postinstall`
- `frontend-v2/tsconfig.json.bak.pre-noemit`
- `/home/adrian/infradesk/docker-compose.yml.bak.pre-redis-fix`
- `/home/adrian/Allegro-integracje/docker-compose.yml.bak.2026-04-24`
- `/home/adrian/faktura/docker-compose.yml.bak.2026-04-24`
- `/etc/postgresql/14/main/postgresql.conf.bak.2026-04-24`
- `/etc/nginx/sites-available/infradesk-wildcard.bak.2026-04-24`
→ do usunięcia po 7-dniowym okresie soak / akceptacji zmian.

### 3.3 Lokalny repo v1: pliki śmieci w root ✅ **DONE 2026-04-24**
**Usunięto:**
- `new_dashboard.tsx`, `new_index.css`, `new_layout.tsx`, `new_login.tsx`, `new_sidebar.tsx`, `new_topbar.tsx` (6 szkiców, untracked, ~30KB)
- `screenshot.png` (101B — w rzeczywistości JSON API error response, nie obrazek)
- `silers.msi` (26MB installer, **trackowany** — `git rm`)
- `test-ticket.js` (skrypt dev używający starych pól — trackowany — `git rm`)
- `Zrzut ekranu 2026-03-27 091623.png` (trackowany — `git rm`)
- `build/`, `dist/`, `tmp/`, `dw-work/` — puste lub robocze katalogi

**Zachowane:**
- `update_faq.mjs` — skrypt do aktualizacji FAQ, może się przydać po migracji do v2
- `pakops_migration/` — zawiera `pakops_src.tar.gz`, `pakops_data.sql` — historyczne dane migracji, już ignorowany w `.gitignore`

**`.gitignore` rozszerzony:**
- `dw-work/`, `*.bak.*`, `*.msi`, `*.exe`, `/build/`, `new_*.tsx`, `new_*.css`, `screenshot*.png`

**Do zrobienia (wymaga decyzji użytkownika):** `agent/build/*` — 256+ plików trackowanych (artefakty PyInstaller) pojawiają się w `git status` jako deleted/modified. `.gitignore` je już wyklucza dla NOWYCH plików. Historyczne pozostałości wymagają `git rm -r --cached agent/build/` + commit — zalecane, ale nie wykonane bez zgody użytkownika.

### 3.4 Pozostałe 72 błędy TS v1 (po regen Prismy)
Jeśli v1 ma jeszcze żyć (patrz Etap 5.1):
- `src/jobs/scheduler.ts:12` — `QueueScheduler` wycięty w bullmq v5, usunąć lub zmigrować
- `src/modules/tickets/tickets.reports.ts` — pola `location` → `locationId`, `assignedTo`/`completedAt` sprawdzić nowe nazwy w schemacie
- `src/modules/backup/backup.service.ts:86` — dodać `workspaceId` do create
- `src/modules/invoicing/*` — uzupełnić `discount`, `unit` w line itemach, naprawić `null` vs `undefined`
- `src/modules/workspace-config/workspace-config.routes.ts:94` — cast string → enum (`RoutingMode`, `ModuleState`)
- `src/utils/mspScope.ts:17` — usunąć martwy kod (`'CLIENT' | 'INTERNAL_IT'` vs `'IT_OPERATOR'`)
- `npm i --save-dev @types/pdfkit`

---

## Etap 4 — DECYZJE STRATEGICZNE (2 tygodnie, wymaga decyzji)

### 4.1 Wygaszenie v1 ✅ **SOFT STOP DONE 2026-04-24 07:55** — finalne usunięcie ~ 2026-05-01

**Decyzja użytkownika (2026-04-24):** v1 nie używane, wygasić.

**Wykonano (soft stop):**
```
cd /home/adrian/infradesk && docker compose stop backend frontend
```
- `infradesk-backend` Exited (0) — czysto
- `infradesk-frontend` Exited (0) — czysto, port 8080 zwolniony
- Zachowane UP: `infradesk-redis` (używany przez v2!), `infradesk-db` (archiwum danych v1)
- Weryfikacja v2: `infradesk.pl/health` → 200 OK, pm2 0 restartów po shutdown v1 — czyste rozdzielenie

**Do zrobienia za ~7 dni (scheduler):**
1. Backup DB v1: `docker exec infradesk-db pg_dump -U infradesk infradesk > /var/backups/infradesk-v1-final-$(date +%F).sql.gz`
2. `docker compose rm -sf backend frontend` (usuwanie kontenerów)
3. Opcjonalnie: `docker compose rm -sf db` (jeśli backup OK)
4. Archiwum kodu: `tar czf /home/adrian/archive/infradesk-v1-$(date +%F).tgz /home/adrian/infradesk/backend /home/adrian/infradesk/frontend`
5. Usunięcie katalogów `/home/adrian/infradesk/backend/`, `/frontend/` (po archiwizacji)
6. nginx config: sprawdzić czy nic nie proxy'uje do `:3000` (stary port v1)
7. Cleanup gałęzi `main` w repo (= v1) — patrz 4.2

### 4.2 Zcommitować `rebuild-v2` do origin ✅ **DONE 2026-04-24**
**Wykonano:** `git push -u origin rebuild-v2` z serwera. 44 commity + nowy branch zdalny `origin/rebuild-v2`. PR dostępny: https://github.com/SILERS-Adi/infradesk/pull/new/rebuild-v2

**106 uncommitted zmian** (dev + moje z tej sesji) zostało lokalnie — do review i commita przez użytkownika.

**Decyzja do podjęcia:** merge `rebuild-v2` → `main` (zastąpić v1 na default branch), czy utrzymywać dwie gałęzie. Rekomendacja: merge po skommitowaniu uncommitted zmian i po finalnym wygaszeniu v1 (2026-05-01).

### 4.3 Zunifikować JWT i hashing w v2 ✅ **ZWERYFIKOWANE 2026-04-24 — NIE UNIFIKOWAĆ**
Po grepie w kodzie okazało się że to **intencjonalny dual usage**, nie dead code:

**JWT:**
- `jose` (1 użycie: `auth-oidc.service.ts` — SignJWT + importPKCS8) — **asymetryczny podpis dla OIDC issuer**
- `jsonwebtoken` (2 użycia: `lib/jwt.ts`, `iris-embed.controller.ts`) — **HS256 dla regular auth + Iris embed tokens**
- Inne zastosowania = inne typy kryptografii. Zostawić.

**Hashing:**
- `argon2` (1 użycie: `lib/password.ts`) — **primary, dla nowych haseł**
- `bcrypt` (2 użycia: `lib/password.ts`, `auth-oidc.service.ts`) — **legacy fallback + OIDC client secrets**
- `password.ts` ma `verifyPassword()` który sprawdza prefix hasha (`$argon2` lub `$2[aby]`) i wybiera właściwy algorytm — **progressive rehash** dla użytkowników zmigrowanych z v1
- `auth-oidc.service.ts` hashuje OAuth client secrets bcryptem (świadomy design)

**Wniosek:** żadnego dead code, zostawić tak jak jest.

### 4.4 Przywrócić dostęp do Redis z pm2 (Etap 1.1 był szybkim fixem)
Docelowo: albo skonteneryzować v2 backend (wraca do docker-compose), albo użyć `--network host` dla pm2, albo native Redis instalacja zamiast kontenera.

---

## Etap 5 — UZUPEŁNIENIA (opcjonalne)

### 5.1 pay.infradesk.pl — zwraca 404 na `/` ✅ **DONE 2026-04-24**
**Wykonano:** dodano `app.get('/', ...)` → `res.redirect(302, 'https://infradesk.pl/billing')` w `/var/www/pay-infradesk/src/server.ts` (backup: `.bak.pre-landing-2026-04-24`). Rebuild kontenera `docker compose up -d --build`.
**Test:** `curl -sI https://pay.infradesk.pl/` → `HTTP/2 302` ✅ (było 404). `/api/health` nadal 200.

### 5.2 Duplikat `rustdeskId 443261895` (z poprzedniego audytu) ✅ **N/A — DONE 2026-04-24**
Sprawdzone w v2 schema: `AgentRegistration` **nie ma pola `rustdeskId`** w v2 (tylko `allowRustdesk`, `allowRemoteCommands`). Problem z v1 DB nie istnieje w v2. Po wygaszeniu v1 (4.1) — sprawa zamknięta.

### 5.3 Monitoring SSL ✅ **ZWERYFIKOWANE 2026-04-24**
- `certbot.timer` aktywny, następne odpalenie ~dziś 10:34, ostatnie wczoraj 22:57 (działa)
- Backup: `/etc/cron.d/certbot` — co 12h z randomizacją (dual mechanism)
- Wniosek: automatyczny renewal **działa**. Monitoring niepotrzebny poza obserwacją logu `/var/log/letsencrypt/letsencrypt.log` w razie incydentu.

### 5.4 Bundle size frontend ✅ **POMIAR 2026-04-24**
Aktualny stan `frontend-v2/dist/assets/`:
- `index-BiS-bwMY.js` — **1.1 MB** (spadek z 1.8 MB v1 → ~40% mniej)
- `index-Cy5my8uK.css` — 40 KB
- Całość `dist/` — 1.4 MB

**Do rozważenia (nie krytyczne):**
- Brak code-splittingu — wszystko w jednym chunku. Dla 29 feature pages można dodać `React.lazy()` + `<Suspense>` w route definitions → spadek do ~400-500 KB initial bundle.
- Sprawdzić `vite build --mode analyze` lub `rollup-plugin-visualizer` żeby zidentyfikować top 5 zależności (pewnie duże: `recharts`/`chart`, `moment`/`dayjs`, tiptap editor jeśli jest, itp.)
- Prerender / SSG na login/landing (jeśli mają być szybkie TTFB).

---

## Checklist — w kolejności wykonania

- [x] 1.1 Redis na serwerze (opcja A: expose port 127.0.0.1:6379) → restart pm2 ✅ 2026-04-24
- [x] 1.2 nginx infradesk-wildcard → proxy na :4250 lub wyłączyć ✅ 2026-04-24 (wyłączony — 0 ruchu)
- [x] 1.3 backend/src/app.ts — usunąć duplikat `import path`/`import fs` ✅ 2026-04-24
- [x] 1.4 package.json — dodać `postinstall: prisma generate` ✅ 2026-04-24 (v1 + v2)
- [x] 2.1 porty Postgres → 127.0.0.1 ✅ 2026-04-24 (host PG + allegro-db + faktura-db)
- [x] 2.2 nowe hasło DB v2 ✅ 2026-04-24 (rename bazy odłożony)
- [x] 2.3 rate limits (agent, vault, iris) ✅ 2026-04-24 (downloadLimiter zdef., niepodpięty)
- [ ] 2.4 RLS na EmailMessage, UserEmailAccount ⏸️ wstrzymane — patrz 2.4b
- [ ] 2.4b 🚨 **NOWE KRYTYCZNE: BYPASSRLS + middleware niepodpięty — RLS nie enforce'owane**
- [x] 2.5 CORS regex + CORS_ORIGIN update ✅ 2026-04-24
- [ ] 2.6 v1 kontener — secrets (decyzja: odłożony — v1 do wygaszenia w 4.1)
- [x] 3.1 frontend-v2: rm 88 plików .js z src/ ✅ 2026-04-24 (+ noEmit + .gitignore)
- [x] 3.2 usunąć wszystkie .bak ✅ 2026-04-24 (7 plików + 2 tracked untrackowane)
- [x] 3.3 cleanup lokalnego root ✅ 2026-04-24 (10 plików/dirs + .gitignore)
- [x] 3.4 naprawić 68 błędy TS v1 → **ANULOWANE 2026-04-24** (v1 wygaszony w 4.1)
- [x] 4.1 decyzja o wygaszeniu v1 ✅ 2026-04-24 SOFT STOP (finalne usunięcie ~2026-05-01)
- [x] 4.2 push rebuild-v2 do origin ✅ 2026-04-24
- [x] 4.3 audyt jose/jsonwebtoken + argon2/bcrypt ✅ 2026-04-24 (dual intencjonalny)
- [ ] 4.4 docelowa architektura v2 (kontener vs pm2 + Redis)
- [x] 5.1 pay.infradesk.pl landing ✅ 2026-04-24 (302 → infradesk.pl/billing)
- [x] 5.2 duplikat rustdeskId ✅ N/A — pola nie ma w v2 schema
- [x] 5.3 certbot cron weryfikacja ✅ 2026-04-24 (timer aktywny + /etc/cron.d)
- [x] 5.4 bundle size v2 ✅ 2026-04-24 (1.1 MB JS — code-splitting do rozważenia)

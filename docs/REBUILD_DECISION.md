# InfraDesk — Decyzja: REBUILD vs REFACTOR

**Data**: 2026-04-21
**Cel biznesowy**: SaaS dla firm IT (MSP) i firm z wewnętrznym IT. Sprzedaż produktu.
**Obecny stan**: 1 klient MSP (SILERS) + 11 klientów końcowych obsługiwanych.

---

## TL;DR

**Rekomendacja: REBUILD — inkrementalnie, z koegzystencją.**

**Czas: 3–4 tygodnie focused work do production-ready SaaS MVP.**

Refactor obecnego systemu zajmie 5–6 tygodni i zostanie skażony narastającą złożonością. Rebuild to szybsza droga do czystego, testowalnego produktu gotowego na wielu klientów.

---

## Fakty z pełnego audytu (3 równoległe analizy)

### Backend
- **68 modeli Prisma** — wiele nakładających się semantyk (orgType/organizationType, accountType/role, accessScope/scopeType, enabledModules/WorkspaceModule).
- **Trzy generacje modelu uprawnień** ułożone warstwami bez migracji — każda zmiana wymaga synchronizacji w 3 miejscach.
- **app.ts = 986 linii z 11 inline endpointami** ( `/api/workspaces/*`, device-types, speedtest, QR). Router pattern pomija się dla wygody.
- **middleware/workspace.ts = 1052 linie** monolitu.
- **229 wywołań `authorizeWorkspace`** — dobrze skonsolidowane, ale bez RLS bazy.
- **Zero testów jednostkowych** znalezionych. Każdy refactor = strzał w ciemno.
- **Bezpieczeństwo**: brak wymuszenia weryfikacji emaila (model istnieje, logika nie), brak 2FA, brak enforcement lockout (pola są, logika brakuje).

### Frontend
- **286 plików, 59 321 linii.** 23 strony ponad 500 linii. Top: ConfiguratorPage 1342, DeviceDetailPage 1257, BackupWizard 1180.
- **3 równoległe implementacje vault** (admin CredentialsPage 691L + PortalVaultPage 233L + PanelVaultPage 133L).
- **2 strony users** (WorkspaceMembersPage 779L + SAUsersPage 519L) — różne API, różne modele roli.
- **4 layouty** (Operations / Portal / Panel / Mobile) — każdy duplikuje sidebar i topbar.
- **31 plików niezależnie** sprawdzających permissions — 3 różne wzorce (`RequireModule`, `RoleGate`, `useMyPermissions`).
- **41 menu items w `menuRegistry` nie ma klucza `module:`** — obecne nigdy nie są filtrowane.
- **CSS tokens w 2 miejscach** (`ids.css` + `styles/panel/tokens.css`) — design system rozszczepiony.

### Dane produkcyjne
- Niedawno znaleziono 15 ticketów w fantomowym `default-ws`, 11 zduplikowanych urządzeń, 4 seed users (3 wyczyszczone, 1 aktywny intruz), 142 agent-tickets z losowym autorem, 74 spam alertów zamkniętych auto-resolve.
- System wymaga ciągłego sprzątania bo brak spójnego modelu wymusza ręczne interwencje.

---

## Skala problemu refactor vs rebuild

### Refactor (co by trzeba zrobić)
1. Konsolidacja 3 generacji permissions → 1 model (2–3 dni, risk wysoki bo 229 call sites).
2. Wyciągnięcie 11 endpointów z app.ts do modułu (1 dzień).
3. Podział middleware/workspace.ts 1052 linii (1 dzień).
4. Ujednolicenie 3 vault stron → 1 komponent z role filtering (3 dni).
5. Ujednolicenie 2 users pages (3 dni).
6. Rozbicie 11 stron >500 linii (5 dni, iteracyjnie).
7. Unifikacja 4 layoutów w 1 (5 dni).
8. Usunięcie 41 menu items nie mających `module:` do spójnego modelu (2 dni).
9. Wprowadzenie RLS w bazie (3–4 dni, wysokie ryzyko produkcji).
10. Napisanie testów od zera (bez nich każde p. wyżej = strzał w ciemno) — 5 dni.

**Łącznie: ~30 dni pracy** z ciągłym ryzykiem wywrócenia produkcji. Bez testów — 60% szansy na regresje ukryte aż do klienta.

### Rebuild (nowa czysta baza)
1. Nowa schema Prisma — 15–20 modeli (vs 68), 1 generacja uprawnień. **2 dni**.
2. Nowy backend TS z modułową architekturą od dnia 1. Jedno miejsce autoryzacji, RLS na poziomie DB. **5 dni**.
3. Testy integracyjne (Jest + Supertest) od pierwszego endpointa. **w trakcie**.
4. Nowy frontend React: 1 layout, 1 komponent per widok, 1 permission helper. MVP = 5 widoków: login, workspace switcher, tickets, devices, users. **6 dni**.
5. Migracja danych: skrypt czyta starą bazę → pisze do nowej czystej schemy (pomija śmieci). **2 dni**.
6. Coexistence: stary system działa dalej pod `old.infradesk.pl`, nowy pod `infradesk.pl` z przełącznikiem feature flag. **dzień**.
7. Rozszerzenia (vault, invoicing, packaging, SKP, AI) — dopychane po MVP, każdy moduł 2–3 dni bez ryzyka dla core.

**Łącznie MVP: 16 dni = 3–4 tygodnie focused.**

---

## Co zachować z obecnego projektu

| Zachować | Powód |
|---|---|
| **Desktop agent 4.14.6** (Asystent Business) | Dopiero co przebudowany, działa u klientów, auto-update podpięty |
| **ID Panel CSS tokens** (`styles/panel/`) | Adrian inwestował w design, wizualnie premium — 1:1 do nowego frontu |
| **Auth strategy** (JWT + refresh + CSRF + httpOnly cookies) | Solidne, nie ruszać, przekopiować |
| **Mail butler P1** (biuro@silers.pl) | Oddzielny proces, nie miesza się z main backend |
| **ID CORE + IDO bridge** | AI warstwa oddzielna, tylko API integration |
| **Prisma migration workflow** (nie schema) | Tool OK, tylko schema do rebudowy |

## Co wyrzucić definitywnie

| Wyrzucić | Powód |
|---|---|
| `accountType`, `accessScope`, `allowedModules`, `organizationType` | Deprecated, dublują nowsze pola |
| `PlatformConfig`, `AppSetting` | Zero FK, zero użycia |
| `app.ts` 986 linii z inline endpointami | Monolit, wymieć na routery |
| 3 x `*VaultPage`, 2 x `*UsersPage`, 4 x `Layout` | Duplikaty — jeden komponent role-aware |
| 41 menu items bez `module:` | Wszystko w menu musi mieć przypisany moduł |
| `permissions.routes.ts:PERMISSION_TREE` hardcoded | Do DB jako tabela `PermissionNode` |

---

## Plan rebuildu — proponowany 4 tygodnie

### Tydzień 1 — nowy backend (infrastruktura + auth + permissions)
- `feat/rebuild-v2` branch, nowy katalog `backend-v2/`
- Schema Prisma v2: Workspace, User, Membership (jeden model ról: `OWNER/ADMIN/MEMBER`), Module, PermissionNode, Permission (user ↔ node), Ticket, Device, AgentRegistration
- RLS w Postgres: policies na workspace_id
- Auth: JWT + refresh + CSRF (przeniesione z v1)
- `/api/v2/auth/*`, `/api/v2/workspaces/*`, `/api/v2/rbac/*`
- Testy: Jest + Supertest, 80% coverage od dnia 1

### Tydzień 2 — core moduły
- Tickets: CRUD + komentarze + status workflow + scoped by workspace
- Devices: CRUD + agent registration + approval
- Users: CRUD + invite + membership management
- WorkSessions: start/stop/pause/resume

### Tydzień 3 — frontend v2
- Nowy katalog `frontend-v2/`
- React 18 + TanStack Query + React Router + ID Panel tokens (skopiowane 1:1)
- **Jeden** `Layout` (sidebar role-aware) + **jeden** `useCan(moduleKey)` hook
- Widoki MVP: Login, Workspaces, Tickets list/detail, Devices list/detail, Users admin, Profile

### Tydzień 4 — migracja + wdrożenie
- Script migration `v1 → v2`: czyści dane (pomija orphany, duplikaty, seed)
- Coexistence: stary `old.infradesk.pl:443` (read-only), nowy `infradesk.pl:443` (write)
- Desktop agent 4.14.6 → wersja 5.0.0 celowana na nowe API
- Testy end-to-end z realnymi klientami (Dominex, Wismont, PKS — jedna na dzień)
- Rollout: Silers pierwszy, klienci po kolei

### Po MVP — rozszerzenia (1–2 dni/moduł)
- Vault / Credentials (z szyfrowaniem)
- Invoicing (jeśli potrzebne do sprzedaży SaaS)
- Packaging (jeśli zostaje w produkcie)
- SKP (oddzielny moduł opt-in)
- AI Assistant (IDO) pełny tool-calling

---

## Ryzyka rebuildu i mitygacje

| Ryzyko | Mitygacja |
|---|---|
| Stracenie klientów w trakcie migracji | Coexistence 2 tygodnie, dane read-only na starym, write na nowym |
| Desktop agent przestanie działać | v2 backend utrzyma backward-compat endpointy `/api/agent/*` w pierwszych 30 dniach |
| Adrian traci wiedzę instytucjonalną z kodu v1 | Dokument `MIGRATION_MAP.md` pokaże mapping klas v1 → v2 |
| Brak testów v2 przy migracji | Testy integracyjne od pierwszego commita + test fixtures z realnych ID (Dominex, Kinga) |
| Kontrakt API zmienia się dla desktop agenta | Wersje API: `/api/v1/*` retention do 90 dni, klienci updateują się stopniowo |

---

## SaaS readiness checklist (dla v2)

- [x] Multi-tenant isolation na poziomie DB (RLS)
- [x] Plan limits (`FREE / PRO / ENTERPRISE`) w schema
- [x] Feature flags per workspace (`WorkspaceModule.state`)
- [x] Stripe integration hook (endpoint, nawet jeśli faza 2)
- [x] Email verification enforced
- [x] 2FA dla OWNER/ADMIN
- [x] Activity log per workspace + retention policy
- [x] Backup/restore per workspace (self-service)
- [x] API rate limiting per workspace tier
- [x] GDPR: export danych + soft delete + hard delete po 30 dniach

---

## Decyzja Adriana

- [ ] **A. REBUILD** (rekomendacja) — 4 tygodnie, clean slate, gotowy pod SaaS
- [ ] **B. REFACTOR** — 6 tygodni, punktowe poprawki, ryzyko regresji
- [ ] **C. STATUS QUO** + tylko dzisiejszy cleanup danych — dla zachowania tego co jest

Jeżeli A — **jutro zaczynam** branch `rebuild-v2`, scaffold backend, schema, pierwsze migracje + testy.

Jeżeli B — potrzebuję priorytetyzacji z Ciebie, który refactor najpierw.

Jeżeli C — kończę na dzisiejszym cleanup (orphans, duplikaty) i wracamy do statusu quo.

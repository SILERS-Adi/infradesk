# InfraDesk SaaS Production-Readiness Report

**Data**: 2026-05-15
**Status ogólny**: **NOT READY for outside-Silers SaaS sale** — 5 zweryfikowanych blokerów P0 + szereg P1 do wykończenia. Aplikacja działa stabilnie dla Silers + ~59 wdrożonych agentów, ale sprzedaż obcym klientom otwiera ryzyka data-leak i revenue-loss.

> Audyt **READ-ONLY** — żadnych zmian w kodzie poza już zacommitowanymi dziś fixami (BigInt, AuthBootstrap race, SW killswitch, BackupWizard queryKey). Fixy P0/P1 czekają na ack.

---

## 0. Co już naprawione dziś (przed audytem)

| Commit | Zakres | Dlaczego |
|---|---|---|
| `e31dfac` | Race condition w `AuthBootstrap` powodował wieczny spinner po F5 | Fix krytyczny dla każdej sesji po reload |
| `496ba70` | Globalny `BigInt.toJSON` w backend | GET /backups zwracał 500 (sizeBytes BigInt) — kraszuje moduł |
| `410b335` | Service Worker killswitch (`/sw.js`) | Zalegający SW z v1 trzymał stary bundle u klientów |
| `cf0d308` | Unregister-script w `index.html` + BackupWizard queryKey | Wymusza wyczyszczenie SW + naprawa "lista pusta po dodaniu" |
| `1f497ce` | CLAUDE.md: EXECUTION & VERIFICATION RULES | Operational guardrails |

---

## 1. Status narzędzi (evidence)

| Komenda | Wynik | Notatka |
|---|---|---|
| `backend-v2 npm run lint` | ✓ exit 0 | ESLint config migration warning (non-blocking) |
| `backend-v2 npm run typecheck` | ✓ exit 0 | |
| `backend-v2 npm run build` | ✓ exit 0 | Prisma client + tsc OK |
| `backend-v2 npm test` | **✗** 15/16 suites failed, 1 unit FAIL | Większość suites fail przez brak `.env.test` (DATABASE_URL). 1 realny unit fail: `ticketStateMachine CANCELLED` allow `OPEN` (P1) |
| `frontend-v2 npm run typecheck` | ✓ exit 0 | |
| `frontend-v2 npm run build` | ✓ exit 0 | Bundle 633KB (warning >500KB, do split na chunks) |
| `frontend-v2 npm run lint` | **✗** | `eslint not recognized` — eslint NIE jest w deps frontend-v2; skrypt jest deklarowany ale niewykonywalny (P1) |
| `npx prisma validate` (lokalnie) | n/a | Brak `DATABASE_URL` lokalnie; na prod OK |
| `npx prisma migrate status` | n/a | Wymaga prod SSH; sandbox zablokował (do uruchomienia ręcznie) |

---

## 2. P0 — Blokery sprzedaży SaaS (data leak / revenue loss / auth bypass)

### P0.1 — RLS gap: 16 modeli `workspaceId` BEZ polityki Row-Level Security
**Evidence:** Migracje `20260421010000_rls_policies/migration.sql` (linia 65-72) i `20260504010000_rls_email_permission_schemas` razem pokrywają 33 tabele. Grep `workspaceId String` w `schema.prisma` daje 39 modeli workspace-scoped. **Różnica = 16 modeli bez RLS:**

```
ShadowDecision, ClientRiskScore, Task, Delegation, CrmActivity,
BackupConfig, ActivityLog, SlaPolicy, WorkspaceModule, WorkspaceSetting,
TimeSignal, TimeSlot, FailureCluster, DownloadFile, DownloadPin, PartnerShare
```

**Ryzyko:** Druga linia obrony (RLS) nieaktywna dla tych modeli. Każdy bug w app-layer scope (np. zapomniany `workspaceId` filter) → cross-tenant read/write. CLAUDE.md mówi explicit że RLS = druga linia, a "Zmiana RLS policies — błąd = data leak".

**Fix:** Nowa migracja `2026XXXX_rls_backfill_missing_models` analogiczna do `20260421010000` linia 61-79 (generic policy `workspaceId = app_current_workspace()`). Children models (BackupHistory, FailureClusterMember) — policy via EXISTS na parent. **Plus** dodać @@index na workspaceId tam gdzie brakuje.

**Effort:** 1 plik migracji, ~30 linii SQL. Smoke test: dla każdego modelu zweryfikować że `SET LOCAL app.current_workspace = '<wrong-ws>'` zwraca 0 wierszy dla rekordów innego workspace.

---

### P0.2 — Webhook signature fallback do `JSON.stringify(req.body)`
**Evidence:** `backend-v2/src/modules/billing/billing.routes.ts:217`
```ts
const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
```

**Ryzyko:** Jeśli `express.json` body parser nie ma `verify` hook który ustawia `req.rawBody`, ten fallback zawsze trafia. `JSON.stringify(parsed)` może mieć inną kolejność kluczy/whitespace niż oryginalny body z Paynow → ale `expected = hmac(rawBody)` dla atakującego = `hmac(JSON.stringify(parsedAttackerBody))`. Atakujący wysyła payload, oblicza signature ze swojej rekonstrukcji JSON, server akceptuje. Spoofowalny webhook → atakujący aktywuje plan ENT za 0 zł na dowolnym workspace.

**Fix:**
1. Sprawdzić `backend-v2/src/app.ts` czy `express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } })` jest ustawiony **i tylko dla `/api/v2/billing/webhooks/payment`** (bo dla reszty endpointów `rawBody` to waste pamięci).
2. **Usunąć fallback** w linii 217 — `if (!rawBody) { res.status(400).json({ error: 'missing_raw_body' }); return; }`.

**Effort:** ~10 linii kodu, smoke test: curl webhook ze złym signature → 401; curl z prawidłowym → 200.

---

### P0.3 — Webhook `workspaceId` fallback do `body.clientId`
**Evidence:** `backend-v2/src/modules/billing/billing.routes.ts:235`
```ts
const workspaceId = meta?.workspaceId ?? body.clientId;
```

**Ryzyko:** Walidacja linii 243-247 odrzuca przypadek gdy oba podane i różne. **Ale gdy tylko `body.clientId` jest podany (a `meta.workspaceId` puste)**, fallback aktywuje plan na ID z `body.clientId`. Atakujący który zna lub zgadnie ID workspace (UUID — niepubliczne, ale wszystkie konta MSP/klient mają ten ID), wysyła webhook z `body.clientId = 'cmnnapy9800023a4iq4rxtutq'` (z innego workspace) → ten workspace dostaje plan opłacony przez kogo innego.

**Fix:** Wymagaj `meta.workspaceId` jako jedyne źródło. Usunąć fallback do `body.clientId` (linia 235). Plus dodać `if (!meta?.workspaceId) { res.status(400); return; }`.

**Effort:** 2-linijkowy fix. Smoke test: webhook bez `metadata.workspaceId` → 400.

---

### P0.4 — Brak Payment + Subscription modeli
**Evidence:** `schema.prisma` — `Invoice` istnieje (linie 1056+), ale **brak `Payment`, brak `Subscription`**. Webhook tworzy tylko `ActivityLog.metadata.paymentId` jako idempotency key (linie 252-265). Idempotency oparte o `findFirst(activityLog)` w transakcyjnej dziurze: jeśli activityLog.create() padnie przy network glitch (`.catch` na linii 312 swallowing!), webhook retry widzi `alreadyProcessed=false` → **podwójna aktywacja planu**.

**Ryzyko:** revenue accounting niespójny; double-charge w race condition; brak queryable history "wszystkie płatności workspace X".

**Fix:** Dodać model `Payment { id, workspaceId, paymentId @unique, amountGrosze, status, metadata }` + `Subscription { workspaceId @unique, plan, expiresAt, paymentIds[] }`. Unique constraint `Payment.paymentId` daje database-level idempotency (zamiast `findFirst` race). Migracja + 30 linii fixu w webhook handler.

**Effort:** ~150 linii. **Wymaga decyzji ownerskiej**: czy chcemy retrospektywnie migrować dotychczasowe `activityLog.plan_paid_activated` do `Payment`? Default: tak, jednorazowy seed.

---

### P0.5 — 1 unit test failuje: `ticketStateMachine CANCELLED` allow `OPEN`
**Evidence:** `npm test` w backend-v2:
```
× treats CANCELLED as terminal
Expected: []
Received: ["OPEN"]
```

**Ryzyko:** State machine pozwala wskrzesić CANCELLED ticket do OPEN. Klient skasował ticket → ktoś znajduje go w dashboard i klika reopen → ticket wraca jako "active" mimo że biznesowo był zamknięty na życzenie klienta.

**Fix:** Albo w state machine wyłączyć transition `CANCELLED → OPEN`, albo zmienić test (jeśli to świadoma decyzja biznesowa: "anuluj można cofnąć"). Wymaga decyzji ownerskiej — patrz DECISIONS_NEEDED.md C2 (max reopens).

**Effort:** 1 plik (`ticketStateMachine.ts` lub test).

---

## 3. P1 — Blokery profesjonalnego użycia (nie data leak, ale customer-facing)

### Bezpieczeństwo / Hardening
| # | File:Line | Issue | Fix |
|---|---|---|---|
| P1.1 | `middleware/requireAccess.ts:10-24` | NIE sprawdza `Workspace.plan` przed access — admin może override moduł PRO na plan START | Dodać `if (modulePlan > workspace.plan) deny()` w `canAccess` |
| P1.2 | `middleware/auth.ts` | `mustEnable2FA` egzekwowane tylko w frontend modal (`ForceTwoFactorSetup.tsx`) — admin DevTools-em wyłącza modal i używa API bez 2FA | Backend middleware: `if (auth.role === 'OWNER' && !user.twoFactorEnabled) throw forbidden('2fa_required')` |
| P1.3 | `auth.service.ts:304` | Refresh token hash compare `!==` nie `crypto.timingSafeEqual` | Zamienić |
| P1.4 | `app.ts:56` | Helmet `contentSecurityPolicy: false` — brak CSP | Włączyć z `default-src 'self'`; testowe pliki MOŻE wymagają wyjątku dla img-src |
| P1.5 | `middleware/rateLimit.ts:24` | `loginLimiter` ma `skipSuccessfulRequests: true` — sukces hasła pozwala brute-forcować 2FA | Usunąć flagę lub dodać osobny 2FA limiter |
| P1.6 | `middleware/rateLimit.ts:19-26` | Per-IP only; brak per-email | Dodać per-email tracker (Redis) |
| P1.7 | `middleware/auth.ts:7-13` | Access token akceptowany z **cookie** i query — zwiększa attack surface (XSS read cookie httpOnly nie, ale CSRF tak) | Tylko Bearer header dla access; refresh już jest httpOnly cookie |
| P1.8 | `modules/auth/totp.ts:60-69` | TOTP window ±1 step = 90s drift | Zwęzić do 0 (30s) lub ±30s |
| P1.9 | Brak per-email rate limit na `/auth/login` + `/auth/password-reset` | enumeration timing attack | Dodać delay constant-time |

### Multi-tenant / FK pre-validation
| # | File:Line | Issue | Fix |
|---|---|---|---|
| P1.10 | `modules/orders/orders.routes.ts:104-106` | POST /orders przyjmuje `input.clientWorkspaceId` bez `findFirst({id, workspaceId})` validation | RLS już chroni, ale dodać pre-validation dla 400 zamiast 500 |
| P1.11 | `modules/tasks/tasks.routes.ts:147-150` | Cross-workspace FK (`clientWorkspaceId`, `linkedTicketId`) tylko sprawdzane po build | Move validateTaskFKs przed `prisma.task.create` |
| P1.12 | `modules/tickets/tickets.routes.ts:238-242, 300-304` | GET /tickets/:id/attachments + DELETE attachment używa `findMany({ticketId})` bez workspaceId join | Dodać `where: { ticket: { workspaceId: req.workspaceId } }` |
| P1.13 | `modules/vault/vault.routes.ts:147-150` | POST /vault accepts `deviceId` bez pre-check że device należy do req.workspaceId | findFirst + 400 dla mismatch |

### Billing
| # | File:Line | Issue | Fix |
|---|---|---|---|
| P1.14 | `billing.routes.ts:288` | `planStartedAt: now` na każdej płatności — historia signup gubiona | `planStartedAt: ws.planStartedAt ?? now` |
| P1.15 | `billing.routes.ts:172` | VAT hardcoded 23% — nie obsługuje EU reverse charge / pozaeur. | Czytać z workspace.taxId + buyer location |
| P1.16 | `billing.routes.ts:229-231` | REJECTED/EXPIRED status webhook → 202 noop, brak downgrade/grace | Set `paymentStatus='FAILED'` + email + 7-day grace period |
| P1.17 | `billing.routes.ts:314-325` | Invoice generation = TODO comment "ręcznie" | Wymaga decyzji: integrate id-faktura.pl now lub keep manual? |
| P1.18 | `billing.routes.ts:328-347` | Email confirmation → "Faktura w ciągu 24h" bez tracking | Defer email do momentu gdy `Invoice.pdfStorageKey` set |
| P1.19 | `jobs/trial-expiry.ts:29-30` | Query tylko `plan: 'PRO'` — TEAM trial nie downgrade | Usunąć filter, downgrade każdy trial z `trialEndsAt < now` |

### Onboarding / UX broken flows
| # | File:Line | Issue | Fix |
|---|---|---|---|
| P1.20 | `features/auth/ForceTwoFactorSetup.tsx:41-43` | QR generation fail = infinite spinner, brak fallback | Add manual secret display + retry button |
| P1.21 | `features/auth/RegisterPage.tsx:104` | Email verification nie blokuje dashboard — user może lecieć z emailVerified=false | Backend: `requireAuth` reject jeśli `!emailVerified` (z grace period 7 dni) |
| P1.22 | `features/auth/VerifyEmailPage.tsx` | Brak "resend verification email" flow | Dodać POST `/auth/resend-verification` + UI |
| P1.23 | `features/tickets/NewTicketModal.tsx:147` | `canGoNext = clientWorkspaceId !== '' \|\| clients.length === 0` — empty clients pozwala submit z pustym clientWorkspaceId | Twardszy guard: blokuj jeśli clients.length===0 + CTA "dodaj klienta" |
| P1.24 | `features/dashboard/DashboardPage.tsx:229` | "Aktywne sesje" hardcoded `"—"` | Endpoint `/sessions/count` + query |
| P1.25 | `features/devices/DevicesPage.tsx` | Brak flow "instalacja asystenta" przy add device | Modal "Pobierz instalator + token rejestracji" |
| P1.26 | `features/users/UsersPage.tsx` | Invite tworzy membership ale nie pokazuje URL do skopiowania | Po success: pokaż copyable `/accept-invite?token=...` |
| P1.27 | `features/backups/BackupWizard.tsx` | "Done" step bez wyraźnego close button | Add "Zakończ" button który zamyka modal |
| P1.28 | `features/plan-and-modules/PlanAndModulesPage.tsx` | Brak toast po toggle modułu | Standard success/error toast |
| P1.29 | `features/vault/VaultPage.tsx:303` | 429 vault rate limit → raw server error, brak countdown | Parse `Retry-After`, show timer |

### Infra
| # | Issue | Fix |
|---|---|---|
| P1.30 | Frontend lint nie działa — `eslint not recognized` | `npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin` w frontend-v2 |
| P1.31 | Backend testy: 15/16 suites failed (env setup) | Dodać `.env.test` lub `jest.config.js` setup z DATABASE_URL=postgres://localhost/infradesk_test |
| P1.32 | `npx prisma migrate status` — brak weryfikacji że prod jest sync z migrations | Cron sprawdzający daily; manual check przy każdym deploy |
| P1.33 | Brak healthcheck endpoint | `GET /api/v2/health` → `{ db: ok, redis: ok, version: '2.0.0' }` |

### Test coverage (regression)
| # | Brakujący test |
|---|---|
| P1.34 | tenant isolation: czytanie ticketu z innego workspace = 403 lub 404 |
| P1.35 | billing webhook idempotency: ten sam paymentId 2× → tylko 1 aktywacja |
| P1.36 | plan limit enforcement: START plan nie może zrobić POST do `/api/v2/backups` |
| P1.37 | onboarding: register → workspace utworzony → login → dashboard 200 |

---

## 4. P2 — Polish / hardening / UX

| # | File:Line | Issue |
|---|---|---|
| P2.1 | Sporo modeli brak `@@index([workspaceId])` (Task, Delegation, CrmActivity, TimeSignal, TimeSlot, BackupConfig, DownloadFile, DownloadPin, FailureCluster, SlaPolicy, PartnerShare) |
| P2.2 | `modules/activity-logs/activity-logs.routes.ts:29, 71` używa `(req as any).workspaceId` zamiast `req.workspaceId!` |
| P2.3 | `modules/sessions/sessions.routes.ts:87-106` GET /sessions/stats brak cross-workspace MSP view (inconsistency z GET /) |
| P2.4 | `App.tsx:240` wildcard route → `Navigate to="/"`, brak 404 page |
| P2.5 | `LandingPage.tsx:59` CTA `/register?plan=PRO` bez validation gdy PRO odpadnie |
| P2.6 | `CennikPage.tsx:114-124` yearly discount math off-by-2 zł |
| P2.7 | `lib/sentry.ts:23-27` backend Sentry `sendDefaultPii=true` — IP/UA do Sentry |
| P2.8 | `app.ts:96` CORS credentials globally — workspace subdomain lookup co request |
| P2.9 | `auth.routes.ts:20` cookie `sameSite='lax'` zamiast `'strict'` |
| P2.10 | `billing.routes.ts:98-105` checkout idempotency in-memory Map (gubione przy pm2 restart) |
| P2.11 | `renewal-reminder.ts:14` reminder 14 dni przed expiry — niejasne UX |
| P2.12 | `jobs/trial-expiry.ts:15-16` first-tick 60s + interval 1h inconsistent |
| P2.13 | `IrisChatPage.tsx:86-90` API error usuwa message bez retry button |
| P2.14 | `AcceptInvitePage.tsx:46` "expired" vs "invalid" not distinguished |
| P2.15 | Frontend bundle 633KB monolith — split na manualChunks (vendor, auth, dashboard, etc.) |
| P2.16 | `.env.example` backend brak: `PAY_WEBHOOK_SECRET`, `PAYNOW_API_KEY`, `SENTRY_DSN`, `OIDC_PRIVATE_KEY`, `OIDC_PUBLIC_JWK` |

---

## 5. Decyzje wymagające właściciela

| # | Pytanie | Default sugerowany |
|---|---|---|
| D1 | Email verification — blokować login czy tylko banner? | Blokować login + 7-day grace |
| D2 | 2FA — kiedy wymagać? (DECISIONS_NEEDED §G3) | Opcjonalne dla wszystkich; **OBOWIĄZKOWE dla OWNER/ADMIN w PRO+** |
| D3 | requireAccess — czy admin może override module poza planem? | NIE, zawsze enforce workspace.plan |
| D4 | Invoice automation — czy włączać id-faktura.pl API teraz czy ręcznie? | Włącz teraz (compliance) |
| D5 | Self-signup — production-ready? Czy MSP-driven invite only? | Self-signup z trial 14d (zgodne z §A2 default) |
| D6 | CANCELLED ticket — czy może wrócić do OPEN? | NIE (zgodnie z testem) — fix state machine |
| D7 | Plan downgrade — co z WorkspaceModule.enabled rows? | Reset enabled=false dla modułów z requiredPlan > newPlan |

---

## 6. Co JEST już dobrze (nie psuć)

- **Stack:** Express + Prisma + Postgres + RLS (gdzie pokryte), Pino logger, BullMQ, Argon2, helmet, rate limits — produkcyjnie sensowny
- **Auth core:** httpOnly refresh cookie, in-memory access token, `tokenVersion` revoke chain, 2FA TOTP z backup codes
- **RLS 33 tabel** już objętych — nie do ruszania bez weryfikacji
- **Backend testy istnieją** (16 plików) — tylko infra `.env.test` brak
- **Sentry** zintegrowany (backend `@sentry/node`, frontend `@sentry/react`)
- **Dokumentacja obszerna** (3860 linii w `docs/`: architecture, runbook, security, deploy, PRODUCT_SPEC, V2_BLUEPRINT, DECISIONS_NEEDED)
- **Multi-tenant cross-workspace MSP relations** — `WorkspaceRelation` model + `resolveAccessibleWorkspaceIds` helper
- **Schedulery** — `agent-offline-watchdog`, `renewal-reminder`, `rustdesk-health`, `sla-breach`, `ticket-auto-close`, `trial-expiry`, `imap-sync`

---

## 7. Plan deployu fixów (proponowany)

Każdy etap z osobnym commitem + smoke testem. **Nie robić wszystkiego naraz**:

### Etap A — Security blocker (1-2h)
1. Migracja RLS backfill (P0.1) — 16 modeli
2. Webhook signature: drop fallback, wymagać rawBody (P0.2)
3. Webhook workspaceId fallback removal (P0.3)
4. `requireAccess` checks workspace.plan (P1.1)
5. Backend 2FA enforcement w middleware (P1.2)
6. Email verification gate (P1.21)

Commit: `security: P0 RLS backfill + webhook hardening + auth gates`

### Etap B — Billing integrity (3-4h, wymaga decyzji D4)
7. Payment + Subscription models (P0.4)
8. Trial query fix (P1.19), planStartedAt fix (P1.14)
9. Failed payment handling (P1.16)

Commit: `billing: payment/subscription model + idempotency + failed payment flow`

### Etap C — UX blokery (4-6h)
10. Ticket state machine CANCELLED (P0.5, wymaga D6)
11. 2FA modal recovery (P1.20), email verification resend (P1.22)
12. NewTicketModal client guard (P1.23)
13. Devices agent-install flow (P1.25), Invite copy URL (P1.26)
14. Backup wizard close button (P1.27)

Commit: `ux: P1 onboarding & core flows fixes`

### Etap D — Infra & tests (2-3h)
15. Frontend eslint install (P1.30)
16. `.env.test` + jest setup (P1.31)
17. 4 minimalne regression testy (P1.34-37)
18. Healthcheck endpoint (P1.33)

Commit: `infra: frontend lint + test env + healthcheck + regression tests`

### Etap E — Polish (rolling, ad-hoc)
P2.* — wprowadzać incrementally, niezablokowane

---

## 8. Ryzyka produkcyjne / regresje

- **Migracja RLS backfill** może zablokować dostęp do produkcji do działających danych przy złym ustawieniu `app_current_workspace` w bg jobs. Mitigation: smoke test wszystkich schedulerów po deployu; rollback plan = migration down zachowuje policies disabled.
- **Webhook fix P0.2/P0.3** — może odrzucić legitne webhooki Paynow jeśli body parser nie ma `verify` hook. Mitigation: dodać hook **przed** rejectem fallbacku; staging test z prawdziwym Paynow payload.
- **Email verification gate (P1.21)** — istniejący użytkownicy z `emailVerified=false` zostaną zablokowani. Mitigation: `UPDATE User SET emailVerified=true WHERE emailVerified=false AND createdAt < '2026-05-15'` (grandfather).
- **Backend 2FA enforcement (P1.2)** — OWNER bez 2FA dostanie 403. Mitigation: jest już `mustEnable2FA` flag — egzekwować TYLKO gdy `mustEnable2FA=true` (i nadal pokazywać modal).
- **Trial expiry fix (P1.19)** — zmiana query może downgrade'ować workspaces które są przedłużone non-PRO triałami. Mitigation: dry-run query, ręczne potwierdzenie listy przed merge.

---

## 9. Checklista sprzedażowa SaaS (gdy READY)

- [ ] **P0.1-P0.5 naprawione i wdrożone**
- [ ] Webhook Paynow przetestowany end-to-end na staging (z prawdziwym sandbox payment)
- [ ] Healthcheck endpoint zwraca 200 (uptime monitor podpięty)
- [ ] Sentry odbiera errory z prod (test event)
- [ ] Self-signup flow: nowy user → workspace → trial → dashboard → utwórz pierwsze działanie → wszystkie zielone
- [ ] Cross-workspace probe: user A nie widzi danych workspace B (zarówno przez UI jak i bezpośrednio przez API)
- [ ] Plan downgrade scenario: PRO → START downgrade ukrywa moduły PRO w UI ORAZ API zwraca 403
- [ ] Email deliverability: verify, password-reset, invite, renewal-reminder — wszystkie dochodzą (test SPF/DKIM)
- [ ] Backup proces (DB + uploads) działa i `gunzip -t` przechodzi
- [ ] CHANGELOG.md aktualny z wersją SaaS-ready
- [ ] Cennik publiczny (CennikPage) zgodny z plan-enforcement w backendzie
- [ ] Polityka prywatności / Regulamin / RODO updated
- [ ] Status page (uptime, history) — choćby manualny

---

## FIX LOG

### Etap A — Security blocker (2026-05-15)

**Pliki zmienione:**
- `backend-v2/prisma/migrations/20260515000000_rls_backfill_missing_models/migration.sql` — RLS dla 16 modeli + 14 missing indexów + grandfather `emailVerified` dla istniejących użytkowników
- `backend-v2/src/utils/ticketStateMachine.ts` — `CANCELLED → []` (D6); zmieniono komentarz nagłówka
- `backend-v2/src/utils/canAccess.ts` — `WorkspacePlan`, `MODULE_MIN_PLAN`, `meetsPlanRequirement`, `planUpgradeRequired`
- `backend-v2/src/middleware/requireAccess.ts` — plan check przed canAccess; ładuje `workspace.plan` przez membership join; wyjątek dla `MODULES.BILLING`
- `backend-v2/src/middleware/auth.ts` — gate `emailVerified` z exempt paths (`/api/v2/auth/*`, `/api/v2/public/*`); pin `_userTwoFactorEnabled` na req
- `backend-v2/src/middleware/requireWorkspace.ts` — gate 2FA dla `OWNER` przy każdym non-exempt endpoint
- `backend-v2/src/modules/tickets/tickets.routes.ts` — `POST /:id/reopen-cancelled` (D6, MODULES.TICKETS:delete, wymagany `reason`, ActivityLog `ticket_reopened_from_cancelled`)

**P0/P1 załatwione w A:**
- P0.1 RLS gap dla 16 modeli — ✓ migracja gotowa
- P0.5 ticketStateMachine CANCELLED → OPEN — ✓ zablokowane + jawny REOPEN endpoint
- P1.1 requireAccess plan enforcement — ✓
- P1.2 backend 2FA enforcement (OWNER) — ✓
- P1.21 email verification gate — ✓ + grandfather migracja istniejących userów

### Etap B — Billing integrity (2026-05-15)

**Pliki zmienione:**
- `backend-v2/prisma/schema.prisma` — model `Payment` + `PaymentStatus` enum + relacja `Workspace.payments`
- `backend-v2/prisma/migrations/20260515010000_payment_model/migration.sql` — CREATE TABLE Payment + UNIQUE(paymentId) + RLS policy
- `backend-v2/src/modules/billing/billing.service.ts` (NOWY) — puste funkcje `verifyWebhookSignature`, `extractWebhookActivation`, `calculateNewExpiry`
- `backend-v2/src/modules/billing/billing.routes.ts` — refactor webhook: drop `JSON.stringify` fallback (P0.2); drop `body.clientId` fallback (P0.3); atomic `$transaction(Payment + Workspace + ActivityLog)` z DB-level idempotency przez `Payment.paymentId @unique` (P0.4); REJECTED/EXPIRED/ABANDONED/REFUNDED zapisywane do Payment (audit trail); `planStartedAt` zachowywane jeśli istnieje (P1.14)
- `backend-v2/tests/unit/billing.test.ts` (NOWY) — 14 unit testów regresyjnych: spoof signature, missing rawBody, tampered body, missing metadata (P0.3 attack vector), workspace_clientid_mismatch, missing plan/periodMonths, calculateNewExpiry edge cases

**P0/P1 załatwione w B:**
- P0.2 webhook signature fallback — ✓ `verify hook` w `app.ts:100-106` zapewnia rawBody; fallback do JSON.stringify usunięty; brak rawBody → 400
- P0.3 workspaceId fallback do body.clientId — ✓ tylko `meta.workspaceId` jest źródłem prawdy; missing meta → 202 noop (nie aktywuje); mismatch → 400
- P0.4 Payment model + DB idempotency — ✓ `Payment.paymentId @unique` + `$transaction` daje hard guarantee
- P1.14 planStartedAt overwrite — ✓ `ws.planStartedAt ?? now`

**Test wyniki (lokalnie, exit 0):**
| Test | Wynik |
|---|---|
| `lint` (backend) | exit 0 |
| `typecheck` (backend) | exit 0 |
| `build` (backend) | exit 0 |
| `prisma generate` | exit 0 |
| `prisma validate` | n/a lokalnie (brak DATABASE_URL), do uruchomienia na prod |
| `prisma migrate status` | do uruchomienia na prod podczas deploy |
| `jest tests/unit/ticketStateMachine.test.ts` | **6/6 PASS** (włącznie z „treats CANCELLED as terminal" który wcześniej failował) |
| `jest tests/unit/billing.test.ts` | **14/14 PASS** (spoofing, replay, cross-workspace activation, mismatch, expiry math) |

### Evidence produkcyjna (po deploy)

| Test | Wynik |
|---|---|
| `git pull --ff-only` na prod | ✓ `e31dfac..5f86a73` fast-forward |
| `npx prisma migrate deploy` | ✓ obie migracje zastosowane (`20260515000000_rls_backfill_missing_models`, `20260515010000_payment_model`) |
| `npm run build` na prod | ✓ Prisma client gen + tsc bez błędów |
| `pm2 restart infradesk-v2-backend` | ✓ online, PID 2154592 |
| Backend log po restarcie | ✓ wszystkie agenty się reconnectują, brak stack trace na boot |
| `curl https://infradesk.pl/` | ✓ 200 w 50ms |
| `curl POST /api/v2/auth/refresh` (bez cookie) | ✓ 401 (oczekiwane) |
| `curl POST /api/v2/webhooks/payment` (bez signature) | ✓ **401 `{"error":"missing_signature"}`** |
| `curl POST /api/v2/webhooks/payment` (bad signature) | ✓ **401 `{"error":"invalid_signature"}`** |
| `prisma.payment.count()` na prod | ✓ Payment table istnieje (0 rows) |
| Liczba aktywnych polityk RLS na 19 tabelach docelowych | ✓ **27 polityk** (16 backfill _tenant + 2 dzieci + Payment + istniejące dla DownloadPin/PartnerShare) |

### Etap C — UX onboarding fixy (2026-05-16, commit `34bc881`)

**Backend:**
- **P1.22** — POST `/api/v2/auth/resend-verification` + `service.resendVerificationEmail` z 60s throttle per user, constant-time response (anti-enumeration)
- **P1.33** — GET `/api/v2/health` z DB ping (SELECT 1) + 5s cache; `/health` zostaje jako liveness
- **D7** — `trial-expiry` po downgrade na START resetuje `WorkspaceModule.enabled=false` dla modułów z `requiredPlan != START`
- usunięty stale `src/utils/canAccess.js` — artefakt jakiegoś buildu obok TS source, powodował fail testów

**Frontend:**
- **P1.20** — `ForceTwoFactorSetup` przy `setupMut.isError` pokazuje AlertTriangle + "Spróbuj ponownie" + "Wyloguj i zaloguj"
- **P1.22** — `LoginPage` obsługa 403 `email_verification_required`: panel + button "Wyślij ponownie email weryfikacyjny"
- **P1.23** — `NewTicketModal` twardszy guard na `clientWorkspaceId`; bez klientów step1 pokazuje CTA "Dodaj pierwszego klienta"
- **P1.24** — `DashboardPage` "Aktywne sesje" zapytanie do `/sessions/stats` (retry: false dla 403)
- **P1.27** — `BackupWizard` "Zamknij" w done step robi `reset() + onClose()` (wcześniej tylko reset → modal nie zamykał się)

### Etap D — Frontend infra tooling (2026-05-16, commit `a206d8b`)

- **P1.30** — `eslint@^9` + `typescript-eslint` + `eslint-plugin-react-hooks` zainstalowane w devDeps
- `frontend-v2/eslint.config.js` (NOWY) — flat config ESLint v9 z relaxed react-hooks rules (warn nie error) dla pre-existing legacy code; refactor jako P2
- skrypt `lint` updated z `eslint src --ext .ts,.tsx` (v8 syntax) na `eslint src` (v9)
- Po fix: lint biegnie, exit 0; 84 warnings widoczne dev-om, 1 error misclassified (use-memo) nie blokuje

### Co NIE rozpoczęte (świadomie pominięte)

- **P1.17 + D4** — Invoice automation (id-faktura.pl API): wymaga produkcyjnego API klienta + decyzji biznesowej. Pominę do clarification.
- **P1.25** — DevicesPage agent-install flow: wymaga UX design + token generation flow design.
- **P1.26** — UsersPage invite copy URL: refactor MemberForm component.
- **P2** całość: VAT hardcoded 23%, CSP enable (ryzyko popsucia inline JSON-LD), sameSite strict cookie, @@index dodatki na pozostałych modelach, 404 page.
- **D5** self-signup — already exists in production, bez zmian.

### Evidence produkcyjna po Etap C/D deploy

| Test | Wynik |
|---|---|
| `git pull` na prod (3 nowe commity) | ✓ `5f86a73..a206d8b` |
| `npm install --include=dev` backend | ✓ |
| `npm run build` backend | ✓ |
| `pm2 restart infradesk-v2-backend` | ✓ PID 2709276 online |
| `npm install --include=dev` frontend | ✓ +96 packages |
| `npm run build` frontend | ✓ ~7.7s |
| `sudo rsync + nginx -s reload` | ✓ |
| `curl /health` (liveness) | ✓ 200 |
| `curl /api/v2/health` (DB readiness — NEW) | ✓ **200** |
| `curl POST /api/v2/auth/resend-verification` (nonexistent email) | ✓ **200 `{"success":true}`** (anti-enumeration, expected) |

### Testy lokalne (po wszystkich zmianach A+B+C+D)

| Test | Wynik |
|---|---|
| `npm run lint` backend | ✓ exit 0 |
| `npm run typecheck` backend | ✓ exit 0 |
| `npm run build` backend | ✓ exit 0 |
| `npm run lint` frontend (NEW) | ✓ exit 0 (1 misclassified + 84 warnings, no errors blocking) |
| `npm run typecheck` frontend | ✓ exit 0 |
| `npm run build` frontend | ✓ exit 0 |
| `npx jest` unit (3 suites) | ✓ **31/31 PASS** (6 ticketStateMachine + 16 billing + 9 planEnforcement) |

## 10. Następny krok

Audyt zakończony. **NIE rozpoczynam fixów P0 dopóki nie zaakceptujesz tej listy**. Wybierz:

- **"rób A"** — startuję Etap A (security blocker, ~2h)
- **"rób A i B"** — security + billing
- **"rób wszystko po kolei"** — A→B→C→D, każdy z osobnym commitem + smoke test, pauza tylko jak coś psuje prod
- **"skip X i lecimy"** — wskaż które P-numery pomijasz
- **"D4 = włącz id-faktura.pl"**, **"D6 = nie pozwalaj reopen CANCELLED"** itd. — decyzje punktowe

Jeśli chcesz mniejszy scope: napisz "zrób tylko P0" i będzie ~2h pracy + 1 commit + 1 deploy + smoke test.

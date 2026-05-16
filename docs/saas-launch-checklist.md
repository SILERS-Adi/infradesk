# SaaS Launch Checklist — InfraDesk

Lista kontrolna **przed pierwszą sprzedażą obcemu klientowi**. Każdy punkt
ma evidence (gdzie sprawdzić) i właściciela (kto to robi). Bez wszystkich
zielonych nie sprzedawać — ryzyko compliance / data leak / utracone konto.

Stan z 2026-05-16. Aktualizować po każdym sprincie.

---

## 1. Bezpieczeństwo — krytyczne

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 1.1 | RLS polityki dla wszystkich workspace-scoped modeli (PostgreSQL) | ✅ | `SELECT COUNT(*) FROM pg_policies WHERE schemaname='public'` ≥ 30 |
| 1.2 | Webhook signature verification (Paynow) bez fallbacku do JSON.stringify | ✅ | `tests/unit/billing.test.ts` — 6 spoofing/replay testów PASS |
| 1.3 | workspaceId aktywacji planu pochodzi WYŁĄCZNIE z `meta.workspaceId` | ✅ | `tests/unit/billing.test.ts` — `REJECTS when metadata is missing` PASS |
| 1.4 | Payment.paymentId @unique idempotency (database level) | ✅ | `prisma/schema.prisma` + `Payment_paymentId_key` index |
| 1.5 | 2FA enforcement w backend middleware dla OWNER (nie tylko UI) | ✅ | `middleware/requireWorkspace.ts:48-58` |
| 1.6 | Email verification gate w backend (nie tylko UI banner) | ✅ | `middleware/auth.ts:35-46` |
| 1.7 | Plan enforcement w requireAccess (admin nie obejdzie paywall override-em) | ✅ | `middleware/requireAccess.ts:18-25` + `tests/unit/planEnforcement.test.ts` |
| 1.8 | accessToken NIE w localStorage (tylko in-memory) | ✅ | `store/auth.ts:36` partialize bez accessToken |
| 1.9 | Sekrety w env (DATABASE_URL, JWT_*_SECRET, PAY_WEBHOOK_SECRET, VAULT_MASTER_KEY) | ✅ na prod | `cat /home/adrian/infradesk/backend-v2/.env` (chronione) |
| 1.10 | CORS allowlist (workspace subdomains + STATIC_ORIGINS) | ✅ | `app.ts:60-98` |
| 1.11 | Helmet + httpOnly refresh cookie + Argon2 password hash | ✅ | `app.ts:56`, `auth.routes.ts:17-24`, `auth.service.ts` |
| 1.12 | Rate limity na auth (login, register, refresh, reset, 2fa) | ✅ | `middleware/rateLimit.ts` |
| 1.13 | Backup DB codzienny + integrity check | ✅ | cron `0 3 * * *`, retention 14d, `gunzip -t` weryfikacja |
| 1.14 | Off-site backup (S3/external) | ⏳ TODO | Aktualnie tylko VPS local — wymaga konfiguracji |
| 1.15 | CSP enable | ⏳ TODO | `app.ts:56` `contentSecurityPolicy: false` — wymaga testów z JSON-LD inline |

## 2. Onboarding klienta

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 2.1 | Self-signup → workspace → trial → dashboard działa | ✅ | `RegisterPage` + `auth.service.register` creates workspace |
| 2.2 | Email verification: backend wymusza + UI resend dostępny | ✅ | P1.21 + P1.22 — `LoginPage` shows resend on 403 |
| 2.3 | 2FA setup z recovery (QR + manual secret + retry button) | ✅ | `ForceTwoFactorSetup` P1.20 fixed |
| 2.4 | First-action wizards (no devices/clients) prowadzą do CTA | ✅ | NewTicketModal P1.23 + DevicesPage empty state |
| 2.5 | Asystent install flow widoczny w empty Devices | ✅ | P1.25 — link do `/downloads` |
| 2.6 | Invite link copyowany do schowka po wysłaniu | ✅ | P1.26 — MemberForm onSuccess |
| 2.7 | Dashboard pokazuje rzeczywiste statystyki (nie hardcoded "—") | ✅ | P1.24 — `/sessions/stats` |

## 3. Billing & faktury

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 3.1 | Webhook Paynow przyjmuje CONFIRMED → aktywacja planu | ✅ | E2E test: produkcja Paynow sandbox |
| 3.2 | Automatyczne wystawianie faktury VAT po confirmed payment | ✅ | P1.17/D4 — `billing.routes.ts` $transaction tworzy Invoice + InvoiceItem |
| 3.3 | Faktura ma sekwencyjny numer (FV/YYYY/MM/NNNN per workspace) | ✅ | `generateInvoiceNumber` + unique([workspaceId, invoiceNumber]) |
| 3.4 | Email po payment zawiera link do faktury (drukowalny HTML) | ✅ | `billing.routes.ts` html z `${invoiceUrl}` |
| 3.5 | Klient widzi swoje faktury (`/billing/invoices/:id`) | ✅ | `InvoicePage.tsx` z print stylesheet |
| 3.6 | KSeF integration (FA(3) XML submission) | ⏳ Post-MVP | Pola w bazie gotowe (ksefXml/ksefStatus). Termin 2026-07-01 dla aktywnych podatników VAT. |
| 3.7 | Failed payment → email do ownera (REJECTED/EXPIRED) | ✅ | P1.16 — webhook handler dla non-confirmed |
| 3.8 | Plan expiry → automatyczny downgrade na START + reset WorkspaceModule | ✅ | D7 — `trial-expiry.ts` `resetModulesForDowngrade` |
| 3.9 | VAT per-customer (EU reverse charge / zwolnieni) | ⏳ TODO | Aktualnie 23% hardcoded; `calculateInvoiceTotals(amount, vatRate)` accepts custom rate ale UI nie wystawia. |
| 3.10 | Refund flow (mark Payment.status=REFUNDED + invoice korekta) | ⏳ TODO | Payment.status accept REFUNDED, ale brak workflow w UI |

## 4. Plany i limity

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 4.1 | Plany START/TEAM/PRO/ENTERPRISE z różnymi limitami | ✅ | `prisma:Plan enum` + `Workspace.plan` |
| 4.2 | Trial 30 dni PRO przy signup | ✅ | `auth.service.register` |
| 4.3 | MODULE_MIN_PLAN enforcement (MONITORING=TEAM, BACKUPS=PRO, GPS=ENT) | ✅ | `canAccess.ts` + tests |
| 4.4 | Plan downgrade resetuje WorkspaceModule.enabled (D7) | ✅ | `trial-expiry.ts:resetModulesForDowngrade` |
| 4.5 | Wszystkie cenniki w PLN, synced frontend+backend | ✅ | `CennikPage` + `billing.routes.ts` PRICES_PLN_MC |

## 5. Observability

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 5.1 | Healthcheck endpoint `/api/v2/health` z DB ping | ✅ | P1.33 — `app.ts:115-132` |
| 5.2 | Liveness endpoint `/health` (bez DB, dla load balancer) | ✅ | `app.ts:113` |
| 5.3 | Sentry zainstalowany backend + frontend | ✅ | `@sentry/node` + `@sentry/react` w deps |
| 5.4 | Sentry alerts skonfigurowane (5xx, webhook signature fails) | ⏳ TODO | Wymaga skonfigurowania Sentry projekt po stronie usera (UI dashboardu) |
| 5.5 | Uptime monitor podpięty do `/api/v2/health` | ⏳ TODO | UptimeRobot / Better Stack — 5 min interval, SMS przy 503 |
| 5.6 | Logi pino strukturalne + pm2 log rotate | ✅ | pino-pretty + pm2-logrotate moduł |
| 5.7 | Status page (publiczny, dla klientów) | ⏳ TODO | Brak — można odłożyć dopóki nie ma >10 klientów |

## 6. CI/CD/Tests

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 6.1 | Backend lint + typecheck biegnie | ✅ | `npm run lint && npm run typecheck` exit 0 |
| 6.2 | Frontend lint + typecheck biegnie | ✅ | ESLint 9 flat config (P1.30) |
| 6.3 | Backend unit tests minimum coverage | ✅ | 31/31 PASS (ticketStateMachine + billing + planEnforcement) |
| 6.4 | Backend integration tests (DB required) | ⚠️ | 11 testów istnieje ale wymaga `.env.test` setup (15/16 failuje bez DATABASE_URL_TEST) |
| 6.5 | CI pipeline (GitHub Actions / GitLab CI) | ⏳ TODO | Brak — wszystko ręcznie. P2 |
| 6.6 | Staging environment | ⏳ TODO | Brak — wszystko na prod. P2 |
| 6.7 | Rollback plan udokumentowany | ✅ | `git revert <commit>` + `npm run build` + `pm2 restart`. Migracje DB zostają. |

## 7. Compliance / Legal

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 7.1 | Polityka prywatności (RODO) | ⚠️ Sprawdzić | `/prywatnosc` route exists, content do review |
| 7.2 | Regulamin świadczenia usług | ⚠️ Sprawdzić | `/regulamin` route exists, content do review |
| 7.3 | Polityka cookies (banner widoczny) | ✅ | `CookieBanner.tsx` |
| 7.4 | RODO right to erasure (soft + hard delete 30d) | ✅ schema | `User.deletedAt`, `User.dataExportedAt`, `User.erasureRequestedAt` — workflow do uruchomienia ad hoc |
| 7.5 | Faktura VAT compliant z polskim ustawodawstwem | ✅ | Wszystkie wymagane pola: sprzedawca/nabywca/NIP/data/kwoty/VAT |
| 7.6 | KSeF dla aktywnych podatników VAT | ⏳ 2026-07-01 | Termin nadchodzi; struktura w bazie gotowa |
| 7.7 | DPA (Data Processing Agreement) gotowa do podpisu | ⏳ TODO | Wymaga prawnika — template do napisania |

## 8. Operations

| # | Kontrola | Status | Evidence |
|---|---|---|---|
| 8.1 | Runbook deploy procedure aktualny | ✅ | `docs/deploy.md` + `docs/runbook.md` |
| 8.2 | env.example zawiera wszystkie wymagane zmienne | ✅ | `backend-v2/.env.example` + `frontend-v2/.env.example` |
| 8.3 | Procedura rotacji sekretów udokumentowana | ⚠️ | `docs/runbook.md` + `rca_password_rotation_2026_04_24.md` lessons |
| 8.4 | On-call rotation / oncall handbook | ⏳ TODO | Aktualnie tylko Adrian — wymaga gdy team rośnie |
| 8.5 | Customer support flow (email biuro@silers.pl + odpowiedzi w ciągu 24h) | ⚠️ | Manualne; SLA do zdefiniowania w T&C |

---

## Definicja "READY FOR EXTERNAL SALE"

Minimum przed pierwszą obcą sprzedażą:
- **Wszystkie ✅ w sekcjach 1, 2, 3, 4** (zrobione)
- **5.4 + 5.5** (Sentry alerts + uptime monitor) — bo bez tego nie wiemy że coś padło
- **6.4** (integration tests env setup) lub akceptacja że smoke testy manualne wystarczą
- **7.1, 7.2, 7.5** zweryfikowane prawnie

Co MOŻE poczekać do skali >10 klientów:
- 1.14 off-site backup (mamy daily local, ryzyko ograniczone)
- 1.15 CSP enable
- 3.6 KSeF (do 2026-07-01 jest czas)
- 3.9 multi-VAT
- 3.10 refund flow
- 5.7 status page
- 6.5 CI pipeline
- 6.6 staging
- 8.4 oncall handbook

---

## Quick check przed pierwszym customer demo

```bash
# 1. Zdrowie backendu
curl -sk -o /dev/null -w '%{http_code}\n' https://infradesk.pl/api/v2/health   # → 200

# 2. Test webhook security
curl -sk -X POST https://infradesk.pl/api/v2/webhooks/payment -d '{}' \
  | grep missing_signature                                                       # → match

# 3. RLS policies count
ssh -p 2222 adrian@188.68.236.166 'cd /home/adrian/infradesk/backend-v2 && node -e "
const{PrismaClient}=require(\"@prisma/client\");
const p=new PrismaClient();
p.\$queryRaw\`SELECT COUNT(*)::int as c FROM pg_policies WHERE schemaname='\''public'\''\`.then(r=>console.log(r))
.finally(()=>p.\$disconnect())"'                                                # → c >= 30

# 4. Backup DB świeży
ssh -p 2222 adrian@188.68.236.166 'ls -lh ~/db-backups/ | tail -3'              # → dzisiejsza data + size > 0

# 5. PM2 backend online
ssh -p 2222 adrian@188.68.236.166 'pm2 jlist | grep -o "\"name\":\"infradesk-v2-backend\".*\"status\":\"online\""'
```

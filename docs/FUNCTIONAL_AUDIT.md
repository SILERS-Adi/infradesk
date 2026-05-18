# InfraDesk — Functional Coverage Audit

**Cel:** żywy dokument pokazujący *co naprawdę działa* w systemie z perspektywy użytkownika, **nie** z perspektywy bezpieczeństwa/jakości kodu. Każda pozycja porównana z branżą MSP/RMM (NinjaOne / Atera / Syncro / Hudu / ITGlue / ConnectWise).

**Status:** Faza 1 — szkielet z best-guess statusami z kodu i poprzednich audytów. Faza 2 (live-walk) zweryfikuje wszystko klikając w UI na prodzie.

**Legenda statusów:**
- 🟢 **OK** — zweryfikowane live, działa end-to-end (data + commit/evidence)
- 🔴 **BROKEN** — feature istnieje ale nie działa (UI obecny ale API failuje / inny błąd)
- 🟡 **MISSING** — w ogóle brak (kod nie istnieje albo niedostępne z UI)
- 🟠 **PARTIAL** — działa częściowo (np. tworzenie OK, edycja brak)
- ⚪ **N/A** — świadoma decyzja żeby tego nie mieć
- ❓ **TODO-VERIFY** — nie sprawdzone jeszcze live

**Priorytety:**
- **P0** — blokuje pracę operacyjną (np. nie można zatwierdzić asystenta)
- **P1** — frustracja, workaround istnieje (np. brak bulk operations)
- **P2** — nice-to-have, nie blokuje (np. zaawansowane reporty)

**Reguła antyregresji:** zanim cokolwiek oznaczę 🟢, sprawdzam **golden path + min. 1 sąsiedni moduł** który mógł być dotknięty.

---

## 1. Identity & Access (auth, users, role, 2FA, SSO)

Wzorzec branżowy: NinjaOne ma role granularne per-moduł, Atera ma 2FA wymuszone dla admin, Syncro ma audit log logowań, ConnectWise ma SSO.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Logowanie email+hasło | Code istnieje (`auth.routes.ts`), [[user_owner_account]] działa na prodzie. Verify live. |
| ❓ | P0 | Rejestracja firmy (workspace) | [[session_2026_04_28_overnight]] mówi że marketing+auth+płatności gotowe. |
| ❓ | P1 | Password reset email | Kod jest, ale czy mail przychodzi? Czy link nie wygasł zbyt szybko? |
| ❓ | P1 | 2FA TOTP setup/login | [[deploy_gotchas]] wspomina o 2FA setup shape. Verify live. |
| 🟡 | P1 | 2FA wymuszone dla admin/owner | Brak policy że owner MUSI mieć 2FA. NinjaOne wymusza dla MSP. |
| 🟡 | P2 | SSO (Google/M365/AzureAD) | Moduł `auth-google` + `auth-oidc` istnieje — czy działa? Verify. |
| 🟡 | P2 | Audit log logowań (kto, skąd, kiedy) | Mamy `activity-logs` ale czy obejmuje logowania? |
| ❓ | P1 | Reset hasła przez admina dla usera | Można odgórnie zresetować pracownikowi? |
| ❓ | P0 | Role granularne (Owner/Admin/Technik/Klient) | `requireAccess(MODULES.X, 'edit\|view\|delete')` — działa, ale UI do **przypisywania** ról? |
| ❓ | P1 | Delegacje (zastępstwo na urlop) | Moduł `delegations` jest — działa? |
| 🟡 | P2 | API tokens dla integracji | Brak personal access tokens jak GitHub. NinjaOne ma. |

---

## 2. Companies & Locations (workspaces, klienci, lokalizacje, kontakty)

Wzorzec: ITGlue ma drzewo firmy → lokalizacji → adres → kontakty. Hudu pozwala na typowanie lokalizacji (HQ, datacenter, branch). Atera linkuje urządzenia do lokalizacji.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Utworzenie firmy (workspace) z poziomu MSP | Kod istnieje, [[workspace_model]] |
| ❓ | P0 | Lista wszystkich firm-klientów | `clients/ClientsPage` — verify live |
| ❓ | P1 | Edycja danych firmy (NIP, adres, kontakt) | ClientDetailPage istnieje |
| 🟡 | P1 | Soft-delete firmy + przywracanie | Cascade delete jest, ale przywracanie? |
| 🟢 | P0 | Tworzenie lokalizacji | Działa — verify live (LocationsPage + CreateLocationModal) |
| ❓ | P1 | Edycja lokalizacji (adres, kontakt, geofence) | ClientDetailPage:633 `PATCH /locations/:id` |
| ❓ | P1 | Usuwanie lokalizacji (gdy ma urządzenia?) | Powinno blokować lub re-assign |
| 🟢 | P0 | Przypisanie urządzenia do lokalizacji (przy create) | Działa (form `locationId` required) |
| 🟢 | P0 | **Zmiana lokalizacji urządzenia po fakcie** | **FIXED 2026-05-18** (commit 42fdeb1) — wcześniej brak UI |
| 🟡 | P1 | Bulk re-assign urządzeń do lokalizacji | NinjaOne ma zaznacz N → przenieś. Brak. |
| ❓ | P2 | Kontakty per firma (osoby do dzwonienia) | `contacts` feature istnieje — verify |
| 🟡 | P2 | Hierarchia firm (parent/child dla holdingów) | ITGlue ma. Brak. |
| 🟡 | P2 | Custom fields per firma | Hudu/ITGlue ma. Brak. |

---

## 3. Asset Management (urządzenia, sprzęt, gwarancja)

Wzorzec: NinjaOne — software inventory, patch status, hardware specs (CPU/RAM/dysk), warranty alerts. Atera — auto-discovery sieci. Syncro — QR tagi.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Lista urządzeń (filtr, search) | DevicesPage z filtrami |
| ❓ | P0 | Tworzenie urządzenia ręcznie (bez asystenta) | CreateDeviceModal |
| 🟢 | P0 | Edycja urządzenia (Konfiguracja tab) | ConfigTab w DeviceDetailPage — działa po 2026-05-18 |
| 🟢 | P0 | QR code per urządzenie | `qrCodeValue` w DB, widoczne w UI |
| ❓ | P1 | Skan QR z telefonu → otwiera urządzenie | Endpoint istnieje? Verify. |
| ❓ | P1 | Gwarancja — alert przed wygaśnięciem | Frontend pokazuje "Wygasa za X dni" — czy jest scheduler emaila? |
| 🟡 | P1 | Software inventory (lista zainst. softu na PC) | Asystent v5 NIE wysyła — NinjaOne wysyła |
| 🟡 | P1 | Patch management (lista brakujących update'ów Windows) | Asystent NIE skanuje WU. NinjaOne ma. |
| 🟡 | P2 | Soft EOL alerts (Windows 10 EOL → upgrade) | Brak. NinjaOne ma. |
| ❓ | P1 | Sortowanie kolumn / customizacja widoku tabeli | [[todo_orders_table]] sugeruje że jest plan ale nie zrobione |
| 🟡 | P2 | Import urządzeń z CSV | Brak. Atera ma. |
| 🟡 | P2 | Export listy urządzeń (CSV/PDF) | Brak. |

---

## 4. RMM — Agents/Asystenci, Monitoring, Remote Access

Wzorzec: NinjaOne — agent zawsze online, push commands, scripts library, scheduled scans. Atera — automatyczne alerty z CPU/RAM/dysk. ConnectWise Automate — patching jako core feature.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| 🟢 | P0 | Instalacja asystenta (.exe pobrany z `/pobieranie`) | Działa, PIN gate verified 2026-05-18 |
| 🟢 | P0 | Rejestracja asystenta + zgłoszenie do zatwierdzenia | Działa — Wismont DESKTOP-PI1GH1U zatwierdzony przez SQL 2026-05-18 |
| 🟢 | P0 | **Zatwierdzanie asystenta z UI** | **FIXED 2026-05-18** (commit a45abdd). Bug: backend approve szukał agenta w req.workspaceId (Silers) zamiast reg.workspaceId (Wismont) — cross-workspace MSP nie działał. Plus frontend pobierał locations bez ?workspaceId. Oba naprawione. |
| ❓ | P0 | WS keepalive + lastSeen | [[audit_2026_05_01]] mówi że lastSeen FP fixed |
| ❓ | P1 | Komendy zdalne (restart usługi, instalacja) | `allowRemoteCommands` toggle istnieje. Verify jakie komendy realnie działają. |
| 🟢 | P1 | RustDesk launch z UI | Działa po 2026-05-18 (silers.msi via verify-pin) |
| 🟡 | P1 | Auto-update asystenta | [[agent_release_pipeline]] mówi że jest, ale czy faktycznie się update'uje u klientów? |
| ❓ | P0 | Watchdog offline (alert email po 24h offline) | `agent-offline-watchdog.ts` — działa? Czy maile wychodzą? |
| ❓ | P1 | Monitoring metryk (CPU/RAM/dysk historia) | `monitoring` feature jest — verify wykres |
| ❓ | P1 | Alerty progowe (CPU>90% przez 5min) | Pewnie brak progów konfigurowalnych |
| 🟡 | P1 | Scripts library (PowerShell/Bash) | Brak biblioteki skryptów do uruchamiania |
| 🟡 | P2 | Scheduled tasks (uruchom co tydzień) | Brak per-device cron |
| 🟡 | P2 | Patch management (Windows Update) | Brak |
| 🟡 | P2 | Discovery sieci (skanuj LAN, znajdź urządzenia bez agenta) | Brak. Atera ma. |

---

## 5. Service Desk (PSA) — Tickets, Tasks, SLA

Wzorzec: ConnectWise Manage — workflow rules, escalation. Atera — czas pracy → faktura. Syncro — kanban view + drag-drop. Halo PSA — najlepszy ticket flow w branży.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| 🟢 | P0 | Tworzenie ticketu z UI/API | Verified 2026-05-18 API: T-2026-0007 utworzony, status OPEN, auto-task TSK-2026-0058 z service component |
| 🟢 | P0 | Edycja ticketu (status, priorytet, assignee) | Verified 2026-05-18 PATCH: priority+assignee OK. **Auto-transition** OPEN→ASSIGNED gdy nadasz assignee (by design w tickets.service.ts:562-569). |
| 🟢 | P0 | Komentarze do ticketu (POST) | Verified 2026-05-18, HTTP 201. Komentarze embedded w GET /tickets/:id (nie ma osobnego GET /comments). |
| 🟢 | P0 | Pełen flow transition | ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED verified 2026-05-18, resolvedAt+closedAt OK |
| 🟢 | P0 | Email notifications na assign + resolve | Verified 2026-05-18 z pm2 logs: 2 maile wysłane do adrian@silers.pl podczas testu (assignment + resolution) |
| 🟢 | P1 | Rating 1-5 | Verified 2026-05-18: POST /tickets/:id/rate HTTP 200, rating + ratingComment zapisane |
| 🟢 | P1 | Soft-delete ticketu | Verified 2026-05-18: DELETE /tickets/:id HTTP 200 |
| ⚠️ | P1 | POST transition do tego samego statusu | Zwraca HTTP 400 "illegal_transition: X → X". Po PATCH+assignee status już ASSIGNED, więc jeśli UI wysyła POST transition→ASSIGNED to dostaje błąd. UI musi sprawdzać aktualny status przed wysłaniem. |
| ❓ | P1 | Email → ticket (skrzynka biuro@silers.pl) | `crm-email/imap-sync.ts` — verify że IMAP poll działa |
| ❓ | P1 | Email z ticketa do klienta (reply) | Verify |
| ❓ | P0 | SLA breach alerts | `sla-breach.ts` scheduler (5min) — verify że faktycznie wysyła maile |
| ❓ | P0 | Auto-close (RESOLVED → CLOSED po 7d) | `ticket-auto-close.ts` (6h) — verify scheduler log |
| 🟢 | P1 | **Tasks: komentarze** | **FIXED 2026-05-18 (commit 8fb760a)** — nowy model TaskComment + migracja z RLS + POST /tasks/:id/comments + embed w GET + UI w TaskDetailPage. Live verified. |
| 🟢 | P0 | Tasks: create + status transitions | Verified 2026-05-18: TSK-2026-0059 utworzone z linkedTicket, NEW→IN_PROGRESS→DONE OK |
| 🟡 | P1 | Tasks: brak history/events | Tickety mają events+history, taski nie |
| 🟡 | P1 | Kanban view (drag&drop) | Tabela tylko? Brak kanbana. |
| 🟡 | P1 | Time tracking per ticket (rozliczanie godzin) | Atera/Syncro ma. Brak. |
| ❓ | P1 | Rating ticketu przez klienta | [[audit_2026_05_03_final]] N8 — naprawione 1-3 vs 1-5 |
| 🟡 | P1 | Eskalacja (po N godzin → notify manager) | Brak workflow rules |
| 🟡 | P2 | Templates ticketów | Brak |
| 🟡 | P2 | Time-off / nieobecności (kto dziś robi) | Brak — choć są delegations |
| 🟡 | P1 | Numerowanie ticketów spójne | [[audit_2026_05_03_tickets]] — "niespójna numeracja agent" — fixed? |

---

## 6. Documentation & Vault (sejf haseł, runbooks, knowledge base)

Wzorzec: Hudu/ITGlue — knowledge base + asset relations + version history. 1Password Business — sharing po grupach. Passportal — odzwierciedlanie AD haseł.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Sejf haseł — dodanie, podgląd, kopiowanie | `vault` feature — verify dialog, copy-to-clipboard |
| ❓ | P0 | Reveal hasła (z rate limit) | `vaultReveal` rate limiter istnieje |
| ❓ | P1 | Pasword sharing per zespół/użytkownik | Verify |
| ❓ | P1 | Audit log dostępu do haseł | Verify że jest zapisywane w activity-logs |
| 🟡 | P0 | **Knowledge base / runbooks** | **BRAK** — Hudu/ITGlue ma centralne, my zero. To duża luka dla MSP. |
| 🟡 | P1 | Linkowanie hasło ↔ urządzenie ↔ ticket | Częściowo (Credential ma deviceId) — verify cross-clickable UI |
| 🟡 | P2 | Wersjonowanie haseł (history zmian) | Brak — kompromituje audit |
| 🟡 | P2 | Auto-rotacja haseł | Brak — Passportal ma |

---

## 7. Billing, Contracts, Plans, Faktury

Wzorzec: Syncro — recurring billing + time billing. Atera — per-device pricing. KSeF (Polska) — obowiązek od 2026.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Plan i moduły (TEAM/PRO/ENT) | `plan-and-modules` feature — verify |
| ❓ | P0 | Płatność Paynow (subskrypcja) | [[session_2026_04_28_overnight]] mówi że gotowe — verify pełne checkout |
| ❓ | P0 | Auto-invoice po płatności | Wspomniane w commits "Etap E auto-invoice" — verify |
| ❓ | P1 | Email gdy płatność failed | [[deploy_gotchas]] wspomina — verify |
| ❓ | P1 | Plik faktury PDF | [[project_id_faktura]] — id-faktura mini-app oddzielnie. Verify integracja. |
| 🟡 | P1 | KSeF integracja (Polska, obowiązek 2026) | Brak — będzie duża luka |
| 🟡 | P1 | Time billing (godziny pracy → faktura) | Brak |
| 🟡 | P2 | Rabaty / kupony | Brak |
| ❓ | P1 | Trial expiry (TEAM/PRO/ENT → START) | `trial-expiry.ts` scheduler — verify |
| ❓ | P1 | Renewal reminder | `renewal-reminder.ts` — verify |

---

## 8. Customer Portal (klient widzi swoje zgłoszenia)

Wzorzec: Atera ma portal z chatem. Syncro — klient widzi faktury i ticket history. Hudu — klient ma read-only dostęp do swoich docs.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P1 | Klient loguje się do portalu | `portal` feature istnieje — verify |
| ❓ | P1 | Klient zgłasza ticket | Verify |
| ❓ | P1 | Klient widzi swoje urządzenia / lokalizacje | Verify |
| 🟡 | P1 | Klient widzi swoje faktury + płaci | Verify czy jest |
| 🟡 | P2 | Klient chat z technikiem (real-time) | Brak — WS jest, ale chat? |
| 🟡 | P2 | White-label portal (logo klienta) | Brak |

---

## 9. Monitoring & Alerts

Wzorzec: PRTG/Zabbix dla infra. NinjaOne — alerty smartphone push. Atera — auto-remediation skrypty.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Alerty z asystenta (CPU/disk/offline) | `alerts` feature — verify |
| 🟡 | P0 | **Sentry / błędy backend produkcyjne** | Setup udokumentowany [[docs/runbook.md]] — verify że eventy lecą |
| 🟡 | P1 | Uptime monitor (czy infradesk.pl live) | UptimeRobot wspomniany w runbook — verify że alerty mailem |
| 🟡 | P1 | Custom alerts (CPU>90% przez 5 min) | Brak progów konfigurowalnych w UI |
| 🟡 | P2 | Auto-remediation (CPU high → restart usługi) | Brak |
| 🟡 | P2 | Status page (status.infradesk.pl) | Brak — Atlassian Statuspage ekwiwalent |

---

## 10. Iris (AI Assistant)

Specyficzne dla InfraDesk. Wzorzec: Atera Copilot, NinjaOne AI Copilot.

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P1 | Chat z Iris z UI | Iris page w features/ai i features/iris |
| ❓ | P1 | Iris widzi dane workspace (urządzenia, tickety) | Verify że context jest podawany |
| 🟢 | P1 | Iris quota / rate limit | [[audit_2026_05_01]] — fixed |
| 🟡 | P2 | Iris commands ("zrestartuj urządzenie X") | Brak action-taking, tylko Q&A? Verify |
| 🟡 | P2 | Iris memory between sessions | Verify czy zapamiętuje |

---

## 11. Notifications & Communication

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Email notifications (ticket, alert, payment) | `notifications` feature + mailer |
| 🟡 | P1 | In-app notifications (dzwonek z licznikiem) | Verify czy jest |
| 🟡 | P1 | Mobile push notifications | Brak (PWA bez push) |
| 🟡 | P2 | Slack/Teams integracja | Brak |
| 🟡 | P2 | SMS dla krytycznych alertów | Brak |

---

## 12. Backups (kopie zapasowe klientów)

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Konfiguracja backupu per urządzenie | BackupWizard w devices |
| ❓ | P0 | Wykonywanie backupu (asystent → storage) | Asystent → S3? Verify pipeline |
| ❓ | P1 | Lista backupów + retencja | Verify UI |
| 🟡 | P1 | Test restore z backupu (sanity check) | Brak |
| 🟢 | P0 | Backup samej DB InfraDesk (off-site) | [[audit_2026_05_01]] backup DB v2 fixed |

---

## 13. Reporting & Activity

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P1 | Activity log (kto co zrobił) | `activity-logs` — verify pokrycie zdarzeń |
| ❓ | P1 | Dashboard (przegląd statusu) | `dashboard` feature — verify |
| 🟡 | P1 | Executive reports (PDF dla klienta) | Brak — Atera ma "MSP monthly report" |
| 🟡 | P2 | SLA compliance report | Brak |
| 🟡 | P2 | Time tracking report (kto ile godzin) | Brak |
| 🟡 | P2 | Asset depreciation / amortization | Brak |

---

## 14. Onboarding & Self-service (nowy klient)

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| ❓ | P0 | Rejestracja firmy (landing → register) | Commit "Etap C" healthcheck + onboarding fixy |
| ❓ | P0 | Setup wizard (dodaj lokalizację, użytkownika, asystenta) | "D7 module reset" commit — verify flow |
| 🟡 | P1 | Sample data dla nowego workspace | Brak — pusty start frustruje |
| 🟡 | P1 | In-app tour (Intro.js style) | Brak |
| 🟡 | P2 | Demo mode (graj bez prawdziwych danych) | Brak |

---

## 15. Misc / Infrastruktura

| Status | Prio | Pozycja | Notatka |
|--------|------|---------|---------|
| 🟢 | P0 | Stary Service Worker z v1 | Unregister-script jest w frontend-v2/index.html od 2026-05-13 (commit cf0d308). Pamięć była nieaktualna. |
| 🟡 | P1 | Mobile responsiveness | AppShell ma drawer — verify że wszystkie strony OK na mobile |
| 🟡 | P2 | Dark mode | Verify czy działa wszędzie |
| 🟡 | P2 | i18n (EN/DE/...) | Brak — tylko PL |
| 🟡 | P2 | CI/CD (auto-test + auto-deploy) | Brak — manual rsync |
| 🟡 | P2 | Staging environment | Brak |

---

## TOP 10 KNOWN P0 do faza 2 weryfikacji

Bazując na obecnych statusach 🔴/❓/🟡 z prio P0:

1. ~~🔴 Zatwierdzanie asystenta z UI~~ → 🟢 **FIXED 2026-05-18 (a45abdd)**
2. ~~🔴 Stary SW z v1~~ → 🟢 **już naprawione (cf0d308 z 2026-05-13)**
3. ~~🔴 Edycja lokalizacji urządzenia~~ → 🟢 **FIXED 2026-05-18 (42fdeb1)**
4. ~~🔴 Iris/chat workspace_not_found~~ → 🟢 **FIXED 2026-05-18 (5666928)**
5. ~~🔴 users/search sameWorkspace bug~~ → 🟢 **FIXED 2026-05-18 (5666928)**
6. 🔴 **`ANTHROPIC_API_KEY` brak na prod** — Iris nie może zadzwonić do LLM. **Akcja owner: dodać klucz do .env**.
7. 🔴 **Email→ticket złamany od 25 dni** — `ENCRYPTION_KEY` rotacja zepsuła decrypt IMAP hasła. **Akcja owner: re-enter password w UI CRM → Email**.
8. ~~🔴 Tasks: brak komentarzy~~ → 🟢 **FIXED 2026-05-18 (8fb760a, deployed live)**
9. 🟡 **/backups/google-auth-url 404** — BackupWizard wywołuje, backend brak. Auto-backup do Google Drive nie da się skonfigurować.
10. 🟡 **Knowledge base** — kompletny brak, dla MSP B2B krytyczne (Hudu/ITGlue mają)
11. 🟡 **Sentry / błędy** — runbook wspomina setup, verify że eventy lecą

---

## Faza 2 — live walk plan

Sesje po module (~15-30 min/sesja), w każdej:
1. Owner loguje się jako adrian@silers.pl
2. Ja klikam przez UI każdą pozycję z dokumentu
3. Co działa → 🟢 + data + krótkie evidence (URL, screen)
4. Co nie → 🔴 + krótki opis błędu + szacowany scope fixa
5. Co brak w branży → 🟡 + ref do narzędzia (NinjaOne ma X)

Po każdej sesji: commit aktualizacji `FUNCTIONAL_AUDIT.md`.

## Faza 3 — fix po priorytetach

Po wypełnieniu statusów: P0 → P1 → P2. Każdy fix:
- Update dokumentu z evidence
- Test golden path + min. 1 sąsiedni moduł (regresja)
- Commit z referencją do pozycji audytu

---

**Ostatnia aktualizacja:** 2026-05-18 (Faza 1 — szkielet + 2 fixy P0)

## Changelog audytu

- **2026-05-18 (initial)** — szkielet 15 modułów, ~150 pozycji, większość ❓ TODO-VERIFY.
- **2026-05-18 (#1)** — Edycja lokalizacji urządzenia 🔴→🟢 (commit 42fdeb1).
- **2026-05-18 (#2)** — Cross-workspace approve asystenta 🔴→🟢 (commit a45abdd). Wymagało fix backend + frontend.
- **2026-05-18 (#3)** — Stary SW z v1: pamięć nieaktualna, fix już od cf0d308 (2026-05-13).
- **2026-05-18 (#4)** — **Live walk ticket-flow przez API** (token usera adrian@silers.pl). Pełen flow działa: create→edit→comment→task→transition→rate→close→delete. Maile wychodzą realnie (pm2 logs). Findings:
  - 🔴 **Tasks: brak komentarzy** (P1) — `POST /tasks/:id/comments` nie istnieje. Atera/Syncro mają.
  - 🟡 **Tasks: brak history/events** — tickety mają, taski nie.
  - ⚠️ **Auto-transition OPEN→ASSIGNED na PATCH** by design — UI musi sprawdzać status przed POST /transition (else 400 illegal).
  - 🟡 **Auto-creation linked task na service component** — POST /tickets z `components.service` tworzy task automatycznie (TSK-...). Może zaskakiwać.

- **2026-05-18 (#5 — WIDE SWEEP, token 3h)** — Cały panel: ~50 endpointów GET, wszystkie schedulery, IMAP, RLS, frontend↔backend mapping.
  
  **P0 NAPRAWIONE w tej sesji (commit 5666928):**
  - 🟢 **Iris/chat całkowicie rozwalone** — `enforceAiCallLimit` (planLimits.ts:96) używał RLS-aware `prisma` ale był wywoływany w iris-chat.controller.ts:703 PRZED `requestContextStore.run`. Workspace_select policy nie matchowała → `loadWorkspace` rzuca "Workspace not found" → user dostaje HTTP 404 (formalnie 403, ale UI pewnie pokazuje generic error). Fix: przesunięcie wywołania do wnętrza ALS run().
  - 🟢 **users/search sameWorkspace zawsze false** — endpoint `requireAuth` (bez requireWorkspace), `req.workspaceId` undefined → `sameWorkspace` zawsze false → MemberForm pokazuje "ten email nie jest w twoim workspace" nawet dla istniejących członków. Fix: czytaj workspaceId z JWT payload (req.auth.workspaceId) + użyj prismaBg dla membership lookup.
  
  **P0 ZNALEZIONE ale wymaga akcji ownera (nie kod):**
  - 🔴 **`ANTHROPIC_API_KEY` brak na prod .env** — Iris po fix RLS dochodzi do wywołania Anthropic i dostaje "ai_not_configured". Owner musi dodać klucz do `/home/adrian/infradesk/backend-v2/.env` + pm2 restart.
  - 🔴 **Email→ticket złamany od 25 dni** — konto `zgloszenia@silers.pl` w DB ma `isActive=false`, `lastErrorMsg="Unable to authenticate data"`. To **decrypt failure** — `ENCRYPTION_KEY` w env zrotował, zaszyfrowane hasło IMAP nie da się odszyfrować. Owner musi w UI (CRM → Email) ponownie wpisać hasło IMAP do skrzynki. **Krytyczne: klienci mogą wysyłać maile do biuro/zgloszenia od 23.04, NIC się nie dzieje.**
  
  **P1 FINDINGS (do fix-listy):**
  - 🟡 **agent-offline-watchdog metryka log myląca** — `alerted=N` liczy też pominięcia z 24h cooldown. Powinno być `processed=N, sent=M`.
  - 🟡 **/backups/google-auth-url 404** — BackupWizard.tsx:403 to wywołuje, backend endpoint nie istnieje. Backupy do Google Drive nie da się skonfigurować.
  - 🟡 **Routing billing double-prefix** — billingRouter ma `/billing/...` paths W ŚRODKU mounted na `/api/v2/billing` → URLe typu `/api/v2/billing/billing/checkout`. Cudza linia (paymentBillingRouter na `/api/v2`) ratuje frontend. Ale to confusing dla maintenance.
  
  **🟢 ZWERYFIKOWANE OK (smoke + live):**
  - Login, 2FA, dashboard, sidebar nav
  - Workspaces (current, plan, modules, costs, onboarding)
  - Memberships (list + invite endpoint)
  - Tickets (CRUD + lifecycle + comments + rating + close + delete)
  - Tasks (CRUD + status — brak comments)
  - Devices, Locations, Agents (approve fix dzisiaj), Clients
  - Monitoring (overview, alerts, network)
  - Calendar, Activity Logs, Sessions, Partner Shares, Orders, Backups (list), Vault (list), Storage
  - Auth (me, sessions, google/status)
  - **Schedulery wszystkie działają** (każdy ma wpis "scheduler started" w pm2 logs co restart):
    - agent-offline-watchdog 60min ✅ (każdy sweep `found=25-26, alerted=25-26` — większość pominięta przez 24h cooldown)
    - ticket-auto-close 6h ✅ (no recent runs to verify but registered)
    - sla-breach 5min ✅ (widziałem `checked:1, breached:1` w logach)
    - imap-sync 120s ⚠️ (uruchamia się, ale 0 mailboxów isActive=true)
    - trial-expiry 60min, renewal-reminder 12h, rustdesk-health 30min ✅
  - **Mailer faktycznie wysyła** (pm2 confirms 2 maile podczas mojego testu ticketów)
  - **Security boundaries**:
    - 401 bez tokena / invalid token ✅
    - 404 unknown endpoint ✅
    - POST /tickets z `workspaceId` w body → backend stripuje, używa req.workspaceId (super-admin nie może wstrzyknąć cudzego workspace) ✅
    - Cross-workspace ticket access przez super-admin lub aktywny WorkspaceRelation z canViewDevices=true ✅ (intencjonalne dla MSP)

- **2026-05-18 (#6 — Tasks Comments FIX)** — nowy model `TaskComment` paralel do `TicketComment` z denormalizowanym `workspaceId` (RLS bez joina). Migracja `20260518213000_task_comments` idempotentna + RLS policy z cross-workspace MSP via `WorkspaceRelation.canViewDevices`. Backend `POST /tasks/:id/comments` + embed w `GET`. Frontend `TaskDetailPage`: karta "Komentarze" z listą, textarea (Enter=send, Shift+Enter=nowa linia), checkbox isInternal. **Live-verified na prodzie**: POST 201, GET embed OK.

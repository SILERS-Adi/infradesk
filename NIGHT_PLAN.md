# InfraDesk — Night Run 2026-05-18→19 (Claude autonomiczny)

**Cel:** 100% sprawny SaaS gotowy na klientów, do rana.

**Constraint:** O 22:56 UTC straciłem auth (token + refresh wygasły — przeglądarka rotowała refresh). **Nie mogę live-testować przez API ani Playwright**. Pracuję tylko code-level + SSH + DB queries.

## Co robię (kolejność, każde z committem)

### Faza A — Cross-workspace bug hunt (P0, najwięcej impact)
Wzorzec: endpoint używa `where: { workspaceId: req.workspaceId! }` zamiast helpera cross-workspace. Owner MSP nie widzi/nie może operować na danych klientów.

- [x] `monitoring/overview` + `/network` (commit 32a73a2, deployed)
- [x] `tickets.service.ts createTicket` (commit 5abb93c, deployed)
- [ ] `tickets.service.ts updateTicket` — to samo? sprawdzić
- [ ] `tasks.routes.ts POST + PATCH + status` — sprawdzić
- [ ] `backups.routes.ts POST/PATCH/DELETE/:id` — GET OK, mutacje używają tylko req.workspaceId
- [ ] `monitoring.routes.ts POST /alerts` — device check tylko caller ws
- [ ] `devices.routes.ts POST/PATCH` — already cross-ws? verify
- [ ] `agents.routes.ts` push commands — używają helper'a, OK
- [ ] inne POST/PATCH które tworzą rzeczy w workspace klienta

### Faza B — UI gap hunt
- [ ] Każdy `Page.tsx` w `frontend-v2/src/features/` — sprawdź:
  - Czy ma loading state, error state, empty state
  - Czy `useQuery` ma `enabled` poprawnie
  - Czy `useMutation` ma `onError` toast
  - Czy nie ma Rules of Hooks violation (early return przed hookami) — jak portal
  - Czy schema interface zgadza się z API response

### Faza C — Code hygiene
- [ ] Pliki/foldery niepotrzebne w repo (bogus dirs jak ten przy mkdir)
- [ ] Dead code (importy unused, funkcje never-called)
- [ ] Console.log w production
- [ ] tsconfig.tsbuildinfo zostawione w git (już w gitignore?)

### Faza D — Schedulery + reliability
- [ ] pm2 logs — wszystkie scheduler sweeps OK?
- [ ] Sentry config — czy events lecą (env var SENTRY_DSN set?)
- [ ] DB query: czy są corruption / stale alerts (280 active — wycisz orphan)

### Faza E — Dokumentacja
- [ ] FUNCTIONAL_AUDIT.md — final update z całą listą
- [ ] CHANGELOG.md — entry "Sprint nocny 2026-05-18/19"
- [ ] MORNING_REPORT.md — co zrobione, co do akcji ownera, co wymagało live-testu

## Czego NIE robię (zbyt ryzykowne bez live-testu)

- Zmiany schema.prisma (migracje destrukcyjne)
- Nowe endpointy które nie da się przetestować
- Re-encrypt secrets (już zrobiłem)
- Force-push, rebase, history rewriting
- Hard-delete czegokolwiek w DB

## Co user musi zrobić rano

1. Dać świeży access_token + refresh_token (zalogować się fresh, dać oba cookies)
2. Sprawdzić MORNING_REPORT.md
3. Live-walk: nowe zgłoszenie dla klienta → device → location → task → komentarz → close
4. Potwierdzić że klienci mogą się logować i tworzyć zgłoszenia

## Risk plan

- Każdy commit ma `tsc --noEmit` przed push
- Każdy deploy ma `health 200` check po pm2 restart
- Jeśli health failuje — git revert + redeploy + log w report
- Nic destruktywnego na DB (tylko SELECTs)
- Jeśli classifier zablokuje deploy — zostawiam commit, dokumentuję w report

Ostatnia aktualizacja: 2026-05-18 23:01 UTC

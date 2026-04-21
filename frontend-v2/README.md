# InfraDesk v2 — Frontend (alpha)

React 18 + Vite + TypeScript + Tailwind + shadcn-style primitives. Paired with `backend-v2`.

## Struktura

```
frontend-v2/
├── src/
│   ├── main.tsx, App.tsx
│   ├── components/
│   │   ├── ui/        # Button, Input, Card, Badge, ViewToggle, ThemeToggle, AddThreeWays
│   │   └── layout/    # Sidebar, Topbar, AppShell
│   ├── features/
│   │   ├── auth/      # LoginPage, RequireAuth
│   │   ├── dashboard/ # DashboardPage (KPI + recent tickets)
│   │   └── tickets/   # TicketsPage (dual-view) + 3-way add modal
│   ├── lib/           # api client (axios + token refresh), utils
│   ├── store/         # zustand: auth, theme
│   └── styles/        # tokens.css (3 motywy), globals.css
└── vite.config.ts     # dev proxy /api/v2 → backend :4200
```

## Kluczowe konwencje

- **`canAccess`**: importowane przez alias `@shared/canAccess` z `backend-v2/src/utils/canAccess.ts` — jeden plik dla obu stron.
- **Dual-view widoki** (`ViewToggle` + `useViewPreference`): każda lista ma toggle wizualnie/tabelarycznie, preferencja per-user w localStorage. Default `visual` dla OWNER/ADMIN, technicy mogą przełączyć na `table`.
- **3-tryby dodawania** (`AddThreeWays`): modal z zakładkami Formularz / Wizard / Z AI. Zakładka AI zostaje w localStorage jeśli user ją wybierze → otwiera się domyślnie następnym razem.
- **3 tryby kolorystyczne** (`ThemeToggle`): jasny/ciemny/auto, preferencja per-user w localStorage. Tokens w HSL → Tailwind binding.

## Dev

```bash
cd frontend-v2
npm install
npm run dev         # → http://localhost:5174, proxy /api/v2 na :4200 (backend-v2)
npm run typecheck
npm run build
```

## Status modułów

| Moduł           | Status     |
|-----------------|------------|
| Auth (login)    | ✅ MVP     |
| Dashboard       | ✅ MVP     |
| Tickets         | ✅ MVP (dual-view + 3-way add) |
| Devices         | stub       |
| Locations       | stub       |
| CRM Contacts    | stub       |
| Orders          | stub       |
| Vault           | stub       |
| Monitoring      | stub       |
| AI / Iris       | stub       |
| Settings        | stub       |

# IDS 1.0 — Module Template

Referencyjny wzorzec budowy modułu InfraDesk.

## Co to jest

Ten katalog zawiera **template'y stron** — nie gotowe strony biznesowe, lecz wzorce do kopiowania. Każdy template pokazuje standardowy układ, komponenty IDS i konwencje, których powinien trzymać się każdy nowy moduł.

## Pliki

| Plik | Typ strony | Kiedy użyć |
|------|-----------|------------|
| `ModuleDashboardTemplate.tsx` | Dashboard modułu | Landing page modułu (`/module/`) |
| `ModuleListTemplate.tsx` | Lista rekordów | Każda strona z tabelą (`/module/items`) |
| `ModuleDetailTemplate.tsx` | Widok szczegółów | Strona pojedynczego rekordu (`/module/items/:id`) |
| `ModuleFormTemplate.tsx` | Formularz nowy/edycja | Tworzenie i edycja (`/module/items/new`, `/module/items/:id/edit`) |
| `components/ToolbarTemplate.tsx` | Toolbar z filtrami | Komponent toolbar nad tabelą |
| `components/SectionCard.tsx` | Karta sekcyjna | Grupowanie info na detail page |
| `components/EmptyStateTemplate.tsx` | Puste stany | 3 wzorce: brak danych, brak wyników, brak dostępu |

## Jak budować nowy moduł

### 1. Stwórz katalog
```
frontend/src/pages/admin/{module-name}/
```

### 2. Skopiuj potrzebne template'y
```bash
# Kopiuj i przemianuj:
cp templates/module-template/ModuleDashboardTemplate.tsx  pages/admin/mymodule/DashboardPage.tsx
cp templates/module-template/ModuleListTemplate.tsx       pages/admin/mymodule/ItemsListPage.tsx
cp templates/module-template/ModuleDetailTemplate.tsx     pages/admin/mymodule/ItemDetailPage.tsx
cp templates/module-template/ModuleFormTemplate.tsx       pages/admin/mymodule/ItemNewPage.tsx
```

### 3. Dostosuj
W każdym skopiowanym pliku:
- Zamień mock data na prawdziwe `useQuery` hooki
- Zamień interfejsy na swoje typy
- Zamień kolumny DataTable na swoje pola
- Zamień opcje Select na swoje filtry
- Zamień endpointy API

### 4. Zarejestruj moduł
W `frontend/src/modules/registry.ts`:
```typescript
export const myModule: ModuleDefinition = {
  id: 'mymodule',
  label: 'Mój Moduł',
  basePath: '/mymodule',
  sidebarLabel: 'MÓJ MODUŁ',
  navItems: [
    { to: '/mymodule', label: 'Dashboard', icon: null },
    { to: '/mymodule/items', label: 'Elementy', icon: null },
  ],
  routeTitles: {
    '/mymodule': 'Mój Moduł',
    '/mymodule/items': 'Mój Moduł — Elementy',
    '/mymodule/items/new': 'Mój Moduł — Nowy element',
  },
};
```

### 5. Dodaj routing w App.tsx
```tsx
<Route path="mymodule" element={<DashboardPage />} />
<Route path="mymodule/items" element={<ItemsListPage />} />
<Route path="mymodule/items/new" element={<ItemNewPage />} />
<Route path="mymodule/items/:id" element={<ItemDetailPage />} />
```

### 6. Dodaj nawigację w Sidebar.tsx
```tsx
{
  label: 'MÓJ MODUŁ',
  items: [
    { to: '/mymodule', label: 'Dashboard', icon: <LayoutDashboard className="nav-icon" /> },
    { to: '/mymodule/items', label: 'Elementy', icon: <FileText className="nav-icon" /> },
  ],
},
```

## Dwa wzorce list

IDS 1.0 definiuje dwa oficjalne wzorce dla stron listowych. Każdy nowy ekran z tabelą musi zostać zakwalifikowany do jednego z nich.

### Standard List Pattern

Prosty CRUD z tabelą danych. Użytkownik przegląda, filtruje, klika w rekord.

**Komponenty:** PageHeader → SearchInput → Select filtry → DataTable → Pagination
**Template:** `ModuleListTemplate.tsx`
**Przykłady:** Faktury/Dokumenty, Kontrahenci, Produkty, Zamówienia, Delegacje, Sesje, CRM

### Advanced Operational List Pattern

Ekran operacyjny z wielogodzinnym użyciem. Tabela jest narzędziem pracy — sortowalna, z column toggle, inline actions.

**Komponenty IDS:** PageHeader, SearchInput, LoadingSpinner, EmptyState, Badge, Button, Modal, toast, CSS tokens
**Tabela:** Custom `<table>` z SortTh, column editor, inline popups
**Template:** Brak gotowego template — patrz `AdvancedListPattern.md`
**Przykłady:** Zgłoszenia (Tickets), Urządzenia (Devices), Lokalizacje (Locations)

### Test kwalifikacyjny (3 pytania)

Zadaj te pytania o ekran. Jeśli **wszystkie** = NIE → Standard List. Jeśli **którekolwiek** = TAK → Advanced.

| # | Pytanie |
|---|---------|
| 1 | Czy użytkownik sortuje kolumny klikając w nagłówki? |
| 2 | Czy użytkownik wykonuje akcje inline w wierszu (przydziel, zmień status) bez nawigacji? |
| 3 | Czy użytkownik customizuje widoczność lub kolejność kolumn? |

Dodatkowe sygnały wskazujące na Advanced: tab navigation z badge counts, mobile card view, >8 kolumn, >30 min użycia dziennie.

**Zasada:** W razie wątpliwości zacznij od Standard List. Rozbudowa do Advanced jest łatwa. Odwrotna droga jest trudna.

---

## Konwencje IDS 1.0

### Spacing
- Content padding: `24px` (horizontal), `0` (top, PageHeader ma swój padding)
- Gap między Card: `20px`
- Gap wewnątrz Card grid: `16px`
- Gap w toolbar: `12px`
- Bottom padding na stronach z formularzy: `120px` (sticky footer clearance)

### Kolory (zawsze zmienne CSS, nigdy hex)
- Tekst główny: `var(--t)`
- Tekst drugorzędny: `var(--ts)`
- Tekst wyciszony: `var(--tm)`
- Tekst disabled/label: `var(--td)`
- Tło strony: `var(--bg)`
- Tło karty: via `.page-card` class
- Obramowanie: `var(--border)`
- Accent: `var(--accent)`
- Hover: `var(--hover-bg)`

### Typografia
- Wartości KPI: `24px`, weight `800`
- Nagłówki sekcji: `14px`, weight `700`
- Body: `13px`, weight `400`
- Tabela TH: `10px`, weight `700`, uppercase, letter-spacing `0.06em`
- Tabela TD: `12px`, weight `400`
- Etykiety Input: `10px`, weight `700`, uppercase
- Błędy: `11px`, kolor `#F87171`

### Komponenty (z `components/ui/`)
- `PageHeader` — zawsze na górze strony
- `Card` — kontener sekcji (z `title` lub `noPadding`)
- `Badge` — statusy i etykiety
- `Button` — variant: primary/secondary/danger/ghost/outline, size: sm/md/lg
- `Input` / `Select` / `Textarea` — pola formularzy z `label` i `error`
- `DataTable` — tabela z loading i empty state
- `KpiCard` — metryka z ikoną
- `SearchInput` — pole wyszukiwania z ikoną i clear
- `Pagination` — nawigacja stron
- `Alert` — komunikaty info/success/warning/error
- `Switch` — toggle z label i description
- `Modal` — dialog
- `EmptyState` — stan pusty
- `LoadingSpinner` — spinner ładowania

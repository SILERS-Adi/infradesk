# IDS 1.0 — Advanced Operational List Pattern

Wzorzec dla ekranów operacyjnych z zaawansowaną tabelą.

## Kiedy używać

Ekran, na którym co najmniej JEDNO z poniższych jest prawdą:

1. Użytkownik sortuje kolumny klikając w nagłówki (client-side sort z persistent state)
2. Użytkownik wykonuje akcje inline w wierszu bez nawigacji (assign popup, status change)
3. Użytkownik customizuje widoczność lub kolejność kolumn (column toggle, drag & drop reorder)

Dodatkowe sygnały: tab navigation z badge counts, responsywny mobile card view, >8 kolumn, >30 min dziennego użycia.

## Obecne ekrany Advanced w InfraDesk

| Ekran | Moduł | Cechy Advanced |
|-------|-------|---------------|
| TicketsListPage | Helpdesk | SortTh, column toggle, drag reorder, AssignPopup, tab nav z badges |
| DevicesListPage | Helpdesk | SortTh, AgentBadge, RustDesk launch, mobile cards |
| LocationsListPage | Helpdesk | Column toggle, drag reorder, column editor, mobile cards |

## Co jest CUSTOM (nie DataTable)

Poniższe elementy pozostają jako własna implementacja `<table>`:

- **SortTh** — sortowalne nagłówki z chevronami (click-to-sort, persistent direction)
- **Column visibility** — toggle kolumn z localStorage persistence
- **Column reorder** — drag & drop kolejności z `GripVertical` handle
- **Inline popups** — AssignPopup, ServiceModeBadge select — otwierane w komórce bez nawigacji
- **Tab navigation** — status tabs z badge counts (np. Oczekujące: 12, Przydzielone: 8)
- **Column editor panel** — slide-up panel z grupami kolumn, toggles, reorder
- **Mobile card view** — responsywna alternatywa tabeli (`hidden md:block` / `md:hidden`)

## Co MUSI być zgodne z IDS

Nawet w ekranie Advanced, poniższe elementy muszą używać komponentów IDS:

### Obowiązkowe komponenty

| Element | Komponent IDS |
|---------|--------------|
| Nagłówek strony | `PageHeader` (title, subtitle, actions, back) |
| Pole wyszukiwania | `SearchInput` (value, onChange, placeholder) |
| Stan ładowania | `LoadingSpinner` |
| Pusty stan | `EmptyState` (title, description, action, scopeEntity) |
| Statusy w wierszach | `Badge`, `StatusBadge`, `PriorityBadge` |
| Przyciski | `Button` (variant, size, icon, loading) |
| Modale | `Modal` (open, onClose, title, size, footer) |
| Dialogi potwierdzenia | `ConfirmDialog` (open, onConfirm, title, message) |
| Powiadomienia | `toast.success()`, `toast.error()` via react-hot-toast |

### Obowiązkowe CSS tokens

Nigdy nie hardcoduj kolorów. Zawsze używaj tokenów:

```
Tekst:      var(--t), var(--ts), var(--tm), var(--td)
Tła:        var(--bg), var(--bg2), var(--bg-card), var(--hover-bg)
Obramowania: var(--border), var(--border-l)
Akcent:     var(--accent), var(--accent-g), var(--accent-s)
Promień:    var(--r), var(--rs)
Transition: var(--trf)
```

## Styl tabeli (musi być wizualnie identyczny z DataTable)

### TH (nagłówek kolumny)
```css
font-size: 10px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.06em;
color: var(--tm);          /* inactive */
color: #A78BFA;            /* active sort — accent secondary */
padding: 10px 14px;
background: var(--hover-bg);  /* opcjonalnie */
```

### TD (komórka)
```css
font-size: 12px;            /* lub 13px dla kluczowych wartości */
color: var(--ts);
padding: 10px 14px;
```

### TR (wiersz)
```css
border-bottom: 1px solid var(--border);
cursor: pointer;             /* jeśli onRowClick */
transition: background 0.15s;
```

### TR:hover
```css
background: var(--hover-bg);
```

## Checklist dla ekranu Advanced

Przed oddaniem ekranu Advanced do review, sprawdź:

- [ ] `PageHeader` z title, subtitle i actions
- [ ] `SearchInput` zamiast inline search z ikoną Search
- [ ] `LoadingSpinner` zamiast custom animacji spin
- [ ] `EmptyState` z odpowiednim title/description + `scopeEntity` jeśli scope detection
- [ ] Badge/StatusBadge/PriorityBadge dla statusów w wierszach
- [ ] `Button` dla CTA i akcji (nie custom `<button>` z inline styles)
- [ ] `Modal` dla create/edit (nie custom overlay div)
- [ ] `ConfirmDialog` dla destrukcyjnych akcji
- [ ] `toast` na success/error
- [ ] CSS tokens (zero hardcoded hex kolorów dla tekstu, obramowań, teł)
- [ ] TH styling: 10px, bold, uppercase, tracking-wider, var(--tm)
- [ ] TD styling: 12-13px, var(--ts)
- [ ] TR hover: var(--hover-bg)
- [ ] Border: var(--border)

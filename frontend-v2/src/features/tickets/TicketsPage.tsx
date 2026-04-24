const PRIORITY_PL_LABEL: Record<string, string> = { LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', CRITICAL: 'Krytyczny' };
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { useColumns } from '@/components/ui/ColumnPicker';
import { useCardFields, type CardField, type CardPreset } from '@/components/ui/CardFieldsPicker';
import { TicketsVisualGrid } from './TicketsVisualGrid';
import { TicketsTable, TICKET_COLUMNS } from './TicketsTable';
import { NewTicketModal } from './NewTicketModal';

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
  updatedAt?: string;
  dueAt: string | null;
  assignedTo: { id: string; firstName: string; lastName: string; email?: string } | null;
  serviceMode?: 'REMOTE' | 'ONSITE' | null;
  device: { id: string; name: string } | null;
  clientWorkspaceId?: string | null;
  clientWorkspace?: { id: string; name: string; slug: string } | null;
  hasService?: boolean;
  hasOrder?: boolean;
  hasCrm?: boolean;
  resolutionSummary?: string | null;
  tab?: 'nowe' | 'w_toku' | 'zakonczone' | 'anulowane';
  childCounts?: { total: number; done: number; active: number };
}

const STATUS_LABEL: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = {
  NEW: { label: 'Nowe', variant: 'neutral' },
  OPEN: { label: 'Otwarte', variant: 'accent' },
  ASSIGNED: { label: 'Przypisane', variant: 'accent' },
  IN_PROGRESS: { label: 'W toku', variant: 'warning' },
  WAITING: { label: 'Oczekujące', variant: 'warning' },
  RESOLVED: { label: 'Rozwiązane', variant: 'success' },
  CLOSED: { label: 'Zakończone', variant: 'success' },
  CANCELLED: { label: 'Anulowane', variant: 'danger' },
};

const STATUS_COLOR: Record<string, string> = {
  NEW: '#9CA3AF', OPEN: '#3B82F6', ASSIGNED: '#6366F1', IN_PROGRESS: '#F59E0B',
  WAITING: '#EAB308', RESOLVED: '#10B981', CLOSED: '#059669', CANCELLED: '#EF4444',
};
export function statusBadge(status: string) {
  const cfg = STATUS_LABEL[status] ?? STATUS_LABEL.OPEN!;
  const color = STATUS_COLOR[status] ?? '#9CA3AF';
  const isActive = status === 'IN_PROGRESS' || status === 'ASSIGNED';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
      style={{
        background: color + '20',
        color,
        borderColor: color + '55',
      }}
    >
      <span
        className={isActive ? 'w-1.5 h-1.5 rounded-full animate-pulse' : 'w-1.5 h-1.5 rounded-full'}
        style={{ background: color, boxShadow: isActive ? '0 0 6px ' + color : 'none' }}
      />
      {cfg.label}
    </span>
  );
}

type Tab = 'wszystkie' | 'nowe' | 'w_toku' | 'zakonczone' | 'anulowane';
const TAB_LABEL: Record<Tab, string> = {
  wszystkie: 'Wszystkie',
  nowe: 'Nowe',
  w_toku: 'W toku',
  zakonczone: 'Zakończone',
  anulowane: 'Anulowane',
};

const PRIORITIES: Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PRIORITY_COLOR: Record<string, string> = { LOW: '#6b7280', MEDIUM: '#3b82f6', HIGH: '#f59e0b', CRITICAL: '#ef4444' };

interface ClientRow {
  relationId: string;
  client: { id: string; name: string; slug: string; isActive: boolean };
}
interface MemberRow {
  id: string; role: string; status: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function TicketsPage() {
  const nav = useNavigate();
  const [view, setView] = useViewPreference('tickets', 'visual');
  const [showNew, setShowNew] = useState(false);
  const [sp, setSp] = useSearchParams();

  // Filter state — source of truth: URL params
  const tab = (sp.get('tab') as Tab) ?? 'wszystkie';
  const [searchInput, setSearchInput] = useState(sp.get('q') ?? '');
  const debouncedSearch = useDebounced(searchInput, 300);
  const priority = sp.get('priority') ?? '';
  const priorityList = priority ? priority.split(',') : [];
  const tech = sp.get('tech') ?? '';
  const client = sp.get('client') ?? '';
  const device = sp.get('device') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';

  // Sync debounced search -> URL
  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (debouncedSearch === cur) return;
    const next = new URLSearchParams(sp);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp);
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  }

  function togglePriority(p: string) {
    const cur = priorityList.includes(p) ? priorityList.filter((x) => x !== p) : [...priorityList, p];
    updateParam('priority', cur.length ? cur.join(',') : null);
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (tab !== 'wszystkie') next.set('tab', tab);
    setSearchInput('');
    setSp(next, { replace: true });
  }

  const { visibleColumns, pickerButton } = useColumns<TicketListItem>({
    tableKey: 'tickets',
    columns: TICKET_COLUMNS,
  });

  // Card-view field picker (visual mode)
  const { visibleFields: visibleCardFields, activePreset: cardPreset, pickerButton: cardPickerButton } = useCardFields({
    tableKey: 'tickets',
    fields: TICKET_CARD_FIELDS,
    presets: TICKET_CARD_PRESETS,
    defaultPreset: 'standard',
  });

  function handleAdd() {
    if (view === 'visual') setShowNew(true);
    else nav('/tickets/new');
  }

  // Fetch tickets with backend filters from URL params
  const { data, isLoading } = useQuery<{ items: TicketListItem[] }>({
    queryKey: ['tickets', 'list', { q: debouncedSearch, priority, tech, client, device, from, to }],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 200 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (priority) params.priority = priority;
      if (tech) params.assignedToUserId = tech;
      if (client) params.clientWorkspaceId = client;
      if (device) params.deviceId = device;
      if (from) params.from = from;
      if (to) params.to = to;
      return (await api.get('/tickets', { params })).data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Reference data for filter dropdowns
  const clientsQ = useQuery<{ clients: ClientRow[] }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
    staleTime: 60_000,
  });
  const membersQ = useQuery<{ memberships: MemberRow[] }>({
    queryKey: ['memberships'],
    queryFn: async () => (await api.get('/memberships')).data,
    staleTime: 60_000,
  });

  const clients = clientsQ.data?.clients ?? [];
  const members = (membersQ.data?.memberships ?? []).filter((m) => m.status === 'ACTIVE');

  const items = data?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { wszystkie: items.length, nowe: 0, w_toku: 0, zakonczone: 0, anulowane: 0 };
    for (const t of items) {
      const tabValue: Tab = (t.tab as Tab) ?? 'nowe';
      if (tabValue !== 'wszystkie') c[tabValue]++;
    }
    return c;
  }, [items]);

  const priorityCounts = useMemo(() => {
    const c: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const t of items) c[t.priority] = (c[t.priority] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    if (tab === 'wszystkie') return items;
    return items.filter((t) => (t.tab ?? 'nowe') === tab);
  }, [items, tab]);

  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (priorityList.length > 0 ? 1 : 0) +
    (tech ? 1 : 0) +
    (client ? 1 : 0) +
    (device ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  // --- Quick-action mutations (optimistic) ----------------------------------
  const qc = useQueryClient();
  type ListResp = { items: TicketListItem[] };
  function patchList(id: string, patch: Partial<TicketListItem>) {
    const keys = qc.getQueryCache().findAll({ queryKey: ['tickets', 'list'] });
    for (const k of keys) {
      const prev = k.state.data as ListResp | undefined;
      if (!prev?.items) continue;
      qc.setQueryData(k.queryKey, {
        ...prev,
        items: prev.items.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });
    }
  }
  const assignMut = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) =>
      (await api.patch(`/tickets/${id}`, { assignedToUserId: userId })).data,
    onMutate: ({ id, userId }) => {
      const prevSnapshots = qc.getQueriesData<ListResp>({ queryKey: ['tickets', 'list'] })
        .map(([k, d]) => ({ key: k, data: d }));
      const m = userId ? members.find((x) => x.user.id === userId) : null;
      const assignedTo = m
        ? { id: m.user.id, firstName: m.user.firstName ?? '', lastName: m.user.lastName ?? '', email: m.user.email }
        : null;
      patchList(id, { assignedTo });
      return { prevSnapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevSnapshots.forEach((s) => qc.setQueryData(s.key, s.data));
      toast.error('Nie udalo sie przypisac');
    },
    onSuccess: (_d, v) => {
      if (v.userId === null) toast.success('Odpieto technika');
      else {
        const m = members.find((x) => x.user.id === v.userId);
        const name = m ? ([m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email) : 'technika';
        toast.success(`Przypisano ${name}`);
      }
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  const serviceModeMut = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: 'REMOTE' | 'ONSITE' }) =>
      (await api.patch(`/tickets/${id}`, { serviceMode: mode })).data,
    onMutate: ({ id, mode }) => {
      const prevSnapshots = qc.getQueriesData<ListResp>({ queryKey: ['tickets', 'list'] })
        .map(([k, d]) => ({ key: k, data: d }));
      patchList(id, { serviceMode: mode });
      return { prevSnapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevSnapshots.forEach((s) => qc.setQueryData(s.key, s.data));
      toast.error('Nie udalo sie zmienic trybu');
    },
    onSuccess: (_d, v) => {
      toast.success(v.mode === 'REMOTE' ? 'Tryb: zdalnie' : 'Tryb: u klienta');
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  function handleAssign(id: string, userId: string | null) { assignMut.mutate({ id, userId }); }
  function handleServiceMode(id: string, mode: 'REMOTE' | 'ONSITE') { serviceModeMut.mutate({ id, mode }); }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tx">Zgłoszenia</h1>
          <p className="text-sm text-tx3">
            Master-rekordy. Praca dzieje się w Zadaniach, Zamówieniach, CRM — tu widzisz nieprzydzielone i statusy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view === 'table' && pickerButton}
          {view === 'visual' && cardPickerButton}
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Nowe zgłoszenie</Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Szukaj</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tx3 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Szukaj (numer / tytuł / opis)"
                className="pl-8"
              />
            </div>
          </div>

          {/* Technik */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Technik</label>
            <Select value={tech} onChange={(e) => updateParam('tech', e.target.value || null)}>
              <option value="">Wszyscy technicy</option>
              {members.map((m) => {
                const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;
                return (
                  <option key={m.user.id} value={m.user.id}>{name}</option>
                );
              })}
            </Select>
          </div>

          {/* Klient */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Klient</label>
            <Select value={client} onChange={(e) => updateParam('client', e.target.value || null)}>
              <option value="">Wszyscy klienci</option>
              {clients.filter((c) => c.client.isActive).map((c) => (
                <option key={c.client.id} value={c.client.id}>{c.client.name}</option>
              ))}
            </Select>
          </div>

          {/* Priorytet (multi-select via chips below) */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Priorytet</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => {
                const active = priorityList.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePriority(p)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors"
                    style={{
                      background: active ? PRIORITY_COLOR[p] + '22' : 'var(--sf-h)',
                      color: active ? PRIORITY_COLOR[p] : 'var(--tx2)',
                      border: '1px solid ' + (active ? PRIORITY_COLOR[p] + '55' : 'var(--bd)'),
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />
                    {PRIORITY_PL_LABEL[p] ?? p}
                    {priorityCounts[p] !== undefined && (
                      <span className="opacity-60">({priorityCounts[p]})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daty */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Od</label>
            <Input type="date" value={from} onChange={(e) => updateParam('from', e.target.value || null)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Do</label>
            <Input type="date" value={to} onChange={(e) => updateParam('to', e.target.value || null)} />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-bd">
            <Badge variant="accent">{activeFilterCount} {activeFilterCount === 1 ? 'filtr' : 'filtrów'}</Badge>
            <Button variant="ghost" onClick={clearAll} className="h-8 px-2 text-[12px]">
              <X className="h-3.5 w-3.5" /> Wyczyść filtry
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-1 border-b border-bd overflow-x-auto">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => updateParam('tab', t === 'wszystkie' ? null : t)}
            className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderColor: tab === t ? 'var(--pri)' : 'transparent',
              color: tab === t ? 'var(--pri)' : 'var(--tx2)',
            }}
          >
            {TAB_LABEL[t]}
            <span
              className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'var(--sf-h)', color: 'var(--tx3)' }}
            >
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card className="p-10 text-center text-tx3">Wczytywanie…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-tx font-medium mb-1">
            {activeFilterCount > 0
              ? 'Brak zgłoszeń spełniających filtry'
              : tab === 'wszystkie' ? 'Brak zgłoszeń'
              : tab === 'nowe' ? 'Brak nieprzydzielonych zgłoszeń'
              : tab === 'w_toku' ? 'Brak zgłoszeń w toku'
              : tab === 'zakonczone' ? 'Brak zakończonych'
              : 'Brak anulowanych'}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="ghost" onClick={clearAll} className="mt-2">Wyczyść filtry</Button>
          ) : (tab === 'wszystkie' || tab === 'nowe') ? (
            <p className="text-sm text-tx3">Kliknij „Nowe zgłoszenie" aby utworzyć.</p>
          ) : null}
        </Card>
      ) : view === 'visual' ? (
        <TicketsVisualGrid items={filtered} members={members} onAssign={handleAssign} onServiceMode={handleServiceMode} visibleFields={visibleCardFields} density={cardPreset} />
      ) : (
        <TicketsTable items={filtered} columns={visibleColumns} members={members} onAssign={handleAssign} onServiceMode={handleServiceMode} />
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
// ---------------------------------------------------------------------------
// Card-view field definitions + presets (visual grid)
// ---------------------------------------------------------------------------

export const TICKET_CARD_FIELDS: CardField[] = [
  { id: 'ticketNumber', label: 'Numer', pinned: true },
  { id: 'title', label: 'Tytuł', pinned: true },
  { id: 'status', label: 'Status', pinned: true },
  { id: 'priority', label: 'Priorytet' },
  { id: 'client', label: 'Klient' },
  { id: 'device', label: 'Urządzenie' },
  { id: 'assignedTo', label: 'Przypisany technik' },
  { id: 'createdAt', label: 'Utworzone' },
  { id: 'dueAt', label: 'Termin' },
  { id: 'serviceMode', label: 'Tryb (zdalnie/lokalnie)' },
  { id: 'childCounts', label: 'Licznik task/order/crm' },
  { id: 'description', label: 'Opis (fragment)' },
  { id: 'rating', label: 'Ocena (jeśli closed)' },
  { id: 'quickActions', label: 'Szybkie akcje (assign/mode)' },
];

export const TICKET_CARD_PRESETS: CardPreset[] = [
  {
    id: 'compact',
    label: 'Compact',
    hint: 'Minimum — szybki przegląd',
    fields: ['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'quickActions'],
  },
  {
    id: 'standard',
    label: 'Standard',
    hint: 'Domyślny zestaw',
    fields: ['ticketNumber', 'title', 'status', 'priority', 'client', 'device', 'assignedTo', 'createdAt', 'quickActions'],
  },
  {
    id: 'detailed',
    label: 'Detailed',
    hint: 'Wszystkie pola',
    fields: TICKET_CARD_FIELDS.map((f) => f.id),
  },
];

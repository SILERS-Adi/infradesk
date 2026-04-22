import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { TicketsVisualGrid } from './TicketsVisualGrid';
import { TicketsTable } from './TicketsTable';
import { NewTicketModal } from './NewTicketModal';

export interface TicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
  dueAt: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  device: { id: string; name: string } | null;
  clientWorkspaceId?: string | null;
  hasService?: boolean;
  hasOrder?: boolean;
  hasCrm?: boolean;
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

export function statusBadge(status: string) {
  const cfg = STATUS_LABEL[status] ?? STATUS_LABEL.OPEN!;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

type Tab = 'nowe' | 'w_toku' | 'zakonczone' | 'anulowane';
const TAB_LABEL: Record<Tab, string> = {
  nowe: 'Nowe',
  w_toku: 'W toku',
  zakonczone: 'Zakończone',
  anulowane: 'Anulowane',
};

export function TicketsPage() {
  const nav = useNavigate();
  const [view, setView] = useViewPreference('tickets', 'visual');
  const [tab, setTab] = useState<Tab>('nowe');
  const [showNew, setShowNew] = useState(false);

  function handleAdd() {
    if (view === 'visual') setShowNew(true);
    else nav('/tickets/new');
  }

  const { data, isLoading } = useQuery<{ items: TicketListItem[] }>({
    queryKey: ['tickets', 'list'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 200 } })).data,
  });

  const items = data?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { nowe: 0, w_toku: 0, zakonczone: 0, anulowane: 0 };
    for (const t of items) {
      const tabValue: Tab = t.tab ?? 'nowe';
      c[tabValue]++;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => items.filter((t) => (t.tab ?? 'nowe') === tab), [items, tab]);

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
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Nowe zgłoszenie</Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-bd overflow-x-auto">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
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
            {tab === 'nowe' && 'Brak nieprzydzielonych zgłoszeń'}
            {tab === 'w_toku' && 'Brak zgłoszeń w toku'}
            {tab === 'zakonczone' && 'Brak zakończonych'}
            {tab === 'anulowane' && 'Brak anulowanych'}
          </p>
          {tab === 'nowe' && <p className="text-sm text-tx3">Kliknij „Nowe zgłoszenie" aby utworzyć.</p>}
        </Card>
      ) : view === 'visual' ? (
        <TicketsVisualGrid items={filtered} />
      ) : (
        <TicketsTable items={filtered} />
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

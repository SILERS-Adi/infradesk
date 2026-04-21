import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { AddThreeWays } from '@/components/ui/AddThreeWays';
import { TicketsVisualGrid } from './TicketsVisualGrid';
import { TicketsTable } from './TicketsTable';
import { CreateTicketForm } from './CreateTicketForm';
import { CreateTicketWizard } from './CreateTicketWizard';
import { CreateTicketFromAi } from './CreateTicketFromAi';

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

export function TicketsPage() {
  const [view, setView] = useViewPreference('tickets', 'visual');
  const { data, isLoading } = useQuery<{ items: TicketListItem[] }>({
    queryKey: ['tickets', 'list'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 50 } })).data,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tx">Zgłoszenia</h1>
          <p className="text-sm text-tx3">Wszystkie tickety w Twoim workspace.</p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <AddThreeWays
            title="Nowe zgłoszenie"
            trigger={<Button><Plus className="h-4 w-4" /> Nowe</Button>}
            formTab={<CreateTicketForm />}
            wizardTab={<CreateTicketWizard />}
            aiTab={<CreateTicketFromAi />}
          />
        </div>
      </div>

      {isLoading ? (
        <Card className="p-10 text-center text-tx3">Wczytywanie…</Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-tx font-medium mb-1">Brak zgłoszeń</p>
          <p className="text-sm text-tx3">Kliknij „Nowe" aby utworzyć pierwsze.</p>
        </Card>
      ) : view === 'visual' ? (
        <TicketsVisualGrid items={items} />
      ) : (
        <TicketsTable items={items} />
      )}
    </div>
  );
}

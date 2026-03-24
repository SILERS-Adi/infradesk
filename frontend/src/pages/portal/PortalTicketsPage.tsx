import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../../api/tickets';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { formatDate } from '../../utils/helpers';
import { Plus } from 'lucide-react';
import type { Ticket } from '../../types';

export function PortalTicketsPage() {
  const navigate = useNavigate();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets-portal'],
    queryFn: () => ticketsApi.getAll(),
  });

  const columns: Column<Ticket>[] = [
    { key: 'ticketNumber', header: 'Nr', render: (r) => <span className="font-mono text-xs text-indigo-600">{r.ticketNumber}</span> },
    { key: 'title', header: 'Tytuł', render: (r) => <span className="font-medium text-gray-900">{r.title}</span> },
    { key: 'location', header: 'Lokalizacja', render: (r) => r.location?.name ?? '—' },
    { key: 'priority', header: 'Priorytet', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'status', header: 'Status', render: (r) => <TicketStatusBadge status={r.status} /> },
    { key: 'reportedAt', header: 'Data', render: (r) => <span className="text-xs text-gray-500">{formatDate(r.reportedAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Moje zgłoszenia"
        subtitle={`${tickets.length} zgłoszeń`}
        actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/portal/new-request')}>Nowe zgłoszenie</Button>}
      />
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <DataTable
          columns={columns}
          data={tickets}
          loading={isLoading}
          onRowClick={(row) => navigate(`/portal/tickets/${(row as unknown as Ticket).id}`)}
          keyExtractor={(row) => (row as unknown as Ticket).id}
          emptyTitle="Brak zgłoszeń"
          emptyDescription="Nie masz jeszcze żadnych zgłoszeń."
        />
      </div>
    </div>
  );
}

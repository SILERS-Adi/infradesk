import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import type { TicketStatus, TicketPriority } from '../../types';
import type { OperatorTicket, OperatorClient } from '../../api/operator';

export default function OperatorTickets() {
  const navigate = useNavigate();
  const [clientFilter, setClientFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['operator', 'tickets', clientFilter, statusFilter, page],
    queryFn: () => operatorApi.getTickets({
      clientWorkspaceId: clientFilter || undefined,
      status: statusFilter || undefined,
      page,
      limit,
    }),
    refetchInterval: 15_000,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  const columns: Column<OperatorTicket>[] = [
    { key: 'ticketNumber', header: 'Numer', render: (r) => (
      <span style={{ fontWeight: 600, color: 'var(--t)', whiteSpace: 'nowrap' }}>{r.ticketNumber}</span>
    )},
    { key: 'title', header: 'Tytuł', render: (r) => (
      <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.title}</span>
    )},
    { key: 'client', header: 'Klient', render: (r) => (
      <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.clientWorkspaceName ?? '—'}</span>
    )},
    { key: 'status', header: 'Status', render: (r) => <TicketStatusBadge status={r.status as TicketStatus} /> },
    { key: 'priority', header: 'Priorytet', render: (r) => <PriorityBadge priority={r.priority as TicketPriority} /> },
    { key: 'assignedTo', header: 'Przypisany', render: (r) =>
      r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : '—'
    },
    { key: 'createdAt', header: 'Data', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Zgłoszenia" subtitle="Wszystkie zgłoszenia od klientów" />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={clientFilter}
          onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ minWidth: 200 }}
        >
          <option value="">Wszyscy klienci</option>
          {clients?.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input"
          style={{ minWidth: 160 }}
        >
          <option value="">Wszystkie statusy</option>
          <option value="PENDING">Oczekujące</option>
          <option value="ASSIGNED">Przypisane</option>
          <option value="COMPLETED">Zakończone</option>
          <option value="CANCELLED">Anulowane</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.tickets ?? []}
        loading={isLoading}
        onRowClick={(t) => navigate(`/tickets/${t.id}`)}
        keyExtractor={(t) => t.id}
        emptyTitle="Brak zgłoszeń"
        emptyDescription={clientFilter ? 'Brak zgłoszeń dla wybranego klienta' : 'Nie ma jeszcze żadnych zgłoszeń'}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ fontSize: 12 }}
          >
            Poprzednia
          </button>
          <span style={{ fontSize: 12, color: 'var(--tm)', padding: '6px 12px' }}>
            {page} / {totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ fontSize: 12 }}
          >
            Następna
          </button>
        </div>
      )}
    </div>
  );
}

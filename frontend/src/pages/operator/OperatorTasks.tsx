import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '../../api/client';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';

interface OperatorTask {
  id: string;
  taskNumber: string;
  title: string;
  status: string;
  assignedTo?: { firstName: string; lastName: string } | null;
  workspace?: { id: string; name: string };
  ticket?: { ticketNumber: string; title: string } | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nowe', IN_PROGRESS: 'W toku', DONE: 'Gotowe',
};

export default function OperatorTasks() {
  const [clientFilter, setClientFilter] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['operator', 'tasks', clientFilter, page],
    queryFn: () => apiClient.get<{ data: OperatorTask[]; pagination: { total: number } }>('/operator/tasks', {
      params: { clientWorkspaceId: clientFilter || undefined, page, per_page: perPage },
    }).then(r => r.data),
  });

  const totalPages = Math.ceil((data?.pagination?.total ?? 0) / perPage);

  const columns: Column<OperatorTask>[] = [
    { key: 'taskNumber', header: 'Numer', render: (r) => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.taskNumber}</span> },
    { key: 'title', header: 'Tytuł', render: (r) => <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.title}</span> },
    { key: 'client', header: 'Klient', render: (r) => <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.workspace?.name ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
        background: r.status === 'DONE' ? '#DEF7EC' : r.status === 'IN_PROGRESS' ? '#FEF3C7' : '#E0E7FF',
        color: r.status === 'DONE' ? '#03543F' : r.status === 'IN_PROGRESS' ? '#92400E' : '#3730A3',
      }}>
        {STATUS_LABELS[r.status] ?? r.status}
      </span>
    )},
    { key: 'ticket', header: 'Zgłoszenie', render: (r) => r.ticket ? r.ticket.ticketNumber : '—' },
    { key: 'assignedTo', header: 'Przypisany', render: (r) => r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : '—' },
    { key: 'createdAt', header: 'Data', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  if (isError) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Zadania" subtitle="Zadania ze wszystkich klientów" />
        <div className="page-card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>Nie udało się załadować zadań</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Zadania" subtitle="Zadania ze wszystkich klientów" />

      <div style={{ marginBottom: 16 }}>
        <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(1); }} className="input" style={{ minWidth: 200 }}>
          <option value="">Wszyscy klienci</option>
          {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        keyExtractor={r => r.id}
        emptyTitle="Brak zadań"
        emptyDescription="Zadania pojawią się wraz ze zgłoszeniami klientów"
      />

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>Poprzednia</button>
          <span style={{ fontSize: 12, color: 'var(--tm)', padding: '6px 12px' }}>{page} / {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>Następna</button>
        </div>
      )}
    </div>
  );
}

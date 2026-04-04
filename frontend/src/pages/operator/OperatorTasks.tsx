import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  createdAt: string;
}

export default function OperatorTasks() {
  const navigate = useNavigate();
  const [clientFilter, setClientFilter] = useState('');

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  // Tasks endpoint will be available when backend extends operator module
  // For now using placeholder
  const { data: tasks, isLoading } = useQuery<OperatorTask[]>({
    queryKey: ['operator', 'tasks', clientFilter],
    queryFn: async () => [],
  });

  const columns: Column<OperatorTask>[] = [
    { key: 'taskNumber', header: 'Numer', render: (r) => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.taskNumber}</span> },
    { key: 'title', header: 'Tytuł' },
    { key: 'client', header: 'Klient', render: (r) => r.workspace?.name ?? '—' },
    { key: 'status', header: 'Status' },
    { key: 'assignedTo', header: 'Przypisany', render: (r) => r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : '—' },
    { key: 'createdAt', header: 'Data', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Zadania" subtitle="Zadania ze wszystkich klientów" />

      <div style={{ marginBottom: 16 }}>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="input" style={{ minWidth: 200 }}>
          <option value="">Wszyscy klienci</option>
          {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={tasks ?? []}
        loading={isLoading}
        keyExtractor={r => r.id}
        emptyTitle="Brak zadań"
        emptyDescription="Zadania pojawią się wraz ze zgłoszeniami klientów"
      />
    </div>
  );
}

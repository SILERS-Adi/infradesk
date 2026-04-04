import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Monitor, Ticket, Users } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import type { OperatorClient } from '../../api/operator';

export default function OperatorClients() {
  const navigate = useNavigate();

  const { data: clients, isLoading } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const columns: Column<OperatorClient>[] = [
    { key: 'name', header: 'Firma', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={16} color="#fff" />
        </div>
        <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span>
      </div>
    )},
    { key: 'ticketCount', header: 'Zgłoszenia', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Ticket size={14} color="var(--tm)" /> {r.ticketCount}
      </div>
    )},
    { key: 'deviceCount', header: 'Urządzenia', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Monitor size={14} color="var(--tm)" /> {r.deviceCount}
      </div>
    )},
    { key: 'userCount', header: 'Użytkownicy', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Users size={14} color="var(--tm)" /> {r.userCount}
      </div>
    )},
    { key: 'createdAt', header: 'Data dodania', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader
        title="Klienci"
        subtitle="Firmy obsługiwane przez Twoje Centrum IT"
        actions={
          <button
            className="btn-primary"
            onClick={() => navigate('/operator/clients/new')}
          >
            Dodaj klienta
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={clients ?? []}
        loading={isLoading}
        keyExtractor={(r) => r.id}
        emptyTitle="Brak klientów"
        emptyDescription="Dodaj pierwszego klienta, aby rozpocząć obsługę"
      />
    </div>
  );
}

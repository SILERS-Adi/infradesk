import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { DeviceStatusBadge } from '../../components/ui/StatusBadge';
import type { DeviceStatus } from '../../types';
import type { OperatorDevice, OperatorClient } from '../../api/operator';

export default function OperatorDevices() {
  const [clientFilter, setClientFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['operator', 'devices', clientFilter, page],
    queryFn: () => operatorApi.getDevices({
      clientWorkspaceId: clientFilter || undefined,
      page,
      limit,
    }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  const columns: Column<OperatorDevice>[] = [
    { key: 'name', header: 'Nazwa', render: (r) => (
      <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span>
    )},
    { key: 'type', header: 'Typ', render: (r) => r.type },
    { key: 'status', header: 'Status', render: (r) => <DeviceStatusBadge status={r.status as DeviceStatus} /> },
    { key: 'ipAddress', header: 'IP', render: (r) => r.ipAddress || '—' },
    { key: 'client', header: 'Klient', render: (r) => (
      <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.clientWorkspaceName ?? '—'}</span>
    )},
  ];

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Urządzenia klientów" subtitle="Przegląd urządzeń ze wszystkich firm" />

      <div style={{ marginBottom: 16 }}>
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
      </div>

      <DataTable
        columns={columns}
        data={data?.devices ?? []}
        loading={isLoading}
        keyExtractor={(r) => r.id}
        emptyTitle="Brak urządzeń"
        emptyDescription="Nie znaleziono urządzeń dla wybranych kryteriów"
      />

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>
            Poprzednia
          </button>
          <span style={{ fontSize: 12, color: 'var(--tm)', padding: '6px 12px' }}>{page} / {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>
            Następna
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { DeviceStatusBadge } from '../../components/ui/StatusBadge';
import type { DeviceStatus } from '../../types';

interface DeviceRow {
  id: string;
  name: string;
  type: string;
  status: string;
  ipAddress?: string;
  hostname?: string;
  workspace?: { id: string; name: string };
  location?: { id: string; name: string };
}

export default function OperatorDevices() {
  const [clientFilter, setClientFilter] = useState('');

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['operator', 'devices', clientFilter],
    queryFn: () => operatorApi.getDevices({ clientWorkspaceId: clientFilter || undefined }),
  });

  const columns: Column<DeviceRow>[] = [
    { key: 'name', header: 'Nazwa', render: (r) => (
      <div>
        <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span>
        {r.hostname && <div style={{ fontSize: 11, color: 'var(--td)' }}>{r.hostname}</div>}
      </div>
    )},
    { key: 'type', header: 'Typ' },
    { key: 'status', header: 'Status', render: (r) => <DeviceStatusBadge status={r.status as DeviceStatus} /> },
    { key: 'ipAddress', header: 'IP', render: (r) => r.ipAddress || '—' },
    { key: 'location', header: 'Lokalizacja', render: (r) => r.location?.name ?? '—' },
    { key: 'client', header: 'Klient', render: (r) => <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.workspace?.name ?? '—'}</span> },
  ];

  if (isError) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Urządzenia klientów" subtitle="Przegląd urządzeń ze wszystkich firm" />
        <div className="page-card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>Nie udało się załadować urządzeń</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Urządzenia klientów" subtitle="Przegląd urządzeń ze wszystkich firm" />

      <div style={{ marginBottom: 16 }}>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="input" style={{ minWidth: 200 }}>
          <option value="">Wszyscy klienci</option>
          {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={(devices as DeviceRow[]) ?? []}
        loading={isLoading}
        keyExtractor={(r) => r.id}
        emptyTitle="Brak urządzeń"
        emptyDescription="Nie znaleziono urządzeń dla wybranych kryteriów"
      />
    </div>
  );
}

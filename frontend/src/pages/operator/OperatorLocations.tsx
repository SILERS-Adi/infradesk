import { useQuery } from '@tanstack/react-query';
import { MapPin, Building2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

interface LocationRow { id: string; name: string; type: string; city?: string; workspaceName: string; }

export default function OperatorLocations() {
  const { data: clients, isLoading: clLoading } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  // Fetch locations from all client workspaces
  const clientIds = (clients ?? []).map(c => c.id);
  const { data: locations, isLoading: locLoading } = useQuery({
    queryKey: ['operator', 'locations', clientIds],
    queryFn: async () => {
      if (clientIds.length === 0) return [];
      const results = await Promise.all(clientIds.map(async wsId => {
        try {
          const r = await apiClient.get(`/locations`, { headers: { 'X-Workspace-Id': wsId } });
          const clientName = clients?.find(c => c.id === wsId)?.name ?? '—';
          return ((r.data as any[]) ?? []).map((l: any) => ({ ...l, workspaceName: clientName }));
        } catch { return []; }
      }));
      return results.flat();
    },
    enabled: clientIds.length > 0,
  });

  const columns: Column<LocationRow>[] = [
    { key: 'name', header: 'Lokalizacja', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={14} color="var(--accent)" /> <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span>
      </div>
    )},
    { key: 'type', header: 'Typ', render: r => <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.type}</span> },
    { key: 'city', header: 'Miasto', render: r => <span style={{ fontSize: 12, color: 'var(--tm)' }}>{r.city || '—'}</span> },
    { key: 'company', header: 'Firma', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tm)' }}>
        <Building2 size={13} color="var(--td)" /> {r.workspaceName}
      </div>
    )},
  ];

  if (clLoading) return <LoadingSpinner />;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Lokalizacje klientów" subtitle="Wszystkie lokalizacje z firm klientów" />
      <DataTable columns={columns} data={(locations as LocationRow[]) ?? []} loading={locLoading} keyExtractor={r => r.id}
        emptyTitle="Brak lokalizacji" emptyDescription="Lokalizacje pojawią się po dodaniu klientów" />
    </div>
  );
}

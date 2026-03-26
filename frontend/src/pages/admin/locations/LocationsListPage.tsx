import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { locationsApi } from '../../../api/locations';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { LocationForm } from '../../../components/forms/LocationForm';
import { useDebounce } from '../../../hooks/useDebounce';
import { getErrorMessage } from '../../../utils/helpers';
import type { Location } from '../../../types';

export function LocationsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', { clientId, search: debouncedSearch }],
    queryFn: () => locationsApi.getAll({ clientId: clientId || undefined, search: debouncedSearch || undefined }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      toast.success('Lokalizacja usunięta');
      qc.invalidateQueries({ queryKey: ['locations'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const columns: Column<Location>[] = [
    {
      key: 'name',
      header: 'Nazwa',
      render: (row) => <span className="font-medium text-white/85">{row.name}</span>,
    },
    { key: 'client', header: 'Klient', render: (row) => row.client?.name ?? '—' },
    { key: 'type', header: 'Typ', render: (row) => <Badge color="indigo">{row.type}</Badge> },
    { key: 'city', header: 'Miasto', render: (row) => row.city ?? '—' },
    {
      key: 'contact',
      header: 'Kontakt',
      render: (row) => row.contactPersonName ?? <span style={{ color: 'rgba(255,255,255,0.3)' }} className="text-xs">—</span>,
    },
    { key: 'devices', header: 'Urządzenia', render: (row) => row._count?.devices ?? 0 },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/locations/${row.id}`)}>Otwórz</Button>
          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setDeleteTarget(row)}>Usuń</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lokalizacje"
        subtitle={`${locations.length} lokalizacji`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowa lokalizacja
          </Button>
        }
      />

      <div className="rounded-lg" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="p-4 flex gap-3 items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj lokalizacji..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg text-white/85 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="text-sm rounded-lg px-3 py-2 text-white/85 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <option value="">Wszyscy klienci</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <DataTable
          columns={columns}
          data={locations}
          loading={isLoading}
          onRowClick={(row) => navigate(`/locations/${(row as unknown as Location).id}`)}
          keyExtractor={(row) => (row as unknown as Location).id}
          emptyTitle="Brak lokalizacji"
        />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nowa lokalizacja" size="xl">
        <LocationForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['locations'] }); toast.success('Lokalizacja dodana'); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń lokalizację"
        message={`Czy usunąć "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

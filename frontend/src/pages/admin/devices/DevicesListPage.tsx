import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, QrCode } from 'lucide-react';
import { devicesApi } from '../../../api/devices';
import { clientsApi } from '../../../api/clients';
import { locationsApi } from '../../../api/locations';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { DeviceStatusBadge } from '../../../components/ui/StatusBadge';
import { CriticalityBadge } from '../../../components/ui/PriorityBadge';
import { Modal } from '../../../components/ui/Modal';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { useDebounce } from '../../../hooks/useDebounce';
import type { Device } from '../../../types';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'ACTIVE', label: 'Aktywne' },
  { value: 'INACTIVE', label: 'Nieaktywne' },
  { value: 'BROKEN', label: 'Zepsute' },
  { value: 'RETIRED', label: 'Wycofane' },
  { value: 'IN_SERVICE', label: 'W serwisie' },
];

export function DevicesListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices', { clientId, status, search: debouncedSearch }],
    queryFn: () => devicesApi.getAll({
      clientId: clientId || undefined,
      status: status || undefined,
      search: debouncedSearch || undefined,
    }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const columns: Column<Device>[] = [
    {
      key: 'name',
      header: 'Urządzenie',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          {row.deviceType && <div className="text-xs text-gray-500">{row.deviceType.name}</div>}
        </div>
      ),
    },
    { key: 'client', header: 'Klient', render: (row) => row.client?.name ?? '—' },
    { key: 'location', header: 'Lokalizacja', render: (row) => row.location?.name ?? '—' },
    {
      key: 'ip',
      header: 'IP / Hostname',
      render: (row) => (
        <div className="font-mono text-xs text-gray-700">
          {row.ipAddress && <div>{row.ipAddress}</div>}
          {row.hostname && <div className="text-gray-400">{row.hostname}</div>}
          {!row.ipAddress && !row.hostname && <span>—</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <DeviceStatusBadge status={row.status} />,
    },
    {
      key: 'criticality',
      header: 'Krytyczność',
      render: (row) => <CriticalityBadge criticality={row.criticality} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/devices/${row.id}`)}>Otwórz</Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<QrCode className="h-3.5 w-3.5" />}
            onClick={() => handleDownloadQr(row)}
            title="Pobierz QR"
          />
        </div>
      ),
    },
  ];

  const handleDownloadQr = async (device: Device) => {
    try {
      const qr = await devicesApi.getQr(device.id);
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${qr}`;
      link.download = `qr-${device.name.replace(/\s+/g, '-')}.png`;
      link.click();
    } catch {
      toast.error('Nie można pobrać kodu QR');
    }
  };

  return (
    <div>
      <PageHeader
        title="Urządzenia"
        subtitle={`${devices.length} urządzeń`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowe urządzenie
          </Button>
        }
      />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj (nazwa, IP, hostname)..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Wszyscy klienci</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <DataTable
          columns={columns}
          data={devices}
          loading={isLoading}
          onRowClick={(row) => navigate(`/devices/${(row as unknown as Device).id}`)}
          keyExtractor={(row) => (row as unknown as Device).id}
          emptyTitle="Brak urządzeń"
          emptyDescription="Dodaj pierwsze urządzenie."
        />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="2xl" noPadding>
        <DeviceForm
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['devices'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </div>
  );
}

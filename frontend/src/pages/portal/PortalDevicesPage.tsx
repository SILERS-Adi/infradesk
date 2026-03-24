import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../../api/devices';
import { PageHeader } from '../../components/ui/PageHeader';
import { DeviceStatusBadge } from '../../components/ui/StatusBadge';
import { CriticalityBadge } from '../../components/ui/PriorityBadge';
import { Card } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Monitor } from 'lucide-react';

export function PortalDevicesPage() {
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices-portal'],
    queryFn: () => devicesApi.getAll(),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Moje urządzenia" subtitle={`${devices.length} urządzeń`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.length === 0 ? (
          <p className="text-sm text-gray-500 col-span-3">Brak urządzeń</p>
        ) : devices.map(d => (
          <Card key={d.id}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Monitor className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{d.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{d.deviceType?.name} · {d.location?.name}</div>
                {d.clientVisibleNotes && (
                  <div className="text-xs text-gray-600 mt-1 bg-gray-50 rounded p-1.5">{d.clientVisibleNotes}</div>
                )}
                <div className="flex gap-2 mt-2">
                  <DeviceStatusBadge status={d.status} />
                  <CriticalityBadge criticality={d.criticality} />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Monitor, ChevronRight, Loader2, Wifi, WifiOff } from 'lucide-react';
import { devicesApi } from '../../api/devices';

export function MobileDevicesPage() {
  const navigate = useNavigate();
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['mobile-devices'],
    queryFn: () => devicesApi.getAll({}),
  });

  return (
    <div className="px-5 py-4 space-y-4">
      <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>Urządzenia</h1>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5B5FEF' }} />
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: '#6B7280' }}>Brak urządzeń</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {devices.map((d: any) => (
            <button key={d.id} onClick={() => navigate(`/devices/${d.id}`)}
              className="w-full flex items-center gap-3 p-4 rounded-[18px] text-left active:scale-[0.98] transition-all duration-200"
              style={{ background: 'rgba(20,30,48,0.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: d.status === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)' }}>
                {d.status === 'ACTIVE'
                  ? <Wifi className="h-5 w-5" style={{ color: '#22C55E' }} />
                  : <WifiOff className="h-5 w-5" style={{ color: '#6B7280' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#E5E7EB' }}>{d.name}</p>
                <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                  {d.client?.name}{d.hostname ? ` · ${d.hostname}` : ''}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#4B5563' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

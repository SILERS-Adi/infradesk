import { useQuery } from '@tanstack/react-query';
import { Loader2, ExternalLink, Monitor, Cpu, HardDrive, Wifi, Building2 } from 'lucide-react';
import { partnersApi } from '../../../api/partners';

function MetricBar({ value, color }: { value?: number; color: string }) {
  if (value == null) return null;
  return (
    <div className="w-16 h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
  );
}

export default function SharedDevicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['partner-devices'],
    queryFn: partnersApi.getPartnerDevices,
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  const groups = data || [];
  const totalDevices = groups.reduce((sum: number, g: any) => sum + g.devices.length, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-600/10 flex items-center justify-center">
          <ExternalLink className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Infrastruktura klientów</h1>
          <p className="text-sm text-zinc-400">
            {totalDevices} urządzeń od {groups.length} {groups.length === 1 ? 'klienta' : 'klientów'}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-12 text-center">
          <ExternalLink className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">Żaden klient nie udostępnił Ci jeszcze infrastruktury</p>
          <p className="text-xs text-zinc-500 mt-1">Gdy klient doda Twój panel jako partnera, urządzenia pojawią się tutaj</p>
        </div>
      ) : (
        groups.map((group: any) => (
          <div key={group.partnershipId} className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-medium text-white">{group.ownerName}</h2>
              <span className="text-xs text-zinc-500">{group.ownerSlug}.infradesk.pl</span>
              <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full text-xs">
                {group.devices.length} urządzeń
              </span>
              <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-full text-xs">
                {group.role === 'FULL_MANAGEMENT' ? 'Pełne zarządzanie' : group.role === 'REMOTE_SUPPORT' ? 'Zdalna pomoc' : 'Podgląd'}
              </span>
            </div>

            <div className="grid gap-2">
              {group.devices.map((device: any) => {
                const agent = device.agents?.[0];
                const online = agent?.lastSeen && (Date.now() - new Date(agent.lastSeen).getTime()) < 120000;

                return (
                  <div key={device.sharedDeviceId || device.id} className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-4 flex items-center gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-zinc-600'}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-zinc-400" />
                        <span className="text-white text-sm font-medium truncate">{device.name || device.hostname}</span>
                        {device.client && <span className="text-xs text-zinc-500">· {device.client.name}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        {agent?.hostname && <span>{agent.hostname}</span>}
                        {agent?.ipAddress && <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />{agent.ipAddress}</span>}
                        {device.location && <span>{device.location.name}{device.location.city ? ` · ${device.location.city}` : ''}</span>}
                      </div>
                    </div>

                    {agent && online && (
                      <div className="flex items-center gap-4 text-xs text-zinc-400">
                        {agent.cpuUsage != null && (
                          <div className="flex items-center gap-1.5">
                            <Cpu className="h-3 w-3" />
                            <span>{Math.round(agent.cpuUsage)}%</span>
                            <MetricBar value={agent.cpuUsage} color={agent.cpuUsage > 80 ? '#ef4444' : '#10b981'} />
                          </div>
                        )}
                        {agent.ramUsage != null && (
                          <div className="flex items-center gap-1.5">
                            <span>RAM</span>
                            <span>{Math.round(agent.ramUsage)}%</span>
                            <MetricBar value={agent.ramUsage} color={agent.ramUsage > 80 ? '#ef4444' : '#3b82f6'} />
                          </div>
                        )}
                        {agent.diskFree != null && (
                          <div className="flex items-center gap-1.5">
                            <HardDrive className="h-3 w-3" />
                            <span>{Math.round(agent.diskFree)} GB</span>
                          </div>
                        )}
                      </div>
                    )}

                    {agent?.rustdeskId && group.role !== 'VIEWER' && (
                      <a href={`rustdesk://${agent.rustdeskId}`}
                        className="px-2.5 py-1 bg-violet-600/10 text-violet-400 rounded-lg text-xs hover:bg-violet-600/20 transition-colors">
                        RustDesk
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

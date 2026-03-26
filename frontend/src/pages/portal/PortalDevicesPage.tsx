import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../../api/devices';
import { useAuth } from '../../store/authStore';
import { Monitor, Cpu, HardDrive, MemoryStick, Wifi, WifiOff, Clock } from 'lucide-react';
import type { Device } from '../../types';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  ...extra,
});

const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
  ACTIVE: { dot: '#22C55E', label: 'Aktywne' },
  INACTIVE: { dot: '#6B7280', label: 'Nieaktywne' },
  BROKEN: { dot: '#EF4444', label: 'Uszkodzone' },
  RETIRED: { dot: '#9CA3AF', label: 'Wycofane' },
  IN_SERVICE: { dot: '#F59E0B', label: 'W serwisie' },
};

function ProgressBar({ value, max, color, label, detail }: { value: number; max: number; color: string; label: string; detail: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{detail}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function timeSince(dateStr?: string): string {
  if (!dateStr) return 'Brak danych';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} godz. temu`;
  const days = Math.floor(hrs / 24);
  return `${days} dni temu`;
}

export function PortalDevicesPage() {
  const { user } = useAuth();
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices-portal'],
    queryFn: () => devicesApi.getAll(),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>DEVICES</p>
        <h1 className="text-[22px] font-semibold text-white/90">Moje urządzenia</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{devices.length} urządzeń</p>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-[18px] p-12 text-center" style={glass()}>
          <Monitor className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak urządzeń</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d: Device) => {
            const agent = d.agentInfo;
            const lastSeen = agent?.lastSeen || (d.agents && d.agents.length > 0 ? d.agents[0].lastSeen : undefined);
            const hasAgent = !!agent;
            const statusInfo = STATUS_COLORS[d.status] || STATUS_COLORS.INACTIVE;

            return (
              <div key={d.id} className="rounded-[18px] p-5 transition-all duration-200 hover:scale-[1.01]" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
                {/* Device header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(96,165,250,0.12)' }}>
                    <Monitor className="h-5 w-5" style={{ color: '#60A5FA' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-white/90 truncate">{d.name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {d.deviceType?.name}{d.location ? ` · ${d.location.name}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ background: statusInfo.dot }} />
                    <span className="text-[10px] font-medium" style={{ color: statusInfo.dot }}>{statusInfo.label}</span>
                  </div>
                </div>

                {/* Device info */}
                <div className="space-y-1.5 mb-4">
                  {d.hostname && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Hostname</span>
                      <span className="text-[11px] font-mono text-white/60">{d.hostname}</span>
                    </div>
                  )}
                  {d.ipAddress && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>IP</span>
                      <span className="text-[11px] font-mono text-white/60">{d.ipAddress}</span>
                    </div>
                  )}
                  {d.operatingSystem && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>System</span>
                      <span className="text-[11px] text-white/60">{d.operatingSystem}{d.osVersion ? ` ${d.osVersion}` : ''}</span>
                    </div>
                  )}
                </div>

                {/* Agent metrics */}
                {hasAgent ? (
                  <div className="space-y-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Wifi className="h-3 w-3" style={{ color: '#22C55E' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#22C55E' }}>Agent online</span>
                      <span className="text-[10px] ml-auto" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        <Clock className="h-3 w-3 inline mr-1" />{timeSince(lastSeen)}
                      </span>
                    </div>

                    {agent.cpuUsage != null && (
                      <ProgressBar
                        value={agent.cpuUsage}
                        max={100}
                        color={agent.cpuUsage > 80 ? '#EF4444' : agent.cpuUsage > 50 ? '#F59E0B' : '#22C55E'}
                        label="CPU"
                        detail={`${Math.round(agent.cpuUsage)}%`}
                      />
                    )}

                    {agent.ramUsage != null && (
                      <ProgressBar
                        value={agent.ramUsage}
                        max={100}
                        color={agent.ramUsage > 80 ? '#EF4444' : agent.ramUsage > 50 ? '#F59E0B' : '#60A5FA'}
                        label="RAM"
                        detail={`${Math.round(agent.ramUsage)}%${agent.ramTotalGb ? ` / ${agent.ramTotalGb} GB` : ''}`}
                      />
                    )}

                    {agent.diskTotal != null && agent.diskFree != null && (
                      <ProgressBar
                        value={agent.diskTotal - agent.diskFree}
                        max={agent.diskTotal}
                        color={(agent.diskTotal - agent.diskFree) / agent.diskTotal > 0.85 ? '#EF4444' : '#A78BFA'}
                        label="Dysk"
                        detail={`${agent.diskFree.toFixed(1)} GB wolne / ${agent.diskTotal.toFixed(1)} GB`}
                      />
                    )}
                  </div>
                ) : (
                  <div className="pt-3 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <WifiOff className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak agenta</span>
                  </div>
                )}

                {/* Client visible notes */}
                {d.clientVisibleNotes && (
                  <div className="mt-3 p-2.5 rounded-xl text-[11px]" style={{ background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.4)' }}>
                    {d.clientVisibleNotes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

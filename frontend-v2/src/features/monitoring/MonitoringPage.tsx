import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, Server, MapPin, Shield, Cpu,
  HardDrive, Zap, ChevronRight, Wifi, WifiOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn, formatRelativePl } from '@/lib/utils';

interface DeviceRow {
  id: string;
  name: string;
  hostname: string | null;
  category: string;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  ipAddress: string | null;
  operatingSystem: string | null;
  location: { id: string; name: string; city: string | null } | null;
  online: boolean;
  lastSeen: string | null;
  agentVersion: string | null;
  auditScore: number | null;
  cpuUsage: number | null;
  ramUsagePercent: number | null;
  diskUsagePercent: number | null;
  openAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
}

interface Histogram {
  day: string;
  total: number;
  critical: number;
  high: number;
  resolved: number;
}

interface Overview {
  summary: {
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    activeAlerts: number;
    criticalAlerts: number;
    avgAuditScore: number | null;
  };
  alertsBySeverity: Record<string, number>;
  histogram: Histogram[];
  devices: DeviceRow[];
}

interface NetworkNode {
  id: string;
  name: string;
  city: string | null;
  deviceCount: number;
  devices: {
    id: string;
    name: string;
    category: string;
    criticality: string;
    ipAddress: string | null;
    online: boolean;
    lastSeen: string | null;
    hasCritical: boolean;
    hasHigh: boolean;
    alertCount: number;
  }[];
}

function scoreColor(score: number | null) {
  if (score === null) return 'var(--tx3)';
  if (score >= 85) return 'var(--ok)';
  if (score >= 70) return 'var(--wn)';
  return 'var(--er)';
}

function scoreBg(score: number | null) {
  if (score === null) return 'var(--sf-h)';
  if (score >= 85) return 'var(--ok-l)';
  if (score >= 70) return 'var(--wn-l)';
  return 'var(--er-l)';
}

function pctBar(value: number | null) {
  if (value === null) return { w: 0, color: 'var(--tx3)' };
  const w = Math.max(0, Math.min(100, value));
  const color = w >= 85 ? 'var(--er)' : w >= 70 ? 'var(--wn)' : 'var(--ok)';
  return { w, color };
}

export function MonitoringPage() {
  const [tab, setTab] = useState<'overview' | 'devices' | 'network'>('overview');
  const [sort, setSort] = useState<'score' | 'alerts' | 'name'>('score');

  const overviewQ = useQuery<Overview>({
    queryKey: ['monitoring', 'overview'],
    queryFn: async () => (await api.get<Overview>('/monitoring/overview')).data,
    refetchInterval: 60_000,
  });

  const networkQ = useQuery<{ nodes: NetworkNode[] }>({
    queryKey: ['monitoring', 'network'],
    queryFn: async () => (await api.get<{ nodes: NetworkNode[] }>('/monitoring/network')).data,
    enabled: tab === 'network',
  });

  const sortedDevices = useMemo(() => {
    if (!overviewQ.data) return [];
    const arr = [...overviewQ.data.devices];
    if (sort === 'score') {
      arr.sort((a, b) => {
        if (a.auditScore === null && b.auditScore === null) return 0;
        if (a.auditScore === null) return 1;
        if (b.auditScore === null) return -1;
        return a.auditScore - b.auditScore;
      });
    } else if (sort === 'alerts') {
      arr.sort((a, b) => b.openAlerts - a.openAlerts || b.criticalAlerts - a.criticalAlerts);
    } else {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [overviewQ.data, sort]);

  if (overviewQ.isLoading) {
    return (
      <div className="space-y-[var(--sp-4)]">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const s = overviewQ.data?.summary;
  const hist = overviewQ.data?.histogram ?? [];
  const maxHist = Math.max(1, ...hist.map((h) => h.total));

  return (
    <div className="space-y-[var(--sp-4)]">
      <div className="flex items-center justify-between gap-[var(--sp-3)]">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Monitoring</h1>
          <p className="text-[13px] text-[var(--tx3)] mt-0.5">
            Audyt urządzeń · Alerty · Mapa sieci — wszystko live z agentów.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-[var(--r-s)] border border-[var(--bd)]">
          {(['overview', 'devices', 'network'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1.5 rounded-[var(--r-xs)] text-[12px] transition-colors',
                tab === t ? 'bg-[var(--pri-l)] text-[var(--pri)] font-medium' : 'text-[var(--tx2)] hover:bg-[var(--sf-h)]',
              )}
            >
              {t === 'overview' ? 'Przegląd' : t === 'devices' ? 'Audyt urządzeń' : 'Mapa sieci'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-[var(--sp-3)]">
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
                <Server size={12} /> Urządzenia
              </div>
              <div className="text-[28px] font-semibold mt-1">{s.totalDevices}</div>
              <div className="text-[11px] text-[var(--tx3)] mt-1">
                {s.onlineDevices} online · {s.offlineDevices} offline
              </div>
            </Card>
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
                <Wifi size={12} /> Online
              </div>
              <div className="text-[28px] font-semibold mt-1 text-[var(--ok)]">
                {s.onlineDevices}
              </div>
              <div className="text-[11px] text-[var(--tx3)] mt-1">
                {s.totalDevices > 0 ? Math.round((s.onlineDevices / s.totalDevices) * 100) : 0}%
              </div>
            </Card>
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
                <AlertTriangle size={12} /> Alerty
              </div>
              <div className="text-[28px] font-semibold mt-1 text-[var(--wn)]">
                {s.activeAlerts}
              </div>
              <div className="text-[11px] text-[var(--er)] mt-1">
                {s.criticalAlerts > 0 ? `${s.criticalAlerts} krytycznych` : 'brak krytycznych'}
              </div>
            </Card>
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
                <Shield size={12} /> Audit Score
              </div>
              <div
                className="text-[28px] font-semibold mt-1"
                style={{ color: scoreColor(s.avgAuditScore) }}
              >
                {s.avgAuditScore ?? '—'}
              </div>
              <div className="text-[11px] text-[var(--tx3)] mt-1">średnia z floty</div>
            </Card>
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
                <Activity size={12} /> Alerty 7 dni
              </div>
              <div className="flex items-end gap-0.5 mt-2 h-10">
                {hist.map((h) => (
                  <div
                    key={h.day}
                    className="flex-1 flex flex-col-reverse"
                    title={`${h.day}: ${h.total} alertów`}
                  >
                    {h.critical > 0 && (
                      <div
                        style={{
                          height: `${(h.critical / maxHist) * 100}%`,
                          background: 'var(--er)',
                          minHeight: h.critical > 0 ? 2 : 0,
                        }}
                      />
                    )}
                    {h.high > 0 && (
                      <div
                        style={{
                          height: `${(h.high / maxHist) * 100}%`,
                          background: 'var(--wn)',
                          minHeight: h.high > 0 ? 2 : 0,
                        }}
                      />
                    )}
                    {h.total - h.critical - h.high > 0 && (
                      <div
                        style={{
                          height: `${((h.total - h.critical - h.high) / maxHist) * 100}%`,
                          background: 'var(--in)',
                          minHeight: 2,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Worst-scored devices teaser */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-[var(--wn)]" />
                <span className="text-[13px] font-medium">Najniższe wyniki audytu</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTab('devices')}>
                Zobacz wszystkie <ChevronRight size={14} />
              </Button>
            </div>
            <div className="divide-y divide-[var(--bd)]">
              {sortedDevices.slice(0, 5).map((d) => (
                <DeviceRow key={d.id} d={d} />
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'devices' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)]">
            <span className="text-[13px] font-medium">
              {sortedDevices.length} {sortedDevices.length === 1 ? 'urządzenie' : 'urządzeń'}
            </span>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-[var(--tx3)]">Sortuj:</span>
              {([
                ['score', 'Audit score'],
                ['alerts', 'Alerty'],
                ['name', 'Nazwa'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={cn(
                    'px-2 py-1 rounded-[var(--r-xs)] transition-colors',
                    sort === key ? 'bg-[var(--pri-l)] text-[var(--pri)]' : 'text-[var(--tx2)] hover:bg-[var(--sf-h)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {sortedDevices.map((d) => (
              <DeviceRow key={d.id} d={d} detailed />
            ))}
          </div>
        </Card>
      )}

      {tab === 'network' && (
        <NetworkMap nodes={networkQ.data?.nodes ?? []} loading={networkQ.isLoading} />
      )}
    </div>
  );
}

function DeviceRow({ d, detailed }: { d: DeviceRow; detailed?: boolean }) {
  const cpu = pctBar(d.cpuUsage);
  const ram = pctBar(d.ramUsagePercent);
  const disk = pctBar(d.diskUsagePercent);

  return (
    <Link
      to={`/devices/${d.id}`}
      className="flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] hover:bg-[var(--sf-h)] transition-colors"
    >
      {/* Online indicator */}
      <div
        className="shrink-0 w-2 h-2 rounded-full"
        style={{ background: d.online ? 'var(--ok)' : 'var(--tx3)' }}
        title={d.online ? 'Online' : 'Offline'}
      />

      {/* Audit score badge */}
      <div
        className="shrink-0 w-11 h-11 rounded-[var(--r-s)] flex flex-col items-center justify-center"
        style={{ background: scoreBg(d.auditScore) }}
      >
        <div className="text-[14px] font-semibold leading-none" style={{ color: scoreColor(d.auditScore) }}>
          {d.auditScore ?? '—'}
        </div>
        <div className="text-[8px] uppercase tracking-wider" style={{ color: scoreColor(d.auditScore), opacity: 0.7 }}>
          score
        </div>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium truncate">{d.name}</span>
          {d.criticality === 'CRITICAL' && <Badge variant="danger">Krytyczny</Badge>}
          {d.openAlerts > 0 && (
            <Badge variant={d.criticalAlerts > 0 ? 'danger' : 'warning'}>
              {d.openAlerts} {d.openAlerts === 1 ? 'alert' : 'alertów'}
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-[var(--tx3)] mt-0.5 truncate flex items-center gap-2">
          {d.hostname && <span>{d.hostname}</span>}
          {d.ipAddress && <span>· {d.ipAddress}</span>}
          {d.location && <span>· {d.location.name}</span>}
          {d.lastSeen && <span>· {formatRelativePl(d.lastSeen)}</span>}
        </div>
      </div>

      {/* CPU/RAM/Disk bars (detailed view only) */}
      {detailed && (
        <div className="hidden md:flex gap-[var(--sp-3)] w-[260px] shrink-0">
          {[
            { label: 'CPU', icon: Cpu, ...cpu, value: d.cpuUsage },
            { label: 'RAM', icon: Zap, ...ram, value: d.ramUsagePercent },
            { label: 'Disk', icon: HardDrive, ...disk, value: d.diskUsagePercent },
          ].map(({ label, icon: Icon, w, color, value }) => (
            <div key={label} className="flex-1">
              <div className="flex items-center justify-between text-[10px] text-[var(--tx3)]">
                <span className="flex items-center gap-1">
                  <Icon size={9} />
                  {label}
                </span>
                <span>{value === null ? '—' : `${Math.round(value)}%`}</span>
              </div>
              <div className="h-1 rounded-full bg-[var(--sf-h)] mt-1 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${w}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <ChevronRight size={14} className="shrink-0 text-[var(--tx3)]" />
    </Link>
  );
}

function NetworkMap({ nodes, loading }: { nodes: NetworkNode[]; loading: boolean }) {
  if (loading) return <SkeletonCard />;
  if (nodes.length === 0) {
    return (
      <Card className="p-[var(--sp-6)] text-center text-[var(--tx3)]">
        <MapPin size={32} className="mx-auto mb-3 opacity-40" />
        <div>Brak lokalizacji z urządzeniami.</div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-4)]">
      {nodes.map((node) => (
        <Card key={node.id} className="p-[var(--sp-4)]">
          <div className="flex items-center justify-between mb-[var(--sp-3)]">
            <div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-[var(--pri)]" />
                <span className="text-[13px] font-medium">{node.name}</span>
              </div>
              {node.city && <div className="text-[11px] text-[var(--tx3)] mt-0.5">{node.city}</div>}
            </div>
            <Badge variant="accent">
              {node.deviceCount} {node.deviceCount === 1 ? 'urządzenie' : 'urządzeń'}
            </Badge>
          </div>
          {/* Radial SVG map */}
          <LocationRadialMap devices={node.devices} />
          <div className="mt-[var(--sp-3)] flex flex-wrap gap-1.5 text-[11px]">
            {node.devices.slice(0, 8).map((d) => (
              <Link
                key={d.id}
                to={`/devices/${d.id}`}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border',
                  d.hasCritical
                    ? 'border-[var(--er-b)] bg-[var(--er-l)] text-[var(--er)]'
                    : d.hasHigh
                    ? 'border-[var(--wn-b)] bg-[var(--wn-l)] text-[var(--wn)]'
                    : d.online
                    ? 'border-[var(--bd)] bg-[var(--sf-h)] text-[var(--tx2)]'
                    : 'border-[var(--bd)] bg-[var(--sf)] text-[var(--tx3)]',
                )}
                title={d.name}
              >
                {d.online ? <Wifi size={9} /> : <WifiOff size={9} />}
                <span className="truncate max-w-[120px]">{d.name}</span>
              </Link>
            ))}
            {node.devices.length > 8 && (
              <span className="text-[var(--tx3)] px-2 py-0.5">+{node.devices.length - 8}</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function LocationRadialMap({ devices }: { devices: NetworkNode['devices'] }) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const hubR = 22;
  const nodeR = 8;
  const ringR = size / 2 - nodeR - 6;
  const n = Math.min(devices.length, 16);
  const visible = devices.slice(0, n);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" style={{ maxHeight: 260 }}>
      {/* Ring guide */}
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--bd)" strokeDasharray="2 4" opacity={0.5} />

      {visible.map((d, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * ringR;
        const y = cy + Math.sin(angle) * ringR;
        const color = d.hasCritical
          ? 'var(--er)'
          : d.hasHigh
          ? 'var(--wn)'
          : d.online
          ? 'var(--ok)'
          : 'var(--tx3)';
        return (
          <g key={d.id}>
            <line
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={d.online ? color : 'var(--bd)'}
              strokeWidth={d.online ? 1.5 : 1}
              strokeDasharray={d.online ? undefined : '3 3'}
              opacity={d.online ? 0.7 : 0.35}
            />
            <circle cx={x} cy={y} r={nodeR} fill={color} opacity={d.online ? 1 : 0.5}>
              <title>{d.name}</title>
            </circle>
            {d.hasCritical && (
              <circle cx={x} cy={y} r={nodeR + 4} fill="none" stroke={color} strokeWidth={1} opacity={0.5}>
                <animate attributeName="r" values={`${nodeR + 2};${nodeR + 8};${nodeR + 2}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}

      {/* Hub */}
      <circle cx={cx} cy={cy} r={hubR} fill="var(--pri-l)" stroke="var(--pri)" strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--pri)">
        HUB
      </text>
    </svg>
  );
}


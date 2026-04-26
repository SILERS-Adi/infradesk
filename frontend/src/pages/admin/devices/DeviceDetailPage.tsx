import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Monitor, Copy, Check, QrCode, ExternalLink,
  Edit2, Download, User, MapPin, Wifi, Plus,
  Building2, Laptop, Cpu, CircuitBoard, HardDrive,
  Thermometer, Clock, Radio, Activity,
  Shield, CheckCircle2, XCircle, AlertTriangle,
  Gauge, Key, Wrench, FileText, PlayCircle, Zap
} from 'lucide-react';
import { AiCoreOrb, type AiCoreState } from '../../../components/ai/AiCoreOrb';
import apiClient from '../../../api/client';
import toast from 'react-hot-toast';
import { devicesApi } from '../../../api/devices';
import { agentsApi } from '../../../api/agents';
import { credentialsApi } from '../../../api/credentials';
import { ticketsApi } from '../../../api/tickets';
import { activityLogsApi } from '../../../api/activityLogs';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { DeviceStatusBadge } from '../../../components/ui/StatusBadge';
import { CriticalityBadge } from '../../../components/ui/PriorityBadge';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { PasswordRevealField } from '../../../components/ui/PasswordRevealField';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { Modal } from '../../../components/ui/Modal';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { formatDate, formatDateTime, copyToClipboard, isExpired } from '../../../utils/helpers';
import { useAuth } from '../../../store/authStore';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import type { Ticket, Credential } from '../../../types';

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyToClipboard(value);
    setCopied(true);
    toast.success(`${label ?? 'Skopiowano'}`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} className="transition-colors p-0.5" style={{ color: 'var(--tm)' }} title="Kopiuj">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function InfoRow({ label, value, mono, children }: { label: string; value?: string | null; mono?: boolean; children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium w-32 flex-shrink-0 mt-0.5" style={{ color: 'var(--tm)' }}>{label}</span>
      {children ?? (
        <span className={`text-sm text-white/80 flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
          {value}
          {mono && value && <CopyButton value={value} label={`${label} skopiowane`} />}
        </span>
      )}
    </div>
  );
}

// ── Konfiguracja narzędzi zdalnych ────────────────────────────────────────────
const REMOTE_TOOLS = [
  {
    key: 'rustdeskId' as const,
    label: 'RustDesk',
    color: 'border rounded-xl',
    colorStyle: { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.2)' },
    labelColor: 'text-emerald-400',
    btnColor: 'bg-emerald-600 hover:bg-emerald-700',
    href: (id: string) => `rustdesk://id=${id}`,
    connectLabel: 'Połącz',
  },
  {
    key: 'anydeskId' as const,
    label: 'AnyDesk',
    color: 'border rounded-xl',
    colorStyle: { background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.2)' },
    labelColor: 'text-red-400',
    btnColor: 'bg-red-500 hover:bg-red-600',
    href: (id: string) => `anydesk:${id}`,
    connectLabel: 'Połącz',
  },
  {
    key: 'teamviewerId' as const,
    label: 'TeamViewer',
    color: 'border rounded-xl',
    colorStyle: { background: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.2)' },
    labelColor: 'text-blue-400',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
    href: (id: string) => `teamviewer10://control?device=${id}`,
    connectLabel: 'Połącz',
  },
  {
    key: 'rdpAddress' as const,
    label: 'RDP',
    color: 'border rounded-xl',
    colorStyle: { background: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.2)' },
    labelColor: 'text-indigo-400',
    btnColor: 'bg-indigo-600 hover:bg-indigo-700',
    href: (id: string) => `rdp://${id}`,
    connectLabel: 'Połącz',
  },
  {
    key: 'sshAddress' as const,
    label: 'SSH',
    color: 'border rounded-xl',
    colorStyle: { background: 'var(--hover-bg)', borderColor: 'var(--border)' },
    labelColor: 'text-white/60',
    btnColor: 'bg-gray-600 hover:bg-gray-700',
    href: (id: string) => `ssh://${id}`,
    connectLabel: 'Połącz',
  },
  {
    key: 'customRemoteLink' as const,
    label: 'Własny link',
    color: 'border rounded-xl',
    colorStyle: { background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.2)' },
    labelColor: 'text-purple-400',
    btnColor: 'bg-purple-600 hover:bg-purple-700',
    href: (id: string) => id,
    connectLabel: 'Otwórz',
  },
] as const;

// ── Pasek zasobu ─────────────────────────────────────────────────────────────
function ResourceBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── Box: Parametry z agenta ───────────────────────────────────────────────────
function AgentStatsBox({ agent }: { agent: NonNullable<import('../../../types').Device['agentInfo']> }) {
  const ramUsedGb = agent.ramTotalGb && agent.ramUsage != null
    ? ((agent.ramUsage / 100) * agent.ramTotalGb).toFixed(1)
    : null;

  const cpuColor  = (agent.cpuUsage  ?? 0) > 85 ? 'bg-red-500'    : (agent.cpuUsage  ?? 0) > 60 ? 'bg-amber-400' : 'bg-emerald-500';
  const ramColor  = (agent.ramUsage  ?? 0) > 85 ? 'bg-red-500'    : (agent.ramUsage  ?? 0) > 60 ? 'bg-amber-400' : 'bg-blue-500';
  const diskUsed  = agent.diskTotal && agent.diskFree != null ? agent.diskTotal - agent.diskFree : null;
  const diskPct   = agent.diskTotal && diskUsed != null ? (diskUsed / agent.diskTotal) * 100 : null;
  const diskColor = (diskPct ?? 0) > 90 ? 'bg-red-500' : (diskPct ?? 0) > 75 ? 'bg-amber-400' : 'bg-indigo-500';
  const tempColor = (agent.cpuTempC ?? 0) > 85 ? 'text-red-400' : (agent.cpuTempC ?? 0) > 65 ? 'text-amber-400' : 'text-emerald-400';

  const isOnline = agent.lastSeen
    ? (Date.now() - new Date(agent.lastSeen).getTime()) < 5 * 60 * 1000
    : false;

  return (
    <div className="space-y-4">
      {/* Status agenta */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : ''}`} style={!isOnline ? { background: 'var(--td)' } : {}} />
          <span className={isOnline ? 'text-emerald-400 font-medium' : ''} style={!isOnline ? { color: 'var(--tm)' } : {}}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {agent.appVersion && <span className="ml-1" style={{ color: 'var(--tm)' }}>v{agent.appVersion}</span>}
        </div>
        {agent.lastSeen && (
          <span className="flex items-center gap-1" style={{ color: 'var(--tm)' }}>
            <Clock className="h-3 w-3" />
            {new Date(agent.lastSeen).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </div>

      {/* CPU */}
      {agent.cpuUsage != null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ts)' }}>
              <Cpu className="h-3.5 w-3.5" />
              <span>CPU</span>
              {agent.cpuModel && <span className="font-normal truncate max-w-[200px]" style={{ color: 'var(--tm)' }}>{agent.cpuModel}</span>}
              {agent.cpuCores && <span style={{ color: 'var(--tm)' }}>· {agent.cpuCores}C/{agent.cpuThreads}T</span>}
            </div>
            <div className="flex items-center gap-2">
              {agent.cpuTempC != null && (
                <span className={`text-xs font-semibold flex items-center gap-0.5 ${tempColor}`}>
                  <Thermometer className="h-3 w-3" />
                  {agent.cpuTempC}°C
                </span>
              )}
              <span className="text-xs font-bold" style={{ color: 'var(--ts)' }}>{agent.cpuUsage.toFixed(1)}%</span>
            </div>
          </div>
          <ResourceBar pct={agent.cpuUsage} color={cpuColor} />
        </div>
      )}

      {/* RAM */}
      {agent.ramUsage != null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ts)' }}>
              <CircuitBoard className="h-3.5 w-3.5" />
              <span>RAM</span>
              {agent.ramTotalGb && <span className="font-normal" style={{ color: 'var(--tm)' }}>· {agent.ramTotalGb} GB</span>}
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--ts)' }}>
              {ramUsedGb && `${ramUsedGb} / ${agent.ramTotalGb} GB`} ({agent.ramUsage.toFixed(1)}%)
            </span>
          </div>
          <ResourceBar pct={agent.ramUsage} color={ramColor} />
        </div>
      )}

      {/* Dysk C: */}
      {diskPct != null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ts)' }}>
              <HardDrive className="h-3.5 w-3.5" />
              <span>Dysk C:</span>
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--ts)' }}>
              {diskUsed != null && agent.diskTotal
                ? `${diskUsed.toFixed(1)} / ${agent.diskTotal.toFixed(1)} GB`
                : ''} ({diskPct.toFixed(1)}%)
            </span>
          </div>
          <ResourceBar pct={diskPct} color={diskColor} />
        </div>
      )}

      {/* Dodatkowe dyski z diskInfo */}
      {Array.isArray(agent.diskInfo) && agent.diskInfo.filter(d => d.mountpoint !== 'C:\\').map(disk => (
        <div key={disk.mountpoint}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--tm)' }}>
              <HardDrive className="h-3 w-3" />
              <span>{disk.mountpoint}</span>
              <span className="font-normal" style={{ color: 'var(--tm)' }}>· {disk.totalGb} GB</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--ts)' }}>
              {(disk.totalGb - disk.freeGb).toFixed(1)} / {disk.totalGb} GB ({disk.usedPct}%)
            </span>
          </div>
          <ResourceBar
            pct={disk.usedPct}
            color={disk.usedPct > 90 ? 'bg-red-500' : disk.usedPct > 75 ? 'bg-amber-400' : 'bg-indigo-400'}
          />
        </div>
      ))}

      {/* Sieć */}
      {Array.isArray(agent.networkIfaces) && agent.networkIfaces.filter(n => n.ip && n.isUp).length > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: 'var(--ts)' }}>
            <Radio className="h-3.5 w-3.5" />
            Sieć
          </div>
          <div className="grid grid-cols-1 gap-1">
            {agent.networkIfaces.filter(n => n.ip && n.isUp).map(iface => (
              <div key={iface.name} className="flex items-center justify-between text-xs rounded-lg px-3 py-1.5" style={{ background: 'var(--bg-card)' }}>
                <span className="font-medium truncate max-w-[160px]" style={{ color: 'var(--ts)' }}>{iface.name}</span>
                <div className="flex items-center gap-2" style={{ color: 'var(--tm)' }}>
                  <span className="font-mono">{iface.ip}</span>
                  {iface.mac && <span className="font-mono" style={{ color: 'var(--tm)' }}>{iface.mac}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ostatni rozruch */}
      {agent.lastBootTime && (
        <div className="flex items-center gap-1.5 text-xs pt-1" style={{ color: 'var(--tm)' }}>
          <Activity className="h-3.5 w-3.5" />
          <span>Ostatni rozruch:</span>
          <span className="font-medium" style={{ color: 'var(--ts)' }}>{new Date(agent.lastBootTime).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      )}
    </div>
  );
}

// ── Mała mapka OpenStreetMap ───────────────────────────────────────────────────
function LocationMap({ lat, lon, label }: { lat: number; lon: number; label?: string }) {
  const delta = 0.008;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <iframe
        src={src}
        title={label ?? 'Lokalizacja'}
        className="w-full h-40 block"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1 py-1.5 text-xs text-violet-400 hover:bg-white/[0.03] transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        Otwórz w mapach
      </a>
    </div>
  );
}

// ── Mapka z adresu (link do Google Maps) ──────────────────────────────────────
function LocationAddress({ address, label }: { address: string; label?: string }) {
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" />
      {label ?? address}
    </a>
  );
}

type TabId = 'info' | 'remote' | 'vault' | 'metrics' | 'speedtest' | 'licenses' | 'selfheal' | 'logs' | 'backup' | 'history';

const TABS: { id: TabId; label: string; icon?: string }[] = [
  { id: 'info', label: 'Przegląd' },
  { id: 'remote', label: 'Zdalny dostęp' },
  { id: 'vault', label: 'Hasła' },
  { id: 'metrics', label: 'Metryki' },
  { id: 'speedtest', label: 'Prędkość' },
  { id: 'licenses', label: 'Licencje' },
  { id: 'selfheal', label: 'Auto-naprawy' },
  { id: 'logs', label: 'Logi' },
  { id: 'backup', label: 'Backup' },
  { id: 'history', label: 'Historia' },
];

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('info');
  const [showEdit, setShowEdit] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const { data: device, isLoading } = useQuery({
    queryKey: ['devices', id],
    queryFn: () => devicesApi.getOne(id!),
    enabled: !!id,
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials', { deviceId: id }],
    queryFn: () => credentialsApi.getAll({ deviceId: id }),
    enabled: !!id,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', { deviceId: id }],
    queryFn: () => ticketsApi.getAll(),
    select: (data) => data.filter(t => t.deviceId === id),
    enabled: !!id,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['activity-logs', { entityId: id }],
    queryFn: () => activityLogsApi.getAll({ entityId: id, entityType: 'DEVICE', limit: 20 }),
    enabled: !!id,
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['users', { roles: 'ADMIN,TECHNICIAN' }],
    queryFn: () => usersApi.getAll(),
    select: (data) => data.filter(u => (u as any).role === 'ADMIN' || (u as any).role === 'TECHNICIAN'),
  });

  const { data: agentData } = useQuery({
    queryKey: ['agent-server-metrics', id],
    queryFn: async () => {
      const agents = await agentsApi.getAll();
      const agent = agents.find(a => a.deviceId === id);
      return agent;
    },
    enabled: !!id,
  });
  const securityAudit = (agentData as any)?.serverMetrics?.securityAudit;
  const networkScan = (agentData as any)?.serverMetrics?.networkScan;
  const agentRegId = (agentData as any)?.id;

  // Snapshot history — speedtest / licenses / logs (fetched on tab change)
  const { data: speedtestHistory } = useQuery({
    queryKey: ['snapshots', agentRegId, 'speedtest'],
    queryFn: async () => {
      const r = await apiClient.get('/monitoring/history', { params: { agentId: agentRegId, type: 'speedtest', days: 14, full: 'true' } });
      return r.data as Array<{ id: string; score: number | null; createdAt: string; data: any }>;
    },
    enabled: !!agentRegId && tab === 'speedtest',
  });

  const { data: licenseHistory } = useQuery({
    queryKey: ['snapshots', agentRegId, 'license'],
    queryFn: async () => {
      const r = await apiClient.get('/monitoring/history', { params: { agentId: agentRegId, type: 'license', days: 60, full: 'true' } });
      return r.data as Array<{ id: string; createdAt: string; data: any }>;
    },
    enabled: !!agentRegId && tab === 'licenses',
  });

  const { data: logsHistory } = useQuery({
    queryKey: ['snapshots', agentRegId, 'logs'],
    queryFn: async () => {
      const r = await apiClient.get('/monitoring/history', { params: { agentId: agentRegId, type: 'logs', days: 7, full: 'true' } });
      return r.data as Array<{ id: string; createdAt: string; data: any }>;
    },
    enabled: !!agentRegId && tab === 'logs',
  });

  const updateManagerMutation = useMutation({
    mutationFn: (managerId: string | null) => devicesApi.update(id!, { managerId } as any),
    onSuccess: () => {
      toast.success('Opiekun zaktualizowany');
      qc.invalidateQueries({ queryKey: ['devices', id] });
    },
    onError: () => toast.error('Błąd zapisu opiekuna'),
  });

  const { isAdmin, isTechnician: isTech } = useWorkspaceContext();
  const canSeeInternal = isAdmin || isTech;

  if (isLoading) return <LoadingSpinner />;
  if (!device) return <div className="text-sm" style={{ color: 'var(--tm)' }}>Nie znaleziono urządzenia</div>;

  // Aktywne narzędzia zdalne (tylko te z ID)
  const activeRemoteTools = REMOTE_TOOLS.filter(t => !!(device as any)[t.key]);

  const handleLoadQr = async () => {
    if (qrBase64) return;
    setLoadingQr(true);
    try {
      const qr = await devicesApi.getQr(device.id);
      setQrBase64(qr);
    } catch {
      toast.error('Nie można załadować QR');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrBase64) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${qrBase64}`;
    link.download = `qr-${device.name.replace(/\s+/g, '-')}.png`;
    link.click();
  };

  const openTickets = tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status));
  const closedTickets = tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));

  // Adres lokalizacji do mapki
  const loc = device.location;
  const locationAddress = [loc?.addressLine1, loc?.postalCode && loc?.city ? `${loc.postalCode} ${loc.city}` : loc?.city, loc?.country]
    .filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        title={device.name}
        back="/devices"
        subtitle={`${device.deviceType?.name ?? 'Urządzenie'} · ${device.location?.name || '—'}`}
        actions={
          <div className="flex items-center gap-3">
            <DeviceStatusBadge status={device.status} />
            <CriticalityBadge criticality={device.criticality} />
            {canSeeInternal && (
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors hover:text-violet-400"
                style={{ color: 'var(--ts)', border: '1px solid var(--border)' }}
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edytuj
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-0 mb-5 rounded-2xl overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors"
            style={tab === t.id
              ? { background: 'rgba(139,92,246,0.12)', color: 'var(--accent-s)', borderBottom: '2px solid var(--accent)' }
              : { color: 'var(--tm)', borderBottom: '2px solid transparent' }
            }
            onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'var(--ts)'; }}
            onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'var(--tm)'; }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Informacje podstawowe ── */}
          <Card title="Informacje podstawowe">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {/* Lokalizacja */}
              <InfoRow label="Lokalizacja">
                {device.location ? (
                  <Link to={`/locations/${device.location.id}`} className="text-sm text-violet-400 hover:underline flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                    {device.location.name}
                  </Link>
                ) : null}
              </InfoRow>

              {/* Użytkownik */}
              <InfoRow label="Użytkownik">
                {device.assignedUser ? (
                  <span className="text-sm text-white/80 flex items-center gap-1">
                    <User className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--tm)' }} />
                    {device.assignedUser.firstName} {device.assignedUser.lastName}
                  </span>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--tm)' }}>— nie przypisano —</span>
                )}
              </InfoRow>

              {/* Typ + Asset Tag */}
              <InfoRow label="Typ urządzenia" value={device.deviceType?.name} />
              <InfoRow label="Asset Tag" value={device.assetTag} mono />
            </div>

            {/* Lokalizacja + mapka */}
            {loc && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--tm)' }} />
                  <div>
                    <p className="text-sm font-medium text-white/80">{loc.name}</p>
                    {locationAddress && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>{locationAddress}</p>
                    )}
                  </div>
                </div>
                {/* Mapka GPS jeśli są współrzędne */}
                {device.gpsLat && device.gpsLon ? (
                  <LocationMap lat={device.gpsLat} lon={device.gpsLon} label={loc.name} />
                ) : locationAddress ? (
                  <LocationAddress address={`${loc.name}, ${locationAddress}`} label="Zobacz na mapie" />
                ) : null}
              </div>
            )}
          </Card>

          {/* ── Dane techniczne ── */}
          <Card title="Dane techniczne">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label="Producent" value={device.manufacturer} />
              <InfoRow label="Model" value={device.model} />
              <InfoRow label="Hostname" value={device.hostname} mono />
              <InfoRow label="Adres IP" value={device.ipAddress} mono />
              <InfoRow label="MAC" value={device.macAddress} mono />
              <InfoRow label="System" value={device.operatingSystem} />
              <InfoRow label="Wersja OS" value={device.osVersion} />
              <InfoRow label="Numer seryjny" value={device.serialNumber} mono />
              <InfoRow label="Data zakupu" value={device.purchaseDate ? formatDate(device.purchaseDate) : null} />
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium w-32 flex-shrink-0 mt-0.5" style={{ color: 'var(--tm)' }}>Gwarancja do</span>
                {device.warrantyUntil ? (
                  <span className={`text-sm font-medium ${isExpired(device.warrantyUntil) ? 'text-red-400' : 'text-green-400'}`}>
                    {formatDate(device.warrantyUntil)}
                    {isExpired(device.warrantyUntil) && ' (wygasła)'}
                  </span>
                ) : <span className="text-sm" style={{ color: 'var(--tm)' }}>—</span>}
              </div>
            </div>
          </Card>

          {/* ── Parametry z agenta ── */}
          {device.agentInfo && (
            <Card title="Parametry urządzenia (Asystent)">
              <AgentStatsBox agent={device.agentInfo} />
            </Card>
          )}

          {/* ── Połączenia zdalne ── */}
          {activeRemoteTools.length > 0 && (
            <Card
              title="Połączenia zdalne"
              action={
                canSeeInternal ? (
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    Dodaj
                  </button>
                ) : null
              }
            >
              <div className="space-y-3">
                {activeRemoteTools.map(tool => {
                  const toolId = (device as any)[tool.key] as string;
                  return (
                    <div
                      key={tool.key}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${tool.color}`}
                      style={tool.colorStyle}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Wifi className={`h-4 w-4 flex-shrink-0 ${tool.labelColor}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${tool.labelColor}`}>{tool.label}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs font-mono truncate" style={{ color: 'var(--ts)' }}>{toolId}</span>
                            <CopyButton value={toolId} label={`${tool.label} ID skopiowane`} />
                          </div>
                        </div>
                      </div>
                      <a
                        href={tool.href(toolId)}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-colors ${tool.btnColor}`}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        {tool.connectLabel}
                      </a>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Brak narzędzi — placeholder z przyciskiem dodaj */}
          {activeRemoteTools.length === 0 && canSeeInternal && (
            <Card title="Połączenia zdalne">
              <div className="flex flex-col items-center py-6 gap-3">
                <Laptop className="h-8 w-8" style={{ color: 'var(--td)' }} />
                <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak skonfigurowanych połączeń</p>
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj RustDesk / AnyDesk / TeamViewer
                </button>
              </div>
            </Card>
          )}

          {/* ── Notatki ── */}
          {(canSeeInternal && device.internalNotes) || device.clientVisibleNotes ? (
            <Card title="Notatki">
              <div className="space-y-4">
                {canSeeInternal && device.internalNotes && (
                  <div>
                    <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--tm)' }}>Notatki wewnętrzne</div>
                    <div className="rounded-lg p-3 text-sm whitespace-pre-wrap" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)', color: 'var(--ts)' }}>
                      {device.internalNotes}
                    </div>
                  </div>
                )}
                {device.clientVisibleNotes && (
                  <div>
                    <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--tm)' }}>Notatki publiczne</div>
                    <div className="rounded-lg p-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--ts)' }}>
                      {device.clientVisibleNotes}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {/* ── Dane dostępowe ── */}
          {canSeeInternal && (
            <Card
              title={`Dane dostępowe (${credentials.length})`}
              action={
                <Link to={`/credentials?deviceId=${device.id}`} className="text-xs text-violet-400 hover:underline">
                  Zarządzaj
                </Link>
              }
            >
              {credentials.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak zapisanych danych dostępowych</p>
              ) : (
                <div>
                  {credentials.map((cred: Credential, idx: number) => (
                    <div key={cred.id} className="py-3 flex items-center justify-between gap-4" style={idx < credentials.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}>
                      <div>
                        <div className="text-sm font-medium text-white/80">{cred.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge color="gray">{cred.category}</Badge>
                          {cred.username && (
                            <span className="text-xs font-mono flex items-center gap-1" style={{ color: 'var(--tm)' }}>
                              {cred.username}
                              <CopyButton value={cred.username} label="Login skopiowany" />
                            </span>
                          )}
                          {cred.urlOrHost && <span className="text-xs" style={{ color: 'var(--tm)' }}>{cred.urlOrHost}</span>}
                        </div>
                      </div>
                      <PasswordRevealField
                        credentialName={cred.name}
                        onReveal={() => credentialsApi.reveal(cred.id).then(r => r.password)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ── Otwarte zgłoszenia ── */}
          <Card
            title={`Otwarte zgłoszenia (${openTickets.length})`}
            action={
              <Link to={`/tickets?deviceId=${device.id}`} className="text-xs text-violet-400 hover:underline">
                + Nowe
              </Link>
            }
          >
            {openTickets.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak otwartych zgłoszeń</p>
            ) : (
              <div className="space-y-2">
                {openTickets.map((t: Ticket) => (
                  <Link
                    key={t.id}
                    to={`/tickets/${t.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <div>
                      <span className="text-xs font-mono text-violet-400">{t.ticketNumber}</span>
                      <span className="text-sm text-white/80 ml-2">{t.title}</span>
                    </div>
                    <div className="flex gap-2">
                      <PriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* ── Historia zgłoszeń ── */}
          {closedTickets.length > 0 && (
            <Card title={`Historia zgłoszeń (${closedTickets.length})`}>
              <div className="space-y-2">
                {closedTickets.slice(0, 5).map((t: Ticket) => (
                  <Link
                    key={t.id}
                    to={`/tickets/${t.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                  >
                    <div>
                      <span className="text-xs font-mono" style={{ color: 'var(--tm)' }}>{t.ticketNumber}</span>
                      <span className="text-sm ml-2" style={{ color: 'var(--ts)' }}>{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--tm)' }}>{formatDate(t.reportedAt)}</span>
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* ── Kod QR ── */}
          <Card title="Kod QR" action={
            !qrBase64 ? (
              <button onClick={handleLoadQr} disabled={loadingQr} className="text-xs text-violet-400 hover:underline">
                {loadingQr ? 'Ładowanie...' : 'Wygeneruj'}
              </button>
            ) : (
              <button onClick={handleDownloadQr} className="flex items-center gap-1 text-xs text-violet-400 hover:underline">
                <Download className="h-3 w-3" />
                Pobierz
              </button>
            )
          }>
            {qrBase64 ? (
              <div className="flex flex-col items-center gap-3">
                <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code" className="w-40 h-40" />
                <div className="text-xs font-mono text-center break-all" style={{ color: 'var(--tm)' }}>{device.qrCodeValue}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center" style={{ borderColor: 'var(--border)' }}>
                  <QrCode className="h-8 w-8" style={{ color: 'var(--td)' }} />
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--tm)' }}>Kliknij "Wygeneruj" aby zobaczyć kod QR</p>
              </div>
            )}
          </Card>

          {/* ── Opiekun ── */}
          <Card title="Opiekun urządzenia">
            <div className="space-y-2">
              <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--tm)' }}>
                <User className="h-3.5 w-3.5" />
                Przypisany opiekun
              </label>
              <select
                value={(device as any).managerId ?? ''}
                onChange={(e) => updateManagerMutation.mutate(e.target.value || null)}
                disabled={updateManagerMutation.isPending}
                className="w-full text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
              >
                <option value="">— brak opiekuna —</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </Card>

          {/* ── Historia aktywności ── */}
          <Card title="Historia aktywności">
            {logs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak wpisów</p>
            ) : (
              <div className="space-y-3">
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex gap-2.5">
                    <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5" />
                    <div className="min-w-0">
                      <p className="text-xs" style={{ color: 'var(--ts)' }}>{log.description}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>
                        {log.performedBy ? `${log.performedBy.firstName} ${log.performedBy.lastName} · ` : ''}
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      )}

      {/* ═══ REMOTE TAB ═══ */}
      {tab === 'remote' && (
        <div className="space-y-5">
          {/* Remote tools */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REMOTE_TOOLS.map(tool => {
              const val = (device as any)[tool.key];
              if (!val) return null;
              return (
                <div key={tool.key} className="rounded-[16px] p-4" style={{ ...tool.colorStyle, border: `1px solid ${tool.colorStyle.borderColor}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${tool.labelColor}`}>{tool.label}</span>
                    <CopyButton value={val} label={`${tool.label} ID`} />
                  </div>
                  <p className="text-xs font-mono mb-3" style={{ color: 'var(--ts)' }}>{val}</p>
                  <a href={tool.href(val)} target="_blank" rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${tool.btnColor}`}>
                    <ExternalLink className="h-3 w-3" /> {tool.connectLabel}
                  </a>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          {agentData && (
            <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--t)' }}>Akcje zdalne</h3>
              <div className="flex flex-wrap gap-2">
                <RemoteActionBtn label="Restart drukarki" command="restart_print_spooler" agentId={(agentData as any).id} />
                <RemoteActionBtn label="Restart systemu" command="system_reboot" agentId={(agentData as any).id} confirmMsg="Na pewno chcesz zrestartować ten serwer?" />
                <RemoteActionBtn label="Wake-on-LAN" command="wake" agentId={(agentData as any).id} isWol />
                <RemoteActionBtn label="Windows Update" command="windows_update" agentId={(agentData as any).id} />
              </div>
            </div>
          )}

          {/* Work sessions */}
          <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Sesje pracy na tym urządzeniu</h3>
            {tickets.filter(t => t.status !== 'CANCELLED').length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--tm)' }}>Brak sesji pracy</p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--tm)' }}>Sesje pracy wyświetlane w zakładce Historia</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ VAULT TAB ═══ */}
      {tab === 'vault' && (
        <div className="space-y-3">
          {credentials.length === 0 ? (
            <div className="text-center py-12 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Shield className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--tm)' }}>Brak haseł przypisanych do tego urządzenia</p>
              {canSeeInternal && (
                <Link to="/vault" className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-violet-400">
                  <Plus className="h-3 w-3" /> Dodaj hasło w Sejfie
                </Link>
              )}
            </div>
          ) : (
            credentials.map((cred: Credential) => (
              <div key={cred.id} className="rounded-[16px] p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold" style={{ color: 'var(--t)' }}>{cred.name}</span>
                    <span className="ml-2"><Badge color="blue">{cred.category}</Badge></span>
                  </div>
                </div>
                {cred.username && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs" style={{ color: 'var(--tm)' }}>Login:</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--ts)' }}>{cred.username}</span>
                    <CopyButton value={cred.username} label="Login skopiowany" />
                  </div>
                )}
                <PasswordRevealField onReveal={async () => { const r = await credentialsApi.reveal(cred.id); return r.password || ''; }} credentialName={cred.name} />
                {cred.urlOrHost && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs" style={{ color: 'var(--tm)' }}>Host:</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--ts)' }}>{cred.urlOrHost}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ METRICS TAB (old security + network merged) ═══ */}
      {tab === 'metrics' && (
        <div className="space-y-5">
          {/* Live agent stats */}
          {(device as any).agentInfo && <AgentStatsBox agent={(device as any).agentInfo} />}

          {/* Remote data panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RemoteDataPanel title="Procesy" command="get_processes" agentId={(agentData as any)?.id} renderFn={(data: any) => (
              <div className="max-h-64 overflow-y-auto">
                {(data.processes || []).slice(0, 15).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="truncate max-w-[160px]" style={{ color: 'var(--ts)' }}>{p.name}</span>
                    <div className="flex gap-3" style={{ color: 'var(--tm)' }}>
                      <span>CPU: {p.cpu?.toFixed(1)}%</span>
                      <span>RAM: {p.memMb?.toFixed(0)} MB</span>
                    </div>
                  </div>
                ))}
              </div>
            )} />

            <RemoteDataPanel title="Oprogramowanie" command="get_installed_software" agentId={(agentData as any)?.id} renderFn={(data: any) => (
              <div className="max-h-64 overflow-y-auto">
                {(data.software || []).slice(0, 20).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="truncate max-w-[200px]" style={{ color: 'var(--ts)' }}>{s.name}</span>
                    <span style={{ color: 'var(--tm)' }}>{s.version}</span>
                  </div>
                ))}
                <p className="text-[10px] text-center mt-2" style={{ color: 'var(--td)' }}>{data.count ?? 0} programów</p>
              </div>
            )} />

            <RemoteDataPanel title="Usługi Windows" command="get_services" agentId={(agentData as any)?.id} renderFn={(data: any) => (
              <div className="max-h-64 overflow-y-auto">
                {(data.services || []).slice(0, 20).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="truncate max-w-[200px]" style={{ color: 'var(--ts)' }}>{s.display_name || s.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.status === 'running' ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{ background: s.status === 'running' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )} />

            <RemoteDataPanel title="Dziennik zdarzeń" command="get_event_log" agentId={(agentData as any)?.id} payload={{ log_name: 'System', level: 'Error', limit: 20 }} renderFn={(data: any) => (
              <div className="max-h-64 overflow-y-auto">
                {(data.events || []).map((e: any, i: number) => (
                  <div key={i} className="text-xs py-1.5 px-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--td)' }}>{e.TimeCreated ? new Date(e.TimeCreated).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                      <span className="font-medium truncate" style={{ color: 'var(--ts)' }}>{e.ProviderName}</span>
                    </div>
                    <p className="truncate mt-0.5" style={{ color: 'var(--tm)' }}>{e.Message?.slice(0, 120)}</p>
                  </div>
                ))}
              </div>
            )} />
          </div>

          {/* Security audit */}
          {securityAudit ? (
            <>
              <div className="flex items-center gap-6 p-6 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                {/* Big circular score */}
                <div className="relative w-[120px] h-[120px] flex-shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="52" fill="none"
                      stroke={securityAudit.score >= 80 ? '#4ADE80' : securityAudit.score >= 50 ? '#FBBF24' : '#F87171'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 52}
                      strokeDashoffset={2 * Math.PI * 52 * (1 - securityAudit.score / 100)}
                      style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[32px] font-bold text-white">{securityAudit.score}</span>
                    <span className="text-[10px]" style={{ color: 'var(--tm)' }}>/ 100</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-[18px] font-bold" style={{ color: securityAudit.score >= 80 ? '#4ADE80' : securityAudit.score >= 50 ? '#FBBF24' : '#F87171' }}>
                    {securityAudit.score >= 80 ? 'Bezpieczny' : securityAudit.score >= 50 ? 'Wymaga uwagi' : 'Zagrożony'}
                  </h3>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--tm)' }}>
                    {securityAudit.checks.filter((c: any) => c.status === 'pass').length} / {securityAudit.checks.length} testów zaliczonych
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--td)' }}>
                    Ostatni audyt: {securityAudit.timestamp}
                  </p>
                </div>
              </div>

              {/* Checks list */}
              <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <h3 className="text-[13px] font-semibold text-white/70">Wyniki audytu</h3>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {securityAudit.checks.map((check: any) => (
                    <div key={check.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: check.status === 'pass' ? 'rgba(34,197,94,0.12)' : check.status === 'fail' ? 'rgba(239,68,68,0.12)' : 'var(--hover-bg)' }}>
                        {check.status === 'pass' ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#4ADE80' }} />
                         : check.status === 'fail' ? <XCircle className="h-3.5 w-3.5" style={{ color: '#F87171' }} />
                         : <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#FBBF24' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/80">{check.name}</span>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ background: check.severity === 'critical' ? 'rgba(239,68,68,0.12)' : check.severity === 'high' ? 'rgba(251,146,60,0.1)' : 'var(--hover-bg)',
                                     color: check.severity === 'critical' ? '#F87171' : check.severity === 'high' ? '#FB923C' : 'var(--tm)' }}>
                            {check.severity}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--tm)' }}>{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Shield className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
              <p className="text-[13px]" style={{ color: 'var(--tm)' }}>Brak danych audytu bezpieczeństwa</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--td)' }}>Agent zbiera dane — pojawią się w ciągu godziny</p>
            </div>
          )}
      </div>
      )}

      {/* ═══ SPEEDTEST TAB ═══ */}
      {tab === 'speedtest' && (
        <SpeedtestTab
          live={(agentData as any)?.serverMetrics?.speedtest}
          history={speedtestHistory || []}
          agentId={agentRegId}
        />
      )}

      {/* ═══ LICENSES TAB ═══ */}
      {tab === 'licenses' && (
        <LicensesTab
          live={(agentData as any)?.serverMetrics?.licenseAudit}
          history={licenseHistory || []}
        />
      )}

      {/* ═══ SELF-HEAL TAB ═══ */}
      {tab === 'selfheal' && (
        <SelfHealTab
          actions={(agentData as any)?.serverMetrics?.selfHealActions || []}
          hostname={(agentData as any)?.hostname}
          lastSeen={(agentData as any)?.lastSeen}
        />
      )}

      {/* ═══ LOGS TAB ═══ */}
      {tab === 'logs' && (
        <LogsTab
          live={(agentData as any)?.serverMetrics?.logShipping}
          history={logsHistory || []}
        />
      )}

      {/* ═══ BACKUP TAB ═══ */}
      {tab === 'backup' && (
        <div className="space-y-4">
          <div className="text-center py-12 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <HardDrive className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--tm)' }}>Konfiguracje backupu</p>
            <p className="text-xs mt-1" style={{ color: 'var(--td)' }}>Zarządzaj backupami w sekcji Backup</p>
            <Link to="/backups" className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-violet-400">
              <ExternalLink className="h-3 w-3" /> Otwórz Backup
            </Link>
          </div>
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === 'history' && (
        <div className="space-y-3">
          {/* Tickets for this device */}
          <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Zgłoszenia ({tickets.length})</h3>
            {tickets.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--tm)' }}>Brak zgłoszeń dla tego urządzenia</p>
            ) : (
              <div className="space-y-2">
                {tickets.slice(0, 10).map((t: Ticket) => (
                  <Link key={t.id} to={`/tickets/${t.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-2">
                      <TicketStatusBadge status={t.status} />
                      <span className="text-xs font-mono" style={{ color: 'var(--tm)' }}>{t.ticketNumber}</span>
                      <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--ts)' }}>{t.title}</span>
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--td)' }}>{formatDate(t.createdAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity logs */}
          <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Dziennik aktywności ({logs.length})</h3>
            {logs.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--tm)' }}>Brak wpisów</p>
            ) : (
              <div className="space-y-2">
                {(logs as any[]).slice(0, 20).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ color: 'var(--td)' }}>
                      {log.createdAt ? formatDateTime(log.createdAt) : ''}
                    </span>
                    <div>
                      <span className="text-xs" style={{ color: 'var(--ts)' }}>{log.description}</span>
                      {log.performedBy && (
                        <span className="text-[10px] ml-2" style={{ color: 'var(--tm)' }}>
                          — {log.performedBy.firstName} {log.performedBy.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Network scan (moved from old tab) */}
          {networkScan && networkScan.devices?.length > 0 && (
            <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Skan sieci — {networkScan.subnet}</h3>
              <p className="text-xs mb-3" style={{ color: 'var(--tm)' }}>{networkScan.devices.length} urządzeń · Brama: {networkScan.gateway}</p>
              <div className="rounded-[18px] overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>IP</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Hostname</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>MAC</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Typ</th>
                      <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Porty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkScan.devices.map((d: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-2.5 text-[13px] font-mono text-white/70">{d.ip}</td>
                        <td className="px-4 py-2.5 text-[13px] text-white/60">{d.hostname || '—'}</td>
                        <td className="px-4 py-2.5 text-[11px] font-mono" style={{ color: 'var(--tm)' }}>{d.mac}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
                            background: d.type === 'server' ? 'rgba(139,92,246,0.12)' : d.type === 'router' ? 'rgba(96,165,250,0.12)' : d.type === 'printer' ? 'rgba(251,146,60,0.12)' : 'var(--hover-bg)',
                            color: d.type === 'server' ? '#A78BFA' : d.type === 'router' ? '#60A5FA' : d.type === 'printer' ? '#FB923C' : 'var(--tm)',
                          }}>{d.type}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] font-mono" style={{ color: 'var(--tm)' }}>{d.ports?.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} size="2xl" noPadding>
        <DeviceForm
          device={device}
          onSuccess={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['devices', id] });
          }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  );
}

/* ═══ Remote Action Button ═══ */
function RemoteActionBtn({ label, command, agentId, confirmMsg, isWol }: {
  label: string; command: string; agentId: string; confirmMsg?: string; isWol?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setLoading(true);
    try {
      if (isWol) {
        await agentsApi.wake(agentId);
      } else if (command === 'windows_update') {
        await agentsApi.windowsUpdate(agentId);
      } else if (command === 'system_reboot') {
        await agentsApi.systemReboot(agentId, 60);
      } else if (command === 'restart_print_spooler') {
        await agentsApi.restartService(agentId, 'Spooler');
      }
      toast.success(`${label} — wysłano`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || `Błąd: ${label}`);
    }
    setLoading(false);
  };

  return (
    <button onClick={execute} disabled={loading}
      className="px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA', opacity: loading ? 0.6 : 1 }}>
      {loading ? 'Wysyłanie...' : label}
    </button>
  );
}

/* ═══ Remote Data Panel (fetch on-demand via remote command) ═══ */
function RemoteDataPanel({ title, command, agentId, payload, renderFn }: {
  title: string; command: string; agentId?: string; payload?: any;
  renderFn: (data: any) => React.ReactNode;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!agentId) { setError('Agent nie przypisany'); return; }
    setLoading(true);
    setError(null);
    try {
      const apiClient = (await import('../../../api/client')).default;
      const res = await apiClient.post(`/agent/${agentId}/command`, { command, payload: payload || {} });
      setData(res.data?.data || res.data);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Brak odpowiedzi';
      const code = err?.response?.data?.code;
      setError(code === 'AGENT_OFFLINE' ? 'Agent nie ma aktywnego połączenia WebSocket — komendy zdalne niedostępne. Agent wysyła metryki ale nie obsługuje komend w czasie rzeczywistym.' : msg);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-[16px] p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold" style={{ color: 'var(--t)' }}>{title}</h4>
        <button onClick={fetch} disabled={loading}
          className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
          {loading ? '...' : data ? 'Odśwież' : 'Pobierz'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {data && renderFn(data)}
      {!data && !loading && !error && (
        <p className="text-xs" style={{ color: 'var(--td)' }}>Kliknij "Pobierz" aby pobrać dane z agenta</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPEEDTEST TAB
// ═══════════════════════════════════════════════════════════
function SpeedtestTab({ live, history, agentId }: {
  live: any; history: Array<{ createdAt: string; data: any }>; agentId?: string;
}) {
  const [triggering, setTriggering] = useState(false);
  const qc = useQueryClient();

  const runSpeedtest = async () => {
    if (!agentId) return;
    setTriggering(true);
    try {
      await apiClient.post(`/agent/${agentId}/notify`, { type: 'speedtest' });
      toast.success('Wysłano polecenie — wynik pojawi się w ciągu minuty');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['agent-server-metrics'] }), 60_000);
    } catch {
      toast.error('Nie udało się uruchomić pomiaru');
    } finally {
      setTriggering(false);
    }
  };

  const sorted = [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const maxDown = Math.max(1, ...sorted.map(s => Number(s.data?.downloadMbps) || 0));
  const maxUp = Math.max(1, ...sorted.map(s => Number(s.data?.uploadMbps) || 0));

  return (
    <div className="space-y-4">
      {/* Header + trigger */}
      <div className="rounded-[18px] p-5 flex items-center justify-between" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
            <Gauge className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--t)' }}>Test prędkości sieci</h3>
            <p className="text-xs" style={{ color: 'var(--tm)' }}>Pomiar download / upload / ping wobec infradesk.pl</p>
          </div>
        </div>
        <button
          onClick={runSpeedtest}
          disabled={!agentId || triggering}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#6D28D9,#4F46E5)' }}
        >
          <PlayCircle className="h-4 w-4" />
          {triggering ? 'Wysyłam...' : 'Uruchom pomiar'}
        </button>
      </div>

      {/* Live KPI */}
      <div className="grid grid-cols-3 gap-4">
        <KpiBox label="Pobieranie" value={live?.downloadMbps} unit="Mbps" color="#60A5FA" />
        <KpiBox label="Wysyłanie" value={live?.uploadMbps} unit="Mbps" color="#A78BFA" />
        <KpiBox label="Ping" value={live?.pingMs} unit="ms" color="#4ADE80" />
      </div>

      {/* Chart */}
      <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Historia — ostatnie 14 dni</h3>
        {sorted.length < 2 ? (
          <p className="text-xs" style={{ color: 'var(--tm)' }}>Za mało danych historycznych (min. 2 pomiary).</p>
        ) : (
          <svg viewBox="0 0 600 180" className="w-full" style={{ maxHeight: 240 }}>
            {[0, 50, 100].map((p) => (
              <g key={p}>
                <line x1={40} y1={150 - (p / 100) * 130} x2={590} y2={150 - (p / 100) * 130}
                  stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
                <text x={30} y={154 - (p / 100) * 130} fontSize={8} fill="rgba(255,255,255,0.4)" textAnchor="end">{p}%</text>
              </g>
            ))}
            <polyline fill="none" stroke="#60A5FA" strokeWidth={2}
              points={sorted.map((s, i) => {
                const x = 40 + (i / (sorted.length - 1)) * 550;
                const y = 150 - ((Number(s.data?.downloadMbps) || 0) / maxDown) * 130;
                return `${x},${y}`;
              }).join(' ')}
            />
            <polyline fill="none" stroke="#A78BFA" strokeWidth={2}
              points={sorted.map((s, i) => {
                const x = 40 + (i / (sorted.length - 1)) * 550;
                const y = 150 - ((Number(s.data?.uploadMbps) || 0) / maxUp) * 130;
                return `${x},${y}`;
              }).join(' ')}
            />
            <g transform="translate(460,10)">
              <rect width={8} height={8} fill="#60A5FA" />
              <text x={12} y={8} fontSize={10} fill="rgba(255,255,255,0.7)">↓ download</text>
              <rect x={80} width={8} height={8} fill="#A78BFA" />
              <text x={92} y={8} fontSize={10} fill="rgba(255,255,255,0.7)">↑ upload</text>
            </g>
          </svg>
        )}
      </div>

      {/* List */}
      <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Ostatnie pomiary</h3>
        {sorted.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--tm)' }}>Brak pomiarów. Uruchom pierwszy pomiar lub poczekaj na cykliczny (co 3h).</p>
        ) : (
          <div className="space-y-1 text-xs font-mono">
            {[...sorted].reverse().slice(0, 20).map((s) => (
              <div key={s.createdAt} className="flex items-center gap-3 py-1" style={{ color: 'var(--ts)' }}>
                <span style={{ color: 'var(--tm)', minWidth: 140 }}>{formatDateTime(s.createdAt)}</span>
                <span>↓ {s.data?.downloadMbps ?? '—'} Mbps</span>
                <span>↑ {s.data?.uploadMbps ?? '—'} Mbps</span>
                <span>ping {s.data?.pingMs ?? '—'} ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, unit, color }: { label: string; value?: number | null; unit: string; color: string }) {
  return (
    <div className="rounded-[14px] p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--tm)' }}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color }}>{value != null ? value : '—'}</span>
        <span className="text-xs" style={{ color: 'var(--tm)' }}>{unit}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LICENSES TAB
// ═══════════════════════════════════════════════════════════
function LicensesTab({ live, history }: { live: any; history: Array<{ createdAt: string; data: any }> }) {
  const latest = live || history[history.length - 1]?.data;
  const licenses = latest?.licenses || [];
  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      'Licensed': '#4ADE80',
      'OOB Grace': '#FB923C',
      'OOT Grace': '#FB923C',
      'Notification': '#FB923C',
      'Extended Grace': '#FB923C',
      'Non-Genuine': '#EF4444',
      'Unlicensed': '#EF4444',
    };
    return map[s] || '#9CA3AF';
  };
  return (
    <div className="space-y-4">
      <div className="rounded-[18px] p-5 flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
          <Key className="h-5 w-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold" style={{ color: 'var(--t)' }}>Audyt licencji</h3>
          <p className="text-xs" style={{ color: 'var(--tm)' }}>
            Windows (OEM key z BIOS-u) + Office + inne produkty Microsoft · aktualizacja 1×/dobę
          </p>
        </div>
        {latest?.measuredAt && (
          <span className="text-[10px]" style={{ color: 'var(--td)' }}>
            Ostatni: {formatDateTime(latest.measuredAt)}
          </span>
        )}
      </div>

      {licenses.length === 0 ? (
        <div className="text-center py-12 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Key className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
          <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak danych o licencjach</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--td)' }}>Audyt uruchamiany 1×/dobę. Wymaga praw admina na stacji.</p>
        </div>
      ) : (
        <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr className="text-left" style={{ color: 'var(--tm)' }}>
                <th className="px-4 py-3 font-medium">Produkt</th>
                <th className="px-4 py-3 font-medium">Klucz</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Źródło</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((l: any, i: number) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--t)' }}>{l.product || l.name}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--ts)' }}>
                    {l.key || (l.partialKey && `···· ${l.partialKey}`) || l.version || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {l.status ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${statusColor(l.status)}22`, color: statusColor(l.status) }}>
                        {l.status}{l.graceDays ? ` · ${l.graceDays} dni` : ''}
                      </span>
                    ) : <span style={{ color: 'var(--td)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--tm)' }}>{l.source || 'WMI'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SELF-HEAL TAB — with AiCoreOrb
// ═══════════════════════════════════════════════════════════
function SelfHealTab({ actions, hostname, lastSeen }: {
  actions: Array<{ action: string; summary: string; at: string }>;
  hostname?: string;
  lastSeen?: string;
}) {
  // State inferred from last action age — fixing (recent) / idle
  const lastActionAt = actions[actions.length - 1]?.at;
  const isRecent = lastActionAt && (Date.now() - new Date(lastActionAt).getTime()) < 15 * 60_000;
  const coreState: AiCoreState = isRecent ? 'fixing' : (actions.length > 0 ? 'scanning' : 'idle');

  const stateLabels: Record<AiCoreState, { title: string; desc: string; badge: string }> = {
    idle:     { title: 'Rdzeń AI',  desc: 'Monitoring aktywny — brak akcji w ostatniej godzinie',   badge: 'GOTOWY' },
    scanning: { title: 'Analiza',    desc: 'Skanowanie systemu i poszukiwanie problemów',             badge: 'ANALIZA' },
    warning:  { title: 'Uwaga',      desc: 'Wykryto problemy wymagające interwencji',                  badge: 'OSTRZEŻENIE' },
    fixing:   { title: 'Naprawa',    desc: 'Automatyczna naprawa w toku',                              badge: 'NAPRAWA' },
    success:  { title: 'Gotowe',     desc: 'System działa prawidłowo',                                 badge: 'OK' },
    error:    { title: 'Błąd',       desc: 'Operacja nieudana — wymagana ręczna interwencja',          badge: 'BŁĄD' },
  };
  const lbl = stateLabels[coreState];

  const actionIcons: Record<string, { label: string; color: string }> = {
    clean_temp:     { label: 'Czyszczenie TEMP', color: '#60A5FA' },
    flush_dns:      { label: 'Flush DNS', color: '#A78BFA' },
    reset_wu:       { label: 'Reset Windows Update', color: '#FB923C' },
  };

  return (
    <div className="space-y-4">
      {/* Header card with AiCoreOrb */}
      <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-stretch" style={{ minHeight: 280 }}>
          {/* LEFT: Orb + state */}
          <div
            className="flex flex-col items-center justify-center text-center p-6 border-r"
            style={{ borderColor: 'var(--border)', width: 300, flexShrink: 0 }}
          >
            <AiCoreOrb state={coreState} size={180} />
            <span className="aicore-badge mt-3" style={{ letterSpacing: '0.8px' }}>{lbl.badge}</span>
            <div className="mt-2 text-[15px] font-bold" style={{ color: 'var(--t)' }}>{lbl.title}</div>
            <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--tm)', maxWidth: 240 }}>{lbl.desc}</div>
            {hostname && (
              <div className="mt-4 text-[10px]" style={{ color: 'var(--td)' }}>
                {hostname} · sygnał: {lastSeen ? formatDateTime(lastSeen) : '—'}
              </div>
            )}
          </div>

          {/* RIGHT: Action feed */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--tm)' }}>Strumień akcji</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--td)' }}>
                {actions.length} akcji
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2" style={{ maxHeight: 280 }}>
              {actions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <Wrench className="h-8 w-8 mb-3" style={{ color: 'var(--td)' }} />
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Brak akcji auto-naprawczych</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--td)' }}>
                    Rdzeń monitoruje system. Akcje pojawią się przy wykryciu niskiego miejsca, zatrzymanej usługi lub problemu z DNS.
                  </p>
                </div>
              ) : (
                [...actions].reverse().map((a, i) => {
                  const meta = actionIcons[a.action] || { label: a.action, color: '#9CA3AF' };
                  return (
                    <div key={i} className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}33` }}>
                        <Zap className="h-3 w-3" style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium" style={{ color: 'var(--t)' }}>{meta.label}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--tm)' }}>{a.summary}</div>
                      </div>
                      <div className="text-[10px] flex-shrink-0" style={{ color: 'var(--td)' }}>
                        {new Date(a.at).toLocaleTimeString('pl', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info card — co robi self-heal */}
      <div className="rounded-[18px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--t)' }}>Co robi rdzeń auto-naprawczy?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <HealCapability icon="🧹" title="Czyszczenie TEMP" desc="Gdy wolne miejsce na C: spadnie poniżej 5%, rdzeń czyści foldery TEMP i kosz." />
          <HealCapability icon="🔌" title="Restart usług" desc="Krytyczne usługi (Spooler, BITS, wuauserv, Dnscache) są automatycznie restartowane gdy się zatrzymają." />
          <HealCapability icon="🌐" title="Naprawa DNS" desc="Gdy wykryje błąd rozwiązywania nazw — uruchamia ipconfig /flushdns." />
        </div>
        <p className="text-[10px] mt-4" style={{ color: 'var(--td)' }}>
          Cooldown 1h/akcja — ta sama naprawa nie powtórzy się częściej.
        </p>
      </div>
    </div>
  );
}

function HealCapability({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--t)' }}>{title}</div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--tm)' }}>{desc}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGS TAB
// ═══════════════════════════════════════════════════════════
function LogsTab({ live, history }: { live: any; history: Array<{ createdAt: string; data: any }> }) {
  const entries: Array<{ type: string; path: string; meta: any; lines: string[]; count: number; collectedAt: string }> = [];
  if (live?.entries) {
    for (const e of live.entries) entries.push({ ...e, collectedAt: live.collectedAt });
  }
  // Merge historical entries (most recent first)
  for (const snap of [...history].reverse()) {
    const d = snap.data;
    if (d?.entries) {
      for (const e of d.entries) entries.push({ ...e, collectedAt: d.collectedAt || snap.createdAt });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] p-5 flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
          <FileText className="h-5 w-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--t)' }}>Log shipping</h3>
          <p className="text-xs" style={{ color: 'var(--tm)' }}>
            IIS (5xx/401/403/429) + SQL Server ERRORLOG · push co 10 min, cursor per-plik
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
          <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak zgłoszonych błędów w logach</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--td)' }}>
            Źródła są auto-wykrywane: C:\inetpub\logs\LogFiles + Program Files\Microsoft SQL Server\…\ERRORLOG
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.slice(0, 20).map((e, i) => (
            <div key={i} className="rounded-[14px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: e.type === 'iis' ? 'rgba(96,165,250,0.12)' : 'rgba(251,146,60,0.12)',
                             color:      e.type === 'iis' ? '#60A5FA' : '#FB923C' }}>
                    {e.type}
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--ts)' }}>{e.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                    {e.count} błędów
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--td)' }}>{formatDateTime(e.collectedAt)}</span>
                </div>
              </div>
              <div className="p-3 font-mono text-[11px] space-y-0.5 overflow-x-auto" style={{ color: 'var(--ts)', maxHeight: 200, overflowY: 'auto' }}>
                {e.lines.slice(0, 15).map((ln, j) => (
                  <div key={j} className="whitespace-pre">{ln}</div>
                ))}
                {e.lines.length > 15 && (
                  <div className="text-[10px] pt-1" style={{ color: 'var(--td)' }}>… i {e.lines.length - 15} kolejnych</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

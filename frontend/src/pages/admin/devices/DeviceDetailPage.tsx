import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Monitor, Copy, Check, QrCode, ExternalLink,
  Edit2, Download, User, MapPin, Wifi, Plus,
  Building2, Laptop, Cpu, CircuitBoard, HardDrive,
  Thermometer, Clock, Radio, Activity,
  Shield, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
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

type TabId = 'info' | 'security' | 'network';

const TABS: { id: TabId; label: string }[] = [
  { id: 'info', label: 'Informacje' },
  { id: 'security', label: 'Bezpieczeństwo' },
  { id: 'network', label: 'Sieć' },
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
    enabled: !!id && (tab === 'security' || tab === 'network'),
  });
  const securityAudit = (agentData as any)?.serverMetrics?.securityAudit;
  const networkScan = (agentData as any)?.serverMetrics?.networkScan;

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
            <Card title="Parametry urządzenia (Agent)">
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

      {tab === 'security' && (
        <div className="space-y-5">
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

      {tab === 'network' && (
        <div className="space-y-5">
          {networkScan && networkScan.devices?.length > 0 ? (
            <>
              <div className="flex items-center gap-4 p-4 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <Wifi className="h-5 w-5" style={{ color: '#A78BFA' }} />
                <div>
                  <p className="text-[14px] font-semibold text-white/80">Sieć: {networkScan.subnet}</p>
                  <p className="text-[12px]" style={{ color: 'var(--tm)' }}>
                    {networkScan.devices.length} urządzeń · Brama: {networkScan.gateway} · Skan: {networkScan.scannedAt}
                  </p>
                </div>
              </div>

              <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
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
            </>
          ) : (
            <div className="text-center py-16 rounded-[18px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Wifi className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
              <p className="text-[13px]" style={{ color: 'var(--tm)' }}>Brak danych skanowania sieci</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--td)' }}>Agent skanuje sieć co 30 minut</p>
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

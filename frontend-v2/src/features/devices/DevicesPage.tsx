import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, Search, Server as ServerIcon, Monitor, Router, HardDrive, Printer, Camera,
  Smartphone, X, Loader2, QrCode, ChevronLeft, WifiOff,
  Ticket as TicketIcon, AlertTriangle, MonitorPlay, Terminal, Share2,
} from 'lucide-react';
import { PartnerShareDialog, type ShareResourceType } from '@/features/partner-shares/PartnerShareDialog';
import { RemoteLaunchLink } from '@/components/ui/RemoteLaunchLink';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useColumns, type Column } from '@/components/ui/ColumnPicker';

interface DeviceAgent {
  id: string;
  status: string;
  lastSeen: string | null;
  agentVersion: string;
  currentUser: string | null;
  cpuModel: string | null;
  ramMb: number | null;
  diskFreeGb: number | null;
  diskTotalGb: number | null;
  allowMonitoring: boolean;
  allowRustdesk: boolean;
  allowRemoteCommands: boolean;
}

interface Device {
  id: string;
  name: string;
  hostname: string | null;
  category: string;
  criticality: string;
  status: string;
  ipAddress: string | null;
  macAddress: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  qrCodeValue: string;
  workspaceId: string;
  assetTag: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  rustdeskId: string | null;
  rdpAddress: string | null;
  sshAddress: string | null;
  anydeskId: string | null;
  teamviewerId: string | null;
  customRemoteLink: string | null;
  purchaseDate: string | null;
  installationDate: string | null;
  warrantyUntil: string | null;
  createdAt: string;
  updatedAt: string;
  workspace: { id: string; name: string; type: string } | null;
  location: { id: string; name: string; city: string | null };
  agent: DeviceAgent | null;
  _count?: { tickets: number; alerts: number };
}

const ONLINE_THRESHOLD_MS = 5 * 60_000;

function isDeviceOnline(d: Device): boolean {
  if (!d.agent || d.agent.status !== 'ACTIVE' || !d.agent.lastSeen) return false;
  return Date.now() - new Date(d.agent.lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

function formatRelativeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'teraz';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} d`;
  const mo = Math.floor(days / 30);
  return `${mo} mies.`;
}

function formatGb(gb: number | null | undefined): string {
  if (gb == null) return '—';
  if (gb < 10) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb)} GB`;
}

function formatRam(mb: number | null | undefined): string {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

function buildRemoteUrl(d: Device): { url: string; kind: string; label: string } | null {
  if (d.rustdeskId) {
    return { url: `rustdesk://connection/new/${encodeURIComponent(d.rustdeskId)}`, kind: 'rustdesk', label: 'RustDesk' };
  }
  if (d.rdpAddress) {
    return { url: `rdp://${d.rdpAddress.replace(/^rdp:\/\//, '')}`, kind: 'rdp', label: 'RDP' };
  }
  if (d.anydeskId) {
    return { url: `anydesk:${encodeURIComponent(d.anydeskId)}`, kind: 'anydesk', label: 'AnyDesk' };
  }
  if (d.teamviewerId) {
    return { url: `teamviewer8://control?device=${encodeURIComponent(d.teamviewerId)}`, kind: 'teamviewer', label: 'TeamViewer' };
  }
  if (d.sshAddress) {
    return { url: `ssh://${d.sshAddress.replace(/^ssh:\/\//, '')}`, kind: 'ssh', label: 'SSH' };
  }
  if (d.customRemoteLink) {
    return { url: d.customRemoteLink, kind: 'custom', label: 'Link' };
  }
  return null;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof ServerIcon }> = {
  WORKSTATION: { label: 'Komputer', icon: Monitor },
  SERVER:      { label: 'Serwer',   icon: ServerIcon },
  ROUTER:      { label: 'Router',   icon: Router },
  SWITCH:      { label: 'Switch',   icon: Router },
  FIREWALL:    { label: 'Firewall', icon: Router },
  PRINTER:     { label: 'Drukarka', icon: Printer },
  SCANNER:     { label: 'Skaner',   icon: Printer },
  CCTV:        { label: 'Kamera',   icon: Camera },
  PHONE:       { label: 'Telefon',  icon: Smartphone },
  IOT:         { label: 'IoT',      icon: HardDrive },
  OTHER:       { label: 'Inne',     icon: HardDrive },
};

interface Location { id: string; name: string; city: string | null }

const CATEGORIES = ['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER'];
const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CRIT_COLOR: Record<string, string> = { LOW: '#9CA3AF', MEDIUM: '#3B82F6', HIGH: '#F59E0B', CRITICAL: '#EF4444' };
const CRIT_PL: Record<string, string> = { LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', CRITICAL: 'Krytyczny' };

function useDebouncedDevices(value: string, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function DevicesPage() {
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('devices', 'visual');
  const [showCreate, setShowCreate] = useState(false);
  const [qrDevice, setQrDevice] = useState<Device | null>(null);
  const [shareTarget, setShareTarget] = useState<{ device: Device; type: ShareResourceType } | null>(null);
  const [sp, setSp] = useSearchParams();

  const [searchInput, setSearchInput] = useState(sp.get('q') ?? '');
  const debouncedSearch = useDebouncedDevices(searchInput, 300);
  const client = sp.get('client') ?? '';
  const locationFilter = sp.get('location') ?? '';
  const category = sp.get('category') ?? '';
  const categoryList = category ? category.split(',') : [];
  const criticality = sp.get('criticality') ?? '';
  const criticalityList = criticality ? criticality.split(',') : [];

  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (debouncedSearch === cur) return;
    const next = new URLSearchParams(sp);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp);
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    setSp(next, { replace: true });
  }
  function toggleCsv(paramKey: string, list: string[], value: string) {
    const cur = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    updateParam(paramKey, cur.length ? cur.join(',') : null);
  }
  function clearAll() {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  }

  const { data, isLoading } = useQuery<{ devices: Device[] }>({
    queryKey: ['devices', { q: debouncedSearch, client, location: locationFilter, category, criticality }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (client) params.workspaceId = client;
      if (locationFilter) params.locationId = locationFilter;
      if (category) params.category = category;
      if (criticality) params.criticality = criticality;
      return (await api.get('/devices', { params })).data;
    },
  });

  const { data: locs } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });
  const clientsQ = useQuery<{ clients: Array<{ client: { id: string; name: string; isActive: boolean } }> }>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
    staleTime: 60_000,
  });
  const clients = (clientsQ.data?.clients ?? []).filter((c) => c.client.isActive);

  const devices = data?.devices ?? [];
  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of devices) c[d.category] = (c[d.category] ?? 0) + 1;
    return c;
  }, [devices]);
  const criticalityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of devices) c[d.criticality] = (c[d.criticality] ?? 0) + 1;
    return c;
  }, [devices]);
  const activeFilterCount =
    (debouncedSearch ? 1 : 0) + (client ? 1 : 0) + (locationFilter ? 1 : 0) +
    (categoryList.length > 0 ? 1 : 0) + (criticalityList.length > 0 ? 1 : 0);

  const deviceColumns = useMemo(
    () => buildDeviceColumns(
      setQrDevice,
      (d) => setShareTarget({ device: d, type: 'DEVICE' }),
    ),
    [],
  );
  const { visibleColumns, pickerButton } = useColumns<Device>({
    tableKey: 'devices',
    columns: deviceColumns,
  });

  function handleAdd() {
    if (view === 'visual') setShowCreate(true);
    else navigate('/devices/new');
  }

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Urządzenia</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {devices.length > 0 ? `${devices.length} ${devices.length === 1 ? 'urządzenie' : 'urządzeń'}` : 'Brak urządzeń'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view === 'table' && pickerButton}
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj</Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Szukaj</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none" style={{ width: 14, height: 14 }} />
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-8" placeholder="Szukaj (nazwa / hostname / IP / SN)" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Klient</label>
            <Select value={client} onChange={(e) => updateParam('client', e.target.value || null)}>
              <option value="">Wszyscy klienci</option>
              {clients.map((c) => <option key={c.client.id} value={c.client.id}>{c.client.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Lokalizacja</label>
            <Select value={locationFilter} onChange={(e) => updateParam('location', e.target.value || null)}>
              <option value="">Wszystkie lokalizacje</option>
              {(locs?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Kategoria</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const active = categoryList.includes(cat);
                const meta = CATEGORY_META[cat];
                return (
                  <button key={cat} type="button" onClick={() => toggleCsv('category', categoryList, cat)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors"
                          style={{
                            background: active ? 'var(--pri-l)' : 'var(--sf-h)',
                            color: active ? 'var(--pri)' : 'var(--tx2)',
                            border: '1px solid ' + (active ? 'var(--pri)' : 'var(--bd)'),
                          }}>
                    {meta?.label ?? cat}
                    {categoryCounts[cat] !== undefined && <span className="opacity-60">({categoryCounts[cat]})</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-tx3 block mb-1">Krytyczność</label>
            <div className="flex flex-wrap gap-1.5">
              {CRITICALITIES.map((cr) => {
                const active = criticalityList.includes(cr);
                return (
                  <button key={cr} type="button" onClick={() => toggleCsv('criticality', criticalityList, cr)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors"
                          style={{
                            background: active ? CRIT_COLOR[cr] + '22' : 'var(--sf-h)',
                            color: active ? CRIT_COLOR[cr] : 'var(--tx2)',
                            border: '1px solid ' + (active ? CRIT_COLOR[cr] + '55' : 'var(--bd)'),
                          }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CRIT_COLOR[cr] }} />
                    {CRIT_PL[cr] ?? cr}
                    {criticalityCounts[cr] !== undefined && <span className="opacity-60">({criticalityCounts[cr]})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-bd">
            <Badge variant="accent">{activeFilterCount} {activeFilterCount === 1 ? 'filtr' : 'filtrów'}</Badge>
            <Button variant="ghost" onClick={clearAll} className="h-8 px-2 text-[12px]">
              <X className="h-3.5 w-3.5" /> Wyczyść filtry
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : devices.length === 0 ? (
        <Card className="p-10 text-center">
          <ServerIcon className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak urządzeń</p>
          <p className="text-[13px] text-tx3 mb-4">Dodaj pierwsze urządzenie albo zatwierdź agenta (który je auto-doda).</p>
          <Button onClick={handleAdd}><Plus className="h-4 w-4" /> Dodaj urządzenie</Button>
        </Card>
      ) : view === 'visual' ? (
        <DevicesGrid
          devices={devices}
          onQr={setQrDevice}
          onShare={(d) => setShareTarget({ device: d, type: 'DEVICE' })}
        />
      ) : (
        <DevicesTable devices={devices} columns={visibleColumns} />
      )}

      {showCreate && <CreateDeviceModal locations={locs?.locations ?? []} onClose={() => setShowCreate(false)} />}
      {qrDevice && <QrCodeDialog device={qrDevice} onClose={() => setQrDevice(null)} />}
      {shareTarget && (
        <PartnerShareDialog
          open
          onClose={() => setShareTarget(null)}
          resourceType={shareTarget.type}
          resourceId={shareTarget.device.id}
          resourceLabel={`${shareTarget.device.name}${shareTarget.device.hostname ? ` (${shareTarget.device.hostname})` : ''}`}
        />
      )}
    </div>
  );
}

export function DeviceNewPage() {
  const navigate = useNavigate();
  const { data: locs } = useQuery<{ locations: Location[] }>({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });
  return (
    <div className="max-w-3xl mx-auto space-y-4 anim-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-[22px] font-bold text-tx">Nowe urządzenie</h1>
      <CreateDeviceModal variant="page" locations={locs?.locations ?? []} onClose={() => navigate('/devices')} />
    </div>
  );
}

function DevicesGrid({ devices, onQr, onShare }: { devices: Device[]; onQr: (d: Device) => void; onShare: (d: Device) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {devices.map((d) => {
        const meta = CATEGORY_META[d.category] ?? CATEGORY_META.OTHER!;
        const isActive = d.status === 'ACTIVE';
        return (
          <Link key={d.id} to={`/devices/${d.id}`} className="block hover:scale-[1.01] transition-transform">
          <Card className="p-4 cursor-pointer hover:border-[var(--pri)]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center"
                  style={{ background: isActive ? 'var(--ok-l)' : 'var(--sf-h)' }}
                >
                  <meta.icon style={{ width: 18, height: 18, color: isActive ? 'var(--ok)' : 'var(--tx3)' }} />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-tx">{d.name}</h3>
                  {d.hostname && <p className="text-[11px] text-tx3 font-mono">{d.hostname}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQr(d); }}
                className="p-1.5 rounded-[6px] text-tx3 hover:text-pri hover:bg-sf-h press"
                title="QR kod"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="neutral">{meta.label}</Badge>
              <PriorityDot priority={d.criticality} withLabel />
              <Badge variant={d.status === 'ACTIVE' ? 'success' : d.status === 'DECOMMISSIONED' ? 'danger' : 'neutral'}>
                {d.status === 'ACTIVE' ? 'Aktywne' : d.status === 'INACTIVE' ? 'Nieaktywne' : 'Wycofane'}
              </Badge>
            </div>
            <div className="text-[11px] text-tx3 space-y-0.5 mb-3">
              {d.location && <p>📍 {d.location.name}{d.location.city && ` · ${d.location.city}`}</p>}
              {d.ipAddress && <p className="font-mono">IP: {d.ipAddress}</p>}
              {d.operatingSystem && <p>{d.operatingSystem} {d.osVersion ?? ''}</p>}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--bd)' }}>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(d); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-[var(--r-s)] text-[12px] font-semibold press"
                style={{ background: 'var(--pri)', color: 'white' }}
                title="Wygeneruj link share dla zewnętrznego partnera"
              >
                <Share2 className="h-3.5 w-3.5" />
                Udostępnij partnerowi
              </button>
            </div>
          </Card>
          </Link>
        );
      })}
    </div>
  );
}

function ConnectButton({ device }: { device: Device }) {
  const remote = buildRemoteUrl(device);
  if (!remote) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-tx3" title="Brak skonfigurowanego zdalnego dostępu">
        <MonitorPlay className="h-3 w-3" /> —
      </span>
    );
  }
  return (
    <a
      href={remote.url}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[11px] font-semibold press transition-colors"
      style={{
        background: 'var(--pri)',
        color: 'white',
        border: '1px solid var(--pri)',
      }}
      title={`Połącz przez ${remote.label}`}
    >
      {remote.kind === 'rdp' || remote.kind === 'ssh'
        ? <Terminal className="h-3 w-3" />
        : <MonitorPlay className="h-3 w-3" />}
      {remote.label}
    </a>
  );
}

function OnlineBadge({ device }: { device: Device }) {
  const online = isDeviceOnline(device);
  if (!device.agent) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-tx3" title="Brak agenta">
        <WifiOff className="h-3 w-3" /> Bez agenta
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium"
      style={{ color: online ? 'var(--ok)' : 'var(--tx3)' }}
      title={device.agent.lastSeen ? `Ostatnio: ${formatRelativeShort(device.agent.lastSeen)}` : 'Brak telemetrii'}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: online ? 'var(--ok)' : 'var(--tx3)' }}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function buildDeviceColumns(onQr: (d: Device) => void, onShare: (d: Device) => void): Column<Device>[] {
  return [
    {
      id: 'name', label: 'Nazwa', pinned: true,
      render: (d) => <span className="text-tx font-medium">{d.name}</span>,
    },
    {
      id: 'online', label: 'Online',
      render: (d) => <OnlineBadge device={d} />,
    },
    {
      id: 'connect', label: 'Połącz',
      render: (d) => <ConnectButton device={d} />,
    },
    {
      id: 'hostname', label: 'Hostname',
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.hostname ?? '—'}</span>,
    },
    {
      id: 'category', label: 'Kategoria',
      render: (d) => <span className="text-tx2">{CATEGORY_META[d.category]?.label ?? d.category}</span>,
    },
    {
      id: 'criticality', label: 'Priorytet',
      render: (d) => <PriorityDot priority={d.criticality} withLabel />,
    },
    {
      id: 'status', label: 'Status',
      render: (d) => (
        <Badge variant={d.status === 'ACTIVE' ? 'success' : d.status === 'DECOMMISSIONED' ? 'danger' : 'neutral'}>
          {d.status === 'ACTIVE' ? 'Aktywne' : d.status === 'INACTIVE' ? 'Nieaktywne' : 'Wycofane'}
        </Badge>
      ),
    },
    {
      id: 'ipAddress', label: 'IP',
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.ipAddress ?? '—'}</span>,
    },
    {
      id: 'macAddress', label: 'MAC', defaultVisible: false,
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.macAddress ?? '—'}</span>,
    },
    {
      id: 'os', label: 'OS',
      render: (d) => <span className="text-tx3 text-[11px]">{d.operatingSystem ?? '—'}{d.osVersion ? ` ${d.osVersion}` : ''}</span>,
    },
    {
      id: 'location', label: 'Lokalizacja',
      render: (d) => <span className="text-tx3">{d.location?.name ?? '—'}{d.location?.city ? ` · ${d.location.city}` : ''}</span>,
    },
    {
      id: 'workspace', label: 'Klient', defaultVisible: false,
      render: (d) => <span className="text-tx3">{d.workspace?.name ?? '—'}</span>,
    },
    {
      id: 'currentUser', label: 'Zalogowany', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{d.agent?.currentUser ?? '—'}</span>,
    },
    {
      id: 'lastSeen', label: 'Ostatnio', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{d.agent ? formatRelativeShort(d.agent.lastSeen) : '—'}</span>,
    },
    {
      id: 'agentVersion', label: 'Wersja asystenta', defaultVisible: false,
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.agent?.agentVersion ?? '—'}</span>,
    },
    {
      id: 'cpu', label: 'CPU', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{d.agent?.cpuModel ?? '—'}</span>,
    },
    {
      id: 'ram', label: 'RAM', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{formatRam(d.agent?.ramMb)}</span>,
    },
    {
      id: 'disk', label: 'Dysk', defaultVisible: false,
      render: (d) => {
        if (!d.agent) return <span className="text-tx3 text-[11px]">—</span>;
        const free = d.agent.diskFreeGb;
        const total = d.agent.diskTotalGb;
        if (free == null && total == null) return <span className="text-tx3 text-[11px]">—</span>;
        const pct = free != null && total != null && total > 0
          ? Math.round(((total - free) / total) * 100)
          : null;
        const danger = pct != null && pct >= 90;
        return (
          <span className="text-[11px]" style={{ color: danger ? 'var(--er)' : 'var(--tx3)' }}>
            {formatGb(free)} / {formatGb(total)}{pct != null ? ` (${pct}%)` : ''}
          </span>
        );
      },
    },
    {
      id: 'manufacturer', label: 'Producent', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{d.manufacturer ?? '—'}</span>,
    },
    {
      id: 'model', label: 'Model', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{d.model ?? '—'}</span>,
    },
    {
      id: 'serialNumber', label: 'Serial', defaultVisible: false,
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.serialNumber ?? '—'}</span>,
    },
    {
      id: 'assetTag', label: 'Asset tag', defaultVisible: false,
      render: (d) => <span className="text-tx3 font-mono text-[11px]">{d.assetTag ?? '—'}</span>,
    },
    {
      id: 'rustdeskId', label: 'RustDesk', defaultVisible: false,
      render: (d) => d.rustdeskId
        ? <RemoteLaunchLink kind="rustdesk" value={d.rustdeskId} size="sm" showValue={false} />
        : <span className="text-tx3 text-[11px]">—</span>,
    },
    {
      id: 'rdpAddress', label: 'RDP', defaultVisible: false,
      render: (d) => d.rdpAddress
        ? <RemoteLaunchLink kind="rdp" value={d.rdpAddress} size="sm" showValue={false} />
        : <span className="text-tx3 text-[11px]">—</span>,
    },
    {
      id: 'tickets', label: 'Zgłoszenia', defaultVisible: false,
      render: (d) => {
        const n = d._count?.tickets ?? 0;
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-tx3">
            <TicketIcon className="h-3 w-3" /> {n}
          </span>
        );
      },
    },
    {
      id: 'alerts', label: 'Alerty', defaultVisible: false,
      render: (d) => {
        const n = d._count?.alerts ?? 0;
        return (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: n > 0 ? 'var(--er)' : 'var(--tx3)' }}>
            <AlertTriangle className="h-3 w-3" /> {n}
          </span>
        );
      },
    },
    {
      id: 'warrantyUntil', label: 'Gwarancja do', defaultVisible: false,
      render: (d) => {
        if (!d.warrantyUntil) return <span className="text-tx3 text-[11px]">—</span>;
        const date = new Date(d.warrantyUntil);
        const expired = date.getTime() < Date.now();
        return (
          <span className="text-[11px]" style={{ color: expired ? 'var(--er)' : 'var(--tx3)' }}>
            {date.toLocaleDateString('pl-PL')}
          </span>
        );
      },
    },
    {
      id: 'createdAt', label: 'Dodano', defaultVisible: false,
      render: (d) => <span className="text-tx3 text-[11px]">{new Date(d.createdAt).toLocaleDateString('pl-PL')}</span>,
    },
    {
      id: 'qrCode', label: 'QR', defaultVisible: false,
      render: (d) => <span className="text-tx3 font-mono text-[10px]">{d.qrCodeValue}</span>,
    },
    {
      id: 'actions', label: 'Akcje', pinned: true, width: '90px',
      render: (d) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onQr(d); }}
            className="p-1 text-tx3 hover:text-pri press"
            title="QR kod"
          >
            <QrCode className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onShare(d); }}
            className="p-1 text-tx3 hover:text-pri press"
            title="Udostępnij partnerowi"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];
}

function DevicesTable({ devices, columns }: { devices: Device[]; columns: Column<Device>[] }) {
  const navigateTbl = useNavigate();
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="px-4 py-2.5 font-bold whitespace-nowrap"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.id === 'actions' ? '' : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {devices.map((d) => (
              <tr
                key={d.id}
                onClick={() => navigateTbl(`/devices/${d.id}`)}
                style={{ cursor: 'pointer' }}
                className="hover:bg-sf-h"
              >
                {columns.map((c) => (
                  <td key={c.id} className="px-4 py-3 align-middle">
                    {c.render ? c.render(d) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const deviceSchema = z.object({
  name: z.string().min(1, 'Nazwa wymagana'),
  locationId: z.string().uuid('Wybierz lokalizację'),
  hostname: z.string().optional(),
  category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  operatingSystem: z.string().optional(),
  description: z.string().optional(),
});
type DForm = z.infer<typeof deviceSchema>;

export function CreateDeviceModal({ locations, onClose, variant = 'modal', workspaceIdOverride }: { locations: Location[]; onClose: () => void; variant?: 'modal' | 'page'; workspaceIdOverride?: string }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<DForm>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { category: 'WORKSTATION', criticality: 'MEDIUM' },
  });

  const mutation = useMutation({
    mutationFn: async (data: DForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (workspaceIdOverride) payload.workspaceId = workspaceIdOverride;
      return (await api.post('/devices', payload)).data;
    },
    onSuccess: () => { toast.success('Urządzenie dodane'); qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd');
    },
  });

  const formBody = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa *</label>
          <Input {...register('name')} placeholder="np. srv-prod-01" />
          {errors.name && <p className="text-[11px] text-er mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Hostname</label>
          <Input {...register('hostname')} placeholder="LAPTOP-ANNA-K" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-tx3 mb-1">Lokalizacja *</label>
        <Select {...register('locationId')}>
          <option value="">—</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name} {l.city && `(${l.city})`}</option>)}
        </Select>
        {errors.locationId && <p className="text-[11px] text-er mt-1">{errors.locationId.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
          <Select {...register('category')}>
            {Object.entries(CATEGORY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Priorytet</label>
          <Select {...register('criticality')}>
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Producent</label>
          <Input {...register('manufacturer')} placeholder="Dell" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Model</label>
          <Input {...register('model')} placeholder="Latitude 5530" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">Serial</label>
          <Input {...register('serialNumber')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">IP</label>
          <Input {...register('ipAddress')} placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-tx3 mb-1">MAC</label>
          <Input {...register('macAddress')} placeholder="AA:BB:CC:DD:EE:FF" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-tx3 mb-1">System</label>
        <Input {...register('operatingSystem')} placeholder="Windows 11 Pro" />
      </div>
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button type="button" onClick={handleSubmit((d) => mutation.mutate(d))} disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
      </Button>
    </>
  );

  if (variant === 'page') {
    return (
      <Card className="p-0 overflow-hidden">
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          {formBody}
        </form>
        <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h">
          {actions}
        </div>
      </Card>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale max-h-[90vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowe urządzenie</Dialog.Title>
            <Dialog.Close asChild><button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"><X className="h-4 w-4" /></button></Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            {formBody}
          </form>
          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            {actions}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QrCodeDialog({ device, onClose }: { device: Device; onClose: () => void }) {
  // Generate QR as SVG URL via public API (Google Charts-free alt). For alpha we use img with google chart fallback.
  const qrValue = `https://v2.infradesk.pl/qr/${device.qrCodeValue}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrValue)}`;
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-sm -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">{device.name}</Dialog.Title>
            <Dialog.Close asChild><button className="p-1.5 rounded-[6px] text-tx3 hover:bg-sf-h press"><X className="h-3.5 w-3.5" /></button></Dialog.Close>
          </div>
          <div className="p-6 text-center">
            <img src={qrUrl} alt="QR" className="mx-auto rounded-[var(--r-s)] border border-bd" />
            <p className="text-[11px] font-mono text-tx3 mt-3">{device.qrCodeValue}</p>
            <p className="text-[11px] text-tx3 mt-2">Wydrukuj i przyklej do urządzenia — skan otworzy szczegóły.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

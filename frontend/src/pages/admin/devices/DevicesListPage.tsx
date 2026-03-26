import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, QrCode, Monitor, ExternalLink,
  ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { devicesApi } from '../../../api/devices';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { useDebounce } from '../../../hooks/useDebounce';
import type { Device } from '../../../types';
import toast from 'react-hot-toast';

/* ── Device status badge ─────────────────────────────────────────────────── */
const DEVICE_STATUS: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  ACTIVE:     { label: 'Aktywne',    bg: 'rgba(34,197,94,0.1)',   color: '#4ADE80', dot: '#22C55E' },
  INACTIVE:   { label: 'Nieaktywne', bg: 'rgba(107,114,128,0.1)', color: '#9CA3AF', dot: '#6B7280' },
  BROKEN:     { label: 'Zepsute',    bg: 'rgba(239,68,68,0.1)',   color: '#F87171', dot: '#EF4444' },
  RETIRED:    { label: 'Wycofane',   bg: 'rgba(107,114,128,0.08)',color: '#6B7280', dot: '#4B5563' },
  IN_SERVICE: { label: 'W serwisie', bg: 'rgba(251,191,36,0.1)', color: '#FBBF24', dot: '#F59E0B' },
};

function DeviceStatusBadge({ status }: { status: string }) {
  const s = DEVICE_STATUS[status] ?? DEVICE_STATUS.INACTIVE;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2.5 py-0.5"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/* ── Agent badge ─────────────────────────────────────────────────────────── */
function AgentBadge({ agents }: { agents?: { lastSeen?: string }[] }) {
  const lastSeen = agents?.[0]?.lastSeen;
  if (!lastSeen) return <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>;
  const isOnline = Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  return isOnline ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />Offline
    </span>
  );
}

/* ── Sort helpers ────────────────────────────────────────────────────────── */
type SortKey = 'name' | 'user' | 'client' | 'location' | 'agent' | 'status';
type SortDir = 'asc' | 'desc';

function getAgentOnline(d: Device): boolean {
  const ls = d.agents?.[0]?.lastSeen;
  return ls ? Date.now() - new Date(ls).getTime() < 5 * 60 * 1000 : false;
}

function sortDevices(devices: Device[], key: SortKey, dir: SortDir): Device[] {
  const sorted = [...devices].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'user': {
        const uA = a.agents?.[0]?.currentUser || (a.assignedUser ? `${a.assignedUser.firstName} ${a.assignedUser.lastName}` : '');
        const uB = b.agents?.[0]?.currentUser || (b.assignedUser ? `${b.assignedUser.firstName} ${b.assignedUser.lastName}` : '');
        cmp = uA.localeCompare(uB); break;
      }
      case 'client': cmp = (a.client?.name ?? '').localeCompare(b.client?.name ?? ''); break;
      case 'location': cmp = (a.location?.name ?? '').localeCompare(b.location?.name ?? ''); break;
      case 'agent': cmp = (getAgentOnline(a) ? 1 : 0) - (getAgentOnline(b) ? 1 : 0); break;
      case 'status': cmp = a.status.localeCompare(b.status); break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

/* ── Sort header ─────────────────────────────────────────────────────────── */
function SortTh({ label, sortKey, currentKey, currentDir, onSort, align }: {
  label: string; sortKey: SortKey; currentKey: SortKey | null; currentDir: SortDir;
  onSort: (key: SortKey) => void; align?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`${align === 'center' ? 'text-center' : 'text-left'} px-4 py-3 select-none cursor-pointer group`}
      onClick={() => onSort(sortKey)}>
      <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${isActive ? '' : 'group-hover:text-white/50'}`}
        style={{ color: isActive ? '#A78BFA' : 'rgba(255,255,255,0.3)' }}>
        {label}
        {isActive ? (
          currentDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </div>
    </th>
  );
}

/* ── Filter select styles ────────────────────────────────────────────────── */
const selectStyle: React.CSSProperties = {
  background: '#0E1425',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.85)',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'ACTIVE', label: 'Aktywne' },
  { value: 'INACTIVE', label: 'Nieaktywne' },
  { value: 'BROKEN', label: 'Zepsute' },
  { value: 'RETIRED', label: 'Wycofane' },
  { value: 'IN_SERVICE', label: 'W serwisie' },
];

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export function DevicesListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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

  // Only show clients that have devices in the table
  const clientsInTable = useMemo(() => {
    const ids = new Set(devices.map(d => d.clientId));
    return clients.filter(c => ids.has(c.id));
  }, [devices, clients]);

  // Sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedDevices = useMemo(() => {
    if (!sortKey) return devices;
    return sortDevices(devices, sortKey, sortDir);
  }, [devices, sortKey, sortDir]);

  const handleDownloadQr = async (device: Device, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const openRustdesk = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`rustdesk://${id}`, '_blank');
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

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="rounded-t-[18px] p-4 flex flex-wrap gap-3 items-center"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj (nazwa, IP, hostname, S/N)..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none transition-all placeholder:text-white/20"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="text-sm rounded-xl px-3 py-2.5 focus:outline-none appearance-none pr-8"
          style={selectStyle}>
          <option value="">Wszyscy klienci</option>
          {clientsInTable.map(c => (
            <option key={c.id} value={c.id}>{c.legalName || c.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="text-sm rounded-xl px-3 py-2.5 focus:outline-none appearance-none pr-8"
          style={selectStyle}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(clientId || status) && (
          <button onClick={() => { setClientId(''); setStatus(''); }}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            Wyczyść filtry
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="rounded-b-[18px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        )}

        {!isLoading && sortedDevices.length === 0 && (
          <div className="text-center py-16">
            <Monitor className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak urządzeń</p>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Dodaj pierwsze urządzenie.</p>
          </div>
        )}

        {!isLoading && sortedDevices.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <SortTh label="Urządzenie" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Użytkownik" sortKey="user" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Firma" sortKey="client" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Lokalizacja" sortKey="location" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>RustDesk</th>
                    <SortTh label="Agent" sortKey="agent" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="center" />
                    <SortTh label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="center" />
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedDevices.map(device => (
                    <tr key={device.id}
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="cursor-pointer transition-colors duration-150"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>

                      {/* Urządzenie */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(139,92,246,0.1)' }}>
                            {device.deviceType?.icon
                              ? <span className="text-[16px]">{device.deviceType.icon}</span>
                              : <Monitor className="h-4 w-4" style={{ color: '#A78BFA' }} />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-white/85 truncate">{device.name}</div>
                            <div className="text-[11px] font-mono mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                              {device.ipAddress ?? device.hostname ?? device.serialNumber ?? ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Użytkownik */}
                      <td className="px-4 py-3">
                        {device.agents?.[0]?.currentUser ? (
                          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                            {device.agents[0].currentUser}
                          </span>
                        ) : device.assignedUser ? (
                          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                            {device.assignedUser.firstName} {device.assignedUser.lastName}
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                        )}
                      </td>

                      {/* Firma */}
                      <td className="px-4 py-3">
                        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{device.client?.name ?? '—'}</span>
                      </td>

                      {/* Lokalizacja */}
                      <td className="px-4 py-3">
                        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{device.location?.name ?? '—'}</span>
                      </td>

                      {/* RustDesk */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {device.rustdeskId ? (
                          <button onClick={(e) => openRustdesk(device.rustdeskId!, e)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all duration-200 hover:scale-[1.05] active:scale-[0.97]"
                            style={{ background: 'rgba(251,146,60,0.1)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.15)' }}
                            title={`RustDesk: ${device.rustdeskId}`}>
                            <ExternalLink className="h-3 w-3" />
                            {device.rustdeskId}
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                        )}
                      </td>

                      {/* Agent */}
                      <td className="px-4 py-3 text-center">
                        <AgentBadge agents={device.agents} />
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <DeviceStatusBadge status={device.status} />
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => handleDownloadQr(device, e)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
                            title="Pobierz QR">
                            <QrCode className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                          </button>
                          <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden">
              {sortedDevices.map((device, i) => (
                <div key={device.id}
                  onClick={() => navigate(`/devices/${device.id}`)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors active:bg-white/[0.03]"
                  style={i < sortedDevices.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(139,92,246,0.1)' }}>
                    {device.deviceType?.icon
                      ? <span className="text-[18px]">{device.deviceType.icon}</span>
                      : <Monitor className="h-5 w-5" style={{ color: '#A78BFA' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-white/85 truncate">{device.name}</span>
                      <AgentBadge agents={device.agents} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span>{device.client?.name}</span>
                      {device.rustdeskId && (
                        <button onClick={(e) => openRustdesk(device.rustdeskId!, e)}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(251,146,60,0.1)', color: '#FB923C' }}>
                          RD
                        </button>
                      )}
                    </div>
                  </div>
                  <DeviceStatusBadge status={device.status} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
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

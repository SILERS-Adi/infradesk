import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, QrCode, Monitor, ExternalLink,
  ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown,
  Settings2, Eye, EyeOff, X, GripVertical,
} from 'lucide-react';
import { devicesApi } from '../../../api/devices';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { SearchInput } from '../../../components/ui/SearchInput';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { useDebounce } from '../../../hooks/useDebounce';
import type { Device } from '../../../types';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import { MspCompanyFilter } from '../../../components/ui/MspCompanyFilter';
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
  if (!lastSeen) return <span className="text-[11px]" style={{ color: 'var(--td)' }}>—</span>;
  const isOnline = Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  return isOnline ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={{ background: 'var(--hover-bg)', color: 'var(--tm)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--td)' }} />Offline
    </span>
  );
}

/* ── Sort helpers ────────────────────────────────────────────────────────── */
type SortKey = 'name' | 'user' | 'location' | 'agent' | 'status';
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
        const uA = a.assignedUser ? `${a.assignedUser.firstName} ${a.assignedUser.lastName}` : '';
        const uB = b.assignedUser ? `${b.assignedUser.firstName} ${b.assignedUser.lastName}` : '';
        cmp = uA.localeCompare(uB); break;
      }
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
        style={{ color: isActive ? '#A78BFA' : 'var(--tm)' }}>
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
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  color: 'var(--t)',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'ACTIVE', label: 'Aktywne' },
  { value: 'INACTIVE', label: 'Nieaktywne' },
  { value: 'BROKEN', label: 'Zepsute' },
  { value: 'RETIRED', label: 'Wycofane' },
  { value: 'IN_SERVICE', label: 'W serwisie' },
];

/* ── Column system ──────────────────────────────────────────────────────── */

interface DevColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  align?: 'center';
  render: (d: Device) => React.ReactNode;
}

const DEVICE_COL_STORAGE = 'infradesk_device_columns';
const DEFAULT_DEV_COLS = ['device', 'user', 'login', 'company', 'location', 'ip', 'rustdesk', 'agent', 'status'];

function loadDeviceCols(): string[] {
  try { const s = localStorage.getItem(DEVICE_COL_STORAGE); if (s) return JSON.parse(s); } catch {}
  return DEFAULT_DEV_COLS;
}
function saveDeviceCols(keys: string[]) { localStorage.setItem(DEVICE_COL_STORAGE, JSON.stringify(keys)); }

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export function DevicesListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canCreate, isScoped } = useWorkspaceContext();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleKeys, setVisibleKeys] = useState(loadDeviceCols);
  const [showColumnEditor, setShowColumnEditor] = useState(false);

  useEffect(() => { saveDeviceCols(visibleKeys); }, [visibleKeys]);
  const debouncedSearch = useDebounce(search);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices', { status, search: debouncedSearch, companyFilter }],
    queryFn: () => devicesApi.getAll({
      status: status || undefined,
      search: debouncedSearch || undefined,
      clientWorkspaceId: companyFilter || undefined,
    }),
  });

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

  // Column definitions
  const ALL_COLUMNS: DevColDef[] = useMemo(() => [
    { key: 'device', label: 'Urządzenie', group: 'Podstawowe', defaultVisible: true,
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
            {d.deviceType?.icon ? <span className="text-[16px]">{d.deviceType.icon}</span> : <Monitor className="h-4 w-4" style={{ color: '#A78BFA' }} />}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--t)' }}>{d.name}</div>
            <div className="text-[11px] font-mono mt-0.5 truncate" style={{ color: 'var(--td)' }}>{d.hostname ?? d.serialNumber ?? ''}</div>
          </div>
        </div>
      ),
    },
    { key: 'user', label: 'Użytkownik', group: 'Podstawowe', defaultVisible: true,
      render: (d) => d.assignedUser ? <span className="text-[13px]" style={{ color: 'var(--ts)' }}>{d.assignedUser.firstName} {d.assignedUser.lastName}</span> : <span style={{ color: 'var(--td)' }}>—</span>,
    },
    { key: 'login', label: 'Login', group: 'Podstawowe', defaultVisible: true,
      render: (d) => d.agents?.[0]?.currentUser ? <span className="text-[12px] font-mono" style={{ color: 'var(--tm)' }}>{d.agents[0].currentUser}</span> : <span style={{ color: 'var(--td)' }}>—</span>,
    },
    { key: 'company', label: 'Firma', group: 'Podstawowe', defaultVisible: true,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{(d as any).workspace?.name ?? '—'}</span>,
    },
    { key: 'location', label: 'Lokalizacja', group: 'Podstawowe', defaultVisible: true,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{d.location?.name ?? '—'}</span>,
    },
    { key: 'ip', label: 'Adres IP', group: 'Sieć', defaultVisible: true,
      render: (d) => <span className="text-[12px] font-mono" style={{ color: 'var(--tm)' }}>{d.ipAddress ?? '—'}</span>,
    },
    { key: 'mac', label: 'MAC', group: 'Sieć', defaultVisible: false,
      render: (d) => <span className="text-[11px] font-mono" style={{ color: 'var(--td)' }}>{d.macAddress ?? '—'}</span>,
    },
    { key: 'os', label: 'System', group: 'Szczegóły', defaultVisible: false,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{d.operatingSystem ?? '—'}</span>,
    },
    { key: 'manufacturer', label: 'Producent', group: 'Szczegóły', defaultVisible: false,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{d.manufacturer ?? '—'}</span>,
    },
    { key: 'model', label: 'Model', group: 'Szczegóły', defaultVisible: false,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{d.model ?? '—'}</span>,
    },
    { key: 'serial', label: 'Nr seryjny', group: 'Szczegóły', defaultVisible: false,
      render: (d) => <span className="text-[11px] font-mono" style={{ color: 'var(--td)' }}>{d.serialNumber ?? '—'}</span>,
    },
    { key: 'rustdesk', label: 'RustDesk', group: 'Zdalne', defaultVisible: true, align: 'center',
      render: (d) => d.rustdeskId ? (
        <button onClick={(e) => { e.stopPropagation(); openRustdesk(d.rustdeskId!, e); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all hover:scale-[1.05]"
          style={{ background: 'rgba(251,146,60,0.1)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.15)' }}>
          <ExternalLink className="h-3 w-3" />{d.rustdeskId}
        </button>
      ) : <span style={{ color: 'var(--td)' }}>—</span>,
    },
    { key: 'agent', label: 'Agent', group: 'Zdalne', defaultVisible: true, align: 'center',
      render: (d) => <AgentBadge agents={d.agents} />,
    },
    { key: 'status', label: 'Status', group: 'Status', defaultVisible: true, align: 'center',
      render: (d) => <DeviceStatusBadge status={d.status} />,
    },
    { key: 'criticality', label: 'Krytyczność', group: 'Status', defaultVisible: false,
      render: (d) => <span className="text-[12px]" style={{ color: 'var(--tm)' }}>{d.criticality ?? '—'}</span>,
    },
  ], []);

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as DevColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

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
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumnEditor(v => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.97]"
              style={{
                color: showColumnEditor ? '#A78BFA' : 'var(--ts)',
                background: showColumnEditor ? 'rgba(139,92,246,0.12)' : 'var(--hover-bg)',
                border: showColumnEditor ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--border)',
              }}>
              <Settings2 className="h-4 w-4" /> Kolumny
            </button>
            {canCreate && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
                Nowe urządzenie
              </Button>
            )}
          </div>
        }
      />

      {/* ── Filters (IDS) ────────────────────────────────────────────── */}
      <div className="rounded-t-[18px] p-4 flex flex-wrap gap-3 items-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Szukaj (nazwa, IP, hostname, S/N)..." />
        <MspCompanyFilter value={companyFilter} onChange={setCompanyFilter} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="text-sm rounded-xl px-3 py-2.5 focus:outline-none appearance-none pr-8"
          style={selectStyle}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {status && (
          <button onClick={() => { setStatus(''); }}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: 'var(--tm)' }}>
            Wyczyść filtry
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="rounded-b-[18px] overflow-hidden"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>

        {isLoading && <LoadingSpinner />}

        {!isLoading && sortedDevices.length === 0 && (
          <EmptyState
            icon={<Monitor style={{ width: 22, height: 22, color: 'var(--td)' }} />}
            title={isScoped ? 'Brak dostępu' : 'Brak urządzeń'}
            description={isScoped ? 'Nie masz dostępu do żadnych urządzeń w tym workspace.' : 'Dodaj pierwsze urządzenie.'}
            scopeEntity={isScoped ? 'devices' : undefined}
            action={!isScoped && canCreate ? <Button onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" />} size="sm">Nowe urządzenie</Button> : undefined}
          />
        )}

        {!isLoading && sortedDevices.length > 0 && (
          <>
            {/* Desktop table — dynamic columns */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                    {visibleCols.map(col => (
                      <th key={col.key} className={`${col.align === 'center' ? 'text-center' : 'text-left'} px-4 py-3 text-[10px] font-bold uppercase tracking-wider`} style={{ color: 'var(--tm)' }}>
                        {col.label}
                      </th>
                    ))}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedDevices.map(device => (
                    <tr key={device.id}
                      onClick={() => navigate(`/devices/${device.id}`)}
                      className="cursor-pointer transition-colors duration-150"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className={`px-4 py-3 ${col.align === 'center' ? 'text-center' : ''}`}
                          onClick={['rustdesk'].includes(col.key) ? e => e.stopPropagation() : undefined}>
                          {col.render(device)}
                        </td>
                      ))}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => handleDownloadQr(device, e)} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--hover-bg)]" title="Pobierz QR">
                            <QrCode className="h-3.5 w-3.5" style={{ color: 'var(--td)' }} />
                          </button>
                          <ChevronRight className="h-4 w-4" style={{ color: 'var(--td)' }} />
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
                  style={i < sortedDevices.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}>
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
                    <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'var(--tm)' }}>
                      <span>{device.location?.name}</span>
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
      {/* Column Editor — same pattern as TicketsListPage */}
      {showColumnEditor && (
        <DeviceColumnEditor
          allColumns={ALL_COLUMNS}
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

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

/* ════════════════════════════════════════════════════════════════════════════
   Column Editor — drag & drop reorder + toggle (same pattern as Tickets)
   ════════════════════════════════════════════════════════════════════════════ */
function DeviceColumnEditor({ allColumns, visibleKeys, setVisibleKeys, groups, onClose }: {
  allColumns: DevColDef[];
  visibleKeys: string[];
  setVisibleKeys: React.Dispatch<React.SetStateAction<string[]>>;
  groups: string[];
  onClose: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => { e.preventDefault(); setOverIdx(idx); };
  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null); setOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    setVisibleKeys(prev => { const next = [...prev]; const [moved] = next.splice(fromIdx, 1); next.splice(toIdx, 0, moved); return next; });
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const orderedVisible = visibleKeys.map(k => allColumns.find(c => c.key === k)).filter(Boolean) as DevColDef[];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 top-[50%]" style={{ marginLeft: 'var(--sidebar-width, 220px)' }}>
      <div className="mx-4 mb-4 h-full rounded-t-2xl overflow-hidden flex flex-col" style={{
        background: 'var(--bg2)',
        border: '2px solid var(--accent)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.35), 0 0 30px var(--accent-g)',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>Edycja kolumn</span>
            <span className="text-xs" style={{ color: 'var(--td)' }}>({visibleKeys.length} widocznych)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--hover-bg)]" style={{ color: 'var(--td)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drag strip — column order */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 mr-1" style={{ color: 'var(--td)' }}>Kolejność:</span>
          <GripVertical className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--td)' }} />
          {orderedVisible.map((col, idx) => (
            <div key={col.key} draggable onDragStart={onDragStart(idx)} onDragOver={onDragOver(idx)} onDrop={onDrop(idx)} onDragEnd={onDragEnd}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-medium cursor-grab active:cursor-grabbing select-none flex-shrink-0 transition-all"
              style={{
                background: overIdx === idx ? 'rgba(139,92,246,0.25)' : dragIdx === idx ? 'rgba(139,92,246,0.1)' : 'var(--hover-bg)',
                border: overIdx === idx ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border)',
                color: overIdx === idx ? '#C4B5FD' : 'var(--ts)',
                opacity: dragIdx === idx ? 0.35 : 1,
                transform: overIdx === idx ? 'scale(1.08)' : 'scale(1)',
              }}>
              <GripVertical className="h-3 w-3" style={{ color: 'var(--td)' }} />
              {col.label}
            </div>
          ))}
          <span className="text-[9px] flex-shrink-0 ml-2" style={{ color: 'var(--td)' }}>← przeciągnij aby zmienić →</span>
        </div>

        {/* Toggle columns by group */}
        <div className="flex-1 p-4 overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--td)' }}>Włącz / wyłącz kolumny</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(group => (
              <div key={group}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--td)' }}>{group}</p>
                <div className="space-y-0.5">
                  {allColumns.filter(c => c.group === group).map(col => {
                    const visible = visibleKeys.includes(col.key);
                    return (
                      <button key={col.key} onClick={() => toggleColumn(col.key)}
                        className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all hover:bg-[var(--hover-bg)]"
                        style={{ background: visible ? 'rgba(139,92,246,0.1)' : 'transparent', color: visible ? '#A78BFA' : 'var(--tm)' }}>
                        {visible ? <Eye className="h-3 w-3 flex-shrink-0" /> : <EyeOff className="h-3 w-3 flex-shrink-0" />}
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

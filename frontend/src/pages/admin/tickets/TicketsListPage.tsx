// @ts-nocheck
import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Bot, Globe, Phone, Mail, QrCode, User as UserIcon,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle,
  Settings2, Eye, EyeOff, GripVertical, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { SearchInput } from '../../../components/ui/SearchInput';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ScopedAccessBanner } from '../../../components/ui/ScopedAccessBanner';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import { UnifiedTicketWizard } from '../../../components/wizard/UnifiedTicketWizard';
import { formatDate } from '../../../utils/helpers';
import type { Ticket } from '../../../types';

type TabKey = 'pending' | 'assigned' | 'completed' | 'cancelled';

/* -- Source icons ---------------------------------------------------------- */
const SOURCE_ICON: Record<string, { icon: React.ReactNode; label: string }> = {
  AGENT:         { icon: <Bot className="h-3.5 w-3.5 text-violet-500" />, label: 'Agent' },
  CLIENT_PORTAL: { icon: <Globe className="h-3.5 w-3.5 text-blue-500" />, label: 'Portal' },
  PHONE:         { icon: <Phone className="h-3.5 w-3.5 text-green-500" />, label: 'Telefon' },
  EMAIL:         { icon: <Mail className="h-3.5 w-3.5 text-amber-500" />, label: 'Email' },
  QR_SCAN:       { icon: <QrCode className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />, label: 'QR' },
  IN_PERSON:     { icon: <UserIcon className="h-3.5 w-3.5 text-cyan-500" />, label: 'Osobiste' },
  INTERNAL:      { icon: <span style={{ color: 'var(--tm)' }} className="text-xs">--</span>, label: 'Wewn.' },
  MESSAGE:       { icon: <Mail className="h-3.5 w-3.5 text-pink-400" />, label: 'Wiad.' },
};

/* -- ColDef interface ------------------------------------------------------ */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (t: Ticket) => React.ReactNode;
  width?: string;
}

/* -- Sort types ------------------------------------------------------------ */
type SortKey = 'number' | 'client' | 'priority' | 'assigned' | 'status' | 'serviceMode' | 'date';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const STATUS_ORDER: Record<string, number> = { PENDING: 1, ASSIGNED: 2, COMPLETED: 3, CANCELLED: 4 };
const SERVICE_MODE_ORDER: Record<string, number> = { REMOTE: 1, ONSITE: 2 };

function sortTickets(tickets: Ticket[], key: SortKey, dir: SortDir): Ticket[] {
  const sorted = [...tickets].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'number':      cmp = a.ticketNumber.localeCompare(b.ticketNumber, undefined, { numeric: true }); break;
      case 'client':      cmp = (a.location?.name ?? '').localeCompare(b.location?.name ?? ''); break;
      case 'priority':    cmp = (PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0); break;
      case 'assigned':    cmp = (a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : '').localeCompare(b.assignedTo ? `${b.assignedTo.firstName} ${b.assignedTo.lastName}` : ''); break;
      case 'status':      cmp = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0); break;
      case 'serviceMode': cmp = (SERVICE_MODE_ORDER[a.serviceMode ?? ''] ?? 99) - (SERVICE_MODE_ORDER[b.serviceMode ?? ''] ?? 99); break;
      case 'date':        cmp = new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime(); break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

/* -- Sort header ----------------------------------------------------------- */
function SortTh({ label, sortKey, currentKey, currentDir, onSort, align }: {
  label: string; sortKey: SortKey; currentKey: SortKey | null; currentDir: SortDir;
  onSort: (key: SortKey) => void; align?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`${align === 'center' ? 'text-center' : 'text-left'} px-4 py-3 select-none cursor-pointer group`}
      onClick={() => onSort(sortKey)}>
      <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${isActive ? '' : 'group-hover:text-[var(--tm)]'}`}
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

/* -- Plain (non-sortable) header ------------------------------------------- */
function PlainTh({ label, align }: { label: string; align?: string }) {
  return (
    <th className={`${align === 'center' ? 'text-center' : 'text-left'} px-4 py-3`}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>
        {label}
      </span>
    </th>
  );
}

/* -- AssignPopup ----------------------------------------------------------- */
function AssignPopup({ ticket, technicians }: { ticket: Ticket; technicians: { id: string; firstName: string; lastName: string }[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMode, setSelectedMode] = useState<'REMOTE' | 'ONSITE' | ''>(ticket.serviceMode ?? '');
  const popupRef = useRef<HTMLDivElement>(null);

  const assignMutation = useMutation({
    mutationFn: ({ userId, serviceMode }: { userId: string; serviceMode?: string }) =>
      ticketsApi.assign(ticket.id, userId, serviceMode || undefined),
    onSuccess: () => {
      toast.success('Zgłoszenie przydzielone');
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
      setOpen(false);
    },
    onError: () => toast.error('Błąd przydzielenia'),
  });

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupH = 180;
      setPos({
        top: spaceBelow < popupH ? rect.top - popupH : rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        disabled={assignMutation.isPending}
        className="text-xs font-medium"
        style={{ color: '#A78BFA' }}
      >
        {assignMutation.isPending ? 'Przydzielam...' : 'Przydziel'}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          onClick={e => e.stopPropagation()}
          className="rounded-[14px] p-3 flex flex-col gap-2.5"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            minWidth: 220,
          }}
        >
          {/* Technician select */}
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            style={{
              background: 'var(--hover-bg)',
              border: '1px solid var(--border)',
              color: 'var(--t)',
            }}
          >
            <option value="" disabled style={{ background: 'var(--hover-bg)', color: 'var(--t)' }}>
              Wybierz technika...
            </option>
            {technicians.map(u => (
              <option key={u.id} value={u.id} style={{ background: 'var(--hover-bg)', color: 'var(--t)' }}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>

          {/* Service mode buttons */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedMode(selectedMode === 'REMOTE' ? '' : 'REMOTE')}
              className="flex-1 text-[11px] font-semibold rounded-lg py-1.5 px-2 transition-all"
              style={selectedMode === 'REMOTE'
                ? { background: 'rgba(96,165,250,0.18)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.35)' }
                : { background: 'var(--hover-bg)', color: 'var(--tm)', border: '1px solid var(--border)' }
              }
            >
              Zdalny
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode(selectedMode === 'ONSITE' ? '' : 'ONSITE')}
              className="flex-1 text-[11px] font-semibold rounded-lg py-1.5 px-2 transition-all"
              style={selectedMode === 'ONSITE'
                ? { background: 'rgba(251,146,60,0.18)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.35)' }
                : { background: 'var(--hover-bg)', color: 'var(--tm)', border: '1px solid var(--border)' }
              }
            >
              Na miejscu
            </button>
          </div>

          {/* Assign button */}
          <button
            type="button"
            disabled={!selectedUserId || assignMutation.isPending}
            onClick={() => assignMutation.mutate({ userId: selectedUserId, serviceMode: selectedMode || undefined })}
            className="w-full text-xs font-semibold rounded-lg py-2 px-3 transition-all disabled:opacity-40"
            style={{
              background: selectedUserId ? 'rgba(139,92,246,0.2)' : 'var(--hover-bg)',
              color: selectedUserId ? '#A78BFA' : 'var(--tm)',
              border: `1px solid ${selectedUserId ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
            }}
          >
            {assignMutation.isPending ? 'Przydzielam...' : 'Przydziel'}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

/* -- ServiceModeBadge ------------------------------------------------------ */
function ServiceModeBadge({ mode }: { mode?: 'REMOTE' | 'ONSITE' | null }) {
  if (mode === 'REMOTE') {
    return (
      <span
        className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}
      >
        Zdalnie
      </span>
    );
  }
  if (mode === 'ONSITE') {
    return (
      <span
        className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C' }}
      >
        Na miejscu
      </span>
    );
  }
  return <span className="text-[11px]" style={{ color: 'var(--td)' }}>&mdash;</span>;
}

/* -- Column persistence ---------------------------------------------------- */
const STORAGE_KEY = 'infradesk_ticket_columns';

function loadColumns(): string[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return ['number', 'title', 'client', 'priority', 'assigned', 'status', 'serviceMode', 'date', 'sla'];
}

function saveColumns(keys: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

/* -- Column-to-sortKey mapping --------------------------------------------- */
const COL_SORT_KEY: Record<string, SortKey> = {
  number: 'number',
  client: 'client',
  priority: 'priority',
  assigned: 'assigned',
  status: 'status',
  serviceMode: 'serviceMode',
  date: 'date',
};

/* ============================================================================
   PAGE
   ============================================================================ */
export function TicketsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canCreate, isScoped } = useWorkspaceContext();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);
  const [showColumnEditor, setShowColumnEditor] = useState(false);

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: allTickets = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['tickets-all'],
    queryFn: () => ticketsApi.getAll({ limit: '500' }),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });

  const technicians = allUsers.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  /* -- ALL_COLUMNS as useMemo (closure over activeTab + technicians) -------- */
  const ALL_COLUMNS: ColDef[] = useMemo(() => [
    // Podstawowe
    {
      key: 'number', label: 'Nr', group: 'Podstawowe', defaultVisible: true,
      render: (t: Ticket) => (
        <span className="font-mono text-xs font-semibold" style={{ color: '#A78BFA' }}>
          {t.ticketNumber}
        </span>
      ),
    },
    {
      key: 'title', label: 'Tytuł', group: 'Podstawowe', defaultVisible: true,
      render: (t: Ticket) => (
        <div className="max-w-xs">
          <div className="text-[13px] font-semibold text-[var(--t)] truncate">{t.title}</div>
          {t.description && (
            <div
              className="text-[11px] mt-0.5 leading-snug"
              style={{
                color: 'var(--tm)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {t.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'company', label: 'Firma', group: 'Podstawowe', defaultVisible: true,
      render: (t: Ticket) => (
        <span className="text-[12px]" style={{ color: 'var(--tm)' }}>
          {(t as any).workspace?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'client', label: 'Lokalizacja', group: 'Podstawowe', defaultVisible: true,
      render: (t: Ticket) => (
        <span className="text-[13px]" style={{ color: 'var(--ts)' }}>
          {t.location?.name ?? <span className="text-[11px]" style={{ color: 'var(--td)' }}>--</span>}
        </span>
      ),
    },
    {
      key: 'user', label: 'Użytkownik', group: 'Podstawowe', defaultVisible: false,
      render: (t: Ticket) => (
        (t.device as any)?.assignedUser ? (
          <span className="text-[13px]" style={{ color: 'var(--ts)' }}>
            {(t.device as any).assignedUser.firstName} {(t.device as any).assignedUser.lastName}
          </span>
        ) : t.reporterName ? (
          <span className="text-[12px]" style={{ color: 'var(--tm)' }}>
            {t.reporterName}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--td)' }}>—</span>
        )
      ),
    },

    // Status
    {
      key: 'priority', label: 'Priorytet', group: 'Status', defaultVisible: true,
      render: (t: Ticket) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: 'assigned', label: 'Przypisany', group: 'Status', defaultVisible: true,
      render: (t: Ticket) => (
        activeTab === 'pending' ? (
          <AssignPopup ticket={t} technicians={technicians} />
        ) : t.assignedTo ? (
          <span className="text-[13px]" style={{ color: 'var(--ts)' }}>
            {t.assignedTo.firstName} {t.assignedTo.lastName}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--td)' }}>--</span>
        )
      ),
    },
    {
      key: 'source', label: 'Źródło', group: 'Status', defaultVisible: false,
      render: (t: Ticket) => (
        <span className="inline-flex items-center justify-center gap-1" title={SOURCE_ICON[t.source]?.label ?? t.source}>
          {SOURCE_ICON[t.source]?.icon ?? <span className="text-xs" style={{ color: 'var(--tm)' }}>--</span>}
        </span>
      ),
    },
    {
      key: 'status', label: 'Status', group: 'Status', defaultVisible: true,
      render: (t: Ticket) => <TicketStatusBadge status={t.status} />,
    },
    {
      key: 'serviceMode', label: 'Realizacja', group: 'Status', defaultVisible: true,
      render: (t: Ticket) => <ServiceModeBadge mode={t.serviceMode} />,
    },

    // Czas
    {
      key: 'date', label: 'Data', group: 'Czas', defaultVisible: true,
      render: (t: Ticket) => (
        <span className="text-xs" style={{ color: 'var(--tm)' }}>
          {formatDate(t.reportedAt)}
        </span>
      ),
    },
    {
      key: 'sla', label: 'SLA', group: 'Czas', defaultVisible: true,
      render: (t: Ticket) => {
        if (!t.dueAt) return <span style={{ color: 'var(--td)' }}>—</span>;
        if (t.status === 'COMPLETED' || t.status === 'CANCELLED' || t.status === 'RESOLVED') return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>OK</span>;
        const due = new Date(t.dueAt);
        const now = new Date();
        const hoursLeft = (due.getTime() - now.getTime()) / 3600000;
        if (hoursLeft < 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>PRZETERMINOWANE</span>;
        if (hoursLeft < 4) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>{Math.ceil(hoursLeft)}h</span>;
        const d = due.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
        return <span className="text-[10px] font-semibold" style={{ color: 'var(--tm)' }}>{d}</span>;
      },
    },

    // Ocena
    {
      key: 'rating', label: 'Ocena', group: 'Status', defaultVisible: true,
      render: (t: Ticket) => {
        if (!t.rating) return <span style={{ color: 'var(--td)', fontSize: 11 }}>—</span>;
        return (
          <span style={{ display: 'inline-flex', gap: 1 }}>
            {[1, 2, 3].map(s => (
              <span key={s} style={{ fontSize: 12, lineHeight: 1 }}>{s <= t.rating ? '⭐' : ''}</span>
            ))}
          </span>
        );
      },
    },
  ], [activeTab, technicians]);

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  // Partition tickets into tabs
  const pending   = allTickets.filter(t => t.status === 'PENDING');
  const assigned  = allTickets.filter(t => t.status === 'ASSIGNED');
  const completed = allTickets.filter(t => t.status === 'COMPLETED');
  const cancelled = allTickets.filter(t => t.status === 'CANCELLED');

  const tabData: Record<TabKey, Ticket[]> = { pending, assigned, completed, cancelled };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'pending',   label: 'Oczekujące',   count: pending.length },
    { key: 'assigned',  label: 'Przydzielone', count: assigned.length },
    { key: 'completed', label: 'Zakończone',   count: completed.length },
    { key: 'cancelled', label: 'Anulowane',    count: cancelled.length },
  ];

  // Local search filter
  const q = search.toLowerCase();
  const filtered = tabData[activeTab].filter(t =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.ticketNumber.toLowerCase().includes(q) ||
    (t.location?.name ?? '').toLowerCase().includes(q) ||
    (t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`.toLowerCase().includes(q) : false)
  );

  // Sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedTickets = useMemo(() => {
    if (!sortKey) return filtered;
    return sortTickets(filtered, sortKey, sortDir);
  }, [filtered, sortKey, sortDir]);

  const getTabBadgeStyle = (key: TabKey): React.CSSProperties => {
    switch (key) {
      case 'pending':
        return { background: 'rgba(239,68,68,0.12)', color: '#F87171' };
      case 'assigned':
        return { background: 'rgba(234,179,8,0.12)', color: '#FACC15' };
      case 'completed':
        return { background: 'rgba(34,197,94,0.12)', color: '#4ADE80' };
      default:
        return { background: 'var(--hover-bg)', color: 'var(--ts)' };
    }
  };

  /* -- Columns that need center alignment ---------------------------------- */
  const CENTER_COLS = new Set(['priority', 'source', 'status', 'serviceMode']);

  return (
    <div>
      <PageHeader
        title="Zgłoszenia"
        subtitle={`${allTickets.length} zgłoszeń`}
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
                Nowe zgłoszenie
              </Button>
            )}
          </div>
        }
      />

      <div
        className="rounded-lg"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Tabs */}
        <div className="flex mb-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                className="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
                style={isActive
                  ? { borderBottomColor: 'var(--accent)', color: 'var(--accent-s)' }
                  : { borderBottomColor: 'transparent', color: 'var(--tm)' }
                }
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={getTabBadgeStyle(tab.key)}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search (IDS) */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Nr zgłoszenia, tytuł, klient..." />
        </div>

        <ScopedAccessBanner />

        {/* Loading (IDS) */}
        {isLoading && <LoadingSpinner />}

        {/* Error state */}
        {!isLoading && isError && <ErrorState onRetry={() => refetch()} />}

        {/* Empty state (IDS) */}
        {!isLoading && !isError && sortedTickets.length === 0 && (
          <EmptyState
            icon={<AlertTriangle style={{ width: 22, height: 22, color: 'var(--td)' }} />}
            title={isScoped ? 'Brak dostępu' : 'Brak zgłoszeń'}
            description={isScoped ? 'Nie masz dostępu do żadnych zgłoszeń w tym workspace.' : 'Brak zgłoszeń w tej kategorii.'}
            scopeEntity={isScoped ? 'tickets' : undefined}
          />
        )}

        {/* Table */}
        {!isLoading && sortedTickets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                  {visibleCols.map(col => {
                    const sk = COL_SORT_KEY[col.key];
                    const align = CENTER_COLS.has(col.key) ? 'center' : undefined;
                    return sk ? (
                      <SortTh key={col.key} label={col.label} sortKey={sk} currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align={align} />
                    ) : (
                      <PlainTh key={col.key} label={col.label} align={align} />
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedTickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="cursor-pointer transition-colors duration-150"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 whitespace-nowrap ${CENTER_COLS.has(col.key) ? 'text-center' : ''}`}
                        onClick={col.key === 'assigned' && activeTab === 'pending' ? e => e.stopPropagation() : undefined}
                      >
                        {col.render(ticket)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Column Editor Panel ──────────────────────────────────────── */}
      {showColumnEditor && (
        <ColumnEditorPanel
          allColumns={ALL_COLUMNS}
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

      <UnifiedTicketWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['tickets-all'] });
        }}
      />
    </div>
  );
}

/* ============================================================================
   Column Editor — drag & drop reorder + toggle visibility
   ============================================================================ */
function ColumnEditorPanel({ allColumns, visibleKeys, setVisibleKeys, groups, onClose }: {
  allColumns: ColDef[];
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

  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    setVisibleKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const orderedVisible = visibleKeys.map(k => allColumns.find(c => c.key === k)).filter(Boolean) as ColDef[];

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
            <span className="text-sm font-semibold text-[var(--t)]">Edycja kolumn</span>
            <span className="text-xs text-[var(--td)]">({visibleKeys.length} widocznych)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--td)] hover:text-[var(--tm)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Horizontal drag strip — live column order */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderTop: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--td)] flex-shrink-0 mr-1">Kolejność:</span>
          <GripVertical className="h-3 w-3 text-[var(--td)] flex-shrink-0" />
          {orderedVisible.map((col, idx) => (
            <div
              key={col.key}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-medium cursor-grab active:cursor-grabbing select-none flex-shrink-0 transition-all"
              style={{
                background: overIdx === idx ? 'rgba(139,92,246,0.25)' : dragIdx === idx ? 'rgba(139,92,246,0.1)' : 'var(--hover-bg)',
                border: overIdx === idx ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border)',
                color: overIdx === idx ? '#C4B5FD' : 'var(--ts)',
                opacity: dragIdx === idx ? 0.35 : 1,
                transform: overIdx === idx ? 'scale(1.08)' : 'scale(1)',
              }}>
              <GripVertical className="h-3 w-3 text-[var(--td)]" />
              {col.label}
            </div>
          ))}
          <span className="text-[9px] text-[var(--td)] flex-shrink-0 ml-2">← przeciągnij aby zmienić →</span>
        </div>

        <div className="flex gap-0 flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
          {/* LEFT: Toggle columns by group */}
          <div className="flex-1 p-4 overflow-y-auto" style={{ borderRight: '1px solid var(--border)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--td)] mb-3">Włącz / wyłącz kolumny</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map(group => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--td)] mb-1.5">{group}</p>
                  <div className="space-y-0.5">
                    {allColumns.filter(c => c.group === group).map(col => {
                      const visible = visibleKeys.includes(col.key);
                      return (
                        <button key={col.key} onClick={() => toggleColumn(col.key)}
                          className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all hover:bg-[var(--hover-bg)]"
                          style={{
                            background: visible ? 'rgba(139,92,246,0.1)' : 'transparent',
                            color: visible ? '#A78BFA' : 'var(--tm)',
                          }}>
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
    </div>
  );
}

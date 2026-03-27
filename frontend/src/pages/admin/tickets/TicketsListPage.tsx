import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Bot, Globe, Phone, Mail, QrCode, User as UserIcon,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
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
  QR_SCAN:       { icon: <QrCode className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />, label: 'QR' },
  IN_PERSON:     { icon: <UserIcon className="h-3.5 w-3.5 text-cyan-500" />, label: 'Osobiste' },
  INTERNAL:      { icon: <span style={{ color: 'rgba(255,255,255,0.3)' }} className="text-xs">--</span>, label: 'Wewn.' },
  MESSAGE:       { icon: <Mail className="h-3.5 w-3.5 text-pink-400" />, label: 'Wiad.' },
};

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
      case 'client':      cmp = (a.client?.name ?? '').localeCompare(b.client?.name ?? ''); break;
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

/* -- Plain (non-sortable) header ------------------------------------------- */
function PlainTh({ label, align }: { label: string; align?: string }) {
  return (
    <th className={`${align === 'center' ? 'text-center' : 'text-left'} px-4 py-3`}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
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

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        disabled={assignMutation.isPending}
        className="text-xs font-medium"
        style={{ color: '#A78BFA' }}
      >
        {assignMutation.isPending ? 'Przydzielam...' : 'Przydziel'}
      </button>

      {open && (
        <div
          ref={popupRef}
          onClick={e => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-50 rounded-[14px] p-3 flex flex-col gap-2.5"
          style={{
            background: 'rgba(14,20,38,0.97)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: 220,
          }}
        >
          {/* Technician select */}
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            style={{
              background: '#0E1425',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            <option value="" disabled style={{ background: '#0E1425', color: 'rgba(255,255,255,0.85)' }}>
              Wybierz technika...
            </option>
            {technicians.map(u => (
              <option key={u.id} value={u.id} style={{ background: '#0E1425', color: 'rgba(255,255,255,0.85)' }}>
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
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
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
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
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
              background: selectedUserId ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: selectedUserId ? '#A78BFA' : 'rgba(255,255,255,0.3)',
              border: `1px solid ${selectedUserId ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {assignMutation.isPending ? 'Przydzielam...' : 'Przydziel'}
          </button>
        </div>
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
  return <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>&mdash;</span>;
}

/* ============================================================================
   PAGE
   ============================================================================ */
export function TicketsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: allTickets = [], isLoading } = useQuery({
    queryKey: ['tickets-all'],
    queryFn: () => ticketsApi.getAll({ limit: '500' }),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });

  const technicians = allUsers.filter(u => u.role !== 'CLIENT' && u.isActive);

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
    (t.client?.name ?? '').toLowerCase().includes(q) ||
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
        return { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' };
    }
  };

  return (
    <div>
      <PageHeader
        title="Zgłoszenia"
        subtitle={`${allTickets.length} zgłoszeń`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowe zgłoszenie
          </Button>
        }
      />

      <div
        className="rounded-lg"
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Tabs */}
        <div className="flex mb-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                className="px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
                style={isActive
                  ? { borderBottomColor: '#8B5CF6', color: '#A78BFA' }
                  : { borderBottomColor: 'transparent', color: 'rgba(255,255,255,0.4)' }
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

        {/* Search */}
        <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nr zgłoszenia, tytuł, klient..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.85)',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(139,92,246,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; }}
            />
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sortedTickets.length === 0 && (
          <div className="text-center py-16">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak zgłoszeń</p>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak zgłoszeń w tej kategorii.</p>
          </div>
        )}

        {/* Table */}
        {!isLoading && sortedTickets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <SortTh label="Nr" sortKey="number" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <PlainTh label="Tytuł" />
                  <SortTh label="Klient" sortKey="client" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <PlainTh label="Użytkownik" />
                  <SortTh label="Priorytet" sortKey="priority" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="center" />
                  <SortTh label="Przypisany" sortKey="assigned" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <PlainTh label="Źródło" align="center" />
                  <SortTh label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="center" />
                  <SortTh label="Realizacja" sortKey="serviceMode" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="center" />
                  <SortTh label="Data" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedTickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className="cursor-pointer transition-colors duration-150"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Nr */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold" style={{ color: '#A78BFA' }}>
                        {ticket.ticketNumber}
                      </span>
                    </td>

                    {/* Tytuł + description */}
                    <td className="px-4 py-3">
                      <div className="max-w-xs">
                        <div className="text-[13px] font-semibold text-white/85 truncate">{ticket.title}</div>
                        {ticket.description && (
                          <div
                            className="text-[11px] mt-0.5 leading-snug"
                            style={{
                              color: 'rgba(255,255,255,0.35)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {ticket.description}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Klient */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {ticket.client?.name ?? <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>--</span>}
                      </span>
                    </td>

                    {/* Użytkownik */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(ticket.device as any)?.assignedUser ? (
                        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {(ticket.device as any).assignedUser.firstName} {(ticket.device as any).assignedUser.lastName}
                        </span>
                      ) : ticket.reporterName ? (
                        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {ticket.reporterName}
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                      )}
                    </td>

                    {/* Priorytet */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <PriorityBadge priority={ticket.priority} />
                    </td>

                    {/* Przypisany */}
                    <td className="px-4 py-3 whitespace-nowrap" onClick={activeTab === 'pending' ? e => e.stopPropagation() : undefined}>
                      {activeTab === 'pending' ? (
                        <AssignPopup ticket={ticket} technicians={technicians} />
                      ) : ticket.assignedTo ? (
                        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>--</span>
                      )}
                    </td>

                    {/* Źródło */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center gap-1" title={SOURCE_ICON[ticket.source]?.label ?? ticket.source}>
                        {SOURCE_ICON[ticket.source]?.icon ?? <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>--</span>}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <TicketStatusBadge status={ticket.status} />
                    </td>

                    {/* Realizacja */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <ServiceModeBadge mode={ticket.serviceMode} />
                    </td>

                    {/* Data */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {formatDate(ticket.reportedAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

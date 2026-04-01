import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Timer, Clock, User, Building2, Edit2, Trash2, ChevronDown, ChevronUp, Save, Settings2, Eye, EyeOff, GripVertical, X, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionsApi, WorkSession } from '../../../api/sessions';
import { usersApi } from '../../../api/users';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDateTime, getErrorMessage } from '../../../utils/helpers';

function formatDuration(min?: number | null): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(val: number): string {
  return val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

function calcEarnings(s: WorkSession): { amount: number; isContract: boolean; label: string } {
  const client = s.client;
  if (!client) return { amount: 0, isContract: false, label: '—' };
  const isContract = client.hasContract ?? false;
  const rate = client.hourlyRate ?? 0;
  const interval = client.billingIntervalMinutes ?? 30;
  const min = s.durationMin ?? 0;
  const billableHours = Math.ceil(min / interval) * (interval / 60);

  if (isContract) return { amount: 0, isContract: true, label: 'abonament' };
  if (rate > 0) return { amount: billableHours * rate, isContract: false, label: formatMoney(billableHours * rate) };
  return { amount: 0, isContract: false, label: '—' };
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Aktywna',    bg: 'rgba(34,197,94,0.12)',  color: '#4ADE80' },
  PAUSED:    { label: 'Pauza',      bg: 'rgba(234,179,8,0.12)',  color: '#FBBF24' },
  COMPLETED: { label: 'Zakończona', bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' },
};

/* ── Column definitions ─────────────────────────────────── */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  thAlign?: string;
  tdAlign?: string;
  render: (s: WorkSession) => React.ReactNode;
}

const ALL_COLUMNS: ColDef[] = [
  {
    key: 'technician', label: 'Technik', group: 'Podstawowe', defaultVisible: true,
    render: s => {
      const tech = (s as any).tech;
      return (
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />
          <span className="text-[13px]" style={{ color: 'var(--t)' }}>{tech ? `${tech.firstName} ${tech.lastName}` : '—'}</span>
        </div>
      );
    },
  },
  {
    key: 'client', label: 'Klient', group: 'Podstawowe', defaultVisible: true,
    render: s => <span className="text-[13px]" style={{ color: 'var(--ts)' }}>{s.client?.name ?? '—'}</span>,
  },
  {
    key: 'ticket', label: 'Ticket', group: 'Podstawowe', defaultVisible: true,
    render: s => s.ticket
      ? <span className="text-xs font-mono text-violet-400">{s.ticket.ticketNumber}</span>
      : <span className="text-[11px]" style={{ color: 'var(--td)' }}>—</span>,
  },
  {
    key: 'period', label: 'Okres', group: 'Czas', defaultVisible: true,
    render: s => (
      <>
        <span className="text-[12px]" style={{ color: 'var(--ts)' }}>{formatDateTime(s.startedAt)}</span>
        {s.endedAt && <span className="text-[10px] ml-1" style={{ color: 'var(--tm)' }}>→ {formatDateTime(s.endedAt)}</span>}
      </>
    ),
  },
  {
    key: 'duration', label: 'Czas', group: 'Czas', defaultVisible: true,
    render: s => (
      <>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--t)' }}>{formatDuration(s.durationMin)}</span>
        {(s.totalPausedMin ?? 0) > 0 && <span className="text-[10px] ml-1" style={{ color: 'var(--tm)' }}>(pauza {s.totalPausedMin}m)</span>}
      </>
    ),
  },
  {
    key: 'earnings', label: 'Dochód', group: 'Finanse', defaultVisible: true,
    thAlign: 'text-right', tdAlign: 'text-right',
    render: s => {
      const earn = calcEarnings(s);
      return (
        <span className="text-[13px] font-semibold" style={{ color: earn.isContract ? '#60A5FA' : earn.amount > 0 ? '#4ADE80' : 'var(--tm)' }}>
          {earn.label}
        </span>
      );
    },
  },
  {
    key: 'status', label: 'Status', group: 'Status', defaultVisible: true,
    thAlign: 'text-center', tdAlign: 'text-center',
    render: s => {
      const st = STATUS_STYLE[s.status ?? 'COMPLETED'];
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: st.bg, color: st.color }}>
          {st.label}
        </span>
      );
    },
  },
];

/* ── Storage ── */
const STORAGE_KEY = 'infradesk_session_columns';
function loadColumns(): string[] {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {}
  return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
}
function saveColumns(keys: string[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }

/* ── SessionRow ─────────────────────────────────────────── */
function SessionRow({ s, visibleCols }: { s: WorkSession; visibleCols: ColDef[] }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const totalColSpan = visibleCols.length + 1; // +1 for actions column

  const editMutation = useMutation({
    mutationFn: (data: { startedAt?: string; endedAt?: string }) => sessionsApi.updateSession(s.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions-all'] }); toast.success('Sesja zaktualizowana'); setEditing(false); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => sessionsApi.deleteSession(s.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions-all'] }); toast.success('Sesja usunięta'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openEdit = () => {
    setEditStart(s.startedAt.slice(0, 16));
    setEditEnd(s.endedAt?.slice(0, 16) ?? '');
    setEditing(true);
  };

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)' }} className="transition-colors hover:bg-white/[0.02]">
        {visibleCols.map(col => (
          <td key={col.key} className={`px-4 py-3 ${col.tdAlign ?? ''}`}>{col.render(s)}</td>
        ))}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            {s.timeEntries && s.timeEntries.length > 1 && (
              <button onClick={() => setExpanded(e => !e)} className="p-1 rounded transition-colors hover:bg-white/[0.06]" title="Segmenty">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />}
              </button>
            )}
            {s.status === 'COMPLETED' && (
              <>
                <button onClick={openEdit} className="p-1 rounded transition-colors hover:bg-white/[0.06]" title="Edytuj czas">
                  <Edit2 className="h-3.5 w-3.5" style={{ color: 'var(--td)' }} />
                </button>
                <button onClick={() => { if (confirm('Usunąć sesję?')) deleteMutation.mutate(); }}
                  className="p-1 rounded transition-colors hover:bg-red-500/10" title="Usuń">
                  <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--td)' }} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {/* Edit row */}
      {editing && (
        <tr style={{ background: 'rgba(139,92,246,0.04)' }}>
          <td colSpan={totalColSpan} className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-medium" style={{ color: 'var(--ts)' }}>Start:</span>
              <input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}
                className="text-[12px] px-2 py-1.5 rounded-lg focus:outline-none"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--ts)' }}>Koniec:</span>
              <input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                className="text-[12px] px-2 py-1.5 rounded-lg focus:outline-none"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
              <button onClick={() => editMutation.mutate({ startedAt: new Date(editStart).toISOString(), endedAt: new Date(editEnd).toISOString() })}
                disabled={editMutation.isPending}
                className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                <Save className="h-3.5 w-3.5" /> {editMutation.isPending ? '...' : 'Zapisz'}
              </button>
              <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-1.5" style={{ color: 'var(--tm)' }}>Anuluj</button>
            </div>
          </td>
        </tr>
      )}
      {/* Time entries */}
      {expanded && s.timeEntries && s.timeEntries.length > 0 && (
        <tr>
          <td colSpan={totalColSpan} className="px-6 py-2" style={{ background: 'var(--hover-bg)' }}>
            <div className="space-y-1">
              {s.timeEntries.map((te, i) => (
                <div key={te.id ?? i} className="flex items-center gap-3 text-[11px] px-2 py-1 rounded" style={{ background: 'var(--hover-bg)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: te.endedAt ? 'var(--td)' : '#4ADE80' }} />
                  <span style={{ color: 'var(--ts)' }}>{formatDateTime(te.startedAt)}</span>
                  {te.endedAt && <span style={{ color: 'var(--tm)' }}>→ {formatDateTime(te.endedAt)}</span>}
                  <span className="font-semibold" style={{ color: 'var(--ts)' }}>
                    {te.durationMin ? formatDuration(te.durationMin) : te.endedAt ? '—' : 'w toku...'}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── ColumnEditorPanel ──────────────────────────────────── */
function ColumnEditorPanel({ visibleKeys, setVisibleKeys, groups, onClose }: {
  visibleKeys: string[];
  setVisibleKeys: React.Dispatch<React.SetStateAction<string[]>>;
  groups: string[];
  onClose: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const onDragStart = (idx: number) => (e: React.DragEvent) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (idx: number) => (e: React.DragEvent) => { e.preventDefault(); setOverIdx(idx); };
  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setOverIdx(null); return; }
    setVisibleKeys(prev => { const next = [...prev]; const [moved] = next.splice(dragIdx, 1); next.splice(toIdx, 0, moved); return next; });
    setDragIdx(null); setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const orderedVisible = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];

  return (
    <div className="fixed inset-0 z-40" style={{ marginLeft: 220 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 top-[40%] mx-4 mb-4 rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg2)', border: '2px solid var(--accent)', boxShadow: '0 -12px 60px rgba(0,0,0,0.35), 0 0 30px var(--accent-g)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>Edycja kolumn</span>
            <span className="text-xs" style={{ color: 'var(--td)' }}>({visibleKeys.length} widocznych)</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHelp(v => !v)}
              className="p-1.5 rounded-full transition-colors"
              style={{ color: showHelp ? 'var(--accent-s)' : 'var(--td)', background: showHelp ? 'var(--accent-g)' : 'transparent' }}
              title="Instrukcja">
              <HelpCircle className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full transition-colors" style={{ color: 'var(--tm)' }} title="Zamknij">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Help */}
        {showHelp && (
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--accent-g)' }}>
            <div className="flex gap-6 text-xs" style={{ color: 'var(--ts)' }}>
              <div className="flex-1 space-y-2">
                <p className="font-semibold" style={{ color: 'var(--t)' }}>Jak to dziala?</p>
                <div className="flex items-start gap-2">
                  <Eye className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Wlacz/wylacz</strong> -- kliknij nazwe kolumny w dolnej sekcji, zeby ja pokazac lub ukryc w tabeli.</p>
                </div>
                <div className="flex items-start gap-2">
                  <GripVertical className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Zmien kolejnosc</strong> -- przeciagnij kafelek w pasku "Kolejnosc" na nowa pozycje (drag & drop).</p>
                </div>
                <div className="flex items-start gap-2">
                  <Settings2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Zapis</strong> -- ustawienia zapisuja sie automatycznie i sa zapamietane w przegladarce.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drag strip */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 mr-1" style={{ color: 'var(--td)' }}>Kolejnosc:</span>
          {orderedVisible.map((col, idx) => (
            <div key={col.key} draggable onDragStart={onDragStart(idx)} onDragOver={onDragOver(idx)} onDrop={onDrop(idx)} onDragEnd={onDragEnd}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-medium cursor-grab active:cursor-grabbing select-none flex-shrink-0 transition-all"
              style={{
                background: overIdx === idx ? 'var(--accent-g)' : 'var(--hover-bg)',
                border: overIdx === idx ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: overIdx === idx ? 'var(--accent-s)' : 'var(--ts)',
                opacity: dragIdx === idx ? 0.35 : 1,
              }}>
              <GripVertical className="h-3 w-3" style={{ color: 'var(--td)' }} />
              {col.label}
            </div>
          ))}
        </div>

        {/* Toggle groups */}
        <div className="flex-1 p-4 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--td)' }}>Wlacz / wylacz kolumny</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(group => (
              <div key={group}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--td)' }}>{group}</p>
                <div className="space-y-0.5">
                  {ALL_COLUMNS.filter(c => c.group === group).map(col => {
                    const visible = visibleKeys.includes(col.key);
                    return (
                      <button key={col.key} onClick={() => toggleColumn(col.key)}
                        className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: visible ? 'var(--accent-g)' : 'transparent',
                          color: visible ? 'var(--accent-s)' : 'var(--tm)',
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
  );
}

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */
export function SessionsPage() {
  const [techFilter, setTechFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions-all', techFilter, clientFilter, dateFrom, dateTo],
    queryFn: () => sessionsApi.getAll({
      techId: techFilter || undefined,
      clientId: clientFilter || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }),
  });

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.getAll() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.getAll() });

  const techs = users.filter(u => (u as any).role === 'ADMIN' || (u as any).role === 'TECHNICIAN');

  const stats = useMemo(() => {
    const total = sessions.length;
    const totalMin = sessions.reduce((s, x) => s + (x.durationMin ?? 0), 0);
    const active = sessions.filter(s => s.status === 'ACTIVE').length;
    const totalEarnings = sessions.reduce((sum, s) => sum + calcEarnings(s).amount, 0);
    return { total, totalMin, active, totalEarnings };
  }, [sessions]);

  const techSummary = useMemo(() => {
    const map = new Map<string, { name: string; sessions: number; minutes: number; earnings: number }>();
    for (const s of sessions) {
      const tech = (s as any).tech;
      const key = s.techId;
      const name = tech ? `${tech.firstName} ${tech.lastName}` : 'Nieznany';
      const existing = map.get(key) ?? { name, sessions: 0, minutes: 0, earnings: 0 };
      existing.sessions++;
      existing.minutes += s.durationMin ?? 0;
      existing.earnings += calcEarnings(s).amount;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [sessions]);

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  /* Footer: compute which visible column index corresponds to 'duration' and 'earnings' */
  const durationIdx = visibleKeys.indexOf('duration');
  const earningsIdx = visibleKeys.indexOf('earnings');

  return (
    <div>
      <PageHeader
        title="Sesje pracy"
        subtitle={`${stats.total} sesji · ${formatDuration(stats.totalMin)} · ${formatMoney(stats.totalEarnings)}${stats.active > 0 ? ` · ${stats.active} aktywnych` : ''}`}
        actions={
          <button onClick={() => setShowColumnEditor(v => !v)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all"
            style={{
              color: showColumnEditor ? 'var(--accent-s)' : 'var(--tm)',
              background: showColumnEditor ? 'var(--accent-g)' : 'var(--hover-bg)',
              border: showColumnEditor ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}>
            <Settings2 className="h-4 w-4" /> Kolumny
          </button>
        }
      />

      {/* Tech summary cards */}
      {techSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {techSummary.slice(0, 4).map(t => (
            <div key={t.name} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--ts)' }}>{t.name}</p>
              <p className="text-lg font-bold mt-1" style={{ color: 'var(--t)' }}>{formatDuration(t.minutes)}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs" style={{ color: 'var(--tm)' }}>{t.sessions} sesji</span>
                <span className="text-xs font-semibold" style={{ color: '#4ADE80' }}>{formatMoney(t.earnings)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-t-[18px] p-4 flex flex-wrap gap-3 items-end"
        style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--tm)' }}>Technik</label>
          <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
            <option value="">Wszyscy</option>
            {techs.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--tm)' }}>Klient</label>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
            <option value="">Wszyscy</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--tm)' }}>Od</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--tm)' }}>Do</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
        </div>
        {(techFilter || clientFilter || dateFrom || dateTo) && (
          <button onClick={() => { setTechFilter(''); setClientFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--tm)' }}>
            Wyczysc filtry
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-b-[18px] overflow-hidden"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <Timer className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--tm)' }}>Brak sesji</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--border)' }}>
                  {visibleCols.map(col => (
                    <th key={col.key} className={`${col.thAlign ?? 'text-left'} px-4 py-3 text-[10px] font-bold uppercase tracking-wider`}
                      style={{ color: 'var(--tm)' }}>{col.label}</th>
                  ))}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => <SessionRow key={s.id} s={s} visibleCols={visibleCols} />)}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                  {visibleCols.map((col, i) => {
                    if (i === 0) {
                      return <td key={col.key} className="px-4 py-3 text-[12px] font-bold" style={{ color: 'var(--ts)' }}>RAZEM</td>;
                    }
                    if (col.key === 'duration') {
                      return <td key={col.key} className="px-4 py-3 text-[12px] font-bold" style={{ color: 'var(--ts)' }}>{formatDuration(stats.totalMin)}</td>;
                    }
                    if (col.key === 'earnings') {
                      return <td key={col.key} className="px-4 py-3 text-right text-[13px] font-bold" style={{ color: '#4ADE80' }}>{formatMoney(stats.totalEarnings)}</td>;
                    }
                    return <td key={col.key} />;
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Column Editor */}
      {showColumnEditor && (
        <ColumnEditorPanel
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}
    </div>
  );
}

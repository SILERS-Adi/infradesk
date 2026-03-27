import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Timer, Clock, User, Building2, Edit2, Trash2, ChevronDown, ChevronUp, Save } from 'lucide-react';
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

function SessionRow({ s }: { s: WorkSession }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const tech = (s as any).tech;
  const st = STATUS_STYLE[s.status ?? 'COMPLETED'];
  const earn = calcEarnings(s);

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
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }} className="transition-colors hover:bg-white/[0.02]">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <span className="text-[13px] text-white/80">{tech ? `${tech.firstName} ${tech.lastName}` : '—'}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.client?.name ?? '—'}</span>
        </td>
        <td className="px-4 py-3">
          {s.ticket ? <span className="text-xs font-mono text-violet-400">{s.ticket.ticketNumber}</span>
            : <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
        </td>
        <td className="px-4 py-3">
          <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatDateTime(s.startedAt)}</span>
          {s.endedAt && <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>→ {formatDateTime(s.endedAt)}</span>}
        </td>
        <td className="px-4 py-3">
          <span className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{formatDuration(s.durationMin)}</span>
          {(s.totalPausedMin ?? 0) > 0 && <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>(pauza {s.totalPausedMin}m)</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-[13px] font-semibold" style={{ color: earn.isContract ? '#60A5FA' : earn.amount > 0 ? '#4ADE80' : 'rgba(255,255,255,0.3)' }}>
            {earn.label}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: st.bg, color: st.color }}>
            {st.label}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            {s.timeEntries && s.timeEntries.length > 1 && (
              <button onClick={() => setExpanded(e => !e)} className="p-1 rounded transition-colors hover:bg-white/[0.06]" title="Segmenty">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />}
              </button>
            )}
            {s.status === 'COMPLETED' && (
              <>
                <button onClick={openEdit} className="p-1 rounded transition-colors hover:bg-white/[0.06]" title="Edytuj czas">
                  <Edit2 className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                </button>
                <button onClick={() => { if (confirm('Usunąć sesję?')) deleteMutation.mutate(); }}
                  className="p-1 rounded transition-colors hover:bg-red-500/10" title="Usuń">
                  <Trash2 className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {/* Edit row */}
      {editing && (
        <tr style={{ background: 'rgba(139,92,246,0.04)' }}>
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Start:</span>
              <input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}
                className="text-[12px] px-2 py-1.5 rounded-lg focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Koniec:</span>
              <input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                className="text-[12px] px-2 py-1.5 rounded-lg focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }} />
              <button onClick={() => editMutation.mutate({ startedAt: new Date(editStart).toISOString(), endedAt: new Date(editEnd).toISOString() })}
                disabled={editMutation.isPending}
                className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                <Save className="h-3.5 w-3.5" /> {editMutation.isPending ? '...' : 'Zapisz'}
              </button>
              <button onClick={() => setEditing(false)} className="text-[11px] px-2 py-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Anuluj</button>
            </div>
          </td>
        </tr>
      )}
      {/* Time entries */}
      {expanded && s.timeEntries && s.timeEntries.length > 0 && (
        <tr>
          <td colSpan={8} className="px-6 py-2" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="space-y-1">
              {s.timeEntries.map((te, i) => (
                <div key={te.id ?? i} className="flex items-center gap-3 text-[11px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: te.endedAt ? 'rgba(255,255,255,0.15)' : '#4ADE80' }} />
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{formatDateTime(te.startedAt)}</span>
                  {te.endedAt && <span style={{ color: 'rgba(255,255,255,0.3)' }}>→ {formatDateTime(te.endedAt)}</span>}
                  <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
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

export function SessionsPage() {
  const [techFilter, setTechFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const techs = users.filter(u => u.role === 'ADMIN' || u.role === 'TECHNICIAN');

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

  return (
    <div>
      <PageHeader
        title="Sesje pracy"
        subtitle={`${stats.total} sesji · ${formatDuration(stats.totalMin)} · ${formatMoney(stats.totalEarnings)}${stats.active > 0 ? ` · ${stats.active} aktywnych` : ''}`}
      />

      {/* Tech summary cards */}
      {techSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {techSummary.slice(0, 4).map(t => (
            <div key={t.name} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.name}</p>
              <p className="text-lg font-bold text-white/90 mt-1">{formatDuration(t.minutes)}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.sessions} sesji</span>
                <span className="text-xs font-semibold" style={{ color: '#4ADE80' }}>{formatMoney(t.earnings)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-t-[18px] p-4 flex flex-wrap gap-3 items-end"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Technik</label>
          <select value={techFilter} onChange={e => setTechFilter(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}>
            <option value="">Wszyscy</option>
            {techs.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Klient</label>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}>
            <option value="">Wszyscy</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Od</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Do</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }} />
        </div>
        {(techFilter || clientFilter || dateFrom || dateTo) && (
          <button onClick={() => { setTechFilter(''); setClientFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            Wyczyść filtry
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-b-[18px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <Timer className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak sesji</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Technik</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Klient</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Ticket</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Okres</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Czas</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Dochód</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => <SessionRow key={s.id} s={s} />)}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  <td className="px-4 py-3 text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>RAZEM</td>
                  <td /><td /><td />
                  <td className="px-4 py-3 text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>{formatDuration(stats.totalMin)}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-bold" style={{ color: '#4ADE80' }}>{formatMoney(stats.totalEarnings)}</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

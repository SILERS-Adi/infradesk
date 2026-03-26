import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Timer, Clock, User, Building2, Monitor, Ticket } from 'lucide-react';
import { sessionsApi, WorkSession } from '../../../api/sessions';
import { usersApi } from '../../../api/users';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDateTime } from '../../../utils/helpers';

function formatDuration(min?: number | null): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  ACTIVE:    { label: 'Aktywna',    bg: 'rgba(34,197,94,0.12)',  color: '#4ADE80' },
  PAUSED:    { label: 'Pauza',      bg: 'rgba(234,179,8,0.12)',  color: '#FBBF24' },
  COMPLETED: { label: 'Zakończona', bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' },
};

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

  // Statystyki
  const stats = useMemo(() => {
    const total = sessions.length;
    const totalMin = sessions.reduce((s, x) => s + (x.durationMin ?? 0), 0);
    const active = sessions.filter(s => s.status === 'ACTIVE').length;
    return { total, totalMin, active };
  }, [sessions]);

  // Grupowanie po techniku
  const techSummary = useMemo(() => {
    const map = new Map<string, { name: string; sessions: number; minutes: number }>();
    for (const s of sessions) {
      const tech = (s as any).tech;
      const key = s.techId;
      const name = tech ? `${tech.firstName} ${tech.lastName}` : 'Nieznany';
      const existing = map.get(key) ?? { name, sessions: 0, minutes: 0 };
      existing.sessions++;
      existing.minutes += s.durationMin ?? 0;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [sessions]);

  return (
    <div>
      <PageHeader
        title="Sesje pracy"
        subtitle={`${stats.total} sesji · ${formatDuration(stats.totalMin)} łącznie${stats.active > 0 ? ` · ${stats.active} aktywnych` : ''}`}
      />

      {/* Statystyki techników */}
      {techSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {techSummary.slice(0, 4).map(t => (
            <div key={t.name} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.name}</p>
              <p className="text-lg font-bold text-white/90 mt-1">{formatDuration(t.minutes)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.sessions} sesji</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtry */}
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

      {/* Tabela */}
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
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Start</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Czas pracy</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const tech = (s as any).tech;
                  const st = STATUS_STYLE[s.status ?? 'COMPLETED'];
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                          <span className="text-[13px] text-white/80">
                            {tech ? `${tech.firstName} ${tech.lastName}` : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                            {s.client?.name ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.ticket ? (
                          <span className="text-xs font-mono text-violet-400">{s.ticket.ticketNumber}</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {formatDateTime(s.startedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                          {formatDuration(s.durationMin)}
                        </span>
                        {s.totalPausedMin ? (
                          <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            (pauza {s.totalPausedMin}m)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Ticket, Bot, ChevronRight, Play, Pause, Square, Loader2, Zap, ListChecks,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../store/authStore';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';
import { sessionsApi, calcWorkSeconds, type TimeEntry } from '../../api/sessions';
import { useEffect, useState } from 'react';

/* ── Timer from entries ───────────────────────────────────────────────────── */
function Timer({ entries = [], paused = false }: { entries?: TimeEntry[]; paused?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { if (paused) return; const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, [paused]);
  const total = calcWorkSeconds(entries);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="flex items-center justify-center w-[88px] h-[88px] rounded-full"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <span className="font-mono text-[22px] font-bold tracking-tight text-white">
        {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
      </span>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const P: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#8B5CF6', LOW: '#22D3EE' };

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 18,
  ...extra,
});

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function MobileDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: ses, refetch: rSes } = useQuery({ queryKey: ['mobile-active-session'], queryFn: () => sessionsApi.getActive(), refetchInterval: 30000 });
  const { data: tasks = [] } = useQuery({
    queryKey: ['mobile-my-tasks'], enabled: !!user?.id,
    queryFn: async () => { const [a, b] = await Promise.all([tasksApi.getAll({ assignedToUserId: user?.id, status: 'IN_PROGRESS' }), tasksApi.getAll({ assignedToUserId: user?.id, status: 'NEW' })]); return [...a, ...b]; },
  });
  const { data: pending = [] } = useQuery({ queryKey: ['mobile-pending-tickets-all'], queryFn: () => ticketsApi.getAll({ status: 'PENDING' }) });

  const [ld, setLd] = useState('');
  const act = async (a: 'pause' | 'resume' | 'end') => {
    if (!ses) return; setLd(a);
    try { if (a === 'pause') await sessionsApi.pause(ses.id); if (a === 'resume') await sessionsApi.resume(ses.id); if (a === 'end') await sessionsApi.end(ses.id); rSes(); qc.invalidateQueries({ queryKey: ['mobile-my-tasks'] }); }
    catch { toast.error('Błąd'); } setLd('');
  };

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">

      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <div className="pt-1">
        <h1 className="text-[20px] font-semibold text-white/90 tracking-[-0.01em]">
          Cześć, {user?.firstName} <span className="text-[19px]">👋</span>
        </h1>
        <p className="text-[12px] mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>
          {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ── Session card ─────────────────────────────────────────────── */}
      {ses && (() => {
        const on = ses.status === 'ACTIVE';
        return (
          <div className="relative overflow-hidden" style={{
            borderRadius: 20, padding: '20px',
            background: on
              ? 'linear-gradient(145deg, rgba(109,40,217,0.09), rgba(37,99,235,0.06))'
              : 'linear-gradient(145deg, rgba(251,191,36,0.06), rgba(248,113,113,0.04))',
            border: `1px solid ${on ? 'rgba(139,92,246,0.12)' : 'rgba(251,191,36,0.1)'}`,
          }}>
            {/* Status label */}
            <div className="flex items-center gap-[6px] mb-4">
              <span className={`w-[6px] h-[6px] rounded-full ${on ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: on ? 'rgba(167,139,250,0.7)' : 'rgba(251,191,36,0.6)' }}>
                {on ? 'Sesja aktywna' : 'Wstrzymana'}
              </span>
            </div>

            {/* Timer + info row */}
            <div className="flex items-center gap-4 mb-5">
              <Timer entries={ses.timeEntries} paused={!on} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white/85 truncate">{ses.client?.name}</p>
                {ses.ticket && <p className="text-[11px] mt-1 text-white/35 truncate">{ses.ticket.ticketNumber}</p>}
                {ses.ticket && <p className="text-[11px] mt-0.5 text-white/30 truncate">{ses.ticket.title}</p>}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5">
              {on ? (<>
                <button onClick={() => act('pause')} disabled={!!ld}
                  className="flex-1 flex items-center justify-center gap-[6px] py-[10px] rounded-[12px] text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                  style={{ background: 'rgba(251,191,36,0.08)', color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.12)' }}>
                  {ld === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Wstrzymaj
                </button>
                <button onClick={() => act('end')} disabled={!!ld}
                  className="flex-1 flex items-center justify-center gap-[6px] py-[10px] rounded-[12px] text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                  style={{ background: 'rgba(248,113,113,0.07)', color: 'rgba(248,113,113,0.75)', border: '1px solid rgba(248,113,113,0.1)' }}>
                  <Square className="h-3.5 w-3.5" /> Zakończ
                </button>
              </>) : (<>
                <button onClick={() => act('resume')} disabled={!!ld}
                  className="flex-1 flex items-center justify-center gap-[6px] py-[10px] rounded-[12px] text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)', color: '#fff', boxShadow: '0 1px 8px rgba(109,40,217,0.12)' }}>
                  {ld === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Wznów
                </button>
                <button onClick={() => act('end')} disabled={!!ld}
                  className="flex-1 flex items-center justify-center gap-[6px] py-[10px] rounded-[12px] text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                  style={{ background: 'rgba(248,113,113,0.07)', color: 'rgba(248,113,113,0.75)', border: '1px solid rgba(248,113,113,0.1)' }}>
                  <Square className="h-3.5 w-3.5" /> Zakończ
                </button>
              </>)}
            </div>
          </div>
        );
      })()}

      {/* ── Stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4" style={glass({
          background: 'linear-gradient(155deg, rgba(139,92,246,0.06), rgba(255,255,255,0.02))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        })}>
          <div className="flex items-center gap-[6px] mb-3">
            <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <ListChecks className="h-[13px] w-[13px] text-violet-400/80" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.32)' }}>Moje</span>
          </div>
          <p className="text-[28px] font-bold text-white leading-none">{tasks.length}</p>
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>zadania</p>
        </div>

        <div className="p-4 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate('/m/tickets')}
          style={glass({
            background: 'linear-gradient(155deg, rgba(34,211,238,0.05), rgba(255,255,255,0.02))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          })}>
          <div className="flex items-center gap-[6px] mb-3">
            <div className="w-7 h-7 rounded-[8px] flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.08)' }}>
              <Zap className="h-[13px] w-[13px] text-cyan-400/80" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.32)' }}>Do wzięcia</span>
          </div>
          <p className="text-[28px] font-bold text-white leading-none">{pending.length}</p>
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.38)' }}>oczekujące</p>
        </div>
      </div>

      {/* ── CTA — more breathing room ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={() => navigate('/m/tickets')}
          className="flex items-center gap-2 px-4 py-[13px] rounded-[14px] text-[13px] font-semibold text-white active:scale-[0.97] transition-all duration-200"
          style={{ background: 'linear-gradient(145deg, #6D28D9, #4C1D95)', boxShadow: '0 1px 12px rgba(109,40,217,0.15), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          <Ticket className="h-[16px] w-[16px]" /> Zgłoszenia
        </button>
        <button onClick={() => navigate('/m/agents')}
          className="flex items-center gap-2 px-4 py-[13px] rounded-[14px] text-[13px] font-semibold active:scale-[0.97] transition-all duration-200"
          style={{ ...glass({ borderRadius: 14 }), color: 'rgba(255,255,255,0.45)' }}>
          <Bot className="h-[16px] w-[16px]" /> Agenci
        </button>
      </div>

      {/* ── My tasks — more spacing ──────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-white/80">Moje zadania</h2>
            <button onClick={() => navigate('/m/tasks')} className="text-[11px] font-semibold text-violet-400/70">Wszystkie</button>
          </div>
          <div className="space-y-[9px]">
            {tasks.slice(0, 5).map(t => (
              <div key={t.id} onClick={() => t.ticketId && navigate(`/m/tickets/${t.ticketId}`)}
                className="flex items-center gap-3 p-[13px] cursor-pointer active:scale-[0.98] transition-all duration-200" style={glass()}>
                <div className="w-[3px] h-[38px] rounded-full flex-shrink-0" style={{ background: P[t.ticket?.priority ?? 'MEDIUM'] ?? '#8B5CF6' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>{t.taskNumber}</span>
                  <p className="text-[13px] font-semibold text-white/75 truncate mt-[1px]">{t.title}</p>
                  <p className="text-[11px] truncate mt-[2px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.ticket?.client?.name}</p>
                </div>
                <ChevronRight className="h-[13px] w-[13px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.1)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {tasks.length === 0 && !ses && (
        <div className="text-center py-10 mt-2" style={glass({ padding: '32px 20px' })}>
          <ListChecks className="h-8 w-8 mx-auto mb-2.5" style={{ color: 'rgba(255,255,255,0.06)' }} />
          <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>Brak aktywnych zadań</p>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>Sprawdź zgłoszenia do wzięcia</p>
        </div>
      )}
    </div>
  );
}

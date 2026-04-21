import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Play, Pause, Square, Timer, Server as ServerIcon, User, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EndSessionModal } from './EndSessionModal';
import { formatDatePl, formatRelativePl } from '@/lib/utils';

interface Session {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  serviceMode: 'REMOTE' | 'ONSITE' | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  billableMinutes: number | null;
  notes: string | null;
  technician: { id: string; firstName: string; lastName: string };
  device: { id: string; name: string } | null;
  ticketLinks: Array<{ ticketId: string; ticket: { ticketNumber: string; title: string; status: string } }>;
}

export function SessionsPage() {
  const qc = useQueryClient();
  const [view, setView] = useViewPreference('sessions', 'visual');
  const [endingSession, setEndingSession] = useState<Session | null>(null);

  const { data, isLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ['sessions'],
    queryFn: async () => (await api.get('/sessions', { params: { limit: 50 } })).data,
  });

  const { data: current } = useQuery<{ session: Session | null }>({
    queryKey: ['sessions', 'current'],
    queryFn: async () => (await api.get('/sessions/current')).data,
    refetchInterval: 30_000,
  });

  const pause = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sessions/${id}/pause`)).data,
    onSuccess: () => { toast.success('Sesja wstrzymana'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
  });
  const resume = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sessions/${id}/resume`)).data,
    onSuccess: () => { toast.success('Sesja wznowiona'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
  });

  const sessions = data?.sessions ?? [];
  const active = sessions.filter((s) => s.status === 'ACTIVE' || s.status === 'PAUSED');
  const historical = sessions.filter((s) => s.status === 'COMPLETED');

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Sesje pracy</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {active.length > 0 ? `${active.length} w toku` : 'Brak aktywnych sesji'}
            {historical.length > 0 && ` · ${historical.length} w historii`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Active session hero */}
      {current?.session && (
        <Card className="p-5 border-l-4" style={{ borderLeftColor: 'var(--pri)' }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div
              className="w-12 h-12 rounded-[var(--r-s)] flex items-center justify-center anim-glow"
              style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
            >
              <Timer className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-0.5">Twoja aktywna sesja</p>
              <p className="text-[16px] font-semibold text-tx">
                <ElapsedTime startedAt={current.session.startedAt} />
                {current.session.device && <> · <span className="text-tx2">{current.session.device.name}</span></>}
              </p>
              {current.session.ticketLinks.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {current.session.ticketLinks.map((l) => (
                    <Badge key={l.ticketId} variant="accent">{l.ticket.ticketNumber}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {current.session.status === 'ACTIVE' ? (
                <Button size="sm" variant="outline" onClick={() => pause.mutate(current.session!.id)} disabled={pause.isPending}>
                  <Pause className="h-3.5 w-3.5" /> Pauza
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => resume.mutate(current.session!.id)} disabled={resume.isPending}>
                  <Play className="h-3.5 w-3.5" /> Wznów
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setEndingSession(current.session!)}>
                <Square className="h-3.5 w-3.5" /> Zakończ
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-10 text-center">
          <Timer className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak sesji</p>
          <p className="text-[13px] text-tx3">Sesje pojawią się gdy zaczniesz pracę nad ticketem lub urządzeniem.</p>
        </Card>
      ) : view === 'visual' ? (
        <SessionsGrid sessions={sessions} onEnd={setEndingSession} />
      ) : (
        <SessionsTable sessions={sessions} onEnd={setEndingSession} />
      )}

      {endingSession && (
        <EndSessionModal
          session={endingSession}
          onClose={() => setEndingSession(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['sessions'] });
            qc.invalidateQueries({ queryKey: ['sessions', 'current'] });
            qc.invalidateQueries({ queryKey: ['tickets'] });
            setEndingSession(null);
          }}
        />
      )}
    </div>
  );
}

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedMs = now - new Date(startedAt).getTime();
  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const s = Math.floor((elapsedMs % 60_000) / 1000);
  return <span className="tabular-nums">{h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}</span>;
}

function SessionsGrid({ sessions, onEnd }: { sessions: Session[]; onEnd: (s: Session) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {sessions.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <StatusPill entity="ticket" value={s.status === 'ACTIVE' ? 'IN_PROGRESS' : s.status === 'PAUSED' ? 'WAITING' : 'CLOSED'} />
            {s.serviceMode && <Badge variant="neutral">{s.serviceMode}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-[13px] text-tx mb-1">
            <User className="h-3.5 w-3.5 text-tx3" />
            {s.technician.firstName} {s.technician.lastName}
          </div>
          {s.device && (
            <div className="flex items-center gap-2 text-[12px] text-tx2 mb-1">
              <ServerIcon className="h-3.5 w-3.5 text-tx3" />
              {s.device.name}
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-tx3 mb-3">
            <Clock className="h-3 w-3" />
            {s.status === 'COMPLETED'
              ? `${s.durationMinutes ?? 0} min · ${formatDatePl(s.startedAt)}`
              : formatRelativePl(s.startedAt)
            }
          </div>
          {s.ticketLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.ticketLinks.slice(0, 3).map((l) => (
                <Link key={l.ticketId} to={`/tickets/${l.ticketId}`}>
                  <Badge variant="accent" className="hover:brightness-110">{l.ticket.ticketNumber}</Badge>
                </Link>
              ))}
              {s.ticketLinks.length > 3 && <Badge variant="neutral">+{s.ticketLinks.length - 3}</Badge>}
            </div>
          )}
          {s.status !== 'COMPLETED' && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => onEnd(s)}>
              <Square className="h-3 w-3" /> Zakończ
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function SessionsTable({ sessions, onEnd }: { sessions: Session[]; onEnd: (s: Session) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd">
          <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <th className="px-4 py-2.5 font-bold">Status</th>
            <th className="px-4 py-2.5 font-bold">Technik</th>
            <th className="px-4 py-2.5 font-bold">Urządzenie</th>
            <th className="px-4 py-2.5 font-bold">Tryb</th>
            <th className="px-4 py-2.5 font-bold">Start</th>
            <th className="px-4 py-2.5 font-bold">Czas</th>
            <th className="px-4 py-2.5 font-bold">Zgłoszenia</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-sf-h transition-colors">
              <td className="px-4 py-3">
                <StatusPill entity="ticket" value={s.status === 'ACTIVE' ? 'IN_PROGRESS' : s.status === 'PAUSED' ? 'WAITING' : 'CLOSED'} />
              </td>
              <td className="px-4 py-3 text-tx">{s.technician.firstName} {s.technician.lastName}</td>
              <td className="px-4 py-3 text-tx2">{s.device?.name ?? '—'}</td>
              <td className="px-4 py-3 text-tx3">{s.serviceMode ?? '—'}</td>
              <td className="px-4 py-3 text-tx3 text-[11px]">{formatDatePl(s.startedAt)}</td>
              <td className="px-4 py-3 text-tx tabular-nums">
                {s.status === 'COMPLETED'
                  ? `${s.durationMinutes ?? 0} min`
                  : <ElapsedTime startedAt={s.startedAt} />}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {s.ticketLinks.slice(0, 2).map((l) => (
                    <Link key={l.ticketId} to={`/tickets/${l.ticketId}`}>
                      <Badge variant="accent" className="text-[10px]">{l.ticket.ticketNumber}</Badge>
                    </Link>
                  ))}
                  {s.ticketLinks.length > 2 && <span className="text-[10px] text-tx3">+{s.ticketLinks.length - 2}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                {s.status !== 'COMPLETED' && (
                  <button onClick={() => onEnd(s)} className="text-[11px] font-semibold text-tx2 hover:text-er press">
                    Zakończ
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

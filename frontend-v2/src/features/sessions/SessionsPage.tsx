import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Timer, Clock, User, Server as ServerIcon, Play, Pause, Square,
  Filter, ChevronDown, ChevronUp, Edit2, Trash2, Save, X, Users, Calendar, Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatCard } from '@/components/ui/StatCard';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EndSessionModal } from './EndSessionModal';
import { formatDatePl, formatRelativePl, cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────
   Types — aligned with V2 backend (sessions.routes.ts)
   ────────────────────────────────────────────────────────── */
interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
}

interface SessionTicketLink {
  ticketId: string;
  ticket: { id?: string; ticketNumber: string; title: string; status: string };
}

interface Session {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  serviceMode: 'REMOTE' | 'ONSITE' | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  billableMinutes: number | null;
  billable?: boolean;
  notes: string | null;
  technicianId?: string;
  technician: { id: string; firstName: string; lastName: string };
  device: { id: string; name: string } | null;
  timeEntries?: TimeEntry[];
  ticketLinks: SessionTicketLink[];
}

interface SessionsResponse { sessions: Session[] }

interface StatsResponse {
  stats: { total: number; totalMinutes: number; billableMinutes: number; active: number; paused: number; completed: number };
  perTechnician: Array<{ technicianId: string; name: string; sessions: number; minutes: number; billableMinutes: number }>;
}

interface Technician { id: string; firstName: string; lastName: string; avatarUrl: string | null }

/* ──────────────────────────────────────────────────────────
   Formatters
   ────────────────────────────────────────────────────────── */
function formatDuration(min: number | null | undefined): string {
  if (!min && min !== 0) return '—';
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function dateOfMonth(when: 'from' | 'to'): string {
  const d = new Date();
  if (when === 'from') {
    d.setDate(1);
  }
  return d.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────── */
export function SessionsPage() {
  const qc = useQueryClient();
  const [view, setView] = useViewPreference('sessions', 'visual');
  const [endingSession, setEndingSession] = useState<Session | null>(null);

  // Filters
  const [technicianId, setTechnicianId] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'>('');
  const [from, setFrom] = useState(dateOfMonth('from'));
  const [to, setTo] = useState(dateOfMonth('to'));
  const [showFilters, setShowFilters] = useState(false);

  const filtersActive = !!(technicianId || status || from !== dateOfMonth('from') || to !== dateOfMonth('to'));

  const queryParams = useMemo(() => {
    const p: Record<string, string> = { limit: '200' };
    if (technicianId) p.technicianId = technicianId;
    if (status) p.status = status;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [technicianId, status, from, to]);

  const { data: sessionsData, isLoading } = useQuery<SessionsResponse>({
    queryKey: ['sessions', 'list', queryParams],
    queryFn: async () => (await api.get('/sessions', { params: queryParams })).data,
  });

  const { data: statsData } = useQuery<StatsResponse>({
    queryKey: ['sessions', 'stats', { technicianId, from, to }],
    queryFn: async () => (await api.get('/sessions/stats', {
      params: {
        ...(technicianId && { technicianId }),
        ...(from && { from }),
        ...(to && { to }),
      },
    })).data,
  });

  const { data: techData } = useQuery<{ technicians: Technician[] }>({
    queryKey: ['sessions', 'technicians'],
    queryFn: async () => (await api.get('/sessions/technicians')).data,
  });

  const { data: currentData } = useQuery<{ session: Session | null }>({
    queryKey: ['sessions', 'current'],
    queryFn: async () => (await api.get('/sessions/current')).data,
    refetchInterval: 30_000,
  });

  const pause = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sessions/${id}/pause`)).data,
    onSuccess: () => { toast.success('Sesja wstrzymana'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });
  const resume = useMutation({
    mutationFn: async (id: string) => (await api.post(`/sessions/${id}/resume`)).data,
    onSuccess: () => { toast.success('Sesja wznowiona'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });

  const sessions = sessionsData?.sessions ?? [];
  const technicians = techData?.technicians ?? [];
  const stats = statsData?.stats;
  const perTech = statsData?.perTechnician ?? [];

  const resetFilters = () => {
    setTechnicianId('');
    setStatus('');
    setFrom(dateOfMonth('from'));
    setTo(dateOfMonth('to'));
  };

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Sesje pracy</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {stats ? (
              <>
                {stats.total} {stats.total === 1 ? 'sesja' : 'sesji'} · {formatDuration(stats.totalMinutes)}
                {stats.billableMinutes !== stats.totalMinutes && (
                  <> · <span className="text-ok">{formatDuration(stats.billableMinutes)} billable</span></>
                )}
                {stats.active > 0 && <> · <span className="text-pri">{stats.active} w toku</span></>}
              </>
            ) : 'Ładowanie…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={showFilters || filtersActive ? 'outline' : 'ghost'}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" /> Filtry
            {filtersActive && <Badge variant="accent" className="ml-1 text-[9px]">aktywne</Badge>}
          </Button>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Timer}    label="Sesji"          value={stats.total}                          accent="primary" />
          <StatCard icon={Clock}    label="Łączny czas"    value={formatDuration(stats.totalMinutes)}   accent="neutral" />
          <StatCard icon={Activity} label="Do rozliczenia" value={formatDuration(stats.billableMinutes)} accent="success" />
          <StatCard icon={Play}     label="W toku"         value={stats.active}                         accent={stats.active > 0 ? 'warning' : 'neutral'} />
        </div>
      )}

      {/* Per-technician summary */}
      {perTech.length > 1 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-bd bg-sf-h flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-tx3" />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">Podsumowanie per technik</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-bd">
            {perTech.slice(0, 8).map((t) => (
              <button
                key={t.technicianId}
                onClick={() => setTechnicianId(t.technicianId)}
                className={cn(
                  'text-left p-3 hover:bg-sf-h transition-colors',
                  technicianId === t.technicianId && 'bg-sf-h',
                )}
              >
                <p className="text-[12px] font-medium text-tx truncate">{t.name}</p>
                <p className="text-[18px] font-black text-tx tabular-nums mt-0.5">{formatDuration(t.minutes)}</p>
                <p className="text-[10px] text-tx3 mt-0.5">
                  {t.sessions} {t.sessions === 1 ? 'sesja' : 'sesji'}
                  {t.billableMinutes !== t.minutes && <> · <span className="text-ok">{formatDuration(t.billableMinutes)}</span></>}
                </p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Filter bar */}
      {showFilters && (
        <Card className="p-4 anim-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Technik</label>
              <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                <option value="">Wszyscy</option>
                {technicians.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="">Wszystkie</option>
                <option value="ACTIVE">Aktywne</option>
                <option value="PAUSED">Pauza</option>
                <option value="COMPLETED">Zakończone</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Od</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Do</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {filtersActive && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                <X className="h-3 w-3" /> Wyczyść filtry
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Active session hero */}
      {currentData?.session && (
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
                <ElapsedTime startedAt={currentData.session.startedAt} />
                {currentData.session.device && <> · <span className="text-tx2">{currentData.session.device.name}</span></>}
              </p>
              {currentData.session.ticketLinks.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {currentData.session.ticketLinks.map((l) => (
                    <Badge key={l.ticketId} variant="accent">{l.ticket.ticketNumber}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentData.session.status === 'ACTIVE' ? (
                <Button size="sm" variant="outline" onClick={() => pause.mutate(currentData.session!.id)} disabled={pause.isPending}>
                  <Pause className="h-3.5 w-3.5" /> Pauza
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => resume.mutate(currentData.session!.id)} disabled={resume.isPending}>
                  <Play className="h-3.5 w-3.5" /> Wznów
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setEndingSession(currentData.session!)}>
                <Square className="h-3.5 w-3.5" /> Zakończ
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-10 text-center">
          <Timer className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak sesji</p>
          <p className="text-[13px] text-tx3">
            {filtersActive
              ? 'Nie znaleziono sesji dla wybranych filtrów — zmień zakres dat lub wyczyść filtry.'
              : 'Sesje pojawią się gdy zaczniesz pracę nad ticketem lub urządzeniem.'}
          </p>
        </Card>
      ) : view === 'visual' ? (
        <SessionsGrid sessions={sessions} onEnd={setEndingSession} onChange={() => qc.invalidateQueries({ queryKey: ['sessions'] })} />
      ) : (
        <SessionsTable sessions={sessions} onEnd={setEndingSession} onChange={() => qc.invalidateQueries({ queryKey: ['sessions'] })} />
      )}

      {endingSession && (
        <EndSessionModal
          session={endingSession}
          onClose={() => setEndingSession(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['sessions'] });
            qc.invalidateQueries({ queryKey: ['tickets'] });
            setEndingSession(null);
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */
function getErr(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string } } };
  return ax.response?.data?.message ?? 'Błąd';
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

/* ──────────────────────────────────────────────────────────
   Visual grid
   ────────────────────────────────────────────────────────── */
function SessionsGrid({
  sessions, onEnd, onChange,
}: { sessions: Session[]; onEnd: (s: Session) => void; onChange: () => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
      {sessions.map((s) => (
        <SessionGridCard key={s.id} session={s} onEnd={onEnd} onChange={onChange} />
      ))}
    </div>
  );
}

function SessionGridCard({
  session: s, onEnd, onChange,
}: { session: Session; onEnd: (s: Session) => void; onChange: () => void }) {
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-2">
        <StatusPill
          entity="ticket"
          value={s.status === 'ACTIVE' ? 'IN_PROGRESS' : s.status === 'PAUSED' ? 'WAITING' : 'CLOSED'}
        />
        {s.serviceMode && <Badge variant="neutral">{s.serviceMode}</Badge>}
      </div>

      <div className="flex items-center gap-2 text-[13px] text-tx mb-1">
        <User className="h-3.5 w-3.5 text-tx3" />
        <span className="truncate">{s.technician.firstName} {s.technician.lastName}</span>
      </div>

      {s.device && (
        <div className="flex items-center gap-2 text-[12px] text-tx2 mb-1">
          <ServerIcon className="h-3.5 w-3.5 text-tx3" />
          <span className="truncate">{s.device.name}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-tx3 mb-3">
        <Clock className="h-3 w-3" />
        {s.status === 'COMPLETED'
          ? <>{formatDuration(s.durationMinutes)} · {formatDatePl(s.startedAt)}</>
          : <>{formatRelativePl(s.startedAt)}</>
        }
      </div>

      {s.ticketLinks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {s.ticketLinks.slice(0, 3).map((l) => (
            <Link key={l.ticketId} to={`/tickets/${l.ticket.id ?? l.ticketId}`}>
              <Badge variant="accent" className="hover:brightness-110">{l.ticket.ticketNumber}</Badge>
            </Link>
          ))}
          {s.ticketLinks.length > 3 && <Badge variant="neutral">+{s.ticketLinks.length - 3}</Badge>}
        </div>
      )}

      {s.notes && (
        <p className="text-[11px] text-tx3 italic border-l-2 border-bd pl-2 mb-3 line-clamp-2">
          {s.notes}
        </p>
      )}

      {s.status !== 'COMPLETED' ? (
        <Button size="sm" variant="outline" className="w-full mt-auto" onClick={() => onEnd(s)}>
          <Square className="h-3 w-3" /> Zakończ
        </Button>
      ) : (
        <CompletedActions session={s} onChange={onChange} />
      )}
    </Card>
  );
}

function CompletedActions({ session: s, onChange }: { session: Session; onChange: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [startedAt, setStartedAt] = useState(s.startedAt.slice(0, 16));
  const [endedAt, setEndedAt] = useState(s.endedAt?.slice(0, 16) ?? '');

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/sessions/${s.id}`, {
      startedAt: new Date(startedAt).toISOString(),
      endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    })).data,
    onSuccess: () => { toast.success('Sesja zaktualizowana'); setEditing(false); onChange(); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/sessions/${s.id}`)).data,
    onSuccess: () => { toast.success('Sesja usunięta'); onChange(); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });

  const hasSegments = (s.timeEntries?.length ?? 0) > 1;

  if (editing) {
    return (
      <div className="mt-auto pt-3 border-t border-bd space-y-2 anim-up">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Start</label>
          <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 mb-1">Koniec</label>
          <Input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending} className="flex-1">
            <Save className="h-3 w-3" /> {update.isPending ? 'Zapisywanie…' : 'Zapisz'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Anuluj</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto">
      <div className="flex items-center justify-end gap-1 pt-3 border-t border-bd">
        {hasSegments && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-[6px] text-tx3 hover:text-tx hover:bg-sf-h press"
            title="Segmenty czasu"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-[6px] text-tx3 hover:text-pri hover:bg-sf-h press"
          title="Edytuj czas"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { if (confirm('Usunąć sesję? Tej operacji nie można cofnąć.')) remove.mutate(); }}
          className="p-1.5 rounded-[6px] text-tx3 hover:text-er hover:bg-sf-h press"
          title="Usuń sesję"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && hasSegments && (
        <div className="mt-2 space-y-1 anim-up">
          {s.timeEntries!.map((te) => (
            <div key={te.id} className="flex items-center gap-2 text-[10px] text-tx3">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: te.endedAt ? 'var(--tx3)' : 'var(--ok)' }} />
              <span>{formatDatePl(te.startedAt)}</span>
              {te.endedAt && <><span>→</span><span>{formatDatePl(te.endedAt)}</span></>}
              <span className="ml-auto font-semibold text-tx2 tabular-nums">
                {te.durationMinutes !== null ? formatDuration(te.durationMinutes) : 'w toku…'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Tabular view
   ────────────────────────────────────────────────────────── */
function SessionsTable({
  sessions, onEnd, onChange,
}: { sessions: Session[]; onEnd: (s: Session) => void; onChange: () => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-sf-h border-b border-bd">
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold">Technik</th>
              <th className="px-4 py-2.5 font-bold">Urządzenie</th>
              <th className="px-4 py-2.5 font-bold">Tryb</th>
              <th className="px-4 py-2.5 font-bold">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Start</span>
              </th>
              <th className="px-4 py-2.5 font-bold">Czas</th>
              <th className="px-4 py-2.5 font-bold">Zgłoszenia</th>
              <th className="px-4 py-2.5 font-bold text-right">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {sessions.map((s) => (
              <SessionTableRow key={s.id} session={s} onEnd={onEnd} onChange={onChange} />
            ))}
          </tbody>
          <tfoot>
            <TableTotalsRow sessions={sessions} />
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function TableTotalsRow({ sessions }: { sessions: Session[] }) {
  const totalMin = sessions.reduce((acc, s) => acc + (s.durationMinutes ?? 0), 0);
  const billableMin = sessions.reduce((acc, s) => acc + (s.billableMinutes ?? 0), 0);
  return (
    <tr className="bg-sf-h border-t border-bd">
      <td colSpan={5} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">
        RAZEM ({sessions.length})
      </td>
      <td className="px-4 py-3 text-tx font-bold tabular-nums">
        {formatDuration(totalMin)}
        {billableMin !== totalMin && (
          <span className="ml-1 text-[10px] text-ok font-semibold">({formatDuration(billableMin)})</span>
        )}
      </td>
      <td colSpan={2} />
    </tr>
  );
}

function SessionTableRow({
  session: s, onEnd, onChange,
}: { session: Session; onEnd: (s: Session) => void; onChange: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [startedAt, setStartedAt] = useState(s.startedAt.slice(0, 16));
  const [endedAt, setEndedAt] = useState(s.endedAt?.slice(0, 16) ?? '');

  const update = useMutation({
    mutationFn: async () => (await api.patch(`/sessions/${s.id}`, {
      startedAt: new Date(startedAt).toISOString(),
      endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    })).data,
    onSuccess: () => { toast.success('Sesja zaktualizowana'); setEditing(false); onChange(); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/sessions/${s.id}`)).data,
    onSuccess: () => { toast.success('Sesja usunięta'); onChange(); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(getErr(e)),
  });

  if (editing) {
    return (
      <tr className="bg-sf-h">
        <td colSpan={8} className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3">Start:</span>
            <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="w-auto max-w-[200px]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3">Koniec:</span>
            <Input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className="w-auto max-w-[200px]" />
            <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>
              <Save className="h-3 w-3" /> Zapisz
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Anuluj</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-sf-h transition-colors">
      <td className="px-4 py-3">
        <StatusPill
          entity="ticket"
          value={s.status === 'ACTIVE' ? 'IN_PROGRESS' : s.status === 'PAUSED' ? 'WAITING' : 'CLOSED'}
        />
      </td>
      <td className="px-4 py-3 text-tx">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-tx3" />
          {s.technician.firstName} {s.technician.lastName}
        </div>
      </td>
      <td className="px-4 py-3 text-tx2">{s.device?.name ?? <span className="text-tx3">—</span>}</td>
      <td className="px-4 py-3 text-tx3 text-[11px]">{s.serviceMode ?? '—'}</td>
      <td className="px-4 py-3 text-tx3 text-[11px] tabular-nums">{formatDatePl(s.startedAt)}</td>
      <td className="px-4 py-3 text-tx tabular-nums font-semibold">
        {s.status === 'COMPLETED'
          ? formatDuration(s.durationMinutes)
          : <ElapsedTime startedAt={s.startedAt} />}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {s.ticketLinks.slice(0, 2).map((l) => (
            <Link key={l.ticketId} to={`/tickets/${l.ticket.id ?? l.ticketId}`}>
              <Badge variant="accent" className="text-[10px]">{l.ticket.ticketNumber}</Badge>
            </Link>
          ))}
          {s.ticketLinks.length > 2 && <span className="text-[10px] text-tx3">+{s.ticketLinks.length - 2}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {s.status !== 'COMPLETED' ? (
            <button onClick={() => onEnd(s)} className="text-[11px] font-semibold text-tx2 hover:text-er press px-2">
              Zakończ
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1 rounded-[6px] text-tx3 hover:text-pri hover:bg-sf-h press" title="Edytuj czas">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (confirm('Usunąć sesję? Tej operacji nie można cofnąć.')) remove.mutate(); }}
                className="p-1 rounded-[6px] text-tx3 hover:text-er hover:bg-sf-h press"
                title="Usuń sesję"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

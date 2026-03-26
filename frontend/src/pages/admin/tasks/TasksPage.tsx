import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2, Clock, Loader2, Plus, X, ExternalLink, MapPin,
  Monitor, Save, Play, Pause, Square, Timer, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../../api/tasks';
import { sessionsApi, WorkSession, calcWorkSeconds } from '../../../api/sessions';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../store/authStore';
import { formatDate, formatDateTime, getErrorMessage } from '../../../utils/helpers';
import type { Task, TaskStatus } from '../../../types';

type TabKey = 'NEW' | 'IN_PROGRESS' | 'DONE';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'NEW',         label: 'Nowe',         icon: <Clock className="h-4 w-4" /> },
  { key: 'IN_PROGRESS', label: 'W trakcie',    icon: <Loader2 className="h-4 w-4" /> },
  { key: 'DONE',        label: 'Zrealizowane', icon: <CheckCircle2 className="h-4 w-4" /> },
];

const TAB_BADGE_COLORS: Record<TabKey, { bg: string; color: string }> = {
  NEW:         { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  IN_PROGRESS: { bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  DONE:        { bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
};

// ── Timer display ───────────────────────────────────────────────────────────
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDurationShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Live timer hook ─────────────────────────────────────────────────────────
function useLiveTimer(session: WorkSession | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.id, session?.status]);

  if (!session?.timeEntries?.length) return 0;
  return calcWorkSeconds(session.timeEntries);
}

// ── New task form schema ────────────────────────────────────────────────────
const newTaskSchema = z.object({
  title:            z.string().min(1, 'Tytuł jest wymagany'),
  description:      z.string().optional(),
  assignedToUserId: z.string().min(1, 'Wybierz osobę'),
  dueAt:            z.string().optional(),
  notes:            z.string().optional(),
});
type NewTaskForm = z.infer<typeof newTaskSchema>;

// ── Task card ───────────────────────────────────────────────────────────────
function TaskCard({ task, activeSession, onChangeStatus, onStartSession, onPauseSession, onResumeSession, onEndSession }: {
  task: Task;
  activeSession: WorkSession | null;
  onChangeStatus: (id: string, status: TaskStatus) => void;
  onStartSession: (task: Task) => void;
  onPauseSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  onEndSession: (sessionId: string) => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const serviceMode = task.ticket?.serviceMode;
  const rustdeskId = task.ticket?.device?.rustdeskId;
  const [km, setKm] = useState(task.travelKm?.toString() ?? '');
  const [savingKm, setSavingKm] = useState(false);

  // Is THIS task's session active?
  const isThisTaskSession = activeSession?.ticketId === task.ticketId && activeSession?.status === 'ACTIVE';
  const isThisTaskPaused = activeSession?.ticketId === task.ticketId && activeSession?.status === 'PAUSED';
  const hasActiveSession = isThisTaskSession || isThisTaskPaused;

  const liveSeconds = useLiveTimer(isThisTaskSession ? activeSession : null);

  // Total accumulated time from all completed sessions for this ticket
  const { data: clientSessions = [] } = useQuery({
    queryKey: ['sessions-task', task.ticket?.client?.id],
    queryFn: () => task.ticket?.client?.id ? sessionsApi.getByClient(task.ticket.client.id) : Promise.resolve([]),
    enabled: !!task.ticket?.client?.id,
    staleTime: 30_000,
  });
  const taskSessions = clientSessions.filter(s => s.ticketId === task.ticketId);
  const completedMin = taskSessions.filter(s => s.status === 'COMPLETED').reduce((sum, s) => sum + (s.durationMin ?? 0), 0);

  const saveKm = async () => {
    setSavingKm(true);
    try {
      await tasksApi.update(task.id, { travelKm: km ? parseFloat(km) : null });
      toast.success('Km zapisane');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch { toast.error('Błąd zapisu'); }
    finally { setSavingKm(false); }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${isThisTaskSession ? 'rgba(34,197,94,0.25)' : isThisTaskPaused ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-violet-400 font-semibold">{task.taskNumber}</span>
              {task.ticket && <PriorityBadge priority={task.ticket.priority} />}
              {serviceMode === 'REMOTE' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>
                  <Monitor className="h-3 w-3" /> Zdalnie
                </span>
              )}
              {serviceMode === 'ONSITE' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C' }}>
                  <MapPin className="h-3 w-3" /> Na miejscu
                </span>
              )}
              {completedMin > 0 && (() => {
                const cl = task.ticket?.client;
                const isCon = cl?.hasContract ?? false;
                const rate = cl?.hourlyRate ?? 0;
                const interval = cl?.billingIntervalMinutes ?? 30;
                const bh = Math.ceil(completedMin / interval) * (interval / 60);
                const earn = isCon ? 0 : bh * rate;
                return (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                      <Timer className="h-3 w-3" /> {formatDurationShort(completedMin)}
                    </span>
                    <span className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5"
                      style={{ background: isCon ? 'rgba(96,165,250,0.12)' : 'rgba(34,197,94,0.12)', color: isCon ? '#60A5FA' : '#4ADE80' }}>
                      {isCon ? 'abonament' : rate > 0 ? `${earn.toFixed(0)} zł` : '—'}
                    </span>
                  </>
                );
              })()}
            </div>
            <p className="font-medium text-white/85 truncate">{task.title}</p>
            {task.ticket?.client && (
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <Link to={`/tickets/${task.ticketId}`} className="text-violet-400 hover:underline">
                  {task.ticket.ticketNumber}
                </Link>
                {' · '}{task.ticket.client.name}
                {task.ticket.device && <span> · {task.ticket.device.name}</span>}
              </p>
            )}
          </div>

          {/* Timer display when active */}
          {isThisTaskSession && (
            <div className="flex-shrink-0 text-right">
              <div className="text-lg font-mono font-bold" style={{ color: '#4ADE80' }}>
                {formatTimer(liveSeconds)}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium" style={{ color: '#4ADE80' }}>Aktywne</span>
              </div>
            </div>
          )}
          {isThisTaskPaused && (
            <div className="flex-shrink-0 text-right">
              <div className="text-lg font-mono font-bold" style={{ color: '#FBBF24' }}>
                PAUZA
              </div>
              <span className="text-[10px] font-medium" style={{ color: '#FBBF24' }}>Wstrzymane</span>
            </div>
          )}
        </div>

        {/* RustDesk + Km */}
        {serviceMode === 'REMOTE' && rustdeskId && (
          <div className="mt-2">
            <a href={`rustdesk://${rustdeskId}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.15)' }}
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="h-3.5 w-3.5" />
              RustDesk: {rustdeskId}
            </a>
          </div>
        )}
        {serviceMode === 'ONSITE' && (
          <div className="mt-2 flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#FB923C' }} />
            <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="Km"
              className="w-20 px-2 py-1 text-[12px] rounded-lg focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>km</span>
            <button onClick={saveKm} disabled={savingKm} className="p-1 rounded-lg transition-colors hover:bg-white/[0.06]" title="Zapisz km">
              {savingKm ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
                : <Save className="h-3.5 w-3.5" style={{ color: km !== (task.travelKm?.toString() ?? '') ? '#FB923C' : 'rgba(255,255,255,0.2)' }} />}
            </button>
          </div>
        )}

        {task.notes && (
          <p className="text-xs mt-2 rounded p-2 whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.02)' }}>{task.notes}</p>
        )}
      </div>

      {/* ── Action footer ── */}
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}>
        {/* NEW → Start */}
        {task.status === 'NEW' && !hasActiveSession && (
          <button onClick={() => { onChangeStatus(task.id, 'IN_PROGRESS'); onStartSession(task); }}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
            style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#4ADE80' }}>
            <Play className="h-3.5 w-3.5" /> Rozpocznij
          </button>
        )}

        {/* IN_PROGRESS — session controls */}
        {task.status === 'IN_PROGRESS' && (
          <>
            {!hasActiveSession && (
              <button onClick={() => onStartSession(task)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#4ADE80' }}>
                <Play className="h-3.5 w-3.5" /> Wznów
              </button>
            )}
            {isThisTaskSession && activeSession && (
              <button onClick={() => onPauseSession(activeSession.id)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.2)', color: '#FBBF24' }}>
                <Pause className="h-3.5 w-3.5" /> Pauza
              </button>
            )}
            {isThisTaskPaused && activeSession && (
              <button onClick={() => onResumeSession(activeSession.id)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#4ADE80' }}>
                <Play className="h-3.5 w-3.5" /> Wznów
              </button>
            )}
            {hasActiveSession && activeSession && (
              <button onClick={() => { onEndSession(activeSession.id); onChangeStatus(task.id, 'DONE'); }}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all active:scale-[0.97]"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', color: '#F87171' }}>
                <Square className="h-3.5 w-3.5" /> Zakończ
              </button>
            )}
            {!hasActiveSession && (
              <button onClick={() => onChangeStatus(task.id, 'DONE')}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Zakończ bez sesji
              </button>
            )}
          </>
        )}

        <div className="flex-1" />

        {/* History toggle */}
        {taskSessions.length > 0 && (
          <button onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <Timer className="h-3 w-3" /> {taskSessions.length} sesji
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}

        {/* Meta info */}
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {task.assignedTo && `${task.assignedTo.firstName} ${task.assignedTo.lastName}`}
          {task.dueAt && <span className="text-amber-400 ml-2">Termin: {formatDate(task.dueAt)}</span>}
        </span>
      </div>

      {/* ── Session history + billing ── */}
      {expanded && taskSessions.length > 0 && (() => {
        const client = task.ticket?.client;
        const isContract = client?.hasContract ?? false;
        const hourlyRate = client?.hourlyRate ?? 0;
        const billingInterval = client?.billingIntervalMinutes ?? 30;
        const totalMin = completedMin + (isThisTaskSession ? Math.floor(liveSeconds / 60) : 0);
        const billableHours = Math.ceil(totalMin / billingInterval) * (billingInterval / 60);
        const earnings = isContract ? 0 : billableHours * hourlyRate;

        return (
          <div className="px-4 pb-3" style={{ background: 'rgba(255,255,255,0.015)' }}>
            <div className="space-y-1">
              {taskSessions.map(s => {
                const sMin = s.durationMin ?? 0;
                const sBillable = Math.ceil(sMin / billingInterval) * (billingInterval / 60);
                const sEarnings = isContract ? 0 : sBillable * hourlyRate;
                return (
                  <div key={s.id} className="flex items-center gap-3 text-[11px] py-1.5 px-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : s.status === 'PAUSED' ? 'bg-amber-400' : ''}`}
                      style={s.status === 'COMPLETED' ? { background: 'rgba(255,255,255,0.15)' } : {}} />
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {formatDateTime(s.startedAt)}
                    </span>
                    {s.endedAt && (
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                        → {formatDateTime(s.endedAt)}
                      </span>
                    )}
                    <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {sMin ? formatDurationShort(sMin) : s.status === 'ACTIVE' ? 'w toku...' : '—'}
                    </span>
                    <span className="ml-auto font-semibold" style={{ color: isContract ? '#60A5FA' : '#4ADE80' }}>
                      {s.status === 'COMPLETED' ? (isContract ? 'abonament' : `${sEarnings.toFixed(2)} zł`) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5" style={{ color: '#A78BFA' }} />
                <span className="text-xs font-bold" style={{ color: '#A78BFA' }}>
                  Łącznie: {formatDurationShort(totalMin)}
                </span>
              </div>
              <div className="text-xs font-bold" style={{ color: isContract ? '#60A5FA' : '#4ADE80' }}>
                {isContract ? (
                  <span>W ramach abonamentu ({client?.contractHours}h/{client?.contractMonthlyValue} zł/mies.)</span>
                ) : hourlyRate > 0 ? (
                  <span>{earnings.toFixed(2)} zł ({hourlyRate} zł/h × {billableHours.toFixed(1)}h)</span>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>Brak stawki</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('IN_PROGRESS');
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { all: isAdmin }],
    queryFn: () => tasksApi.getAll({ all: isAdmin }),
    refetchInterval: 15_000,
  });

  const { data: activeSession } = useQuery({
    queryKey: ['session-active'],
    queryFn: () => sessionsApi.getActive(),
    refetchInterval: 5_000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    enabled: showCreate,
  });
  const workers = allUsers.filter(u => u.role !== 'CLIENT' && u.isActive);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      tasksApi.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const startSessionMutation = useMutation({
    mutationFn: (task: Task) => {
      if (!task.ticket?.client?.id) throw new Error('Brak klienta');
      return sessionsApi.startMobile({
        clientId: task.ticket.client.id,
        ticketId: task.ticketId,
        locationId: task.ticket?.location?.id,
        deviceId: task.ticket?.device?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-active'] });
      toast.success('Sesja rozpoczęta — czas leci');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const pauseSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.pause(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-active'] });
      toast.success('Sesja wstrzymana');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resumeSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.resume(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-active'] });
      toast.success('Sesja wznowiona');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const endSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.end(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session-active'] });
      qc.invalidateQueries({ queryKey: ['sessions-task'] });
      toast.success('Sesja zakończona — czas zapisany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const form = useForm<NewTaskForm>({
    resolver: zodResolver(newTaskSchema),
    defaultValues: { title: '', description: '', assignedToUserId: '', dueAt: '', notes: '' },
  });

  const createMutation = useMutation({
    mutationFn: (d: NewTaskForm) => tasksApi.create({
      title: d.title, description: d.description || undefined,
      assignedToUserId: d.assignedToUserId,
      dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
      notes: d.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Zadanie dodane');
      setShowCreate(false);
      form.reset();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const tabTasks = tasks.filter(t => t.status === activeTab);

  return (
    <div>
      <PageHeader
        title="Zadania"
        subtitle={`${tasks.filter(t => t.status !== 'DONE').length} aktywnych`}
        actions={isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors">
            <Plus className="h-4 w-4" /> Nowe zadanie
          </button>
        )}
      />

      <div className="rounded-lg mb-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(tab => {
            const count = tasks.filter(t => t.status === tab.key).length;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.key ? 'border-violet-500 text-violet-400' : 'border-transparent hover:text-white/60'
                }`}
                style={activeTab !== tab.key ? { color: 'rgba(255,255,255,0.4)' } : undefined}>
                {tab.label}
                {count > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: TAB_BADGE_COLORS[tab.key].bg, color: TAB_BADGE_COLORS[tab.key].color }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
        </div>
      ) : tabTasks.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <p className="text-sm">Brak zadań w tej kategorii</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tabTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              activeSession={activeSession ?? null}
              onChangeStatus={(id, status) => statusMutation.mutate({ id, status })}
              onStartSession={(t) => startSessionMutation.mutate(t)}
              onPauseSession={(id) => pauseSessionMutation.mutate(id)}
              onResumeSession={(id) => resumeSessionMutation.mutate(id)}
              onEndSession={(id) => endSessionMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); form.reset(); }} title="Nowe zadanie" size="md">
        <form onSubmit={form.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <Input label="Tytuł *" {...form.register('title')} error={form.formState.errors.title?.message} />
          <Textarea label="Opis" rows={2} {...form.register('description')} />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Przypisz do *</label>
            <select {...form.register('assignedToUserId')}
              className="block w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
              <option value="">— Wybierz osobę —</option>
              {workers.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
            {form.formState.errors.assignedToUserId && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assignedToUserId.message}</p>
            )}
          </div>
          <Input label="Termin" type="date" {...form.register('dueAt')} />
          <Textarea label="Notatki" rows={2} {...form.register('notes')} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); form.reset(); }}>Anuluj</Button>
            <Button type="submit" loading={createMutation.isPending}>Dodaj zadanie</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// @ts-nocheck
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CheckCircle2, Clock, Loader2, Plus, X, ExternalLink, MapPin,
  Monitor, Play, Pause, Square, Timer, Edit2, Sparkles, Zap,
  Wifi, WifiOff, RotateCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../../api/tasks';
import { sessionsApi, WorkSession, calcWorkSeconds } from '../../../api/sessions';
import { agentsApi, AgentRegistration } from '../../../api/agents';
import { aiApi, AiSuggestion } from '../../../api/ai';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../store/authStore';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import { formatDate, formatDateTime, getErrorMessage } from '../../../utils/helpers';
import type { Task, TaskStatus } from '../../../types';

// ── Helpers ──────────────────────────────────────────────────────────

type TabKey = 'NEW' | 'IN_PROGRESS' | 'DONE';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'NEW', label: 'Nowe' },
  { key: 'IN_PROGRESS', label: 'W trakcie' },
  { key: 'DONE', label: 'Zrealizowane' },
];

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

function useLiveTimer(session: WorkSession | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [session?.id, session?.status]);
  if (!session?.timeEntries?.length) return 0;
  return calcWorkSeconds(session.timeEntries);
}

// ── Online status badge ──────────────────────────────────────────────

function OnlineBadge({ deviceId, agents }: { deviceId?: string; agents: AgentRegistration[] }) {
  const agent = agents.find(a => a.deviceId === deviceId);
  const isOnline = agent?.lastSeen ? Date.now() - new Date(agent.lastSeen).getTime() < 2 * 60 * 1000 : false;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
      style={isOnline
        ? { background: 'rgba(34,197,94,0.12)', color: '#22C55E' }
        : { background: 'var(--hover-bg)', color: 'var(--tm)' }}>
      {isOnline ? <><Wifi className="h-3 w-3" /> Online</> : <><WifiOff className="h-3 w-3" /> Offline</>}
    </span>
  );
}

// ── AI inline suggestion ─────────────────────────────────────────────

function AiButton({ title, description, source }: { title: string; description?: string; source?: string }) {
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetch_ = async () => {
    if (suggestion) { setOpen(o => !o); return; }
    setLoading(true); setOpen(true);
    try { setSuggestion(await aiApi.suggest({ title, description, source })); }
    catch { toast.error('Błąd AI'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <button onClick={fetch_} disabled={loading}
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
        style={{ color: '#C084FC' }}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        AI
      </button>
      {open && suggestion && (
        <div className="mt-1 p-2 rounded-lg text-[11px]" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
          <p style={{ color: 'var(--ts)' }}>{suggestion.summary}</p>
          {suggestion.steps.length > 0 && (
            <ol className="mt-1 space-y-0.5 list-decimal list-inside" style={{ color: 'var(--tm)' }}>
              {suggestion.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {suggestion.canAutoFix && (
            <button className="mt-1 text-[10px] font-semibold px-2 py-1 rounded"
              style={{ background: 'rgba(34,197,94,0.08)', color: '#4ADE80' }}>
              <Zap className="h-3 w-3 inline mr-1" />
              {suggestion.autoFixType === 'WINDOWS_UPDATE' ? 'Aktualizuj Windows' :
               suggestion.autoFixType === 'RESTART' ? 'Restartuj' : 'Napraw'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── New task form schema ─────────────────────────────────────────────

const newTaskSchema = z.object({
  title: z.string().min(1, 'Tytuł jest wymagany'),
  description: z.string().optional(),
  assignedToUserId: z.string().min(1, 'Wybierz osobę'),
  dueAt: z.string().optional(),
  notes: z.string().optional(),
  estimatedMinutes: z.number().optional().nullable(),
});
type NewTaskForm = z.infer<typeof newTaskSchema>;

// ── Task Row ─────────────────────────────────────────────────────────

function TaskRow({ task, agents, activeSessions, onStatus, onStartSession, onPauseSession, onResumeSession, onEndSession, onEdit }: {
  task: Task; agents: AgentRegistration[]; activeSessions: WorkSession[];
  onStatus: (id: string, s: TaskStatus) => void;
  onStartSession: (t: Task) => void;
  onPauseSession: (id: string) => void;
  onResumeSession: (id: string) => void;
  onEndSession: (id: string) => void;
  onEdit: (t: Task) => void;
}) {
  const activeSession = activeSessions.find(s => s.ticketId === task.ticketId) ?? null;
  const isActive = activeSession?.status === 'ACTIVE';
  const isPaused = activeSession?.status === 'PAUSED';
  const hasSession = isActive || isPaused;
  const liveSeconds = useLiveTimer(isActive ? activeSession : null);
  const rustdeskId = task.ticket?.device?.rustdeskId;
  const [expanded, setExpanded] = useState(false);

  const company = task.ticket?.workspace?.name ?? '—';
  const reporter = task.ticket?.reporterName || (task.ticket?.createdBy ? `${task.ticket.createdBy.firstName} ${task.ticket.createdBy.lastName}` : '—');
  const device = task.ticket?.device?.name ?? '—';
  const deviceId = task.ticket?.device?.id;

  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

        {/* Firma */}
        <td style={th}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{company}</div>
        </td>

        {/* Użytkownik */}
        <td style={th}>
          <div style={{ fontSize: 12, color: 'var(--ts)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{reporter}</div>
        </td>

        {/* Urządzenie */}
        <td style={th}>
          <div style={{ fontSize: 12, color: 'var(--ts)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{device}</div>
        </td>

        {/* Temat */}
        <td style={{ ...th, maxWidth: 250 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.ticket && (
              <Link to={`/tickets/${task.ticketId}`} style={{ color: 'var(--accent)', marginRight: 6, fontSize: 11 }}>{task.ticket.ticketNumber}</Link>
            )}
            {task.title}
          </div>
          {task.ticket && <PriorityBadge priority={task.ticket.priority} />}
        </td>

        {/* Online/Offline */}
        <td style={th}>
          {deviceId ? <OnlineBadge deviceId={deviceId} agents={agents} /> : <span style={{ fontSize: 11, color: 'var(--tm)' }}>—</span>}
        </td>

        {/* RustDesk */}
        <td style={th}>
          {rustdeskId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <a href={`rustdesk://id=${rustdeskId}`} onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.15)' }}>
                <ExternalLink className="h-3 w-3" /> Połącz
              </a>
              <span style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{rustdeskId}</span>
            </div>
          ) : <span style={{ fontSize: 11, color: 'var(--tm)' }}>—</span>}
        </td>

        {/* AI */}
        <td style={th}>
          <AiButton title={task.title} description={task.description} source={task.ticket?.source} />
        </td>

        {/* Timer / Status */}
        <td style={th}>
          {isActive && (
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#22C55E' }}>{formatTimer(liveSeconds)}</span>
          )}
          {isPaused && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FBBF24' }}>PAUZA</span>
          )}
          {!hasSession && task.status === 'DONE' && (
            <span style={{ fontSize: 11, color: 'var(--tm)' }}>Zakończone</span>
          )}
        </td>

        {/* Akcje */}
        <td style={{ ...th, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* NEW → Start */}
            {task.status === 'NEW' && !hasSession && (
              <ActionBtn icon={Play} color="#22C55E" label="Start" onClick={() => { onStatus(task.id, 'IN_PROGRESS'); onStartSession(task); }} />
            )}
            {/* IN_PROGRESS controls */}
            {task.status === 'IN_PROGRESS' && (
              <>
                {!hasSession && <ActionBtn icon={Play} color="#22C55E" label="Wznów" onClick={() => onStartSession(task)} />}
                {isActive && activeSession && <ActionBtn icon={Pause} color="#FBBF24" label="Pauza" onClick={() => onPauseSession(activeSession.id)} />}
                {isPaused && activeSession && <ActionBtn icon={Play} color="#22C55E" label="Wznów" onClick={() => onResumeSession(activeSession.id)} />}
                {hasSession && activeSession && (
                  <ActionBtn icon={Square} color="#EF4444" label="Zakończ" onClick={() => { onEndSession(activeSession.id); onStatus(task.id, 'DONE'); }} />
                )}
                {!hasSession && <ActionBtn icon={CheckCircle2} color="var(--tm)" label="Zamknij" onClick={() => onStatus(task.id, 'DONE')} />}
              </>
            )}
            <button onClick={() => onEdit(task)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }} title="Edytuj">
              <Edit2 style={{ width: 13, height: 13 }} />
            </button>
            <button onClick={() => setExpanded(e => !e)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }} title="Szczegóły">
              {expanded ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: '8px 12px', background: 'var(--hover-bg)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 24, fontSize: 12, flexWrap: 'wrap' }}>
              {task.description && <div style={{ maxWidth: 400 }}><span style={{ color: 'var(--tm)', fontWeight: 600 }}>Opis:</span> <span style={{ color: 'var(--ts)' }}>{task.description}</span></div>}
              {task.notes && <div><span style={{ color: 'var(--tm)', fontWeight: 600 }}>Notatki:</span> <span style={{ color: 'var(--ts)' }}>{task.notes}</span></div>}
              {task.dueAt && <div><span style={{ color: 'var(--tm)', fontWeight: 600 }}>Termin:</span> <span style={{ color: '#F59E0B' }}>{formatDate(task.dueAt)}</span></div>}
              {task.assignedTo && <div><span style={{ color: 'var(--tm)', fontWeight: 600 }}>Technik:</span> <span style={{ color: 'var(--ts)' }}>{task.assignedTo.firstName} {task.assignedTo.lastName}</span></div>}
              {task.ticket?.location && <div><span style={{ color: 'var(--tm)', fontWeight: 600 }}>Lokalizacja:</span> <span style={{ color: 'var(--ts)' }}>{task.ticket.location.name}</span></div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Action button helper ─────────────────────────────────────────────

function ActionBtn({ icon: Icon, color, label, onClick }: { icon: any; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: `${color}14`, color }}>
      <Icon style={{ width: 12, height: 12 }} /> {label}
    </button>
  );
}

// ── Edit Task Modal ──────────────────────────────────────────────────

function EditTaskModal({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dueAt, setDueAt] = useState(task.dueAt?.slice(0, 10) ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimatedMinutes?.toString() ?? '');
  const [status, setStatus] = useState(task.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await tasksApi.update(task.id, { title, description: description || undefined, notes: notes || undefined, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined, estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null });
      if (status !== task.status) await tasksApi.changeStatus(task.id, status);
      toast.success('Zadanie zaktualizowane');
      onSaved();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Edycja: ${task.taskNumber}`} size="md">
      <div className="space-y-4">
        <Input label="Tytuł" value={title} onChange={e => setTitle(e.target.value)} />
        <Textarea label="Opis" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <Textarea label="Notatki" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Termin" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          <Input label="Szacowany czas (min)" type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ts)' }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}
            className="block w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
            <option value="NEW">Nowe</option>
            <option value="IN_PROGRESS">W trakcie</option>
            <option value="DONE">Zakończone</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
          <Button loading={saving} onClick={handleSave}>Zapisz</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('IN_PROGRESS');
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const isAdmin = useWorkspaceContext().isAdmin;

  const { data: tasks = [], isLoading } = useQuery({ queryKey: ['tasks', { all: isAdmin }], queryFn: () => tasksApi.getAll({ all: isAdmin }), refetchInterval: 15_000 });
  const { data: activeSessions = [] } = useQuery({ queryKey: ['session-active'], queryFn: async () => { const s = await sessionsApi.getActive(); return s ? [s] : []; }, refetchInterval: 5_000 });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.getAll(), staleTime: 15_000, refetchInterval: 15_000 });
  const { data: allUsers = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.getAll(), enabled: showCreate });

  const workers = allUsers.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  const statusMut = useMutation({ mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => tasksApi.changeStatus(id, status), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }), onError: (e) => toast.error(getErrorMessage(e)) });
  const startMut = useMutation({ mutationFn: (t: Task) => { if (!t.ticket?.client?.id) throw new Error('Brak klienta'); return sessionsApi.startMobile({ clientId: t.ticket.client.id, ticketId: t.ticketId, locationId: t.ticket?.location?.id, deviceId: t.ticket?.device?.id }); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['session-active'] }); toast.success('Sesja rozpoczęta'); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const pauseMut = useMutation({ mutationFn: (id: string) => sessionsApi.pause(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['session-active'] }); toast.success('Pauza'); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const resumeMut = useMutation({ mutationFn: (id: string) => sessionsApi.resume(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['session-active'] }); toast.success('Wznowiono'); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const endMut = useMutation({ mutationFn: (id: string) => sessionsApi.end(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['session-active'] }); qc.invalidateQueries({ queryKey: ['sessions-task'] }); toast.success('Sesja zakończona'); }, onError: (e) => toast.error(getErrorMessage(e)) });

  const form = useForm<NewTaskForm>({ resolver: zodResolver(newTaskSchema), defaultValues: { title: '', description: '', assignedToUserId: '', dueAt: '', notes: '' } });
  const createMut = useMutation({ mutationFn: (d: NewTaskForm) => tasksApi.create({ title: d.title, description: d.description || undefined, assignedToUserId: d.assignedToUserId, dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : undefined, notes: d.notes || undefined, estimatedMinutes: d.estimatedMinutes || undefined } as any), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Zadanie dodane'); setShowCreate(false); form.reset(); }, onError: (e) => toast.error(getErrorMessage(e)) });

  const tabTasks = tasks.filter(t => t.status === activeTab);

  const thStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' };

  return (
    <div>
      <PageHeader title="Zadania" subtitle={`${tasks.filter(t => t.status !== 'DONE').length} aktywnych`}
        actions={isAdmin && (
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <Plus style={{ width: 14, height: 14 }} /> Nowe zadanie
          </button>
        )} />

      {/* Tabs */}
      <div className="page-card" style={{ padding: 0, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(tab => {
            const count = tasks.filter(t => t.status === tab.key).length;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, background: 'transparent', color: active ? 'var(--accent)' : 'var(--tm)', cursor: 'pointer', transition: 'all 0.15s' }}>
                {tab.label}
                {count > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: active ? 'var(--accent-g)' : 'var(--hover-bg)', color: active ? 'var(--accent)' : 'var(--tm)' }}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="page-card" style={{ padding: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" style={{ width: 24, height: 24, color: 'var(--tm)', margin: '0 auto' }} /></div>
        ) : tabTasks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--tm)' }}>Brak zadań w tej kategorii</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Firma</th>
                <th style={thStyle}>Użytkownik</th>
                <th style={thStyle}>Urządzenie</th>
                <th style={thStyle}>Temat</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>RustDesk</th>
                <th style={thStyle}>AI</th>
                <th style={thStyle}>Czas</th>
                <th style={thStyle}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {tabTasks.map(task => (
                <TaskRow key={task.id} task={task} agents={agents} activeSessions={activeSessions}
                  onStatus={(id, s) => statusMut.mutate({ id, status: s })}
                  onStartSession={t => startMut.mutate(t)}
                  onPauseSession={id => pauseMut.mutate(id)}
                  onResumeSession={id => resumeMut.mutate(id)}
                  onEndSession={id => endMut.mutate(id)}
                  onEdit={t => setEditTask(t)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); form.reset(); }} title="Nowe zadanie" size="md">
        <form onSubmit={form.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
          <Input label="Tytuł *" {...form.register('title')} error={form.formState.errors.title?.message} />
          <Textarea label="Opis" rows={2} {...form.register('description')} />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ts)' }}>Przypisz do *</label>
            <select {...form.register('assignedToUserId')}
              className="block w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
              <option value="">— Wybierz osobę —</option>
              {workers.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Termin" type="date" {...form.register('dueAt')} />
            <Input label="Szacowany czas (min)" type="number" placeholder="np. 60" {...form.register('estimatedMinutes', { valueAsNumber: true })} />
          </div>
          <Textarea label="Notatki" rows={2} {...form.register('notes')} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); form.reset(); }}>Anuluj</Button>
            <Button type="submit" loading={createMut.isPending}>Dodaj zadanie</Button>
          </div>
        </form>
      </Modal>

      {editTask && <EditTaskModal task={editTask} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); qc.invalidateQueries({ queryKey: ['tasks'] }); }} />}
    </div>
  );
}

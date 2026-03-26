import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Clock, Loader2, Plus, X, ExternalLink, MapPin, Monitor, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../../api/tasks';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../store/authStore';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import type { Task, TaskStatus } from '../../../types';

type TabKey = 'NEW' | 'IN_PROGRESS' | 'DONE';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'NEW',         label: 'Nowe',         icon: <Clock className="h-4 w-4" /> },
  { key: 'IN_PROGRESS', label: 'W trakcie',    icon: <Loader2 className="h-4 w-4" /> },
  { key: 'DONE',        label: 'Zrealizowane', icon: <CheckCircle2 className="h-4 w-4" /> },
];

const STATUS_NEXT: Record<TabKey, { label: string; status: TaskStatus } | null> = {
  NEW:         { label: 'Rozpocznij', status: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Zakończ',    status: 'DONE' },
  DONE:        null,
};

const TAB_BADGE_COLORS: Record<TabKey, { bg: string; color: string }> = {
  NEW:         { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  IN_PROGRESS: { bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  DONE:        { bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
};

// ── New task form schema ───────────────────────────────────────────────────────
const newTaskSchema = z.object({
  title:            z.string().min(1, 'Tytuł jest wymagany'),
  description:      z.string().optional(),
  assignedToUserId: z.string().min(1, 'Wybierz osobę'),
  dueAt:            z.string().optional(),
  notes:            z.string().optional(),
});
type NewTaskForm = z.infer<typeof newTaskSchema>;

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onChangeStatus }: { task: Task; onChangeStatus: (id: string, status: TaskStatus) => void }) {
  const qc = useQueryClient();
  const next = STATUS_NEXT[task.status as TabKey];
  const serviceMode = task.ticket?.serviceMode;
  const rustdeskId = task.ticket?.device?.rustdeskId;
  const [km, setKm] = useState(task.travelKm?.toString() ?? '');
  const [savingKm, setSavingKm] = useState(false);

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
    <div className="rounded-xl p-4 transition-colors hover:bg-white/[0.03]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
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

          {/* RustDesk — serwis zdalny */}
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

          {/* Km — serwis na miejscu */}
          {serviceMode === 'ONSITE' && (
            <div className="mt-2 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#FB923C' }} />
              <input type="number" value={km} onChange={e => setKm(e.target.value)}
                placeholder="Km dojazdu"
                className="w-20 px-2 py-1 text-[12px] rounded-lg focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>km</span>
              <button onClick={saveKm} disabled={savingKm}
                className="p-1 rounded-lg transition-colors hover:bg-white/[0.06]" title="Zapisz km">
                {savingKm ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  : <Save className="h-3.5 w-3.5" style={{ color: km !== (task.travelKm?.toString() ?? '') ? '#FB923C' : 'rgba(255,255,255,0.2)' }} />}
              </button>
              {task.travelKm != null && task.travelKm > 0 && (
                <span className="text-[11px] font-semibold" style={{ color: '#FB923C' }}>{task.travelKm} km</span>
              )}
            </div>
          )}

          {task.notes && (
            <p className="text-xs mt-2 rounded p-2 whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.02)' }}>{task.notes}</p>
          )}
        </div>
        {next && (
          <button
            onClick={() => onChangeStatus(task.id, next.status)}
            className="flex-shrink-0 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors font-medium"
          >
            {next.label}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
        {task.assignedTo && (
          <span>{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
        )}
        <span>·</span>
        <span>{formatDate(task.createdAt)}</span>
        {task.dueAt && <span className="text-amber-400">Termin: {formatDate(task.dueAt)}</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('NEW');
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { all: isAdmin }],
    queryFn: () => tasksApi.getAll({ all: isAdmin }),
    refetchInterval: 30_000,
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
      toast.success('Status zadania zaktualizowany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const form = useForm<NewTaskForm>({
    resolver: zodResolver(newTaskSchema),
    defaultValues: { title: '', description: '', assignedToUserId: '', dueAt: '', notes: '' },
  });

  const createMutation = useMutation({
    mutationFn: (d: NewTaskForm) => tasksApi.create({
      title:            d.title,
      description:      d.description || undefined,
      assignedToUserId: d.assignedToUserId,
      dueAt:            d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
      notes:            d.notes || undefined,
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
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nowe zadanie
          </button>
        )}
      />

      <div className="rounded-lg mb-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(tab => {
            const count = tasks.filter(t => t.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent hover:text-white/60'
                }`}
                style={activeTab !== tab.key ? { color: 'rgba(255,255,255,0.4)' } : undefined}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: TAB_BADGE_COLORS[tab.key].bg, color: TAB_BADGE_COLORS[tab.key].color }}
                  >
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
              onChangeStatus={(id, status) => statusMutation.mutate({ id, status })}
            />
          ))}
        </div>
      )}

      {/* Modal: nowe zadanie */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); form.reset(); }} title="Nowe zadanie" size="md">
        <form onSubmit={form.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <Input
            label="Tytuł *"
            {...form.register('title')}
            error={form.formState.errors.title?.message}
          />
          <Textarea label="Opis" rows={2} {...form.register('description')} />
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Przypisz do *</label>
            <select
              {...form.register('assignedToUserId')}
              className="block w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
            >
              <option value="">— Wybierz osobę —</option>
              {workers.map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
            {form.formState.errors.assignedToUserId && (
              <p className="text-xs text-red-500 mt-1">{form.formState.errors.assignedToUserId.message}</p>
            )}
          </div>
          <Input label="Termin" type="date" {...form.register('dueAt')} />
          <Textarea label="Notatki" rows={2} {...form.register('notes')} />
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); form.reset(); }}>
              Anuluj
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Dodaj zadanie
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

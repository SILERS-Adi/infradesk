import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, CheckCircle2, Clock, User, Calendar, Loader2, CheckSquare, X, ChevronLeft } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatDatePl, formatRelativePl, cn } from '@/lib/utils';

interface Task {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: string;
  dueAt: string | null;
  scheduledAt: string | null;
  estimatedMinutes: number | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  linkedTicket: { id: string; ticketNumber: string; title: string } | null;
}

export function TasksPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('tasks', 'visual');
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'unscheduled'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ items: Task[] }>({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '100' };
      if (filter !== 'all') params.scheduled = filter;
      return (await api.get('/tasks', { params })).data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.post(`/tasks/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Nie udało się zmienić statusu'),
  });

  const items = data?.items ?? [];
  const grouped = {
    NEW: items.filter((t) => t.status === 'NEW'),
    IN_PROGRESS: items.filter((t) => t.status === 'IN_PROGRESS'),
    DONE: items.filter((t) => t.status === 'DONE'),
    CANCELLED: items.filter((t) => t.status === 'CANCELLED'),
  };

  function handleAdd() {
    if (view === 'visual') setShowCreate(true);
    else navigate('/tasks/new');
  }

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Zadania</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {items.length > 0 ? `${items.length} ${items.length === 1 ? 'zadanie' : 'zadań'}` : 'Brak zadań'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4" /> Nowe
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-bd">
        {(['all', 'today', 'week', 'unscheduled'] as const).map((f) => {
          const labels = { all: 'Wszystkie', today: 'Dziś', week: 'Ten tydzień', unscheduled: 'Bez terminu' };
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-2 text-[12px] font-semibold transition-colors border-b-2',
                filter === f ? 'text-tx' : 'text-tx3 hover:text-tx2',
              )}
              style={filter === f ? { borderColor: 'var(--pri)' } : { borderColor: 'transparent' }}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckSquare className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak zadań</p>
          <p className="text-[13px] text-tx3 mb-4">Kliknij „Nowe" aby utworzyć pierwsze.</p>
        </Card>
      ) : view === 'visual' ? (
        <TasksKanban grouped={grouped} onToggle={(id, done) => toggleStatus.mutate({ id, status: done ? 'DONE' : 'NEW' })} />
      ) : (
        <TasksTable items={items} onToggle={(id, done) => toggleStatus.mutate({ id, status: done ? 'DONE' : 'NEW' })} />
      )}

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export function TaskNewPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto space-y-4 anim-up">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-[22px] font-bold text-tx">Nowe zadanie</h1>
      <CreateTaskModal variant="page" onClose={() => navigate('/tasks')} />
    </div>
  );
}

function TasksKanban({ grouped, onToggle }: { grouped: Record<string, Task[]>; onToggle: (id: string, done: boolean) => void }) {
  const columns = [
    { key: 'NEW', label: 'Nowe', accent: 'var(--tx3)' },
    { key: 'IN_PROGRESS', label: 'W toku', accent: 'var(--wn)' },
    { key: 'DONE', label: 'Zrobione', accent: 'var(--ok)' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div key={col.key}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full" style={{ background: col.accent }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2">{col.label}</h3>
            <span className="text-[11px] text-tx3">({grouped[col.key]?.length ?? 0})</span>
          </div>
          <div className="space-y-3 stg">
            {(grouped[col.key] ?? []).map((t) => (
              <TaskCard key={t.id} task={t} onToggle={onToggle} />
            ))}
            {(grouped[col.key]?.length ?? 0) === 0 && (
              <p className="text-[11px] text-tx3 text-center py-6">—</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, onToggle }: { task: Task; onToggle: (id: string, done: boolean) => void }) {
  const isDone = task.status === 'DONE';
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggle(task.id, !isDone)}
          className={cn('mt-0.5 shrink-0 press transition-all')}
          style={{ color: isDone ? 'var(--ok)' : 'var(--tx3)' }}
          aria-label={isDone ? 'Cofnij' : 'Oznacz jako zrobione'}
        >
          <CheckCircle2 className="h-4 w-4" fill={isDone ? 'var(--ok-l)' : 'none'} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <PriorityDot priority={task.priority} />
            <span className="text-[10px] font-mono text-tx3">{task.taskNumber}</span>
          </div>
          <p className={cn('text-[13px] text-tx font-medium', isDone && 'line-through text-tx3')}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[10px] text-tx3">
            {task.linkedTicket && (
              <span className="inline-flex items-center gap-1">
                <span>Origin:</span>
                <Link to={`/tickets/${task.linkedTicket.id}`}>
                  <Badge variant="accent" className="text-[9px]">{task.linkedTicket.ticketNumber}</Badge>
                </Link>
              </span>
            )}
            {task.assignedTo && (
              <span className="inline-flex items-center gap-1">
                <User className="h-2.5 w-2.5" />
                {task.assignedTo.firstName} {task.assignedTo.lastName[0]}.
              </span>
            )}
            {task.scheduledAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                {formatDatePl(task.scheduledAt).split(',')[0]}
              </span>
            )}
            {task.estimatedMinutes && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {task.estimatedMinutes} min
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TasksTable({ items, onToggle }: { items: Task[]; onToggle: (id: string, done: boolean) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-[13px]">
        <thead className="bg-sf-h border-b border-bd">
          <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
            <th className="px-3 py-2.5 w-8"></th>
            <th className="px-3 py-2.5 font-bold">Nr</th>
            <th className="px-3 py-2.5 font-bold">Tytuł</th>
            <th className="px-3 py-2.5 font-bold">Status</th>
            <th className="px-3 py-2.5 font-bold">Priorytet</th>
            <th className="px-3 py-2.5 font-bold">Przypisany</th>
            <th className="px-3 py-2.5 font-bold">Ticket</th>
            <th className="px-3 py-2.5 font-bold">Termin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {items.map((t) => (
            <tr key={t.id} className="hover:bg-sf-h transition-colors">
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onToggle(t.id, t.status !== 'DONE')}
                  style={{ color: t.status === 'DONE' ? 'var(--ok)' : 'var(--tx3)' }}
                  className="press"
                >
                  <CheckCircle2 className="h-4 w-4" fill={t.status === 'DONE' ? 'var(--ok-l)' : 'none'} />
                </button>
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-tx3">{t.taskNumber}</td>
              <td className="px-3 py-2 text-tx">{t.title}</td>
              <td className="px-3 py-2"><StatusPill entity="task" value={t.status} /></td>
              <td className="px-3 py-2"><PriorityDot priority={t.priority} withLabel /></td>
              <td className="px-3 py-2 text-tx2">
                {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
              </td>
              <td className="px-3 py-2">
                {t.linkedTicket ? (
                  <Link to={`/tickets/${t.linkedTicket.id}`}>
                    <Badge variant="accent">{t.linkedTicket.ticketNumber}</Badge>
                  </Link>
                ) : <span className="text-tx3">—</span>}
              </td>
              <td className="px-3 py-2 text-[11px] text-tx3">
                {t.scheduledAt ? formatRelativePl(t.scheduledAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const createSchema = z.object({
  title: z.string().min(3, 'Min. 3 znaki'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  scheduledAt: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().positive().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export function CreateTaskModal({ onClose, variant = 'modal' }: { onClose: () => void; variant?: 'modal' | 'page' }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      const payload: Record<string, unknown> = { ...data };
      if (data.scheduledAt) payload.scheduledAt = new Date(data.scheduledAt).toISOString();
      return (await api.post('/tasks', payload)).data;
    },
    onSuccess: () => {
      toast.success('Zadanie utworzone');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: () => toast.error('Błąd tworzenia zadania'),
  });

  const formBody = (
    <>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Tytuł</label>
        <Input {...register('title')} placeholder="Co trzeba zrobić?" />
        {errors.title && <p className="text-[11px] text-er mt-1">{errors.title.message}</p>}
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Opis</label>
        <Textarea rows={3} {...register('description')} placeholder="Szczegóły, kroki, uwagi…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Priorytet</label>
          <Select {...register('priority')}>
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </Select>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Czas (min)</label>
          <Input type="number" {...register('estimatedMinutes')} placeholder="np. 30" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Zaplanowane na</label>
        <Input type="datetime-local" {...register('scheduledAt')} />
      </div>
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
      </Button>
    </>
  );

  if (variant === 'page') {
    return (
      <Card className="p-0 overflow-hidden">
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          {formBody}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
            {actions}
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowe zadanie</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            {formBody}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
              {actions}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

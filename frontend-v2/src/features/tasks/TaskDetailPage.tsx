import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Trash2, User, MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDatePl, formatRelativePl } from '@/lib/utils';

interface TaskDetail {
  id: string;
  taskNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  createdByUserId: string;
  linkedTicketId: string | null;
  clientWorkspaceId: string | null;
  locationId: string | null;
  deviceId: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  travelKm: number | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  createdBy: { id: string; firstName: string; lastName: string };
  linkedTicket: { id: string; ticketNumber: string; title: string; status: string } | null;
  comments?: Array<{
    id: string;
    comment: string;
    isInternal: boolean;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string; email: string };
  }>;
}

const STATUS_OPTIONS: Array<{ key: string; label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = [
  { key: 'NEW',         label: 'Nowe',     variant: 'neutral' },
  { key: 'IN_PROGRESS', label: 'W toku',   variant: 'warning' },
  { key: 'DONE',        label: 'Zrobione', variant: 'success' },
  { key: 'CANCELLED',   label: 'Anulowane', variant: 'danger' },
];

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ task: TaskDetail }>({
    queryKey: ['tasks', id],
    queryFn: async () => (await api.get(`/tasks/${id}`)).data,
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => (await api.post(`/tasks/${id}/status`, { status })).data,
    onSuccess: () => {
      toast.success('Status zmieniony');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Błąd zmiany statusu'),
  });

  const deleteTask = useMutation({
    mutationFn: async () => (await api.delete(`/tasks/${id}`)).data,
    onSuccess: () => {
      toast.success('Zadanie usunięte');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      navigate('/tasks');
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Błąd usuwania'),
  });

  const [commentDraft, setCommentDraft] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const addComment = useMutation({
    mutationFn: async () => (await api.post(`/tasks/${id}/comments`, {
      comment: commentDraft.trim(), isInternal,
    })).data,
    onSuccess: () => {
      setCommentDraft('');
      qc.invalidateQueries({ queryKey: ['tasks', id] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Błąd dodawania komentarza'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--pri)' }} />
    </div>
  );
  if (error || !data) return (
    <div className="card p-10 text-center">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-er" />
      <p className="text-tx font-medium mb-2">Nie znaleziono zadania</p>
      <Button variant="ghost" onClick={() => navigate('/tasks')}>
        <ArrowLeft className="h-4 w-4" /> Wróć do listy
      </Button>
    </div>
  );

  const t = data.task;
  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link to="/tasks" className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PriorityDot priority={t.priority} withLabel />
              <span className="text-[11px] font-mono text-tx3">{t.taskNumber}</span>
            </div>
            <h1 className="text-[20px] font-bold text-tx leading-tight">{t.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusPill entity="task" value={t.status} />
              {t.linkedTicket && (
                <Link to={`/tickets/${t.linkedTicket.id}`} className="text-[12px] hover:underline" style={{ color: 'var(--pri)' }}>
                  ↪ Powiązane: {t.linkedTicket.ticketNumber}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Usunąć zadanie ${t.taskNumber}?`,
                message: 'Akcja nieodwracalna.',
                confirmLabel: 'Usuń zadanie',
                danger: true,
              });
              if (ok) deleteTask.mutate();
            }}
            disabled={deleteTask.isPending}
            className="text-er border-er/30 hover:bg-er/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Opis</CardTitle></CardHeader>
            <CardContent>
              <p className="text-[13px] text-tx leading-relaxed whitespace-pre-wrap">
                {t.description || <span className="text-tx3 italic">Brak opisu.</span>}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                {STATUS_OPTIONS.map((s) => (
                  <Button
                    key={s.key}
                    variant={t.status === s.key ? 'primary' : 'outline'}
                    size="sm"
                    disabled={updateStatus.isPending || t.status === s.key}
                    onClick={() => updateStatus.mutate(s.key)}
                  >
                    {t.status === s.key && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {s.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Komentarze ({t.comments?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(t.comments?.length ?? 0) === 0 ? (
                <p className="text-[12px] text-tx3 italic">Brak komentarzy. Dodaj pierwszy poniżej.</p>
              ) : (
                <ul className="space-y-3">
                  {t.comments!.map((c) => (
                    <li key={c.id} className="border-l-2 pl-3 py-1" style={{ borderColor: c.isInternal ? 'var(--wn)' : 'var(--pri)' }}>
                      <div className="flex items-center gap-2 mb-1 text-[11px] text-tx3">
                        <User className="h-3 w-3" />
                        <span className="text-tx2 font-medium">{c.user.firstName} {c.user.lastName}</span>
                        <span>·</span>
                        <span>{formatRelativePl(c.createdAt)}</span>
                        {c.isInternal && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--wn)', color: 'white' }}>wewnętrzny</span>}
                      </div>
                      <p className="text-[13px] text-tx whitespace-pre-wrap">{c.comment}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-bd pt-3 space-y-2">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Napisz komentarz... (Shift+Enter = nowa linia, Enter = wyślij)"
                  className="w-full px-3 py-2 rounded-[var(--r-s)] border border-bd bg-sf text-[13px] text-tx resize-y min-h-[72px]"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && commentDraft.trim() && !addComment.isPending) {
                      e.preventDefault();
                      addComment.mutate();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="cursor-pointer"
                    />
                    Wewnętrzny (niewidoczny dla klienta)
                  </label>
                  <Button
                    size="sm"
                    onClick={() => addComment.mutate()}
                    disabled={!commentDraft.trim() || addComment.isPending}
                  >
                    {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Wyślij
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Szczegóły</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <div className="flex items-start justify-between gap-4">
                <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Utworzone</span>
                <div className="text-right">
                  <p className="text-tx">{t.createdBy.firstName} {t.createdBy.lastName}</p>
                  <p className="text-[11px] text-tx3">{formatDatePl(t.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Przypisane</span>
                <div className="text-right text-tx">
                  {t.assignedTo ? (
                    <span className="inline-flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-tx3" />
                      {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </span>
                  ) : <span className="text-tx3">—</span>}
                </div>
              </div>
              {t.dueAt && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Termin</span>
                  <span className="text-tx">{formatDatePl(t.dueAt)}</span>
                </div>
              )}
              {t.scheduledAt && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Zaplanowane</span>
                  <span className="text-tx">{formatDatePl(t.scheduledAt)}</span>
                </div>
              )}
              {t.estimatedMinutes != null && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Szacowany czas</span>
                  <span className="text-tx">{t.estimatedMinutes} min</span>
                </div>
              )}
              {t.travelKm != null && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Dojazd</span>
                  <span className="text-tx">{t.travelKm} km</span>
                </div>
              )}
              {t.completedAt && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em]">Ukończone</span>
                  <span className="text-tx">{formatRelativePl(t.completedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailPage;

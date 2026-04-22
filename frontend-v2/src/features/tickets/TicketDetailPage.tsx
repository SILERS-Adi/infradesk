import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Clock, User, Server as ServerIcon, Send, Lock, MessageSquare,
  CheckCircle2, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { Badge } from '@/components/ui/Badge';
import { cn, formatDatePl, formatRelativePl } from '@/lib/utils';

interface TicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  type: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionSummary: string | null;
  rating: number | null;
  ratingComment: string | null;
  ratedAt: string | null;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  createdBy: { id: string; firstName: string; lastName: string; email: string };
  device: { id: string; name: string; hostname: string | null } | null;
  comments: Array<{
    id: string;
    comment: string;
    isInternal: boolean;
    createdAt: string;
    user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  }>;
  events: Array<{
    id: string;
    eventType: string;
    fromValue: string | null;
    toValue: string | null;
    createdAt: string;
    userId: string | null;
    metadata: unknown;
  }>;
  clientName?: string | null;
  hasService?: boolean;
  hasOrder?: boolean;
  hasCrm?: boolean;
  linkedTasks?: Array<{
    id: string; taskNumber: string; title: string; status: string; priority: string;
    dueAt: string | null; completedAt: string | null;
    assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
  }>;
  linkedOrders?: Array<{
    id: string; orderNumber: string; title: string; status: string;
    totalNet: string; totalGross: string;
    supplierName: string | null; expectedDeliveryDate: string | null; deliveredAt: string | null;
  }>;
  linkedCrmActivities?: Array<{
    id: string; type: string; title: string;
    scheduledAt: string | null; completedAt: string | null;
    followUpRequired: boolean; followUpAt: string | null;
    billable: boolean; quoteValueNet: string | null;
  }>;
}

// State machine order — for the stepper UI.
const STATE_FLOW: Array<{ key: string; label: string }> = [
  { key: 'OPEN',        label: 'Otwarte' },
  { key: 'ASSIGNED',    label: 'Przypisane' },
  { key: 'IN_PROGRESS', label: 'W toku' },
  { key: 'RESOLVED',    label: 'Rozwiązane' },
  { key: 'CLOSED',      label: 'Zakończone' },
];

// Allowed transitions per current state (kept in sync with backend state machine).
const ALLOWED: Record<string, string[]> = {
  NEW:         ['OPEN', 'CANCELLED'],
  OPEN:        ['ASSIGNED', 'WAITING', 'CANCELLED'],
  ASSIGNED:    ['IN_PROGRESS', 'WAITING', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'RESOLVED', 'CANCELLED'],
  WAITING:     ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED:    ['CLOSED', 'OPEN'],
  CLOSED:      ['OPEN'],
  CANCELLED:   [],
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');

  const { data, isLoading, error, refetch } = useQuery<{ ticket: TicketDetail }>({
    queryKey: ['tickets', id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data,
    enabled: !!id,
  });

  const transition = useMutation({
    mutationFn: async (payload: { to: string; resolutionSummary?: string }) =>
      (await api.post(`/tickets/${id}/transition`, payload)).data,
    onSuccess: () => {
      toast.success('Status zmieniony');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setShowResolveForm(false);
      setResolutionSummary('');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd zmiany statusu');
    },
  });

  const addComment = useMutation({
    mutationFn: async () =>
      (await api.post(`/tickets/${id}/comments`, { comment: commentText, isInternal })).data,
    onSuccess: () => {
      toast.success('Komentarz dodany');
      setCommentText('');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
    },
    onError: () => toast.error('Błąd dodawania komentarza'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--pri)' }} />
    </div>
  );
  if (error || !data) return (
    <div className="card p-10 text-center">
      <AlertCircle className="h-10 w-10 mx-auto mb-3 text-er" />
      <p className="text-tx font-medium mb-2">Nie znaleziono zgłoszenia</p>
      <Button variant="ghost" onClick={() => navigate('/tickets')}>
        <ArrowLeft className="h-4 w-4" /> Wróć do listy
      </Button>
    </div>
  );

  const t = data.ticket;
  const currentStateIdx = STATE_FLOW.findIndex((s) => s.key === t.status);
  const allowedNext = ALLOWED[t.status] ?? [];

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link to="/tickets" className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PriorityDot priority={t.priority} withLabel />
              <span className="text-[11px] font-mono text-tx3">{t.ticketNumber}</span>
            </div>
            <h1 className="text-[20px] font-bold text-tx leading-tight">{t.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusPill entity="ticket" value={t.status} />
              {t.category && <Badge variant="neutral">{t.category}</Badge>}
              <Badge variant="info">{t.source}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"
            title="Odśwież"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* State machine stepper */}
      <Card className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          {STATE_FLOW.map((s, i) => {
            const isDone = currentStateIdx > i;
            const isCurrent = currentStateIdx === i;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold',
                    isDone && 'text-white bg-ok',
                    isCurrent && 'text-white',
                    !isDone && !isCurrent && 'bg-sf-h text-tx3',
                  )}
                  style={isCurrent ? { background: 'linear-gradient(135deg, var(--pri), #7c3aed)' } : undefined}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn('text-[12px]', isCurrent ? 'text-tx font-semibold' : 'text-tx3')}>
                  {s.label}
                </span>
                {i < STATE_FLOW.length - 1 && (
                  <div
                    className="w-8 h-0.5"
                    style={{ background: isDone ? 'var(--ok)' : 'var(--bd)' }}
                  />
                )}
              </div>
            );
          })}
          {['CANCELLED'].includes(t.status) && (
            <Badge variant="danger" className="ml-2">Anulowane</Badge>
          )}
        </div>

        {/* Transition buttons */}
        {allowedNext.length > 0 && (
          <div className="mt-4 pt-4 border-t border-bd flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em] mr-2">Akcja:</span>
            {allowedNext.map((to) => (
              <Button
                key={to}
                size="sm"
                variant={to === 'CANCELLED' ? 'danger' : to === 'RESOLVED' ? 'success' : 'outline'}
                disabled={transition.isPending}
                onClick={() => {
                  if (to === 'RESOLVED') {
                    setShowResolveForm(true);
                  } else {
                    transition.mutate({ to });
                  }
                }}
              >
                {to === 'RESOLVED' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {labelForState(to)}
              </Button>
            ))}
          </div>
        )}

        {/* Resolve form (inline) */}
        {showResolveForm && (
          <div className="mt-4 pt-4 border-t border-bd anim-up">
            <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">
              Podsumowanie rozwiązania
            </label>
            <Textarea
              rows={3}
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="Co zostało zrobione? Klient to zobaczy…"
            />
            <div className="flex items-center gap-2 mt-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowResolveForm(false)}>Anuluj</Button>
              <Button
                variant="success"
                size="sm"
                disabled={transition.isPending || resolutionSummary.trim().length < 3}
                onClick={() => transition.mutate({ to: 'RESOLVED', resolutionSummary })}
              >
                Oznacz jako rozwiązane
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — description + comments */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Opis</CardTitle></CardHeader>
            <CardContent>
              <p className="text-[13px] text-tx leading-relaxed whitespace-pre-wrap">{t.description}</p>
            </CardContent>
          </Card>

          <GeneratedArtifactsCard ticket={t} />

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Komentarze ({t.comments.length})</CardTitle>
              <span className="text-[11px] text-tx3">{t.comments.filter(c => !c.isInternal).length} publicznych · {t.comments.filter(c => c.isInternal).length} wewnętrznych</span>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.comments.length === 0 ? (
                <p className="text-[13px] text-tx3 text-center py-4">Brak komentarzy</p>
              ) : (
                <div className="space-y-4">
                  {t.comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
                      >
                        {c.user.firstName[0]}{c.user.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-tx">
                            {c.user.firstName} {c.user.lastName}
                          </span>
                          <span className="text-[10px] text-tx3">{formatRelativePl(c.createdAt)}</span>
                          {c.isInternal && (
                            <Badge variant="warning" className="text-[9px]">
                              <Lock className="h-2.5 w-2.5" /> Wewnętrzny
                            </Badge>
                          )}
                        </div>
                        <p className="text-[13px] text-tx whitespace-pre-wrap">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="pt-4 border-t border-bd">
                <Textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={isInternal ? 'Notatka wewnętrzna (klient nie zobaczy)…' : 'Odpowiedź do klienta…'}
                />
                <div className="flex items-center justify-between mt-3">
                  <label className="flex items-center gap-2 text-[12px] text-tx2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="accent-[color:var(--pri)]"
                    />
                    <Lock className="h-3 w-3" />
                    Komentarz wewnętrzny
                  </label>
                  <Button
                    size="sm"
                    disabled={commentText.trim().length < 1 || addComment.isPending}
                    onClick={() => addComment.mutate()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Wyślij
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right — meta */}
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Szczegóły</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <MetaRow label="Utworzony">
                <div>
                  <p className="text-tx">{t.createdBy.firstName} {t.createdBy.lastName}</p>
                  <p className="text-[11px] text-tx3">{formatDatePl(t.createdAt)}</p>
                </div>
              </MetaRow>
              <MetaRow label="Przypisany">
                {t.assignedTo ? (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-tx3" />
                    <span>{t.assignedTo.firstName} {t.assignedTo.lastName}</span>
                  </div>
                ) : <span className="text-tx3">—</span>}
              </MetaRow>
              {t.device && (
                <MetaRow label="Urządzenie">
                  <div className="flex items-center gap-2">
                    <ServerIcon className="h-3.5 w-3.5 text-tx3" />
                    <Link to={`/devices/${t.device.id}`} className="hover:underline" style={{ color: 'var(--pri)' }}>
                      {t.device.name}
                    </Link>
                  </div>
                </MetaRow>
              )}
              {t.dueAt && (
                <MetaRow label="Termin">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-tx3" />
                    <span>{formatDatePl(t.dueAt)}</span>
                  </div>
                </MetaRow>
              )}
              {t.firstResponseAt && (
                <MetaRow label="Pierwsza odpowiedź">
                  <span className="text-[11px] text-tx3">{formatRelativePl(t.firstResponseAt)}</span>
                </MetaRow>
              )}
              {t.resolvedAt && (
                <MetaRow label="Rozwiązane">
                  <span className="text-[11px] text-tx3">{formatRelativePl(t.resolvedAt)}</span>
                </MetaRow>
              )}
            </CardContent>
          </Card>

          {t.resolutionSummary && (
            <Card>
              <CardHeader><CardTitle>Rozwiązanie</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[13px] text-tx leading-relaxed whitespace-pre-wrap">{t.resolutionSummary}</p>
              </CardContent>
            </Card>
          )}

          {t.rating !== null && (
            <Card>
              <CardHeader><CardTitle>Ocena klienta</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-1">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className="text-2xl"
                      style={{ opacity: n === t.rating ? 1 : 0.2 }}
                    >
                      {n === 1 ? '☹️' : n === 2 ? '🙂' : '😊'}
                    </span>
                  ))}
                </div>
                {t.ratingComment && (
                  <p className="text-[12px] text-tx2 mt-2">{t.ratingComment}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Aktywność</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative border-l border-bd ml-2 space-y-4">
                {t.events.slice(-8).reverse().map((ev) => (
                  <li key={ev.id} className="pl-4 relative">
                    <span
                      className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full"
                      style={{ background: 'var(--pri)' }}
                    />
                    <p className="text-[11px] text-tx">
                      <EventLabel event={ev} />
                    </p>
                    <p className="text-[10px] text-tx3">{formatRelativePl(ev.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11px] font-semibold text-tx3 uppercase tracking-[0.1em] shrink-0">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

function EventLabel({ event }: { event: { eventType: string; fromValue: string | null; toValue: string | null } }) {
  switch (event.eventType) {
    case 'created': return <><MessageSquare className="inline h-3 w-3 mr-1" /> Utworzono zgłoszenie</>;
    case 'status_changed': return <>Status: {event.fromValue ?? '—'} → <b>{event.toValue}</b></>;
    case 'assigned': return <>Przypisano</>;
    case 'commented': return <><MessageSquare className="inline h-3 w-3 mr-1" /> Dodano komentarz</>;
    case 'rated': return <>Klient ocenił: {event.toValue}/3</>;
    case 'updated': return <>Aktualizacja</>;
    default: return <>{event.eventType}</>;
  }
}

function labelForState(key: string): string {
  switch (key) {
    case 'OPEN': return 'Otwórz ponownie';
    case 'ASSIGNED': return 'Przypisz';
    case 'IN_PROGRESS': return 'Rozpocznij pracę';
    case 'WAITING': return 'Oczekuje na klienta';
    case 'RESOLVED': return 'Rozwiąż';
    case 'CLOSED': return 'Zamknij';
    case 'CANCELLED': return 'Anuluj';
    default: return key;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wygenerowane — Task / Order / CrmActivity powiązane z ticketem
// ─────────────────────────────────────────────────────────────────────────────
const CRM_TYPE_LABEL: Record<string, string> = {
  PHONE: 'Telefon', MEETING: 'Spotkanie', EMAIL: 'E-mail', QUOTE: 'Oferta', OTHER: 'Inne',
};
const ORDER_STATUS_LABEL: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Szkic', variant: 'neutral' },
  QUOTE_SENT: { label: 'Wycena wysłana', variant: 'accent' },
  APPROVED: { label: 'Zatwierdzone', variant: 'accent' },
  ORDERED: { label: 'Zamówione', variant: 'warning' },
  IN_TRANSIT: { label: 'W drodze', variant: 'warning' },
  DELIVERED: { label: 'Dostarczone', variant: 'success' },
  INVOICED: { label: 'Zafakturowane', variant: 'success' },
  CANCELLED: { label: 'Anulowane', variant: 'danger' },
};
const TASK_STATUS_LABEL: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = {
  NEW: { label: 'Nowe', variant: 'neutral' },
  IN_PROGRESS: { label: 'W toku', variant: 'warning' },
  DONE: { label: 'Zrobione', variant: 'success' },
  CANCELLED: { label: 'Anulowane', variant: 'danger' },
};

function GeneratedArtifactsCard({ ticket }: { ticket: TicketDetail }) {
  const tasks = ticket.linkedTasks ?? [];
  const orders = ticket.linkedOrders ?? [];
  const crms = ticket.linkedCrmActivities ?? [];
  const total = tasks.length + orders.length + crms.length;
  if (total === 0 && !ticket.hasService && !ticket.hasOrder && !ticket.hasCrm) return null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Wygenerowane ({total})</CardTitle>
        <span className="text-[11px] text-tx3">
          Ze zgłoszenia #{ticket.ticketNumber} powstały automatycznie:
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* TASKS */}
        {tasks.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">
              Zadania ({tasks.length})
            </div>
            <div className="space-y-1.5">
              {tasks.map((t) => {
                const s = TASK_STATUS_LABEL[t.status] ?? TASK_STATUS_LABEL.NEW!;
                return (
                  <Link key={t.id} to={`/tasks`} className="block p-2.5 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-tx3">{t.taskNumber}</span>
                          <span className="text-[13px] font-medium text-tx truncate">{t.title}</span>
                        </div>
                        {t.assignedTo && (
                          <div className="text-[11px] text-tx3 mt-0.5">
                            Przypisane: {[t.assignedTo.firstName, t.assignedTo.lastName].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {/* ORDERS */}
        {orders.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">
              Zamówienia ({orders.length})
            </div>
            <div className="space-y-1.5">
              {orders.map((o) => {
                const s = ORDER_STATUS_LABEL[o.status] ?? ORDER_STATUS_LABEL.DRAFT!;
                return (
                  <Link key={o.id} to={`/orders`} className="block p-2.5 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-tx3">{o.orderNumber}</span>
                          <span className="text-[13px] font-medium text-tx truncate">{o.title}</span>
                        </div>
                        <div className="text-[11px] text-tx3 mt-0.5 flex items-center gap-2">
                          <span>Netto: <strong>{Number(o.totalNet).toFixed(2)} zł</strong></span>
                          {o.supplierName && <span>· {o.supplierName}</span>}
                          {o.expectedDeliveryDate && <span>· dostawa {formatRelativePl(o.expectedDeliveryDate)}</span>}
                        </div>
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {/* CRM ACTIVITIES */}
        {crms.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">
              Aktywności CRM ({crms.length})
            </div>
            <div className="space-y-1.5">
              {crms.map((c) => {
                const done = !!c.completedAt;
                return (
                  <Link key={c.id} to={`/contacts`} className="block p-2.5 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="accent">{CRM_TYPE_LABEL[c.type] ?? c.type}</Badge>
                          <span className="text-[13px] text-tx truncate">{c.title}</span>
                          {c.billable && <Badge variant="warning">Bilowane</Badge>}
                          {c.quoteValueNet && <Badge variant="accent">{Number(c.quoteValueNet).toFixed(2)} zł</Badge>}
                          {c.followUpRequired && !done && <Badge variant="danger">Follow-up</Badge>}
                        </div>
                        {c.scheduledAt && (
                          <div className="text-[11px] text-tx3 mt-0.5">
                            {formatRelativePl(c.scheduledAt)}
                          </div>
                        )}
                      </div>
                      <Badge variant={done ? 'success' : 'neutral'}>{done ? 'Zrobione' : 'Zaplanowane'}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {total === 0 && (
          <div className="text-[13px] text-tx3 text-center py-4">
            Zgłoszenie nie wygenerowało jeszcze artefaktów (np. nie przypisano technika dla usługi serwisowej).
          </div>
        )}
      </CardContent>
    </Card>
  );
}


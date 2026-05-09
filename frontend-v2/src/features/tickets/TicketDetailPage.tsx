import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft, Clock, Server as ServerIcon, Send, Lock, MessageSquare,
  CheckCircle2, Loader2, AlertCircle, RefreshCw, Globe, Mail, Phone, Bot,
  Cpu, PenLine, Wallet, Building2, TrendingUp, Timer, Trash2, Edit3, Star,
  Play, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { SimpleMarkdown } from '@/components/ui/SimpleMarkdown';
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
  waitingType: 'CLIENT' | 'SUPPLIER' | 'INTERNAL' | null;
  waitingFor: string | null;
  parentTicketId: string | null;
  parentTicket: { id: string; ticketNumber: string; title: string; status: string } | null;
  slaResponseMinutes: number | null;
  slaResolveMinutes: number | null;
  slaBreached: boolean;
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
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  clientWorkspaceId?: string | null;
  clientBilling?: {
    billingType: 'HOURLY' | 'SUBSCRIPTION' | 'HYBRID';
    hourlyRateNet: string | null;
    monthlyNet: string | null;
    monthlyHours: number | null;
    overageRateNet: string | null;
    billingIncrementMin: number;
    billingPeriod: string;
  } | null;
  billing?: {
    sessionCount: number;
    totalBillableMinutes: number;
    totalDurationMinutes: number;
    billableHours: number;
    effectiveHourlyRateNet: number | null;
    costNet: number | null;
    monthToDateMinutes: number | null;
    monthlyLimitMinutes: number | null;
  };
}

// State machine order — for the stepper UI. NEW = pre-step (przed OPEN),
// CANCELLED + WAITING = side-states pokazane jako badge.
const STATE_FLOW: Array<{ key: string; label: string }> = [
  { key: 'NEW',         label: 'Nowe' },
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
  const [editOpen, setEditOpen] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ ticket: TicketDetail }>({
    queryKey: ['tickets', id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data,
    enabled: !!id,
  });

  // Lista techników workspace — do re-assign picker (R1: /memberships, nie /users które nie istnieje)
  const { data: workspaceUsers } = useQuery<{ users: Array<{ id: string; firstName: string; lastName: string; email: string }> }>({
    queryKey: ['memberships', 'as-users'],
    queryFn: async () => {
      const r = (await api.get('/memberships')).data as { memberships: Array<{ status: string; user: { id: string; firstName: string; lastName: string; email: string } }> };
      const users = r.memberships
        .filter((m) => m.status === 'ACTIVE')
        .map((m) => m.user);
      return { users };
    },
  });

  // Aktualnie zalogowany user — dla guardów (np. RateTicketCard tylko dla createdBy)
  const { data: meResp } = useQuery<{ user: { id: string } }>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/users/me')).data,
    staleTime: 60_000,
  });
  const currentUserId = meResp?.user?.id ?? null;

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

  const updateTicket = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      (await api.patch(`/tickets/${id}`, patch)).data,
    onSuccess: () => {
      toast.success('Zaktualizowano');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setEditOpen(false);
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd zapisu');
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async () => (await api.delete(`/tickets/${id}`)).data,
    onSuccess: () => {
      toast.success('Zgłoszenie usunięte');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      navigate('/tickets');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd usuwania');
    },
  });

  const rateTicket = useMutation({
    mutationFn: async (payload: { rating: number; comment?: string }) =>
      (await api.post(`/tickets/${id}/rate`, payload)).data,
    onSuccess: () => {
      toast.success('Dziękujemy za ocenę');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd zapisu oceny');
    },
  });

  const startSession = useMutation({
    mutationFn: async () => (await api.post('/sessions/start', { ticketId: id })).data,
    onSuccess: () => {
      toast.success('Sesja rozpoczęta');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Nie udało się rozpocząć sesji');
    },
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
  // R4: Stepper logic dla side-states (WAITING, CANCELLED). Bez tego idx=-1 i pusty stepper.
  // WAITING jest po IN_PROGRESS, CANCELLED jest terminalny "anyway".
  const stepperState =
    t.status === 'WAITING' ? 'IN_PROGRESS' :
    t.status === 'CANCELLED' ? (
      // Last reached state z events history
      [...t.events].reverse().find((e) => e.eventType === 'status_changed' && e.fromValue && e.fromValue !== 'CANCELLED')?.fromValue ?? 'NEW'
    ) :
    t.status;
  const currentStateIdx = STATE_FLOW.findIndex((s) => s.key === stepperState);
  const allowedNext = ALLOWED[t.status] ?? [];

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
            title="Edytuj zgłoszenie"
          >
            <Edit3 className="h-3.5 w-3.5" /> Edytuj
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Usunąć zgłoszenie ${t.ticketNumber}?`,
                message: 'Soft-delete — ticket zniknie z list ale dane zostają. Akcja nieodwracalna z UI (admin musi przywrócić w bazie).',
                confirmLabel: 'Usuń zgłoszenie',
                danger: true,
              });
              if (ok) deleteTicket.mutate();
            }}
            disabled={deleteTicket.isPending}
            title="Usuń zgłoszenie"
            className="text-er border-er/30 hover:bg-er/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"
            title="Odśwież"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Edit modal */}
      <EditTicketModal
        open={editOpen}
        ticket={t}
        onClose={() => setEditOpen(false)}
        onSave={(patch) => updateTicket.mutate(patch)}
        isSaving={updateTicket.isPending}
      />

      {/* Origin header — who/where ticket came from */}
      <OriginHeaderCard ticket={t} />

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

        {/* Quick action: Start session — gdy ASSIGNED/IN_PROGRESS i ticket przypisany do mnie */}
        {(t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS') && (
          <div className="mt-3 pt-3 border-t border-bd flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startSession.mutate()}
              disabled={startSession.isPending}
              title="Zarejestruj czas pracy nad zgłoszeniem"
            >
              <Play className="h-3.5 w-3.5" /> Rozpocznij sesję pracy
            </Button>
            {t.billing && t.billing.sessionCount > 0 && (
              <Link to={`/sessions?ticketId=${t.id}`} className="text-[12px] text-tx3 hover:underline">
                Sesji: {t.billing.sessionCount} ({t.billing.billableHours.toFixed(1)} h)
              </Link>
            )}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left — description + comments. md:col-span-2 dla tabletów+, single col na mobile */}
        <div className="md:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Opis</CardTitle></CardHeader>
            <CardContent>
              <SimpleMarkdown text={t.description} className="text-[13px] text-tx leading-relaxed" />
            </CardContent>
          </Card>

          <GeneratedArtifactsCard ticket={t} />

          <BillingAggregateCard ticket={t} />

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
                        <SimpleMarkdown text={c.comment} className="text-[13px] text-tx" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="pt-4 border-t border-bd">
                <CommentEditor
                  value={commentText}
                  onChange={setCommentText}
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
                <Select
                  value={t.assignedTo?.id ?? ''}
                  onChange={(e) => {
                    const userId = e.target.value || null;
                    if (userId !== (t.assignedTo?.id ?? null)) {
                      updateTicket.mutate({ assignedToUserId: userId });
                    }
                  }}
                  disabled={updateTicket.isPending}
                  className="text-[12px] py-1 min-w-0"
                >
                  <option value="">— nikt —</option>
                  {(workspaceUsers?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </Select>
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
              {t.waitingType && (
                <MetaRow label="Czeka na">
                  <div>
                    <Badge variant={t.waitingType === 'CLIENT' ? 'warning' : t.waitingType === 'SUPPLIER' ? 'accent' : 'neutral'}>
                      {t.waitingType === 'CLIENT' ? 'Klienta' : t.waitingType === 'SUPPLIER' ? 'Dostawcę' : 'Wewnętrzne'}
                    </Badge>
                    {t.waitingFor && <p className="text-[11px] text-tx3 mt-0.5">{t.waitingFor}</p>}
                  </div>
                </MetaRow>
              )}
              {t.parentTicket && (
                <MetaRow label="Duplikat">
                  <Link to={`/tickets/${t.parentTicket.id}`} className="text-[12px] hover:underline" style={{ color: 'var(--pri)' }}>
                    ↪ {t.parentTicket.ticketNumber}
                  </Link>
                </MetaRow>
              )}
            </CardContent>
          </Card>

          {(t.slaResponseMinutes || t.slaResolveMinutes) && (
            <SlaCard ticket={t} />
          )}

          <AttachmentsCard ticketId={t.id} />

          {t.resolutionSummary && (
            <Card>
              <CardHeader><CardTitle>Rozwiązanie</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[13px] text-tx leading-relaxed whitespace-pre-wrap">{t.resolutionSummary}</p>
              </CardContent>
            </Card>
          )}

          {t.rating != null ? (
            <Card>
              <CardHeader><CardTitle>Ocena klienta</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn(
                        'h-5 w-5',
                        n <= (t.rating ?? 0) ? 'text-warn fill-warn' : 'text-tx3',
                      )}
                    />
                  ))}
                  <span className="text-[12px] text-tx3 ml-2">{t.rating}/5</span>
                </div>
                {t.ratingComment && (
                  <p className="text-[12px] text-tx2 mt-2 italic">"{t.ratingComment}"</p>
                )}
                {t.ratedAt && (
                  <p className="text-[10px] text-tx3 mt-1">{formatRelativePl(t.ratedAt)}</p>
                )}
              </CardContent>
            </Card>
          ) : (t.status === 'RESOLVED' || t.status === 'CLOSED') && currentUserId && currentUserId === t.createdBy.id && (
            // N8: pokazuj tylko gdy zalogowany user jest twórcą ticketu (klient zgłaszający)
            // Technik własnego ticketu nie ocenia sam siebie.
            <RateTicketCard onRate={(rating, comment) => rateTicket.mutate({ rating, comment })} isPending={rateTicket.isPending} />
          )}

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Aktywność ({t.events.length})</CardTitle>
              {t.events.length > 8 && (
                <button
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="text-[11px] text-tx3 hover:text-pri press"
                >
                  {showAllEvents ? 'Pokaż mniej' : 'Pokaż całą historię'}
                </button>
              )}
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-bd ml-2 space-y-4">
                {(showAllEvents ? [...t.events].reverse() : [...t.events].slice(-8).reverse()).map((ev) => (
                  <li key={ev.id} className="pl-4 relative">
                    <span
                      className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full"
                      style={{ background: 'var(--pri)' }}
                    />
                    <p className="text-[11px] text-tx">
                      <EventLabel event={ev} users={workspaceUsers?.users ?? []} />
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

interface UserMini { id: string; firstName: string; lastName: string }
function userLabel(userId: string | null, users: UserMini[]): string {
  if (!userId) return '—';
  const u = users.find((x) => x.id === userId);
  return u ? `${u.firstName} ${u.lastName}` : userId.slice(0, 8);
}
function EventLabel({ event, users }: {
  event: { eventType: string; fromValue: string | null; toValue: string | null };
  users: UserMini[];
}) {
  switch (event.eventType) {
    case 'created': return <><MessageSquare className="inline h-3 w-3 mr-1" /> Utworzono zgłoszenie</>;
    case 'status_changed': return <>Status: <span className="text-tx3">{event.fromValue ?? '—'}</span> → <b>{event.toValue}</b></>;
    case 'assigned': return <>Przypisano: <span className="text-tx3">{userLabel(event.fromValue, users)}</span> → <b>{userLabel(event.toValue, users)}</b></>;
    case 'commented': return <><MessageSquare className="inline h-3 w-3 mr-1" /> Dodano komentarz</>;
    case 'rated': return <>Klient ocenił: {event.toValue}/5</>;
    case 'updated': return <>Aktualizacja</>;
    case 'auto_closed': return <>Auto-zamknięcie po terminie</>;
    case 'deleted': return <><Trash2 className="inline h-3 w-3 mr-1" /> Usunięto</>;
    default: return <>{event.eventType}</>;
  }
}

function EditTicketModal({
  open, ticket, onClose, onSave, isSaving,
}: {
  open: boolean;
  ticket: TicketDetail;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    category: ticket.category ?? '',
    dueAt: ticket.dueAt ? ticket.dueAt.slice(0, 10) : '',
    waitingType: ticket.waitingType ?? '',
    waitingFor: ticket.waitingFor ?? '',
    parentTicketId: ticket.parentTicketId ?? '',
  });
  // N9: reset state gdy zmienia się ticket id (nawigacja do innego ticketu z otwartym modalem)
  useEffect(() => {
    setForm({
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      category: ticket.category ?? '',
      dueAt: ticket.dueAt ? ticket.dueAt.slice(0, 10) : '',
      waitingType: ticket.waitingType ?? '',
      waitingFor: ticket.waitingFor ?? '',
      parentTicketId: ticket.parentTicketId ?? '',
    });
  }, [ticket.id, ticket.title, ticket.description, ticket.priority, ticket.category, ticket.dueAt, ticket.waitingType, ticket.waitingFor, ticket.parentTicketId]);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[100] anim-fade" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-l)] bg-bg border border-bd shadow-2 anim-scale flex flex-col max-h-[88vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-bd">
            <Dialog.Title className="text-[15px] font-semibold text-tx">Edytuj zgłoszenie</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
                <span className="sr-only">Zamknij</span>
              </button>
            </Dialog.Close>
          </div>
          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Tytuł</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Opis</label>
              <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Priorytet</label>
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="LOW">Niski</option>
                  <option value="MEDIUM">Średni</option>
                  <option value="HIGH">Wysoki</option>
                  <option value="CRITICAL">Krytyczny</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Termin</label>
                <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Kategoria</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={50} placeholder="np. Drukarka, Sieć" />
            </div>
            {/* F2.3: WAITING type + dla kogo czekamy */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Czeka na</label>
                <Select value={form.waitingType} onChange={(e) => setForm({ ...form, waitingType: e.target.value as typeof form.waitingType })}>
                  <option value="">— nie czeka —</option>
                  <option value="CLIENT">Klienta</option>
                  <option value="SUPPLIER">Dostawcę</option>
                  <option value="INTERNAL">Decyzję wewnętrzną</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Opis (opc.)</label>
                <Input value={form.waitingFor} onChange={(e) => setForm({ ...form, waitingFor: e.target.value })} maxLength={200} placeholder="np. potwierdzenie zamówienia" />
              </div>
            </div>
            {/* F8.2: parent ticket — duplicate */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Duplikat zgłoszenia (UUID)</label>
              <Input
                value={form.parentTicketId}
                onChange={(e) => setForm({ ...form, parentTicketId: e.target.value })}
                placeholder="np. abc12345-67de-..."
              />
              <p className="text-[10px] text-tx3 mt-1">UUID zgłoszenia macierzystego — to zgłoszenie zostanie oznaczone jako duplikat.</p>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-bd flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Anuluj</Button>
            <Button
              size="sm"
              disabled={isSaving || form.title.trim().length < 3}
              onClick={() => onSave({
                title: form.title.trim(),
                description: form.description,
                priority: form.priority,
                category: form.category.trim() || null,
                dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                waitingType: form.waitingType || null,
                waitingFor: form.waitingFor.trim() || null,
                parentTicketId: form.parentTicketId.trim() || null,
              })}
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Zapisz
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Markdown preview toggle dla komentarza/opisu — F4.8 enhancement
function CommentEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-tx3">
          <code>**bold**</code> · <code>*kursywa*</code> · <code>[tekst](url)</code>
        </span>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-[11px] text-pri hover:underline press"
        >
          {showPreview ? 'Edytuj' : 'Podgląd'}
        </button>
      </div>
      {showPreview ? (
        <div className="min-h-[80px] p-3 rounded-[var(--r-s)] border border-bd bg-sf-h text-[13px] text-tx">
          {value.trim() ? <SimpleMarkdown text={value} /> : <span className="text-tx3 italic">Pusty</span>}
        </div>
      ) : (
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// F4.9: Załączniki ticketu — upload + lista + delete
function AttachmentsCard({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data } = useQuery<{ attachments: Array<{ id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }> }>({
    queryKey: ['tickets', ticketId, 'attachments'],
    queryFn: async () => (await api.get(`/tickets/${ticketId}/attachments`)).data,
  });
  const del = useMutation({
    mutationFn: async (aid: string) => (await api.delete(`/tickets/${ticketId}/attachments/${aid}`)).data,
    onSuccess: () => {
      toast.success('Usunięto załącznik');
      qc.invalidateQueries({ queryKey: ['tickets', ticketId, 'attachments'] });
    },
    onError: () => toast.error('Błąd usuwania załącznika'),
  });
  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/tickets/${ticketId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Plik wgrany');
      qc.invalidateQueries({ queryKey: ['tickets', ticketId, 'attachments'] });
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd uploadu');
    } finally {
      setUploading(false);
    }
  }
  const attachments = data?.attachments ?? [];
  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Załączniki ({attachments.length})</CardTitle>
        <label className="cursor-pointer text-[11px] px-2 py-1 rounded-[var(--r-s)] border border-bd hover:bg-sf-h press">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
          {uploading ? 'Wgrywam...' : 'Dodaj plik'}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-[12px] text-tx3 text-center py-3">Brak załączników. Max 25 MB.</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-2 rounded-[var(--r-s)] bg-sf-h text-[12px]">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const resp = await api.get(`/tickets/${ticketId}/attachments/${a.id}/file`, { responseType: 'blob' });
                      const url = window.URL.createObjectURL(resp.data as Blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = a.fileName;
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      // Defer revoke — Safari/older Firefox can abort the download otherwise.
                      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                    } catch {
                      toast.error('Nie udało się pobrać pliku');
                    }
                  }}
                  className="flex-1 min-w-0 hover:underline text-tx truncate text-left"
                  title={a.fileName}
                >
                  {a.fileName}
                </button>
                <span className="text-tx3 text-[10px] shrink-0">{fmtSize(a.fileSize)}</span>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Usunąć załącznik?',
                      message: a.fileName,
                      confirmLabel: 'Usuń',
                      danger: true,
                    });
                    if (ok) del.mutate(a.id);
                  }}
                  className="text-tx3 hover:text-er press p-1"
                  title="Usuń"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SlaCard({ ticket }: { ticket: TicketDetail }) {
  const now = Date.now();
  const created = new Date(ticket.createdAt).getTime();
  const responseDeadline = ticket.slaResponseMinutes ? created + ticket.slaResponseMinutes * 60_000 : null;
  const resolveDeadline = ticket.slaResolveMinutes ? created + ticket.slaResolveMinutes * 60_000 : null;
  const responseDone = !!ticket.firstResponseAt;
  const resolveDone = !!ticket.resolvedAt;
  const responseBreached = responseDeadline && !responseDone && now > responseDeadline;
  const resolveBreached = resolveDeadline && !resolveDone && now > resolveDeadline;
  const fmtRemaining = (deadline: number) => {
    const diff = deadline - now;
    if (diff < 0) {
      const overdue = Math.abs(diff);
      const h = Math.floor(overdue / 3_600_000);
      const m = Math.floor((overdue % 3_600_000) / 60_000);
      return `przekroczono o ${h > 0 ? `${h}h ` : ''}${m}min`;
    }
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>SLA</CardTitle>
        {(responseBreached || resolveBreached || ticket.slaBreached) && (
          <Badge variant="danger">Przekroczone</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-[12px]">
        {responseDeadline && (
          <div className="flex items-center justify-between">
            <span className="text-tx3">Czas reakcji ({ticket.slaResponseMinutes}min)</span>
            <span className={cn(
              'font-medium',
              responseDone ? 'text-ok' : responseBreached ? 'text-er' : 'text-tx',
            )}>
              {responseDone ? '✓ ' + formatRelativePl(ticket.firstResponseAt!) :
               responseBreached ? `⚠ ${fmtRemaining(responseDeadline)}` :
               fmtRemaining(responseDeadline)}
            </span>
          </div>
        )}
        {resolveDeadline && (
          <div className="flex items-center justify-between">
            <span className="text-tx3">Czas rozwiązania ({ticket.slaResolveMinutes}min)</span>
            <span className={cn(
              'font-medium',
              resolveDone ? 'text-ok' : resolveBreached ? 'text-er' : 'text-tx',
            )}>
              {resolveDone ? '✓ ' + formatRelativePl(ticket.resolvedAt!) :
               resolveBreached ? `⚠ ${fmtRemaining(resolveDeadline)}` :
               fmtRemaining(resolveDeadline)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RateTicketCard({ onRate, isPending }: { onRate: (rating: number, comment?: string) => void; isPending: boolean }) {
  const [hoverN, setHoverN] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Oceń obsługę</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[12px] text-tx3 mb-3">Jak szybko/dobrze rozwiązano twój problem?</p>
        <div className="flex items-center gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHoverN(n)}
              onMouseLeave={() => setHoverN(0)}
              onClick={() => setSelected(n)}
              className="p-1 press"
              title={`${n}/5`}
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  n <= (hoverN || selected) ? 'text-warn fill-warn' : 'text-tx3',
                )}
              />
            </button>
          ))}
          {selected > 0 && <span className="text-[12px] text-tx3 ml-2">{selected}/5</span>}
        </div>
        <Textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Komentarz (opcjonalny) — co poszło dobrze, co można poprawić?"
          maxLength={1000}
        />
        <Button
          className="mt-3"
          size="sm"
          disabled={selected === 0 || isPending}
          onClick={() => onRate(selected, comment.trim() || undefined)}
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Wyślij ocenę
        </Button>
      </CardContent>
    </Card>
  );
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
                  <Link key={t.id} to={`/tasks/${t.id}`} className="block p-2.5 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors">
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
                  <Link key={o.id} to={`/orders/${o.id}`} className="block p-2.5 rounded-[var(--r-s)] border border-bd hover:bg-sf-h transition-colors">
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

// ─────────────────────────────────────────────────────────────────────────────
// Origin header — who + source + reporter info
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; icon: typeof Globe; variant: 'accent' | 'info' | 'warning' | 'success' | 'neutral' }> = {
  PORTAL:  { label: 'Portal klienta', icon: Globe,    variant: 'accent'  },
  EMAIL:   { label: 'E-mail',         icon: Mail,     variant: 'info'    },
  AGENT:   { label: 'Desktop agent',  icon: Cpu,      variant: 'warning' },
  PHONE:   { label: 'Telefon',        icon: Phone,    variant: 'neutral' },
  AI_CHAT: { label: 'IDO (AI chat)',  icon: Bot,      variant: 'accent'  },
  MANUAL:  { label: 'Technik (ręcznie)', icon: PenLine, variant: 'success' },
  API:     { label: 'API / Integracja', icon: Globe,  variant: 'neutral' },
};

function OriginHeaderCard({ ticket }: { ticket: TicketDetail }) {
  const meta = SOURCE_META[ticket.source] ?? { label: ticket.source, icon: Globe, variant: 'neutral' as const };
  const Icon = meta.icon;
  const hasRequester = !!(ticket.requesterName || ticket.requesterEmail || ticket.requesterPhone);
  const isExternal = ticket.source === 'PORTAL' || ticket.source === 'EMAIL' || ticket.source === 'AI_CHAT';

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="h-10 w-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-tx3">Pochodzenie</span>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {ticket.clientName && (
              <Badge variant="neutral">
                <Building2 className="h-3 w-3" /> {ticket.clientName}
              </Badge>
            )}
            {isExternal && <Badge variant="info">Klient zewnętrzny</Badge>}
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-tx3">Utworzone przez:</span>
              <span className="text-tx font-medium">
                {ticket.createdBy.firstName} {ticket.createdBy.lastName}
              </span>
              <span className="text-tx3 text-[11px]">· {formatRelativePl(ticket.createdAt)}</span>
            </div>
            {hasRequester && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-tx3">Zgłaszający:</span>
                {ticket.requesterName && <span className="text-tx font-medium">{ticket.requesterName}</span>}
                {ticket.requesterEmail && (
                  <a href={`mailto:${ticket.requesterEmail}`} className="text-[11px] hover:underline" style={{ color: 'var(--pri)' }}>
                    <Mail className="inline h-3 w-3 mr-0.5" />{ticket.requesterEmail}
                  </a>
                )}
                {ticket.requesterPhone && (
                  <a href={`tel:${ticket.requesterPhone}`} className="text-[11px] hover:underline" style={{ color: 'var(--pri)' }}>
                    <Phone className="inline h-3 w-3 mr-0.5" />{ticket.requesterPhone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing aggregate — sessions × hourly rate OR subscription counter
// ─────────────────────────────────────────────────────────────────────────────
function formatHoursPl(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 min';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} godz`;
  return `${h} godz ${m} min`;
}

function BillingAggregateCard({ ticket }: { ticket: TicketDetail }) {
  const b = ticket.billing;
  const cb = ticket.clientBilling;
  if (!b || b.sessionCount === 0) {
    // Show hint that no sessions yet are linked
    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Rozliczenie</CardTitle>
          <span className="text-[11px] text-tx3">Brak powiązanych sesji serwisowych</span>
        </CardHeader>
        <CardContent>
          <p className="text-[13px] text-tx3 text-center py-3">
            <Timer className="inline h-3.5 w-3.5 mr-1" />
            Koszt pojawi się po zakończeniu pierwszej sesji (WorkSession) powiązanej z tym zgłoszeniem.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isSubscription = cb?.billingType === 'SUBSCRIPTION';
  const usedMinutes = b.monthToDateMinutes ?? 0;
  const limitMinutes = b.monthlyLimitMinutes ?? 0;
  const pct = limitMinutes > 0 ? Math.min(100, Math.round((usedMinutes / limitMinutes) * 100)) : 0;
  const overLimit = limitMinutes > 0 && usedMinutes > limitMinutes;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>
          <Wallet className="inline h-4 w-4 mr-1.5" />
          Rozliczenie
        </CardTitle>
        {cb && (
          <Badge variant={isSubscription ? 'accent' : 'neutral'}>
            {cb.billingType === 'HOURLY' ? 'Rozliczenie godzinowe' :
             cb.billingType === 'SUBSCRIPTION' ? 'Abonament' : 'Hybrydowe'}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost headline */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-tx3 mb-1">Koszt tego zgłoszenia</div>
            {b.costNet != null ? (
              <div className="text-[24px] font-bold text-tx leading-none">
                {b.costNet.toFixed(2)} <span className="text-[14px] text-tx3 font-medium">PLN netto</span>
              </div>
            ) : (
              <div className="text-[13px] text-tx3">Stawka nieustalona — skonfiguruj WorkspaceRelation</div>
            )}
            <div className="text-[11px] text-tx3 mt-1">
              {formatHoursPl(b.totalBillableMinutes)} bilowane
              {b.effectiveHourlyRateNet != null && (
                <> @ <strong className="text-tx2">{Number(b.effectiveHourlyRateNet).toFixed(2)} PLN/h</strong></>
              )}
              <> · {b.sessionCount} {b.sessionCount === 1 ? 'sesja' : 'sesji'}</>
            </div>
          </div>
          {cb?.billingIncrementMin && (
            <div className="text-[11px] text-tx3 text-right">
              Zaokrąglenie: <strong className="text-tx2">{cb.billingIncrementMin} min</strong>
            </div>
          )}
        </div>

        {/* Subscription usage bar */}
        {isSubscription && limitMinutes > 0 && (
          <div className="pt-3 border-t border-bd">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                Zużycie abonamentu (ten miesiąc)
              </span>
              <span className={cn('text-[12px] font-semibold', overLimit ? 'text-er' : 'text-tx')}>
                {formatHoursPl(usedMinutes)} / {formatHoursPl(limitMinutes)}
                <span className="text-tx3 font-normal"> ({pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sf-h)' }}>
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: overLimit ? 'var(--er)' : pct > 80 ? 'var(--wr)' : 'var(--ok)',
                }}
              />
            </div>
            {overLimit && cb?.overageRateNet && (
              <p className="text-[11px] text-er mt-1.5">
                Przekroczono limit abonamentu o {formatHoursPl(usedMinutes - limitMinutes)} —
                {' '}stawka nadgodzinowa: <strong>{Number(cb.overageRateNet).toFixed(2)} PLN/h</strong>
              </p>
            )}
            {cb?.monthlyNet && !overLimit && (
              <p className="text-[11px] text-tx3 mt-1.5">
                Abonament: <strong>{Number(cb.monthlyNet).toFixed(2)} PLN/m-c</strong>
                {cb.overageRateNet && <> · nadgodziny: {Number(cb.overageRateNet).toFixed(2)} PLN/h</>}
              </p>
            )}
          </div>
        )}

        {/* Session breakdown */}
        <div className="pt-3 border-t border-bd">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">
            Sesje ({b.sessionCount})
          </div>
          <div className="text-[11px] text-tx3 grid grid-cols-2 gap-2">
            <div>
              <span className="block text-tx2">Czas pracy (total):</span>
              <strong className="text-tx">{formatHoursPl(b.totalDurationMinutes)}</strong>
            </div>
            <div>
              <span className="block text-tx2">Czas bilowany:</span>
              <strong className="text-tx">{formatHoursPl(b.totalBillableMinutes)}</strong>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


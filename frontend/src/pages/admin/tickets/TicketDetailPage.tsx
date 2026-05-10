import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Lock, Pencil, X, Check, Trash2, Star, Play, Monitor, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { sessionsApi } from '../../../api/sessions';
import { AttachmentGallery } from '../../../components/ui/AttachmentGallery';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { activityLogsApi } from '../../../api/activityLogs';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { useAuth } from '../../../store/authStore';
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext';
import { formatDateTime, getInitials, getErrorMessage } from '../../../utils/helpers';
import type { TicketPriority, TicketComment } from '../../../types';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function parseDescription(raw: string): { text: string; photoUrls: string } {
  const marker = '📷 Zrzuty ekranu:';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { text: raw, photoUrls: '' };
  return { text: raw.slice(0, idx).trimEnd(), photoUrls: raw.slice(idx + marker.length).trim().split('\n').map(u => u.trim()).filter(Boolean).join(',') };
}

const TYPE_LABELS: Record<string, string> = { INCIDENT: 'Incydent', REQUEST: 'Prośba', MAINTENANCE: 'Konserwacja', INSTALLATION: 'Instalacja', OTHER: 'Inne' };
const SOURCE_LABELS: Record<string, string> = { CLIENT_PORTAL: 'Portal klienta', INTERNAL: 'Wewnętrzne', PHONE: 'Telefon', EMAIL: 'Email', QR_SCAN: 'Skan QR', AGENT: 'Asystent', IN_PERSON: 'Osobiście', MESSAGE: 'Wiadomość' };

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, ...extra,
});
const selectStyle: React.CSSProperties = { background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' };

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[16px] overflow-hidden" style={glass()}>
      <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-[13px] font-semibold text-[var(--tm)]">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ── Editable comment ────────────────────────────────────────────────────── */
function CommentBubble({ c, isAdmin, onEdit, onDelete }: {
  c: TicketComment; isAdmin: boolean;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.comment);

  const save = () => {
    if (editText.trim() && editText !== c.comment) onEdit(c.id, editText.trim());
    setEditing(false);
  };

  return (
    <div className="flex gap-3 p-3 rounded-[12px]"
      style={c.isInternal
        ? { background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.1)' }
        : { background: 'var(--bg-card)', border: '1px solid var(--border)' }
      }>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
        {c.user ? getInitials(c.user.firstName, c.user.lastName) : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[13px] font-semibold text-[var(--t)]">{c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Użytkownik'}</span>
          {c.isInternal && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: '#FBBF24' }}>
              <Lock className="h-3 w-3" /> Wewnętrzne
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'var(--td)' }}>{formatDateTime(c.createdAt)}</span>
          {isAdmin && !editing && (
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => { setEditText(c.comment); setEditing(true); }}
                className="p-1 rounded-lg transition-colors hover:bg-[var(--hover-bg)]" title="Edytuj">
                <Pencil className="h-3 w-3" style={{ color: 'var(--td)' }} />
              </button>
              <button onClick={() => { if (confirm('Usunąć komentarz?')) onDelete(c.id); }}
                className="p-1 rounded-lg transition-colors hover:bg-[var(--hover-bg)]" title="Usuń">
                <Trash2 className="h-3 w-3" style={{ color: 'var(--td)' }} />
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
              className="w-full rounded-xl px-3 py-2 text-[13px] resize-none focus:outline-none placeholder:text-[var(--td)]"
              style={{ background: 'var(--hover-bg)', border: '1px solid rgba(139,92,246,0.3)', color: 'var(--t)' }} />
            <div className="flex gap-2">
              <button onClick={save} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                <Check className="h-3 w-3" /> Zapisz
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{ color: 'var(--tm)' }}>
                Anuluj
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{c.comment}</p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin: wsAdmin, isTechnician: wsTech, isMember, isViewer } = useWorkspaceContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Neighbour tickets for prev/next navigation (same workspace, by createdAt desc — matches list default)
  const { data: neighbours } = useQuery({
    queryKey: ['tickets-neighbours'],
    queryFn: () => ticketsApi.getAll({ limit: 500 } as any),
    staleTime: 60_000,
  });
  const currentIdx = Array.isArray(neighbours)
    ? (neighbours as any[]).findIndex((t: any) => t.id === id)
    : -1;
  const prevTicket = currentIdx > 0 ? (neighbours as any[])[currentIdx - 1] : null;
  const nextTicket = currentIdx >= 0 && Array.isArray(neighbours) && currentIdx < (neighbours as any[]).length - 1
    ? (neighbours as any[])[currentIdx + 1]
    : null;
  const goPrev = () => prevTicket && navigate(`/tickets/${prevTicket.id}`);
  const goNext = () => nextTicket && navigate(`/tickets/${nextTicket.id}`);

  // Keyboard shortcuts: Alt+Left / Alt+Right
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && prevTicket) { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight' && nextTicket) { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevTicket?.id, nextTicket?.id]);
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');

  const { data: ticket, isLoading } = useQuery({ queryKey: ['tickets', id], queryFn: () => ticketsApi.getOne(id!), enabled: !!id });
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['activity-logs', id],
    queryFn: () => activityLogsApi.getAll({ entityId: id, entityType: 'Ticket', limit: 30 }),
    enabled: !!id,
  });
  const { data: technicians = [] } = useQuery({
    queryKey: ['users-staff-all'],
    queryFn: async () => {
      const [t, a] = await Promise.all([usersApi.getAll({ role: 'TECHNICIAN' }), usersApi.getAll({ role: 'ADMIN' })]);
      return [...t, ...a].filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
    },
  });

  const inv = () => qc.invalidateQueries({ queryKey: ['tickets', id] });

  const commentMut = useMutation({
    mutationFn: () => ticketsApi.addComment(id!, comment, isInternal),
    onSuccess: () => { setComment(''); inv(); toast.success('Wiadomość wysłana'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const editCommentMut = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      ticketsApi.update(id!, { comments: [{ id: commentId, comment: text }] } as any),
    onSuccess: () => { inv(); toast.success('Wiadomość zaktualizowana'); },
    onError: () => {
      // Fallback: jeśli backend nie obsługuje edycji komentarza, pokaż info
      toast.error('Edycja komentarza niedostępna — backend nie obsługuje tej funkcji');
    },
  });

  const deleteCommentMut = useMutation({
    mutationFn: (commentId: string) =>
      ticketsApi.update(id!, { deleteComment: commentId } as any),
    onSuccess: () => { inv(); toast.success('Komentarz usunięty'); },
    onError: () => toast.error('Usuwanie komentarza niedostępne'),
  });

  const cancelMut = useMutation({
    mutationFn: () => ticketsApi.cancel(id!),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['tickets-all'] }); toast.success('Anulowane'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const assignMut = useMutation({
    mutationFn: () => ticketsApi.assign(id!, assignUserId),
    onSuccess: () => { setAssignUserId(''); inv(); toast.success('Przypisane'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const startSessionMut = useMutation({
    mutationFn: async (mode: 'REMOTE' | 'ONSITE') => {
      // Set serviceMode on ticket if not already set, then start session
      if (ticket && (ticket as any).serviceMode !== mode) {
        await ticketsApi.assign(id!, ticket.assignedToUserId ?? user!.id, mode as any);
      }
      return sessionsApi.startMobile({
        clientId: ticket!.workspaceId,
        ticketId: id!,
        deviceId: ticket?.deviceId ?? undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-session'] });
      inv();
      toast.success('Sesja pracy rozpoczęta');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!ticket) return <div className="text-sm" style={{ color: 'var(--tm)' }}>Nie znaleziono zgłoszenia</div>;

  const { text: descText, photoUrls } = parseDescription(ticket.description);
  const allPhotoUrls = [photoUrls, (ticket as any).attachmentUrls].filter(Boolean).join(',');
  const isAdminOrTech = wsAdmin || wsTech;
  const isClient = isMember || isViewer;
  const comments = ticket.comments ?? [];
  const visible = isClient ? comments.filter(c => !c.isInternal) : comments;
  const canEdit = ticket.status !== 'CANCELLED' && ticket.status !== 'COMPLETED';

  return (
    <div>
      <PageHeader title={ticket.title} helpKey="ticketDetail" back="/tickets" subtitle={ticket.ticketNumber}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
            {/* chevron-prev-next-injected */}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={goPrev}
                disabled={!prevTicket}
                title={prevTicket ? `Poprzednie: ${prevTicket.ticketNumber}` : 'Brak poprzedniego'}
                className="p-1.5 rounded-md disabled:opacity-40 hover:bg-[var(--hover-bg)]"
                style={{ border: '1px solid var(--border)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goNext}
                disabled={!nextTicket}
                title={nextTicket ? `Następne: ${nextTicket.ticketNumber}` : 'Brak następnego'}
                className="p-1.5 rounded-md disabled:opacity-40 hover:bg-[var(--hover-bg)]"
                style={{ border: '1px solid var(--border)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {canEdit && isAdminOrTech && ticket.status !== 'RESOLVED' && (
              <>
                <button
                  onClick={() => startSessionMut.mutate('REMOTE')}
                  disabled={startSessionMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                  title="Rozpocznij pracę zdalną i uruchom pomiar czasu"
                >
                  <Play size={14} /><Monitor size={14} /> Zdalnie
                </button>
                <button
                  onClick={() => startSessionMut.mutate('ONSITE')}
                  disabled={startSessionMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                  title="Rozpocznij pracę lokalną i uruchom pomiar czasu"
                >
                  <Play size={14} /><MapPin size={14} /> Lokalnie
                </button>
              </>
            )}
          </div>
        } />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          <Section title="Opis">
            <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--ts)' }}>{descText}</p>
            {allPhotoUrls && <div className="mt-3"><AttachmentGallery urls={allPhotoUrls} secure /></div>}
          </Section>

          {ticket.resolutionSummary && (
            <Section title="Rozwiązanie">
              <p className="text-[13px] whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{ticket.resolutionSummary}</p>
            </Section>
          )}

          {/* Wiadomości */}
          <Section title={`Wiadomości (${visible.length})`}>
            <div className="space-y-3 mb-5">
              {visible.length === 0 ? (
                <p className="text-[13px] text-center py-6" style={{ color: 'var(--td)' }}>Brak wiadomości</p>
              ) : visible.map(c => (
                <CommentBubble key={c.id} c={c} isAdmin={isAdminOrTech}
                  onEdit={(cid, text) => editCommentMut.mutate({ commentId: cid, text })}
                  onDelete={(cid) => deleteCommentMut.mutate(cid)} />
              ))}
            </div>

            {/* Nowa wiadomość */}
            <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Napisz wiadomość..." rows={3}
                className="w-full rounded-xl px-4 py-3 text-[13px] resize-none focus:outline-none transition-all placeholder:text-[var(--td)]"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
              <div className="flex items-center justify-between mt-3">
                {isAdminOrTech ? (
                  <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: 'var(--tm)' }}>
                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}
                      className="rounded border-gray-600 text-violet-600" />
                    <Lock className="h-3.5 w-3.5" style={{ color: '#FBBF24' }} /> Notatka wewnętrzna
                  </label>
                ) : <div />}
                <Button size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => commentMut.mutate()}
                  loading={commentMut.isPending} disabled={!comment.trim()}>
                  Wyślij
                </Button>
              </div>
            </div>
          </Section>
        </div>

        {/* ── RIGHT ────────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Przypisz */}
          {isAdminOrTech && (
            <Section title="Przypisz technika">
              <div className="space-y-2.5">
                {ticket.assignedTo && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: 'rgba(139,92,246,0.15)', color: '#A78BFA' }}>
                      {getInitials(ticket.assignedTo.firstName, ticket.assignedTo.lastName)}
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: '#A78BFA' }}>
                      {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                    </span>
                  </div>
                )}
                <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                  className="w-full text-[13px] rounded-xl px-3 py-2.5 focus:outline-none appearance-none"
                  style={selectStyle}>
                  <option value="">{ticket.assignedTo ? 'Zmień technika...' : 'Wybierz technika...'}</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                </select>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => assignMut.mutate()}
                  loading={assignMut.isPending} disabled={!assignUserId}>
                  Przypisz
                </Button>
              </div>
            </Section>
          )}

          {/* Szczegóły */}
          <Section title="Szczegóły">
            <div className="space-y-0">
              {[
                { label: 'Lokalizacja', value: ticket.location?.name || '—' },
                { label: 'Urządzenie', value: ticket.device ? <Link to={`/devices/${ticket.device.id}`} className="text-violet-400 hover:underline">{ticket.device.name}</Link> : null },
                { label: 'Typ', value: TYPE_LABELS[ticket.type] ?? ticket.type },
                { label: 'Priorytet', value: <PriorityBadge priority={ticket.priority} /> },
                { label: 'Źródło', value: SOURCE_LABELS[ticket.source] ?? ticket.source },
                { label: 'Zgłoszono', value: formatDateTime(ticket.reportedAt) },
                { label: 'Termin SLA', value: ticket.dueAt ? (() => {
                  const due = new Date(ticket.dueAt);
                  const now = new Date();
                  const done = ticket.status === 'COMPLETED' || ticket.status === 'RESOLVED' || ticket.status === 'CANCELLED';
                  const hoursLeft = (due.getTime() - now.getTime()) / 3600000;
                  const dateStr = formatDateTime(ticket.dueAt);
                  if (done) return <span style={{ color: '#4ADE80' }}>{dateStr} ✓</span>;
                  if (hoursLeft < 0) return <span style={{ color: '#F87171', fontWeight: 700 }}>{dateStr} — PRZETERMINOWANE ({Math.abs(Math.round(hoursLeft))}h temu)</span>;
                  if (hoursLeft < 4) return <span style={{ color: '#FBBF24', fontWeight: 600 }}>{dateStr} — {Math.ceil(hoursLeft)}h pozostało</span>;
                  return <span>{dateStr}</span>;
                })() : null },
                { label: 'Przypisany', value: ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : null },
                { label: 'Autor', value: ticket.createdBy ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}` : null },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-start gap-2 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-[11px] font-medium w-24 flex-shrink-0 pt-0.5" style={{ color: 'var(--tm)' }}>{label}</span>
                  <span className="text-[13px] text-[var(--ts)]">{value}</span>
                </div>
              ) : null)}
            </div>
          </Section>

          {/* Timeline */}
          {activityLogs.length > 0 && (
            <Section title={`Historia (${activityLogs.length})`}>
              <div className="space-y-2">
                {activityLogs.slice(0, 15).map((log: any) => (
                  <div key={log.id} className="flex gap-2 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--accent)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px]" style={{ color: 'var(--ts)' }}>{log.description}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--td)' }}>
                        {log.performedBy ? `${log.performedBy.firstName} ${log.performedBy.lastName}` : '—'} · {formatDateTime(log.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Ocena klienta */}
          <TicketRatingSection ticket={ticket} />

          {/* Anuluj */}
          {isAdminOrTech && canEdit && (
            <Section title="Akcje">
              <Button size="sm" variant="danger" className="w-full"
                onClick={() => { if (confirm('Anulować zgłoszenie?')) cancelMut.mutate(); }}
                loading={cancelMut.isPending}>
                Anuluj zgłoszenie
              </Button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Rating Section ──────────────────────────────────────────────────────── */

function TicketRatingSection({ ticket }: { ticket: { id: string; status: string; rating?: number | null; ratingComment?: string | null } }) {
  const qc = useQueryClient();
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);

  const rateMut = useMutation({
    mutationFn: (data: { rating: number; ratingComment?: string }) =>
      ticketsApi.rate(ticket.id, data),
    onSuccess: () => {
      toast.success('Dziękujemy za ocenę!');
      qc.invalidateQueries({ queryKey: ['tickets', ticket.id] });
    },
    onError: () => toast.error('Błąd zapisu oceny'),
  });

  const isCompleted = ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(ticket.status);
  if (!isCompleted) return null;

  const handleRate = (rating: number) => {
    if (ticket.rating) return;
    rateMut.mutate({ rating, ratingComment: comment.trim() || undefined });
  };

  return (
    <Section title="Ocena klienta">
      {ticket.rating ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ticket.ratingComment ? 8 : 0 }}>
            {[1, 2, 3].map(s => (
              <Star key={s} size={22} fill={s <= (ticket.rating ?? 0) ? '#F59E0B' : 'none'} color={s <= (ticket.rating ?? 0) ? '#F59E0B' : 'var(--border)'} strokeWidth={s <= (ticket.rating ?? 0) ? 0 : 1.5} />
            ))}
            <span style={{ fontSize: 13, color: 'var(--tm)', marginLeft: 4 }}>{ticket.rating}/3</span>
          </div>
          {ticket.ratingComment && (
            <p style={{ fontSize: 12, color: 'var(--ts)', margin: 0, fontStyle: 'italic' }}>"{ticket.ratingComment}"</p>
          )}
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 10px' }}>Oceń jakość obsługi</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            {[1, 2, 3].map(s => (
              <button key={s}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(0)}
                onClick={() => handleRate(s)}
                disabled={rateMut.isPending}
                style={{
                  background: 'none', border: 'none', padding: 2, cursor: 'pointer',
                  transform: hover === s ? 'scale(1.25)' : 'scale(1)', transition: 'transform 0.15s',
                }}>
                <Star size={26} fill={s <= (hover || 0) ? '#F59E0B' : 'none'} color={s <= (hover || 0) ? '#F59E0B' : 'var(--border)'} strokeWidth={s <= (hover || 0) ? 0 : 1.5} />
              </button>
            ))}
          </div>
          {!showComment ? (
            <button onClick={() => setShowComment(true)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Dodaj komentarz
            </button>
          ) : (
            <div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Opcjonalny komentarz..." rows={2}
                style={{ width: '100%', fontSize: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', resize: 'none', marginBottom: 8 }} />
              <p style={{ fontSize: 10, color: 'var(--td)', margin: 0 }}>Kliknij gwiazdkę aby ocenić</p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

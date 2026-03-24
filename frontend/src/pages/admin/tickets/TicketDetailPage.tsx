import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Lock } from 'lucide-react';
import { AttachmentGallery } from '../../../components/ui/AttachmentGallery';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { useAuth } from '../../../store/authStore';
import { formatDateTime, getInitials, getErrorMessage } from '../../../utils/helpers';
import type { TicketPriority } from '../../../types';

/** Splits description into {text, photoUrls} — photos are appended after the 📷 marker by the wizard */
function parseDescription(raw: string): { text: string; photoUrls: string } {
  const marker = '📷 Zrzuty ekranu:';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { text: raw, photoUrls: '' };
  const text = raw.slice(0, idx).trimEnd();
  const urlBlock = raw.slice(idx + marker.length).trim();
  const urls = urlBlock.split('\n').map(u => u.trim()).filter(Boolean).join(',');
  return { text, photoUrls: urls };
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', CRITICAL: 'Krytyczny',
};
const TYPE_LABELS: Record<string, string> = {
  INCIDENT: 'Incydent', REQUEST: 'Prośba', MAINTENANCE: 'Konserwacja',
  INSTALLATION: 'Instalacja', OTHER: 'Inne',
};
const SOURCE_LABELS: Record<string, string> = {
  CLIENT_PORTAL: 'Portal klienta', INTERNAL: 'Wewnętrzne', PHONE: 'Telefon',
  EMAIL: 'Email', QR_SCAN: 'Skan QR', AGENT: 'Agent systemowy',
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.getOne(id!),
    enabled: !!id,
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['users-staff-all'],
    queryFn: async () => {
      const [techs, admins] = await Promise.all([
        usersApi.getAll({ role: 'TECHNICIAN' }),
        usersApi.getAll({ role: 'ADMIN' }),
      ]);
      const merged = [...techs, ...admins];
      return merged.filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(id!, comment, isInternal),
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success('Komentarz dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => ticketsApi.cancel(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
      toast.success('Zgłoszenie anulowane');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const assignMutation = useMutation({
    mutationFn: () => ticketsApi.assign(id!, assignUserId),
    onSuccess: () => {
      setAssignUserId('');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success('Zgłoszenie przypisane');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!ticket) return <div className="text-sm text-gray-500">Nie znaleziono zgłoszenia</div>;

  const { text: descText, photoUrls } = parseDescription(ticket.description);
  const allPhotoUrls = [photoUrls, ticket.attachmentUrls].filter(Boolean).join(',');

  const isAdminOrTech = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';
  const isClient = user?.role === 'CLIENT';
  const comments = ticket.comments ?? [];
  const visibleComments = isClient ? comments.filter(c => !c.isInternal) : comments;

  return (
    <div>
      <PageHeader
        title={ticket.title}
        back="/tickets"
        subtitle={ticket.ticketNumber}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT - Comments */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Opis">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{descText}</p>
            {allPhotoUrls && <AttachmentGallery urls={allPhotoUrls} />}
          </Card>

          {ticket.resolutionSummary && (
            <Card title="Rozwiązanie">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.resolutionSummary}</p>
            </Card>
          )}

          {/* Comments */}
          <Card title={`Komentarze (${visibleComments.length})`}>
            <div className="space-y-4 mb-6">
              {visibleComments.length === 0 ? (
                <p className="text-sm text-gray-500">Brak komentarzy</p>
              ) : visibleComments.map(c => (
                <div
                  key={c.id}
                  className={`flex gap-3 ${c.isInternal ? 'bg-yellow-50 -mx-2 px-2 py-2 rounded-lg' : ''}`}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center">
                    {c.user ? getInitials(c.user.firstName, c.user.lastName) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Użytkownik'}
                      </span>
                      {c.isInternal && (
                        <span className="flex items-center gap-0.5 text-xs text-yellow-700 font-medium">
                          <Lock className="h-3 w-3" />
                          Wewnętrzne
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <div className="border-t border-gray-100 pt-4">
              <Textarea
                placeholder="Dodaj komentarz..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <div className="flex items-center justify-between mt-3">
                {isAdminOrTech && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    <Lock className="h-3.5 w-3.5 text-yellow-600" />
                    Notatka wewnętrzna
                  </label>
                )}
                {!isAdminOrTech && <div />}
                <Button
                  size="sm"
                  icon={<Send className="h-3.5 w-3.5" />}
                  onClick={() => commentMutation.mutate()}
                  loading={commentMutation.isPending}
                  disabled={!comment.trim()}
                >
                  Wyślij
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT - Details */}
        <div className="space-y-4">
          {/* Cancel ticket */}
          {isAdminOrTech && ticket.status !== 'CANCELLED' && ticket.status !== 'COMPLETED' && (
            <Card title="Akcje">
              <Button
                size="sm"
                variant="danger"
                className="w-full"
                onClick={() => {
                  if (confirm('Anulować zgłoszenie?')) cancelMutation.mutate();
                }}
                loading={cancelMutation.isPending}
              >
                Anuluj zgłoszenie
              </Button>
            </Card>
          )}

          {/* Assign */}
          {isAdminOrTech && (
            <Card title="Przypisz technika">
              <div className="space-y-2">
                <select
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Wybierz technika</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => assignMutation.mutate()}
                  loading={assignMutation.isPending}
                  disabled={!assignUserId}
                >
                  Przypisz
                </Button>
              </div>
            </Card>
          )}

          {/* Details */}
          <Card title="Szczegóły">
            <div className="space-y-3 text-sm">
              {[
                { label: 'Klient', value: ticket.client ? <Link to={`/clients/${ticket.client.id}`} className="text-indigo-600 hover:underline">{ticket.client.name}</Link> : null },
                { label: 'Lokalizacja', value: ticket.location?.name },
                { label: 'Urządzenie', value: ticket.device ? <Link to={`/devices/${ticket.device.id}`} className="text-indigo-600 hover:underline">{ticket.device.name}</Link> : null },
                { label: 'Typ', value: TYPE_LABELS[ticket.type] ?? ticket.type },
                { label: 'Priorytet', value: <PriorityBadge priority={ticket.priority} /> },
                { label: 'Źródło', value: SOURCE_LABELS[ticket.source] ?? ticket.source },
                { label: 'Zgłoszono', value: formatDateTime(ticket.reportedAt) },
                { label: 'Termin', value: ticket.dueAt ? formatDateTime(ticket.dueAt) : null },
                { label: 'Przypisany', value: ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : null },
                { label: 'Autor', value: ticket.createdBy ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}` : null },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-xs font-medium text-gray-500 w-24 flex-shrink-0 mt-0.5">{label}</span>
                  <span className="text-gray-800">{value}</span>
                </div>
              ) : null)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

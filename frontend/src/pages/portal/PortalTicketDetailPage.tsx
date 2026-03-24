import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { AttachmentGallery } from '../../components/ui/AttachmentGallery';

function parseDescription(raw: string): { text: string; photoUrls: string } {
  const marker = '📷 Zrzuty ekranu:';
  const idx = raw.indexOf(marker);
  if (idx === -1) return { text: raw, photoUrls: '' };
  const text = raw.slice(0, idx).trimEnd();
  const urls = raw.slice(idx + marker.length).trim().split('\n').map(u => u.trim()).filter(Boolean).join(',');
  return { text, photoUrls: urls };
}
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { formatDateTime, getInitials, getErrorMessage } from '../../utils/helpers';

export function PortalTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.getOne(id!),
    enabled: !!id,
  });

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(id!, comment, false),
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['tickets', id] });
      toast.success('Komentarz dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!ticket) return <p className="text-sm text-gray-500">Nie znaleziono zgłoszenia</p>;

  const { text: descText, photoUrls } = parseDescription(ticket.description);
  const allPhotoUrls = [photoUrls, ticket.attachmentUrls].filter(Boolean).join(',');
  const publicComments = (ticket.comments ?? []).filter(c => !c.isInternal);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={ticket.title}
        back="/portal/tickets"
        subtitle={ticket.ticketNumber}
        actions={
          <div className="flex gap-2">
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        }
      />

      <Card title="Opis zgłoszenia">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{descText}</p>
        {allPhotoUrls && <AttachmentGallery urls={allPhotoUrls} />}
        {ticket.resolutionSummary && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-500 mb-1">Rozwiązanie</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.resolutionSummary}</p>
          </div>
        )}
      </Card>

      <Card title="Szczegóły">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-xs text-gray-500">Lokalizacja</span><br />{ticket.location?.name}</div>
          {ticket.device && <div><span className="text-xs text-gray-500">Urządzenie</span><br />{ticket.device.name}</div>}
          <div><span className="text-xs text-gray-500">Zgłoszono</span><br />{formatDateTime(ticket.reportedAt)}</div>
          {ticket.assignedTo && <div><span className="text-xs text-gray-500">Technik</span><br />{ticket.assignedTo.firstName} {ticket.assignedTo.lastName}</div>}
        </div>
      </Card>

      <Card title={`Komentarze (${publicComments.length})`}>
        <div className="space-y-4 mb-5">
          {publicComments.length === 0 ? (
            <p className="text-sm text-gray-500">Brak komentarzy</p>
          ) : publicComments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {c.user ? getInitials(c.user.firstName, c.user.lastName) : '?'}
              </div>
              <div>
                <div className="flex gap-2 items-center mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Użytkownik'}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700">{c.comment}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <Textarea
            placeholder="Dodaj komentarz..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end mt-3">
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
  );
}

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
  if (!ticket) return <p className="text-sm" style={{ color: 'var(--tm)' }}>Nie znaleziono zgłoszenia</p>;

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
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{descText}</p>
        {allPhotoUrls && <AttachmentGallery urls={allPhotoUrls} secure />}
        {ticket.resolutionSummary && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--tm)' }}>Rozwiązanie</div>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{ticket.resolutionSummary}</p>
          </div>
        )}
      </Card>

      <Card title="Szczegóły">
        <div className="grid grid-cols-2 gap-3 text-sm" style={{ color: 'var(--t)' }}>
          <div><span className="text-xs" style={{ color: 'var(--tm)' }}>Lokalizacja</span><br />{ticket.location?.name ?? '—'}</div>
          {ticket.device && <div><span className="text-xs" style={{ color: 'var(--tm)' }}>Urządzenie</span><br />{ticket.device.name}</div>}
          <div><span className="text-xs" style={{ color: 'var(--tm)' }}>Zgłoszono</span><br />{formatDateTime(ticket.reportedAt)}</div>
          {ticket.assignedTo && <div><span className="text-xs" style={{ color: 'var(--tm)' }}>Technik</span><br />{ticket.assignedTo.firstName} {ticket.assignedTo.lastName}</div>}
        </div>
      </Card>

      <Card title={`Komentarze (${publicComments.length})`}>
        <div className="space-y-4 mb-5">
          {publicComments.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak komentarzy</p>
          ) : publicComments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                {c.user ? getInitials(c.user.firstName, c.user.lastName) : '?'}
              </div>
              <div>
                <div className="flex gap-2 items-center mb-1">
                  <span className="text-sm font-medium" style={{ color: 'var(--t)' }}>
                    {c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Użytkownik'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--td)' }}>{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-sm" style={{ color: 'var(--ts)' }}>{c.comment}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
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

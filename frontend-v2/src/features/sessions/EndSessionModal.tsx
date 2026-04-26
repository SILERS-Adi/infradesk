import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { cn } from '@/lib/utils';

interface Session {
  id: string;
  startedAt: string;
  device: { id: string; name: string } | null;
  ticketLinks: Array<{ ticketId: string; ticket: { ticketNumber: string; title: string; status: string } }>;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  deviceId: string | null;
}

interface EndSessionModalProps {
  session: Session;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Flow zgodny z project_end_session_flow.md:
 * - Pokazuje ticketу liked z sesją (zawsze zaznaczone)
 * - Dla device związanego z sesją pokazuje INNE otwarte tickety tego urządzenia
 *   (niezaznaczone → user zaznacza które też zamyka)
 * - Notes + billable toggle
 * - POST /sessions/:id/end z bulkCloseTicketIds
 */
export function EndSessionModal({ session, onClose, onSuccess }: EndSessionModalProps) {
  const [notes, setNotes] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [billable, setBillable] = useState(true);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(
    new Set(session.ticketLinks.map((l) => l.ticketId)),
  );

  // Fetch other open tickets on same device (if device linked).
  const { data: deviceTickets } = useQuery<{ items: Ticket[] }>({
    queryKey: ['sessions', session.id, 'device-tickets', session.device?.id],
    queryFn: async () => {
      if (!session.device?.id) return { items: [] };
      return (await api.get('/tickets', {
        params: { deviceId: session.device.id, status: 'OPEN,ASSIGNED,IN_PROGRESS,WAITING', limit: 20 },
      })).data;
    },
    enabled: !!session.device?.id,
  });

  // Combine linked + device-open, deduped.
  const linkedIds = new Set(session.ticketLinks.map((l) => l.ticketId));
  const allTickets: Array<{ ticketNumber: string; title: string; status: string; id: string; priority?: string; linkedToSession: boolean }> = [
    ...session.ticketLinks.map((l) => ({
      id: l.ticketId,
      ticketNumber: l.ticket.ticketNumber,
      title: l.ticket.title,
      status: l.ticket.status,
      linkedToSession: true,
    })),
    ...(deviceTickets?.items ?? []).filter((t) => !linkedIds.has(t.id)).map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      linkedToSession: false,
    })),
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      return (await api.post(`/sessions/${session.id}/end`, {
        notes: notes.trim() || undefined,
        billable,
        bulkCloseTicketIds: Array.from(checkedTickets),
        bulkResolutionSummary: resolutionSummary.trim() || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success(`Sesja zakończona${checkedTickets.size > 0 ? ` + ${checkedTickets.size} zgłoszenia zamknięte` : ''}`);
      onSuccess();
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd zakończenia sesji');
    },
  });

  const toggleTicket = (id: string) => {
    const next = new Set(checkedTickets);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCheckedTickets(next);
  };

  const elapsedMin = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60_000);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-2xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
              >
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <Dialog.Title className="text-[16px] font-bold text-tx">Zakończ sesję pracy</Dialog.Title>
                <p className="text-[11px] text-tx3">
                  {session.device ? `${session.device.name} · ` : ''}
                  <span className="tabular-nums">{elapsedMin} min</span> pracy
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">
            {/* Notes */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">
                Opis wykonanej pracy
              </label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Co zostało zrobione? (widoczne w raportach rozliczeń)"
              />
            </div>

            {/* Billable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="h-4 w-4 accent-[color:var(--pri)]"
              />
              <div>
                <p className="text-[13px] font-medium text-tx">Sesja rozliczana</p>
                <p className="text-[11px] text-tx3">Zaliczamy czas do faktury klienta</p>
              </div>
            </label>

            {/* Tickets to close */}
            {allTickets.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-2 text-tx2">
                  Które zgłoszenia rozwiązać?
                </label>
                <div className="space-y-2">
                  {allTickets.map((t) => {
                    const checked = checkedTickets.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-[var(--r-s)] border cursor-pointer transition-colors',
                          checked ? 'border-[var(--bd-f)] bg-sf-h' : 'border-bd hover:bg-sf-h',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTicket(t.id)}
                          className="mt-1 h-4 w-4 accent-[color:var(--pri)]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {t.priority && <PriorityDot priority={t.priority} />}
                            <span className="text-[11px] font-mono text-tx3">{t.ticketNumber}</span>
                            <StatusPill entity="ticket" value={t.status} />
                            {t.linkedToSession && <Badge variant="accent" className="text-[9px]">Sesja</Badge>}
                          </div>
                          <p className="text-[13px] text-tx font-medium truncate">{t.title}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Resolution summary */}
            {checkedTickets.size > 0 && (
              <div className="anim-up">
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">
                  Podsumowanie rozwiązania (dla {checkedTickets.size} {checkedTickets.size === 1 ? 'ticketu' : 'ticketów'})
                </label>
                <Textarea
                  rows={2}
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="Wspólne podsumowanie — klient to zobaczy"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-bd bg-sf-h rounded-b-[var(--r-xl)]">
            <p className="text-[11px] text-tx3">
              {checkedTickets.size > 0 && <><CheckCircle2 className="inline h-3 w-3 mr-1" />{checkedTickets.size} {checkedTickets.size === 1 ? 'ticket zostanie rozwiązany' : 'ticketów zostanie rozwiązanych'}</>}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>Anuluj</Button>
              <Button
                variant="success"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Zakończ sesję
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

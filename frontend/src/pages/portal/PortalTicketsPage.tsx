import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../../api/tickets';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { formatDate } from '../../utils/helpers';
import { Plus, Ticket, ChevronRight } from 'lucide-react';
import type { Ticket as ITicket } from '../../types';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  ...extra,
});

export function PortalTicketsPage() {
  const navigate = useNavigate();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets-portal'],
    queryFn: () => ticketsApi.getAll(),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>TICKETS</p>
          <h1 className="text-[22px] font-semibold text-white/90">Moje zgłoszenia</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{tickets.length} zgłoszeń</p>
        </div>
        <button
          onClick={() => navigate('/portal/new-request')}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)', boxShadow: '0 2px 10px rgba(234,88,12,0.2)' }}>
          <Plus className="h-4 w-4" />
          Nowe zgłoszenie
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-[18px] p-12 text-center" style={glass()}>
          <Ticket className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="text-[14px] mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak zgłoszeń</p>
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.15)' }}>Nie masz jeszcze żadnych zgłoszeń.</p>
        </div>
      ) : (
        <div className="rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[100px_1fr_140px_100px_100px_110px] gap-3 px-5 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {['Nr', 'Tytuł', 'Lokalizacja', 'Priorytet', 'Status', 'Data'].map(h => (
              <span key={h} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div>
            {tickets.map((t: ITicket) => (
              <div
                key={t.id}
                onClick={() => navigate(`/portal/tickets/${t.id}`)}
                className="grid grid-cols-1 md:grid-cols-[100px_1fr_140px_100px_100px_110px] gap-2 md:gap-3 px-5 py-3.5 cursor-pointer transition-all duration-150 hover:bg-white/[0.03]"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="text-[12px] font-mono" style={{ color: '#F97316' }}>{t.ticketNumber}</span>
                <div className="min-w-0">
                  <span className="text-[13px] font-medium text-white/80 truncate block">{t.title}</span>
                  <span className="text-[11px] md:hidden" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.location?.name}</span>
                </div>
                <span className="text-[12px] hidden md:block" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.location?.name ?? '—'}</span>
                <div><PriorityBadge priority={t.priority} /></div>
                <div><TicketStatusBadge status={t.status} /></div>
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatDate(t.reportedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

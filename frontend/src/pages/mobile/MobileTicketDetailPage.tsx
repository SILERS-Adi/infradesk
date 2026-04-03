// @ts-nocheck
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Send, Loader2, MapPin, Clock, User, Building2, UserPlus,
} from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import { usersApi } from '../../api/users';
import { useAuth } from '../../store/authStore';

const PRIORITY_MAP: Record<string, { label: string; bg: string; color: string }> = {
  CRITICAL: { label: 'Krytyczny', bg: 'rgba(239,68,68,0.2)', color: '#EF4444' },
  HIGH:     { label: 'Wysoki', bg: 'rgba(245,158,11,0.2)', color: '#F59E0B' },
  MEDIUM:   { label: 'Średni', bg: 'rgba(91,95,239,0.2)', color: '#818CF8' },
  LOW:      { label: 'Niski', bg: 'rgba(0,194,255,0.2)', color: '#00C2FF' },
};

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  PENDING:     { label: 'Oczekuje', bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' },
  ASSIGNED:    { label: 'Przypisane', bg: 'rgba(91,95,239,0.2)', color: '#818CF8' },
  IN_PROGRESS: { label: 'W trakcie', bg: 'rgba(0,194,255,0.2)', color: '#00C2FF' },
  COMPLETED:   { label: 'Zakończone', bg: 'rgba(34,197,94,0.2)', color: '#22C55E' },
  CANCELLED:   { label: 'Anulowane', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
};

export function MobileTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['mobile-ticket', id],
    queryFn: () => ticketsApi.getOne(id!),
    enabled: !!id,
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['users-staff-mobile'],
    queryFn: async () => {
      const [techs, admins] = await Promise.all([
        usersApi.getAll({ role: 'TECHNICIAN' }),
        usersApi.getAll({ role: 'ADMIN' }),
      ]);
      const merged = [...techs, ...admins];
      return merged.filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
    },
    enabled: showAssign,
  });

  const commentMutation = useMutation({
    mutationFn: () => ticketsApi.addComment(id!, comment, false),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['mobile-ticket', id] }); toast.success('Wiadomość wysłana'); },
    onError: () => toast.error('Błąd wysyłania'),
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) => ticketsApi.assign(id!, userId),
    onSuccess: () => {
      setShowAssign(false);
      setAssignUserId('');
      qc.invalidateQueries({ queryKey: ['mobile-ticket', id] });
      qc.invalidateQueries({ queryKey: ['mobile-my-tickets'] });
      qc.invalidateQueries({ queryKey: ['mobile-pending-tickets-all'] });
      toast.success('Zgłoszenie przypisane');
    },
    onError: () => toast.error('Błąd przypisywania'),
  });

  const assignToMe = useMutation({
    mutationFn: () => ticketsApi.assign(id!, user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-ticket', id] });
      qc.invalidateQueries({ queryKey: ['mobile-my-tickets'] });
      qc.invalidateQueries({ queryKey: ['mobile-pending-tickets-all'] });
      toast.success('Przypisano do Ciebie');
    },
    onError: () => toast.error('Błąd przypisywania'),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5B5FEF' }} /></div>;
  if (!ticket) return <div className="p-5 text-center" style={{ color: '#6B7280' }}>Nie znaleziono zgłoszenia</div>;

  const pr = PRIORITY_MAP[ticket.priority] ?? { label: ticket.priority, bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' };
  const st = STATUS_MAP[ticket.status] ?? { label: ticket.status, bg: 'rgba(107,114,128,0.2)', color: '#9CA3AF' };
  const isOpen = ticket.status !== 'COMPLETED' && ticket.status !== 'CANCELLED';

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:scale-95 transition-all duration-200"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ArrowLeft className="h-5 w-5" style={{ color: '#9CA3AF' }} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono" style={{ color: '#6B7280' }}>{ticket.ticketNumber}</span>
          <h1 className="text-base font-bold truncate" style={{ color: '#E5E7EB' }}>{ticket.title}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-4 space-y-4 overflow-y-auto">
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: pr.bg, color: pr.color }}>{pr.label}</span>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        </div>

        {/* Info */}
        <div className="space-y-2">
          {[
            { icon: Building2, label: 'Lokalizacja', value: ticket.location?.name },
            { icon: MapPin, label: 'Lokalizacja', value: ticket.location?.name },
            { icon: User, label: 'Technik', value: ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : null },
            { icon: Clock, label: 'Zgłoszono', value: new Date(ticket.reportedAt ?? ticket.createdAt).toLocaleString('pl-PL') },
          ].filter(i => i.value).map(item => (
            <div key={item.label} className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{ background: 'rgba(20,30,48,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <item.icon className="h-4 w-4 flex-shrink-0" style={{ color: '#6B7280' }} />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6B7280' }}>{item.label}</p>
                <p className="text-sm font-medium truncate" style={{ color: '#E5E7EB' }}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Description */}
        {ticket.description && (
          <div className="p-4 rounded-2xl" style={{ background: 'rgba(20,30,48,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>Opis</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#9CA3AF' }}>{ticket.description}</p>
          </div>
        )}

        {/* Actions: Assign */}
        {isOpen && (
          <div className="space-y-2.5">
            {/* Assign to me */}
            {!ticket.assignedToUserId && (
              <button onClick={() => assignToMe.mutate()} disabled={assignToMe.isPending}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff', boxShadow: '0 4px 20px rgba(91,95,239,0.3)' }}>
                {assignToMe.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <User className="h-5 w-5" />}
                Przypisz do mnie
              </button>
            )}

            {/* Assign to someone else */}
            <button onClick={() => setShowAssign(!showAssign)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all duration-200"
              style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}>
              <UserPlus className="h-4 w-4" />
              Przypisz technika
            </button>

            {showAssign && (
              <div className="p-4 rounded-2xl space-y-3"
                style={{ background: 'rgba(20,30,48,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                  className="w-full text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}>
                  <option value="">Wybierz technika</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                  ))}
                </select>
                <button onClick={() => assignUserId && assignMutation.mutate(assignUserId)}
                  disabled={!assignUserId || assignMutation.isPending}
                  className="w-full py-3 rounded-xl font-semibold text-sm active:scale-[0.97] transition-all duration-200 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff' }}>
                  {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Przypisz'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Comments */}
        {ticket.comments && ticket.comments.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B7280' }}>Komentarze</p>
            <div className="space-y-2">
              {ticket.comments.map((c: any) => (
                <div key={c.id} className="p-3.5 rounded-2xl"
                  style={{ background: 'rgba(20,30,48,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold" style={{ color: '#E5E7EB' }}>
                      {c.user?.firstName} {c.user?.lastName}
                    </span>
                    <span className="text-[10px]" style={{ color: '#6B7280' }}>
                      {new Date(c.createdAt).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: '#9CA3AF' }}>{c.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="px-5 pb-24 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && comment.trim() && commentMutation.mutate()}
            placeholder="Wiadomość do klienta..."
            className="flex-1 px-4 py-3 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.08)', color: '#E5E7EB' }}
          />
          <button
            onClick={() => comment.trim() && commentMutation.mutate()}
            disabled={!comment.trim() || commentMutation.isPending}
            className="px-4 py-3 rounded-2xl active:scale-95 transition-all duration-200 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #5B5FEF, #4338CA)' }}>
            {commentMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Send className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

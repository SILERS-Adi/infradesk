import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw, Loader2, UserPlus, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../store/authStore';
import { ticketsApi } from '../../api/tickets';
import { usersApi } from '../../api/users';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#5B5FEF', LOW: '#00C2FF',
};

type Tab = 'pending' | 'assigned' | 'completed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Oczekujące' },
  { key: 'assigned', label: 'Przydzielone' },
  { key: 'completed', label: 'Zakończone' },
];

export function MobileTicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');

  const statusParam = tab === 'pending' ? 'PENDING' : tab === 'assigned' ? 'ASSIGNED' : 'COMPLETED';

  const { data: tickets = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mobile-tickets', tab],
    queryFn: () => ticketsApi.getAll({ status: statusParam, limit: 50 }),
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['users-staff-mobile-list'],
    queryFn: async () => {
      const [techs, admins] = await Promise.all([
        usersApi.getAll({ role: 'TECHNICIAN' }),
        usersApi.getAll({ role: 'ADMIN' }),
      ]);
      return [...techs, ...admins].filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i);
    },
    enabled: tab === 'pending',
  });

  const assignMutation = useMutation({
    mutationFn: ({ ticketId, userId }: { ticketId: string; userId: string }) =>
      ticketsApi.assign(ticketId, userId),
    onSuccess: () => {
      setAssigningId(null);
      setAssignUserId('');
      qc.invalidateQueries({ queryKey: ['mobile-tickets'] });
      qc.invalidateQueries({ queryKey: ['mobile-pending-tickets-all'] });
      toast.success('Przydzielono');
    },
    onError: () => toast.error('Błąd przydzielania'),
  });

  const assignToMe = useMutation({
    mutationFn: (ticketId: string) => ticketsApi.assign(ticketId, user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-tickets'] });
      qc.invalidateQueries({ queryKey: ['mobile-pending-tickets-all'] });
      toast.success('Przydzielono do Ciebie');
    },
    onError: () => toast.error('Błąd'),
  });

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>Zgłoszenia</h1>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2.5 rounded-xl active:scale-95 transition-all duration-200"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#5B5FEF' }} />
            : <RefreshCw className="h-4 w-4" style={{ color: '#6B7280' }} />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
            style={tab === t.key
              ? { background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff', boxShadow: '0 0 20px rgba(91,95,239,0.25)' }
              : { background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280' }
            }>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5B5FEF' }} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: '#6B7280' }}>Brak zgłoszeń</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tickets.map(t => (
            <div key={t.id} className="rounded-[18px] overflow-hidden"
              style={{ background: 'rgba(20, 30, 48, 0.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.06)' }}>

              {/* Ticket info — tap to open detail */}
              <button onClick={() => navigate(`/m/tickets/${t.id}`)}
                className="w-full flex items-center gap-3 p-4 text-left active:opacity-80 transition-opacity">
                <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[t.priority] ?? '#5B5FEF' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-mono" style={{ color: '#6B7280' }}>{t.ticketNumber}</span>
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: '#E5E7EB' }}>{t.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs truncate" style={{ color: '#6B7280' }}>{t.location?.name || '—'}</span>
                    {/* Show assigned tech on "Przydzielone" tab */}
                    {tab === 'assigned' && t.assignedTo && (
                      <>
                        <span style={{ color: '#4B5563' }}>·</span>
                        <span className="text-xs flex items-center gap-1" style={{ color: '#818CF8' }}>
                          <User className="h-3 w-3" />
                          {t.assignedTo.firstName} {t.assignedTo.lastName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#4B5563' }} />
              </button>

              {/* Assign actions — only on "Oczekujące" tab */}
              {tab === 'pending' && (
                <div className="px-4 pb-3">
                  {assigningId === t.id ? (
                    <div className="space-y-2">
                      <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                        className="w-full text-sm px-3 py-2.5 rounded-xl focus:outline-none"
                        style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}>
                        <option value="">Wybierz technika</option>
                        {technicians.map(tech => (
                          <option key={tech.id} value={tech.id}>{tech.firstName} {tech.lastName}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={() => assignUserId && assignMutation.mutate({ ticketId: t.id, userId: assignUserId })}
                          disabled={!assignUserId || assignMutation.isPending}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold active:scale-[0.97] transition-all disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff' }}>
                          {assignMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Przydziel'}
                        </button>
                        <button onClick={() => { setAssigningId(null); setAssignUserId(''); }}
                          className="px-4 py-2.5 rounded-xl text-xs font-semibold"
                          style={{ background: 'rgba(107,114,128,0.15)', color: '#6B7280' }}>
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => assignToMe.mutate(t.id)} disabled={assignToMe.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff', boxShadow: '0 0 12px rgba(91,95,239,0.2)' }}>
                        <User className="h-3.5 w-3.5" /> Weź do siebie
                      </button>
                      <button onClick={() => setAssigningId(t.id)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold active:scale-[0.97] transition-all"
                        style={{ background: 'rgba(20,30,48,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF' }}>
                        <UserPlus className="h-3.5 w-3.5" /> Przydziel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

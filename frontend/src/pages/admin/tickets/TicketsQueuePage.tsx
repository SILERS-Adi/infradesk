// @ts-nocheck
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Bot, Globe, Phone, Mail, QrCode, Inbox, UserCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import type { Ticket, User } from '../../../types';

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  AGENT:         { label: 'Agent',   icon: <Bot className="h-3 w-3" />,    bg: 'rgba(139,92,246,0.12)',  color: '#A78BFA' },
  CLIENT_PORTAL: { label: 'Portal',  icon: <Globe className="h-3 w-3" />,  bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  PHONE:         { label: 'Telefon', icon: <Phone className="h-3 w-3" />,  bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  EMAIL:         { label: 'E-mail',  icon: <Mail className="h-3 w-3" />,   bg: 'rgba(245,158,11,0.12)',  color: '#FBBF24' },
  QR_SCAN:       { label: 'QR',      icon: <QrCode className="h-3 w-3" />, bg: 'var(--hover-bg)', color: 'var(--ts)' },
  INTERNAL:      { label: 'Wewnątr.', icon: null,                           bg: 'var(--hover-bg)', color: 'var(--ts)' },
};

function timeAgo(date: string): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)   return `${diff}s temu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
  return `${Math.floor(diff / 86400)} dni temu`;
}

const PRIORITY_BORDER: Record<string, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-400',
  MEDIUM:   'border-l-yellow-400',
  LOW:      'border-l-blue-300',
};

function TicketCard({ ticket, technicians }: { ticket: Ticket; technicians: User[] }) {
  const qc = useQueryClient();
  const [assigning, setAssigning] = useState(false);
  const navigate = useNavigate();

  const assignMutation = useMutation({
    mutationFn: (userId: string) => ticketsApi.assign(ticket.id, userId),
    onSuccess: () => {
      toast.success('Zgłoszenie przydzielone');
      qc.invalidateQueries({ queryKey: ['tickets-queue'] });
    },
    onError: () => toast.error('Błąd przydzielenia'),
  });

  const src = SOURCE_LABELS[ticket.source] ?? SOURCE_LABELS.INTERNAL;
  const border = PRIORITY_BORDER[ticket.priority] ?? 'border-l-gray-600';

  return (
    <div className={`rounded-xl border-l-4 ${border} p-4 flex flex-col gap-3`} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeftWidth: '4px' }}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-violet-400 font-semibold">{ticket.ticketNumber}</span>
            <PriorityBadge priority={ticket.priority} />
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: src.bg, color: src.color }}
            >
              {src.icon}{src.label}
            </span>
          </div>
          <button
            onClick={() => navigate(`/tickets/${ticket.id}`)}
            className="text-sm font-semibold text-white/85 hover:text-violet-400 text-left line-clamp-2 transition-colors"
          >
            {ticket.title}
          </button>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs flex items-center gap-1" style={{ color: 'var(--tm)' }}>
            <Clock className="h-3 w-3" />
            {timeAgo(ticket.createdAt)}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--tm)' }}>
        <span className="font-medium" style={{ color: 'var(--ts)' }}>{ticket.location?.name ?? '—'}</span>
        {ticket.device && <span>🖥 {ticket.device.name}</span>}
        {ticket.description && (
          <span className="truncate max-w-xs" style={{ color: 'var(--tm)' }}>{ticket.description.substring(0, 80)}…</span>
        )}
      </div>

      {/* Assign */}
      <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <UserCheck className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--tm)' }} />
        {assigning ? (
          <select
            autoFocus
            className="flex-1 text-sm rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
            defaultValue=""
            onBlur={() => setAssigning(false)}
            onChange={e => {
              if (e.target.value) {
                assignMutation.mutate(e.target.value);
                setAssigning(false);
              }
            }}
          >
            <option value="" disabled>Wybierz pracownika…</option>
            {technicians.map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAssigning(true)}
            disabled={assignMutation.isPending}
            className="text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            {assignMutation.isPending ? 'Przydzielam…' : 'Przydziel pracownika'}
          </button>
        )}
      </div>
    </div>
  );
}

export function TicketsQueuePage() {
  const { data: tickets = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tickets-queue'],
    queryFn: () => ticketsApi.getAll({ status: 'NEW', unassigned: true }),
    refetchInterval: 30_000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });

  const technicians = allUsers.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  const sorted = [...tickets].sort((a, b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pd !== 0) return pd;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white/85 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-violet-400" />
            Poczekalnia zgłoszeń
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--tm)' }}>
            Nowe zgłoszenia bez przydzielonego pracownika
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tickets.length > 0 && (
            <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
              {tickets.length} oczekuje
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg transition-colors hover:text-violet-400 hover:bg-white/[0.03]"
            style={{ color: 'var(--tm)' }}
            title="Odśwież"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48" style={{ color: 'var(--tm)' }}>Ładowanie…</div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)' }}>
          <Inbox className="h-12 w-12 mb-3" style={{ color: 'var(--td)' }} />
          <p className="font-medium" style={{ color: 'var(--tm)' }}>Brak oczekujących zgłoszeń</p>
          <p className="text-sm mt-1" style={{ color: 'var(--tm)' }}>Wszystkie nowe zgłoszenia zostały przydzielone</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} technicians={technicians} />
          ))}
        </div>
      )}
    </div>
  );
}

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

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  AGENT:         { label: 'Agent',   icon: <Bot className="h-3 w-3" />,    cls: 'bg-violet-100 text-violet-700' },
  CLIENT_PORTAL: { label: 'Portal',  icon: <Globe className="h-3 w-3" />,  cls: 'bg-blue-100 text-blue-700' },
  PHONE:         { label: 'Telefon', icon: <Phone className="h-3 w-3" />,  cls: 'bg-green-100 text-green-700' },
  EMAIL:         { label: 'E-mail',  icon: <Mail className="h-3 w-3" />,   cls: 'bg-amber-100 text-amber-700' },
  QR_SCAN:       { label: 'QR',      icon: <QrCode className="h-3 w-3" />, cls: 'bg-gray-100 text-gray-600' },
  INTERNAL:      { label: 'Wewnątr.', icon: null,                           cls: 'bg-gray-100 text-gray-600' },
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
  const border = PRIORITY_BORDER[ticket.priority] ?? 'border-l-gray-300';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${border} p-4 flex flex-col gap-3`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-indigo-600 font-semibold">{ticket.ticketNumber}</span>
            <PriorityBadge priority={ticket.priority} />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${src.cls}`}>
              {src.icon}{src.label}
            </span>
          </div>
          <button
            onClick={() => navigate(`/tickets/${ticket.id}`)}
            className="text-sm font-semibold text-gray-900 hover:text-indigo-600 text-left line-clamp-2"
          >
            {ticket.title}
          </button>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(ticket.createdAt)}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        <span className="font-medium text-gray-700">{ticket.client?.name ?? '—'}</span>
        {ticket.device && <span>🖥 {ticket.device.name}</span>}
        {ticket.description && (
          <span className="truncate max-w-xs text-gray-400">{ticket.description.substring(0, 80)}…</span>
        )}
      </div>

      {/* Assign */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <UserCheck className="h-4 w-4 text-gray-400 flex-shrink-0" />
        {assigning ? (
          <select
            autoFocus
            className="flex-1 text-sm border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
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

  const technicians = allUsers.filter(u => u.role !== 'CLIENT' && u.isActive);

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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-indigo-500" />
            Poczekalnia zgłoszeń
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Nowe zgłoszenia bez przydzielonego pracownika
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tickets.length > 0 && (
            <span className="bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
              {tickets.length} oczekuje
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Odśwież"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Ładowanie…</div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
          <Inbox className="h-12 w-12 mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Brak oczekujących zgłoszeń</p>
          <p className="text-sm mt-1">Wszystkie nowe zgłoszenia zostały przydzielone</p>
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

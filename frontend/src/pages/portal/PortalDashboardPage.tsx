import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MapPin, Monitor, Ticket, Plus } from 'lucide-react';
import { dashboardApi } from '../../api/dashboard';
import { useAuth } from '../../store/authStore';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { formatDate } from '../../utils/helpers';
import type { Ticket as ITicket } from '../../types';

export function PortalDashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-client'],
    queryFn: dashboardApi.getClientStats,
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Witaj, {user?.firstName}!</h1>
        <p className="text-sm text-gray-500 mt-0.5">{user?.client?.name} · Portal klienta</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Moje lokalizacje', value: stats?.myLocations ?? 0, icon: <MapPin className="h-5 w-5 text-indigo-600" />, bg: 'bg-indigo-50', to: '/portal/locations' },
          { label: 'Moje urządzenia', value: stats?.myDevices ?? 0, icon: <Monitor className="h-5 w-5 text-violet-600" />, bg: 'bg-violet-50', to: '/portal/devices' },
          { label: 'Otwarte zgłoszenia', value: stats?.openTickets ?? 0, icon: <Ticket className="h-5 w-5 text-orange-600" />, bg: 'bg-orange-50', to: '/portal/tickets' },
        ].map(card => (
          <Link key={card.label} to={card.to} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4 hover:border-indigo-200 transition-colors">
            <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${card.bg}`}>
              {card.icon}
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-sm text-gray-500">{card.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Ostatnie zgłoszenia</h2>
          <Link to="/portal/tickets" className="text-xs text-indigo-600 hover:underline">Zobacz wszystkie</Link>
        </div>
        {stats?.recentTickets?.length ? (
          <div className="space-y-3">
            {stats.recentTickets.slice(0, 5).map((t: ITicket) => (
              <Link
                key={t.id}
                to={`/portal/tickets/${t.id}`}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded"
              >
                <div>
                  <div className="text-xs font-mono text-indigo-600">{t.ticketNumber}</div>
                  <div className="text-sm text-gray-800">{t.title}</div>
                  <div className="text-xs text-gray-500">{formatDate(t.reportedAt)}</div>
                </div>
                <div className="flex gap-2">
                  <PriorityBadge priority={t.priority} />
                  <TicketStatusBadge status={t.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Brak zgłoszeń</p>
        )}
      </div>

      <Link
        to="/portal/new-request"
        className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
      >
        <Plus className="h-5 w-5" />
        Utwórz nowe zgłoszenie
      </Link>
    </div>
  );
}

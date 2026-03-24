import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, MapPin, Monitor, Ticket, AlertTriangle, Clock, Plus, Inbox
} from 'lucide-react';
import { dashboardApi } from '../../api/dashboard';
import { useAuth } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { Button } from '../../components/ui/Button';
import { formatDate } from '../../utils/helpers';
import type { Ticket as ITicket, Device } from '../../types';

function StatCard({
  label, value, icon, color, to,
}: {
  label: string;
  value: number | undefined;
  icon: React.ReactNode;
  color: string;
  to?: string;
}) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4 ${to ? 'hover:border-indigo-200 transition-colors' : ''}`}>
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value ?? '—'}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
  if (to) return <Link to={to}>{content}</Link>;
  return content;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.getStats,
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Dzień dobry, {user?.firstName}!
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Przegląd systemu InfraDesk</p>
        </div>
        <div className="flex gap-3">
          <Link to="/clients">
            <Button variant="secondary" size="sm" icon={<Building2 className="h-4 w-4" />}>
              Nowy klient
            </Button>
          </Link>
          <Link to="/tickets">
            <Button size="sm" icon={<Plus className="h-4 w-4" />}>
              Nowe zgłoszenie
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Klienci"
          value={stats?.totalClients}
          icon={<Building2 className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50"
          to="/clients"
        />
        <StatCard
          label="Lokalizacje"
          value={stats?.totalLocations}
          icon={<MapPin className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-50"
          to="/locations"
        />
        <StatCard
          label="Urządzenia"
          value={stats?.totalDevices}
          icon={<Monitor className="h-5 w-5 text-violet-600" />}
          color="bg-violet-50"
          to="/devices"
        />
        <StatCard
          label="Otwarte zgłoszenia"
          value={stats?.openTickets}
          icon={<Ticket className="h-5 w-5 text-orange-600" />}
          color="bg-orange-50"
          to="/tickets"
        />
        <StatCard
          label="Oczekujące"
          value={stats?.unassignedTickets}
          icon={<Inbox className="h-5 w-5 text-red-600" />}
          color="bg-red-50"
          to="/tickets/queue"
        />
        <StatCard
          label="Przeterminowane"
          value={stats?.overdueTickets}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          color="bg-amber-50"
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Ostatnie zgłoszenia" action={<Link to="/tickets" className="text-xs text-indigo-600 hover:underline">Zobacz wszystkie</Link>}>
          <div className="space-y-3">
            {stats?.recentTickets?.length ? (
              stats.recentTickets.slice(0, 6).map((t: ITicket) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-indigo-600 font-mono">{t.ticketNumber}</div>
                    <div className="text-sm font-medium text-gray-800 truncate">{t.title}</div>
                    <div className="text-xs text-gray-500">{t.client?.name}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <PriorityBadge priority={t.priority} />
                    <TicketStatusBadge status={t.status} />
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Brak zgłoszeń</p>
            )}
          </div>
        </Card>

        <Card title="Ostatnie urządzenia" action={<Link to="/devices" className="text-xs text-indigo-600 hover:underline">Zobacz wszystkie</Link>}>
          <div className="space-y-3">
            {stats?.recentDevices?.length ? (
              stats.recentDevices.slice(0, 6).map((d: Device) => (
                <Link
                  key={d.id}
                  to={`/devices/${d.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{d.name}</div>
                    <div className="text-xs text-gray-500">{d.client?.name} · {d.location?.name}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0 text-xs text-gray-500">
                    <span className="font-mono">{d.ipAddress || '—'}</span>
                    <span className="text-gray-300">|</span>
                    <span>{formatDate(d.createdAt)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Brak urządzeń</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

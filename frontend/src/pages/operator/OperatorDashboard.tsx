import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Ticket, Monitor, Bell, Clock } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { KpiCard } from '../../components/ui/KpiCard';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { PageHeader } from '../../components/ui/PageHeader';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import type { TicketStatus, TicketPriority } from '../../types';
import type { OperatorTicket } from '../../api/operator';

export default function OperatorDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['operator', 'stats'],
    queryFn: operatorApi.getStats,
    refetchInterval: 30_000,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['operator', 'tickets', 'recent'],
    queryFn: () => operatorApi.getTickets({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const ticketColumns: Column<OperatorTicket>[] = [
    { key: 'ticketNumber', header: 'Numer', render: (r) => (
      <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.ticketNumber}</span>
    )},
    { key: 'title', header: 'Tytuł', render: (r) => (
      <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.title}</span>
    )},
    { key: 'client', header: 'Klient', render: (r) => r.clientWorkspaceName ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <TicketStatusBadge status={r.status as TicketStatus} /> },
    { key: 'priority', header: 'Priorytet', render: (r) => <PriorityBadge priority={r.priority as TicketPriority} /> },
    { key: 'createdAt', header: 'Data', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  if (statsLoading) return <LoadingSpinner />;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Centrum Operacyjne" subtitle="Przegląd wszystkich klientów i zgłoszeń" />

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <KpiCard
          label="Klienci"
          value={String(stats?.totalClients ?? 0)}
          icon={<Building2 size={20} color="#fff" />}
          color="#6366F1"
          onClick={() => navigate('/operator/clients')}
        />
        <KpiCard
          label="Zgłoszenia"
          value={String(stats?.totalTickets ?? 0)}
          sub={`${stats?.pendingTickets ?? 0} oczekujących`}
          icon={<Ticket size={20} color="#fff" />}
          color="#F59E0B"
          onClick={() => navigate('/operator/tickets')}
        />
        <KpiCard
          label="Urządzenia"
          value={String(stats?.totalDevices ?? 0)}
          icon={<Monitor size={20} color="#fff" />}
          color="#22C55E"
          onClick={() => navigate('/operator/devices')}
        />
        <KpiCard
          label="Alerty"
          value={String(stats?.activeAlerts ?? 0)}
          icon={<Bell size={20} color="#fff" />}
          color="#EF4444"
        />
      </div>

      {/* Recent Tickets */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Ostatnie zgłoszenia
          </h3>
          <button
            onClick={() => navigate('/operator/tickets')}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Zobacz wszystkie
          </button>
        </div>
        <DataTable
          columns={ticketColumns}
          data={ticketsData?.tickets ?? []}
          loading={ticketsLoading}
          onRowClick={(t) => navigate(`/tickets/${t.id}`)}
          keyExtractor={(t) => t.id}
          emptyTitle="Brak zgłoszeń"
          emptyDescription="Nie ma jeszcze żadnych zgłoszeń od klientów"
        />
      </div>

      {/* Client Summary */}
      {!clientsLoading && clients && clients.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={16} /> Klienci
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {clients.map(c => (
              <div
                key={c.id}
                className="page-card"
                style={{ padding: 16, cursor: 'pointer' }}
                onClick={() => navigate(`/operator/clients`)}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)', marginBottom: 8 }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--tm)' }}>
                  <span>{c.ticketCount} zgłoszeń</span>
                  <span>{c.deviceCount} urządzeń</span>
                  <span>{c.userCount} użytkowników</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

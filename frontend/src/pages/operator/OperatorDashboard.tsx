import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Ticket, Monitor, Bot, Clock, AlertTriangle } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { KpiCard } from '../../components/ui/KpiCard';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import type { TicketStatus, TicketPriority } from '../../types';
import type { OperatorTicket } from '../../api/operator';

export default function OperatorDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['operator', 'stats'],
    queryFn: operatorApi.getStats,
    refetchInterval: 30_000,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['operator', 'tickets', 'recent'],
    queryFn: () => operatorApi.getTickets({ per_page: 10 }),
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
    { key: 'client', header: 'Klient', render: (r) => r.workspace?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <TicketStatusBadge status={r.status as TicketStatus} /> },
    { key: 'priority', header: 'Priorytet', render: (r) => <PriorityBadge priority={r.priority as TicketPriority} /> },
    { key: 'createdAt', header: 'Data', render: (r) => new Date(r.createdAt).toLocaleDateString('pl') },
  ];

  if (statsLoading) return <LoadingSpinner />;

  if (statsError) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Centrum Operacyjne" subtitle="Przegląd wszystkich klientów i zgłoszeń" />
        <div className="page-card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>Nie udało się załadować danych</p>
          <p style={{ fontSize: 12, color: 'var(--tm)' }}>Sprawdź czy Twój workspace jest skonfigurowany jako Centrum Obsługi IT</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Centrum Operacyjne" subtitle="Przegląd wszystkich klientów i zgłoszeń" />

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <KpiCard
          label="Klienci"
          value={String(stats?.clientCount ?? 0)}
          icon={<Building2 size={20} color="#fff" />}
          color="#6366F1"
          onClick={() => navigate('/operator/clients')}
        />
        <KpiCard
          label="Zgłoszenia"
          value={String(stats?.ticketCount ?? 0)}
          sub={`${stats?.activeTickets ?? 0} aktywnych`}
          icon={<Ticket size={20} color="#fff" />}
          color="#F59E0B"
          onClick={() => navigate('/operator/tickets')}
        />
        <KpiCard
          label="Urządzenia"
          value={String(stats?.deviceCount ?? 0)}
          icon={<Monitor size={20} color="#fff" />}
          color="#22C55E"
          onClick={() => navigate('/operator/devices')}
        />
        <KpiCard
          label="Agenty"
          value={String(stats?.agentCount ?? 0)}
          icon={<Bot size={20} color="#fff" />}
          color="#8B5CF6"
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
          data={ticketsData?.data ?? []}
          loading={ticketsLoading}
          onRowClick={(t) => navigate(`/tickets/${t.id}`)}
          keyExtractor={(t) => t.id}
          emptyTitle="Brak zgłoszeń"
          emptyDescription="Nie ma jeszcze żadnych zgłoszeń od klientów"
        />
      </div>

      {/* Client Summary */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={16} /> Klienci
        </h3>
        {clientsLoading ? (
          <LoadingSpinner />
        ) : !clients || clients.length === 0 ? (
          <EmptyState
            title="Brak klientów"
            description="Dodaj pierwszego klienta w sekcji Klienci"
            action={<button className="btn-primary" onClick={() => navigate('/operator/clients')}>Dodaj klienta</button>}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {clients.map(c => (
              <div
                key={c.id}
                className="page-card"
                style={{ padding: 16, cursor: 'pointer' }}
                onClick={() => navigate('/operator/clients')}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)', marginBottom: 8 }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--tm)' }}>
                  <span>{c.ticketCount} zgłoszeń</span>
                  <span>{c.deviceCount} urządzeń</span>
                  <span>{c.activeTickets} aktywnych</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

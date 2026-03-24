import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/dashboard';
import { ticketsApi } from '../../api/tickets';
import { useAuth } from '../../store/authStore';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function TvDashboardPage() {
  const { user } = useAuth();
  const now = useClock();

  const { data: stats, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-tv'],
    queryFn: () => dashboardApi.getStats(),
    refetchInterval: 30_000,
  });

  const { data: pendingTickets = [] } = useQuery({
    queryKey: ['tickets-tv-pending'],
    queryFn: () => ticketsApi.getAll({ status: 'PENDING', limit: 8 }),
    refetchInterval: 30_000,
  });

  const { data: assignedTickets = [] } = useQuery({
    queryKey: ['tickets-tv-assigned'],
    queryFn: () => ticketsApi.getAll({ status: 'ASSIGNED', limit: 8 }),
    refetchInterval: 30_000,
  });

  const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—';

  const bigStats = [
    { label: 'Otwarte zgłoszenia', value: stats?.openTickets ?? '—', color: '#6366f1', pulse: (stats?.openTickets ?? 0) > 0 },
    { label: 'Przeterminowane', value: stats?.overdueTickets ?? '—', color: '#ef4444', pulse: (stats?.overdueTickets ?? 0) > 0 },
    { label: 'Nieprzypisane', value: stats?.unassignedTickets ?? '—', color: '#f97316', pulse: (stats?.unassignedTickets ?? 0) > 0 },
    { label: 'Klienci', value: stats?.totalClients ?? '—', color: '#22c55e', pulse: false },
    { label: 'Urządzenia', value: stats?.totalDevices ?? '—', color: '#06b6d4', pulse: false },
    { label: 'Lokalizacje', value: stats?.totalLocations ?? '—', color: '#a78bfa', pulse: false },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #0a0a14 50%, #0d0d1f 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      padding: '32px 48px',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src="/logo.png" alt="InfraDesk" style={{ height: 48, objectFit: 'contain' }} />
          <div style={{ width: 1, height: 40, background: '#2d2d4e' }} />
          <div style={{ fontSize: 18, color: '#94a3b8' }}>
            Panel monitoringu • {user?.firstName} {user?.lastName}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: 2, color: '#f1f5f9', lineHeight: 1 }}>
            {timeStr}
          </div>
          <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 4, textTransform: 'capitalize' }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* BIG STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 32 }}>
        {bigStats.map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${s.color}33`,
            borderRadius: 20,
            padding: '24px 16px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {s.pulse && typeof s.value === 'number' && s.value > 0 && (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                width: 10, height: 10, borderRadius: '50%',
                background: s.color,
                boxShadow: `0 0 0 0 ${s.color}`,
                animation: 'pulse 2s infinite',
              }} />
            )}
            <div style={{
              fontSize: 56,
              fontWeight: 800,
              color: s.color,
              lineHeight: 1,
              textShadow: `0 0 30px ${s.color}66`,
            }}>
              {s.value}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* TICKETS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, flex: 1 }}>

        {/* PENDING */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2d2d4e', borderRadius: 20, padding: 24, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Oczekujące zgłoszenia</span>
            <span style={{ marginLeft: 'auto', background: '#f59e0b22', color: '#f59e0b', borderRadius: 20, padding: '2px 12px', fontSize: 14, fontWeight: 700 }}>
              {pendingTickets.length}
            </span>
          </div>
          <TicketList tickets={pendingTickets} />
        </div>

        {/* ASSIGNED */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2d2d4e', borderRadius: 20, padding: 24, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1' }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>W realizacji</span>
            <span style={{ marginLeft: 'auto', background: '#6366f122', color: '#6366f1', borderRadius: 20, padding: '2px 12px', fontSize: 14, fontWeight: 700 }}>
              {assignedTickets.length}
            </span>
          </div>
          <TicketList tickets={assignedTickets} />
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569', fontSize: 13 }}>
        <span>InfraDesk MSP • infradesk.pl</span>
        <span>Ostatnia aktualizacja: {lastUpdate} • odświeżanie co 30s</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70%  { box-shadow: 0 0 0 8px transparent; opacity: 0.7; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function TicketList({ tickets }: { tickets: any[] }) {
  if (tickets.length === 0) {
    return <div style={{ color: '#475569', fontSize: 16, textAlign: 'center', marginTop: 40 }}>Brak zgłoszeń</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tickets.map(t => (
        <div key={t.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 12,
          borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] ?? '#6366f1'}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {t.client?.name} {t.location?.name ? `• ${t.location.name}` : ''}
              {t.assignedTo ? ` • ${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{t.ticketNumber}</div>
        </div>
      ))}
    </div>
  );
}

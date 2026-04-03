import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/dashboard';
import { ticketsApi } from '../../api/tickets';
import { agentsApi } from '../../api/agents';
import type { AgentRegistration } from '../../api/agents';
import { tasksApi } from '../../api/tasks';
import { sessionsApi } from '../../api/sessions';
import { useAuth } from '../../store/authStore';

/* ─── constants ─────────────────────────────────────────────────────────── */

const REFRESH_MS = 20_000;

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Oczekujące',
  ASSIGNED: 'Przypisane',
  COMPLETED: 'Zamknięte',
  CANCELLED: 'Anulowane',
  NEW: 'Nowe',
  IN_PROGRESS: 'W toku',
  DONE: 'Gotowe',
  ACTIVE: 'Aktywna',
  PAUSED: 'Pauza',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  ASSIGNED: '#6366f1',
  COMPLETED: '#22c55e',
  CANCELLED: '#64748b',
  NEW: '#38bdf8',
  IN_PROGRESS: '#6366f1',
  DONE: '#22c55e',
  ACTIVE: '#22c55e',
  PAUSED: '#f59e0b',
};

/* ─── hooks ─────────────────────────────────────────────────────────────── */

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'teraz';
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h temu`;
  const d = Math.floor(h / 24);
  return `${d}d temu`;
}

function formatDuration(startedAt: string, pausedMin?: number): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  const net = elapsed - (pausedMin ?? 0);
  const h = Math.floor(net / 60);
  const m = net % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function agentIsOnline(a: AgentRegistration): boolean {
  if (!a.lastSeen) return false;
  return Date.now() - new Date(a.lastSeen).getTime() < 5 * 60_000;
}

function cpuColor(pct: number): string {
  if (pct > 90) return '#ef4444';
  if (pct > 70) return '#f97316';
  if (pct > 50) return '#eab308';
  return '#22c55e';
}

function ramColor(pct: number): string {
  if (pct > 90) return '#ef4444';
  if (pct > 75) return '#f97316';
  if (pct > 50) return '#eab308';
  return '#22c55e';
}

/* ─── main component ────────────────────────────────────────────────────── */

export function TvDashboardPage() {
  const { user } = useAuth();
  const now = useClock();

  // Data queries
  const { data: stats, dataUpdatedAt } = useQuery({
    queryKey: ['tv-dashboard'],
    queryFn: () => dashboardApi.getStats(),
    refetchInterval: REFRESH_MS,
  });

  const { data: pendingTickets = [] } = useQuery({
    queryKey: ['tv-tickets-pending'],
    queryFn: () => ticketsApi.getAll({ status: 'PENDING', limit: 6 }),
    refetchInterval: REFRESH_MS,
  });

  const { data: assignedTickets = [] } = useQuery({
    queryKey: ['tv-tickets-assigned'],
    queryFn: () => ticketsApi.getAll({ status: 'ASSIGNED', limit: 6 }),
    refetchInterval: REFRESH_MS,
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['tv-agents'],
    queryFn: () => agentsApi.getAll(),
    refetchInterval: REFRESH_MS,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tv-tasks'],
    queryFn: () => tasksApi.getAll({ all: true }),
    refetchInterval: REFRESH_MS,
  });

  const { data: activeSession } = useQuery({
    queryKey: ['tv-session'],
    queryFn: () => sessionsApi.getActive(),
    refetchInterval: REFRESH_MS,
  });

  // Computed
  const activeAgents = useMemo(() => allAgents.filter(a => a.status === 'ACTIVE'), [allAgents]);
  const onlineAgents = useMemo(() => activeAgents.filter(agentIsOnline), [activeAgents]);
  const pendingAgents = useMemo(() => allAgents.filter(a => a.status === 'PENDING'), [allAgents]);
  const alertAgents = useMemo(() => onlineAgents.filter(a =>
    (a.cpuUsage != null && a.cpuUsage > 90) ||
    (a.ramUsage != null && a.ramUsage > 90) ||
    (a.cpuTempC != null && a.cpuTempC > 80)
  ), [onlineAgents]);

  const activeTasks = useMemo(() =>
    tasks.filter(t => t.status !== 'DONE').slice(0, 5),
  [tasks]);

  const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  const bigStats = [
    { label: 'Otwarte', value: stats?.openTickets ?? '—', color: '#6366f1', icon: '🎫', pulse: (stats?.openTickets ?? 0) > 0 },
    { label: 'Przeterminowane', value: stats?.overdueTickets ?? '—', color: '#ef4444', icon: '⏰', pulse: (stats?.overdueTickets ?? 0) > 0 },
    { label: 'Nieprzypisane', value: stats?.unassignedTickets ?? '—', color: '#f59e0b', icon: '⚠️', pulse: (stats?.unassignedTickets ?? 0) > 0 },
    { label: 'Agenci online', value: `${onlineAgents.length}/${activeAgents.length}`, color: '#22c55e', icon: '🖥️', pulse: false },
    { label: 'Klienci', value: stats?.totalClients ?? '—', color: '#06b6d4', icon: '🏢', pulse: false },
    { label: 'Urządzenia', value: stats?.totalDevices ?? '—', color: '#a78bfa', icon: '💻', pulse: false },
  ];

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: 'linear-gradient(160deg, #070b16 0%, #0c1220 40%, #0a0f1e 100%)',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 32px 16px',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo.png" alt="InfraDesk" style={{ height: 44, objectFit: 'contain' }} />
          <div style={{ width: 1, height: 32, background: '#1e293b' }} />
          <div>
            <div style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>
              Panel monitoringu
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {user?.firstName} {user?.lastName}
            </div>
          </div>
        </div>

        {/* Alerts ribbon */}
        {(alertAgents.length > 0 || pendingAgents.length > 0) && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {alertAgents.length > 0 && (
              <div style={{
                background: '#ef444422',
                border: '1px solid #ef444466',
                borderRadius: 12,
                padding: '6px 16px',
                fontSize: 13,
                color: '#fca5a5',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                animation: 'pulse-alert 2s infinite',
              }}>
                <span style={{ fontSize: 16 }}>🔥</span>
                {alertAgents.length} agent{alertAgents.length > 1 ? 'ów' : ''} z alertem
              </div>
            )}
            {pendingAgents.length > 0 && (
              <div style={{
                background: '#f59e0b22',
                border: '1px solid #f59e0b66',
                borderRadius: 12,
                padding: '6px 16px',
                fontSize: 13,
                color: '#fcd34d',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                {pendingAgents.length} oczekuje na zatwierdzenie
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 2, color: '#f1f5f9', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 4, textTransform: 'capitalize' }}>
            {dateStr}
          </div>
        </div>
      </div>

      {/* ── STATS ROW ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        {bigStats.map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${s.color}30`,
            borderRadius: 16,
            padding: '16px 12px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {s.pulse && typeof s.value === 'number' && s.value > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                width: 8, height: 8, borderRadius: '50%',
                background: s.color,
                animation: 'pulse-dot 2s infinite',
              }} />
            )}
            <div style={{ fontSize: 11, marginBottom: 4 }}>{s.icon}</div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: s.color,
              lineHeight: 1,
              textShadow: `0 0 24px ${s.color}44`,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN GRID ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>

        {/* ── Column 1: Tickets ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <Panel
            title="Oczekujące zgłoszenia"
            color="#f59e0b"
            count={pendingTickets.length}
            pulse
          >
            <TicketList tickets={pendingTickets} />
          </Panel>
          <Panel
            title="W realizacji"
            color="#6366f1"
            count={assignedTickets.length}
          >
            <TicketList tickets={assignedTickets} />
          </Panel>
        </div>

        {/* ── Column 2: Agents ──────────────────────────────────────────── */}
        <Panel
          title="Agenci online"
          color="#22c55e"
          count={onlineAgents.length}
          subtitle={`${activeAgents.length} aktywnych łącznie`}
        >
          <AgentsList agents={onlineAgents} />
        </Panel>

        {/* ── Column 3: Tasks + Session ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <Panel
            title="Zadania"
            color="#38bdf8"
            count={activeTasks.length}
          >
            <TasksList tasks={activeTasks} />
          </Panel>
          {activeSession && (
            <Panel
              title="Aktywna sesja"
              color="#22c55e"
              pulse
            >
              <ActiveSessionCard session={activeSession} />
            </Panel>
          )}
        </div>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#334155', fontSize: 12, flexShrink: 0 }}>
        <span>InfraDesk MSP • infradesk.pl</span>
        <span>Ostatnia aktualizacja: {lastUpdate} • auto-odświeżanie co {REFRESH_MS / 1000}s</span>
      </div>

      {/* ── CSS animations ──────────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse-dot {
          0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70%  { box-shadow: 0 0 0 6px transparent; opacity: 0.6; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }
        @keyframes pulse-alert {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        * { scrollbar-width: none; }
        *::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ─── Panel wrapper ─────────────────────────────────────────────────────── */

function Panel({ title, color, count, subtitle, pulse, children }: {
  title: string;
  color: string;
  count?: number;
  subtitle?: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid #1e293b',
      borderRadius: 16,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
        {pulse && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color,
            animation: 'pulse-dot 2s infinite',
            flexShrink: 0,
          }} />
        )}
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{title}</span>
        {count != null && (
          <span style={{
            background: `${color}18`,
            color,
            borderRadius: 20,
            padding: '1px 10px',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {count}
          </span>
        )}
        {subtitle && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>{subtitle}</span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Ticket list ───────────────────────────────────────────────────────── */

function TicketList({ tickets }: { tickets: any[] }) {
  if (tickets.length === 0) {
    return <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 24 }}>Brak zgłoszeń</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tickets.map(t => (
        <div key={t.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.025)',
          borderRadius: 10,
          borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] ?? '#6366f1'}`,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#f1f5f9',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t.title}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              {t.client?.name}
              {t.assignedTo ? ` • ${t.assignedTo.firstName} ${t.assignedTo.lastName?.[0]}.` : ''}
              {t.reportedAt ? ` • ${timeAgo(t.reportedAt)}` : ''}
            </div>
          </div>
          <div style={{
            fontSize: 10, color: '#475569', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 6,
            padding: '2px 6px',
          }}>
            {t.ticketNumber}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Agents list ───────────────────────────────────────────────────────── */

function AgentsList({ agents }: { agents: AgentRegistration[] }) {
  if (agents.length === 0) {
    return <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 24 }}>Brak agentów online</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {agents.map(a => {
        const cpu = a.cpuUsage ?? 0;
        const ram = a.ramUsage ?? 0;
        const diskPct = a.diskTotal && a.diskTotal > 0
          ? Math.round(((a.diskTotal - (a.diskFree ?? 0)) / a.diskTotal) * 100)
          : null;
        const hasAlert = cpu > 90 || ram > 90 || (a.cpuTempC != null && a.cpuTempC > 80);

        return (
          <div key={a.id} style={{
            padding: '8px 10px',
            background: hasAlert ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.025)',
            border: hasAlert ? '1px solid #ef444433' : '1px solid transparent',
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: hasAlert ? '#ef4444' : '#22c55e',
                flexShrink: 0,
              }} />
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {a.hostname || 'Nieznany'}
              </div>
              <div style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
                {a.client?.name || a.companyName || ''}
              </div>
              {a.cpuTempC != null && (
                <div style={{
                  fontSize: 10, color: a.cpuTempC > 80 ? '#ef4444' : '#475569',
                  fontWeight: a.cpuTempC > 80 ? 700 : 400,
                }}>
                  {a.cpuTempC}°C
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MiniBar label="CPU" value={cpu} color={cpuColor(cpu)} />
              <MiniBar label="RAM" value={ram} color={ramColor(ram)} />
              {diskPct != null && <MiniBar label="Dysk" value={diskPct} color={diskPct > 90 ? '#ef4444' : '#64748b'} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Mini progress bar ─────────────────────────────────────────────────── */

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%',
          borderRadius: 2,
          width: `${Math.min(100, value)}%`,
          background: color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

/* ─── Tasks list ────────────────────────────────────────────────────────── */

function TasksList({ tasks }: { tasks: any[] }) {
  if (tasks.length === 0) {
    return <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 24 }}>Brak zadań</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map(t => {
        const statusColor = STATUS_COLORS[t.status] || '#64748b';
        return (
          <div key={t.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.025)',
            borderRadius: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#e2e8f0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t.title}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                {t.taskNumber}
                {t.assignedTo ? ` • ${t.assignedTo.firstName} ${t.assignedTo.lastName?.[0]}.` : ''}
                {t.dueAt ? ` • do ${new Date(t.dueAt).toLocaleDateString('pl-PL')}` : ''}
              </div>
            </div>
            <div style={{
              fontSize: 10,
              color: statusColor,
              background: `${statusColor}18`,
              borderRadius: 6,
              padding: '2px 8px',
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {STATUS_LABELS[t.status] || t.status}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Active session card ───────────────────────────────────────────────── */

function ActiveSessionCard({ session }: { session: any }) {
  const [, forceUpdate] = useState(0);

  // Re-render every 10s to update duration
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const isPaused = session.status === 'PAUSED';

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isPaused ? '#f59e0b' : '#22c55e',
          animation: isPaused ? undefined : 'pulse-dot 2s infinite',
        }} />
        <span style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(session.startedAt, session.totalPausedMin)}
        </span>
        <span style={{
          fontSize: 11,
          color: isPaused ? '#f59e0b' : '#22c55e',
          background: isPaused ? '#f59e0b18' : '#22c55e18',
          borderRadius: 6,
          padding: '2px 8px',
          fontWeight: 600,
        }}>
          {isPaused ? 'PAUZA' : 'AKTYWNA'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        {session.client?.name && <span>{session.client.name}</span>}
        {session.ticket && <span> • {session.ticket.ticketNumber}: {session.ticket.title}</span>}
        {session.device?.name && <span> • {session.device.name}</span>}
      </div>
    </div>
  );
}

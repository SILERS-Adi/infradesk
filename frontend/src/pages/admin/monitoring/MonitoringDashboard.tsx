import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Shield, Activity, Server, HardDrive,
  AlertTriangle, Wifi, CheckCircle,
} from 'lucide-react';
import api from '../../../api/client';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface MonitoringDashboardProps {
  agents: any[]; // AgentRegistration[] with serverMetrics
}

interface SummaryData {
  totalAgents: number;
  onlineAgents: number;
  avgAuditScore: number;
  networkDevices: number;
  healthyDisks: number;
  failingDisks: number;
  stoppedServices: number;
  activeAlerts: number;
}

interface HistoryPoint {
  date: string;
  score: number;
}

/* ── Stat Card ─────────────────────────────────────────────────────────── */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}

function StatCard({ icon, label, value, accent }: StatCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        minWidth: 160,
        flex: '1 1 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 8,
          background: accent
            ? `${accent}18`
            : 'color-mix(in srgb, var(--t) 8%, transparent)',
          color: accent ?? 'var(--tm)',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.2,
            color: accent ?? 'var(--t)',
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--ts)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

/* ── Chart Tooltip ─────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
      }}
    >
      <div style={{ color: 'var(--ts)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--t)', fontWeight: 600 }}>
        Wynik: {payload[0].value}%
      </div>
    </div>
  );
}

/* ── Agent Ranking Table ───────────────────────────────────────────────── */

interface RankedAgent {
  hostname: string;
  score: number;
  companyName: string;
  lastAudit: string;
}

function AgentRankingTable({ agents }: { agents: RankedAgent[] }) {
  if (!agents.length) {
    return (
      <div style={{ color: 'var(--td)', padding: 24, textAlign: 'center' }}>
        Brak danych audytu
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--border)',
              textAlign: 'left',
            }}
          >
            <th style={thStyle}>#</th>
            <th style={thStyle}>Host</th>
            <th style={thStyle}>Wynik</th>
            <th style={thStyle}>Firma</th>
            <th style={thStyle}>Ostatni audyt</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr
              key={a.hostname + i}
              style={{
                borderBottom: '1px solid var(--border)',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--hover-bg)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'transparent')
              }
            >
              <td style={tdStyle}>{i + 1}</td>
              <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--t)' }}>
                {a.hostname}
              </td>
              <td style={tdStyle}>
                <ScoreBadge score={a.score} />
              </td>
              <td style={tdStyle}>{a.companyName || '—'}</td>
              <td style={{ ...tdStyle, color: 'var(--ts)' }}>
                {a.lastAudit
                  ? new Date(a.lastAudit).toLocaleDateString('pl-PL')
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontWeight: 600,
  color: 'var(--ts)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--tm)',
};

function ScoreBadge({ score }: { score: number }) {
  let bg: string;
  let fg: string;
  if (score >= 80) {
    bg = '#22c55e18';
    fg = '#22c55e';
  } else if (score >= 50) {
    bg = '#eab30818';
    fg = '#eab308';
  } else {
    bg = '#ef444418';
    fg = '#ef4444';
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        background: bg,
        color: fg,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {score}%
    </span>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */

export default function MonitoringDashboard({ agents }: MonitoringDashboardProps) {
  /* ── API queries ────────────────────────────────────────────────────── */

  const { data: summary } = useQuery<SummaryData>({
    queryKey: ['monitoring', 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/monitoring/summary');
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: history } = useQuery<HistoryPoint[]>({
    queryKey: ['monitoring', 'history', 'audit'],
    queryFn: async () => {
      const { data } = await api.get('/monitoring/history', {
        params: { type: 'audit', days: 30 },
      });
      return data;
    },
    refetchInterval: 60_000,
  });

  /* ── Derive agent ranking from props ────────────────────────────────── */

  const rankedAgents = useMemo<RankedAgent[]>(() => {
    return agents
      .filter((a) => a.serverMetrics?.securityAudit?.score != null)
      .map((a) => ({
        hostname: a.hostname ?? a.name ?? '—',
        score: a.serverMetrics.securityAudit.score as number,
        companyName: a.companyName ?? a.company?.name ?? '',
        lastAudit: a.serverMetrics.securityAudit.timestamp ?? a.lastSeen ?? '',
      }))
      .sort((a, b) => a.score - b.score);
  }, [agents]);

  /* ── Stat cards definition ──────────────────────────────────────────── */

  const stats: StatCardProps[] = [
    {
      icon: <Server size={20} />,
      label: 'Asystentów łącznie',
      value: summary?.totalAgents ?? agents.length,
    },
    {
      icon: <Activity size={20} />,
      label: 'Asystentów online',
      value: summary?.onlineAgents ?? '—',
      accent: '#22c55e',
    },
    {
      icon: <Shield size={20} />,
      label: 'Średni wynik audytu',
      value: summary?.avgAuditScore != null ? `${summary.avgAuditScore}%` : '—',
      accent: '#6366f1',
    },
    {
      icon: <Wifi size={20} />,
      label: 'Urządzeń w sieci',
      value: summary?.networkDevices ?? '—',
    },
    {
      icon: <CheckCircle size={20} />,
      label: 'Zdrowe dyski',
      value: summary?.healthyDisks ?? '—',
      accent: '#22c55e',
    },
    {
      icon: <HardDrive size={20} />,
      label: 'Uszkodzone dyski',
      value: summary?.failingDisks ?? 0,
      accent: summary?.failingDisks ? '#ef4444' : undefined,
    },
    {
      icon: <AlertTriangle size={20} />,
      label: 'Zatrzymane usługi',
      value: summary?.stoppedServices ?? 0,
      accent: summary?.stoppedServices ? '#eab308' : undefined,
    },
    {
      icon: <AlertTriangle size={20} />,
      label: 'Aktywne alerty',
      value: summary?.activeAlerts ?? 0,
      accent: summary?.activeAlerts ? '#ef4444' : undefined,
    },
  ];

  /* ── Chart data formatting ──────────────────────────────────────────── */

  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((p) => ({
      ...p,
      date: new Date(p.date).toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
      }),
    }));
  }, [history]);

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Score trend chart */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--t)',
          }}
        >
          Trend wyniku audytu (30 dni)
        </h3>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient id="auditGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--td)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'var(--td)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#auditGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              height: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--td)',
              fontSize: 13,
            }}
          >
            Brak danych historycznych
          </div>
        )}
      </div>

      {/* Agent ranking table */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--t)',
          }}
        >
          Ranking asystentów (wg wyniku audytu)
        </h3>
        <AgentRankingTable agents={rankedAgents} />
      </div>
    </div>
  );
}

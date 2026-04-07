import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield, Globe, Server, Monitor, Printer,
  Terminal, Wifi, HardDrive, Cpu, Activity, AlertTriangle, CheckCircle,
  XCircle, Clock, ChevronDown, ChevronRight, Loader2, FileText,
} from 'lucide-react';
import { agentsApi, type AgentRegistration } from '../../api/agents';
import { MspCompanyFilter } from '../../components/ui/MspCompanyFilter';
import MonitoringDashboard from './monitoring/MonitoringDashboard';
import NetworkMap from './monitoring/NetworkMap';
import { AlertsPanel, AuditRecommendations, ExtraHealthSections } from './monitoring/MonitoringExtras';
import { apiClient } from '../../api/client';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface AuditCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'error';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  detail: string;
}

interface SecurityAudit {
  score: number;
  checks: AuditCheck[];
  timestamp: string;
}

interface NetDevice {
  ip: string;
  mac: string;
  hostname: string;
  ports: number[];
  type: 'router' | 'server' | 'windows' | 'linux' | 'printer' | 'network' | 'unknown';
}

interface NetworkScan {
  scannedAt: string;
  subnet: string;
  gateway: string;
  devices: NetDevice[];
}

interface SmartDisk {
  id: string;
  name: string;
  type: string;
  health: string;
  status: string;
  sizeGb: number;
}

interface ServiceInfo {
  name: string;
  displayName: string;
  status: 'Running' | 'Stopped';
}

interface CriticalEvent {
  time: string;
  level: string;
  source: string;
  message: string;
}

interface TopProcess {
  pid: number;
  name: string;
  cpu: number;
  ram: number;
}

interface HyperVM {
  name: string;
  state: string;
  cpuUsage: number;
  memoryMb: number;
}

interface ServerMetrics {
  securityAudit?: SecurityAudit;
  networkScan?: NetworkScan;
  smartDisks?: SmartDisk[];
  services?: ServiceInfo[];
  criticalEvents?: CriticalEvent[];
  topProcesses?: TopProcess[];
  listeningPorts?: number[];
  hyperVMs?: HyperVM[];
}

type AgentWithMetrics = AgentRegistration & { serverMetrics?: ServerMetrics };

/* ── Style constants ────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function scoreColor(score: number) {
  if (score >= 80) return '#4ADE80';
  if (score >= 60) return '#FBBF24';
  return '#F87171';
}

function scoreBg(score: number) {
  if (score >= 80) return 'rgba(74,222,128,0.10)';
  if (score >= 60) return 'rgba(251,191,36,0.10)';
  return 'rgba(248,113,113,0.10)';
}

function severityBadge(sev: AuditCheck['severity']) {
  const map: Record<string, { bg: string; color: string }> = {
    critical: { bg: 'rgba(239,68,68,0.15)', color: '#F87171' },
    high:     { bg: 'rgba(251,146,60,0.15)', color: '#FB923C' },
    medium:   { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
    low:      { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA' },
    info:     { bg: 'var(--border)', color: 'var(--ts)' },
  };
  const s = map[sev] ?? map.info;
  return (
    <span
      className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
      style={{ background: s.bg, color: s.color }}
    >
      {sev}
    </span>
  );
}

function deviceIcon(type: NetDevice['type']) {
  const cls = 'h-4 w-4 shrink-0';
  switch (type) {
    case 'router':  return <Globe className={cls} style={{ color: '#60A5FA' }} />;
    case 'server':  return <Server className={cls} style={{ color: '#A78BFA' }} />;
    case 'windows': return <Monitor className={cls} style={{ color: '#22D3EE' }} />;
    case 'linux':   return <Terminal className={cls} style={{ color: '#4ADE80' }} />;
    case 'printer': return <Printer className={cls} style={{ color: '#FB923C' }} />;
    case 'network': return <Wifi className={cls} style={{ color: '#FBBF24' }} />;
    default:        return <Monitor className={cls} style={{ color: 'var(--tm)' }} />;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function agentLabel(a: AgentWithMetrics) {
  return a.hostname || a.ipAddress || a.id.slice(0, 8);
}

/* ── Tab types ──────────────────────────────────────────────────────────── */

type Tab = 'audit' | 'network' | 'health';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'audit',   label: 'Audyt bezpieczeństwa', icon: <Shield className="h-4 w-4" /> },
  { key: 'network', label: 'Skan sieci',           icon: <Globe className="h-4 w-4" /> },
  { key: 'health',  label: 'Zdrowie systemu',      icon: <Activity className="h-4 w-4" /> },
];

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>('audit');
  const [companyFilter, setCompanyFilter] = useState('');

  const { data: agents = [], isLoading } = useQuery<AgentWithMetrics[]>({
    queryKey: ['agents-monitoring'],
    queryFn: () => agentsApi.getAll() as Promise<AgentWithMetrics[]>,
    refetchInterval: 60_000,
  });

  // Filter agents by company
  const filteredAgents = companyFilter
    ? agents.filter((a: any) => a.workspaceId === companyFilter)
    : agents;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ color: 'var(--t)' }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--t)] flex items-center gap-2">
            <Shield className="h-6 w-6" style={{ color: '#A78BFA' }} />
            Monitoring
          </h1>
          <MspCompanyFilter value={companyFilter} onChange={setCompanyFilter} />
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--ts)' }}>
          Kompleksowy widok bezpieczenstwa, sieci i zdrowia wszystkich agentow
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t.key ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: tab === t.key ? '#A78BFA' : 'var(--ts)',
              border: tab === t.key ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard summary */}
      <MonitoringDashboard agents={filteredAgents} />

      {/* Alerts */}
      <div className="mb-6">
        <AlertsPanel />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#A78BFA' }} />
        </div>
      ) : (
        <>
          {tab === 'audit'   && <AuditTab agents={filteredAgents} />}
          {tab === 'network' && <NetworkTab agents={filteredAgents} />}
          {tab === 'health'  && <HealthTab agents={filteredAgents} />}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 1 — AUDYT BEZPIECZENSTWA
   ══════════════════════════════════════════════════════════════════════════ */

function AuditTab({ agents }: { agents: AgentWithMetrics[] }) {
  const audited = agents.filter(a => a.serverMetrics?.securityAudit);
  const scores  = audited.map(a => a.serverMetrics!.securityAudit!.score);
  const avg     = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;

  const allChecks = audited.flatMap(a => a.serverMetrics!.securityAudit!.checks);
  const critFails = allChecks.filter(c => c.status === 'fail' && c.severity === 'critical').length;
  const passRate  = allChecks.length
    ? Math.round((allChecks.filter(c => c.status === 'pass').length / allChecks.length) * 100)
    : 0;

  const sorted = [...audited].sort(
    (a, b) => (a.serverMetrics!.securityAudit!.score) - (b.serverMetrics!.securityAudit!.score),
  );

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Średni wynik"
          value={`${avg}%`}
          valueColor={scoreColor(avg)}
          icon={<CheckCircle className="h-5 w-5" />}
          bg={scoreBg(avg)}
        />
        <SummaryCard
          label="Agentów audytowanych"
          value={String(audited.length)}
          valueColor="#60A5FA"
          icon={<Shield className="h-5 w-5" />}
          bg="rgba(96,165,250,0.10)"
        />
        <SummaryCard
          label="Błędy krytyczne"
          value={String(critFails)}
          valueColor="#F87171"
          icon={<AlertTriangle className="h-5 w-5" />}
          bg="rgba(248,113,113,0.10)"
        />
        <SummaryCard
          label="Wskaźnik zaliczenia"
          value={`${passRate}%`}
          valueColor="#4ADE80"
          icon={<CheckCircle className="h-5 w-5" />}
          bg="rgba(74,222,128,0.10)"
        />
      </div>

      {audited.length === 0 && <EmptyState text="Brak danych audytu bezpieczeństwa" />}

      {/* Agent audit cards */}
      <div className="flex flex-col gap-4">
        {sorted.map(a => (
          <AuditAgentCard key={a.id} agent={a} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, valueColor, icon, bg }: {
  label: string; value: string; valueColor: string; icon: React.ReactNode; bg: string;
}) {
  return (
    <div className="p-4 rounded-[14px]" style={{ background: bg, border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: valueColor }}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ts)' }}>
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold" style={{ color: valueColor }}>{value}</div>
    </div>
  );
}

function AuditAgentCard({ agent }: { agent: AgentWithMetrics }) {
  const [open, setOpen] = useState(false);
  const audit = agent.serverMetrics!.securityAudit!;
  const sc = audit.score;

  return (
    <div style={card} className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          {/* Score circle */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
            style={{ background: scoreBg(sc), color: scoreColor(sc), border: `2px solid ${scoreColor(sc)}33` }}
          >
            {sc}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--t)]">{agentLabel(agent)}</span>
              {agent.client?.name && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA' }}>
                  {agent.client.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--tm)' }}>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(audit.timestamp)}</span>
              <span>{audit.checks.filter(c => c.status === 'pass').length}/{audit.checks.length} zaliczonych</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {audit.checks.some(c => c.status === 'fail' && c.severity === 'critical') && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
              <AlertTriangle className="h-3 w-3" /> Krytyczne
            </span>
          )}
          {open ? <ChevronDown className="h-5 w-5 text-zinc-400" /> : <ChevronRight className="h-5 w-5 text-zinc-400" />}
        </div>
      </button>

      {/* Checks list */}
      {open && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {audit.checks.map((c, i) => (
              <div key={c.id ?? i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {c.status === 'pass'
                  ? <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#4ADE80' }} />
                  : c.status === 'fail'
                    ? <XCircle className="h-4 w-4 shrink-0" style={{ color: '#F87171' }} />
                    : <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#FBBF24' }} />}
                <span className="flex-1 text-[var(--tm)]">{c.name}</span>
                {severityBadge(c.severity)}
                <span className="text-xs max-w-[300px] truncate" style={{ color: 'var(--tm)' }}>
                  {c.detail}
                </span>
              </div>
            ))}
          {/* Recommendations for failed checks */}
          <AuditRecommendations checks={audit.checks} />
          {/* PDF report button */}
          <div className="px-4 py-3 flex justify-end">
            <button
              onClick={() => {
                const url = `/api/monitoring/report/${agent.id}`;
                window.open(url, '_blank');
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--ts)' }}
            >
              <FileText className="h-3.5 w-3.5" /> Pobierz raport PDF
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 2 — SKAN SIECI
   ══════════════════════════════════════════════════════════════════════════ */

function NetworkTab({ agents }: { agents: AgentWithMetrics[] }) {
  const withScan = agents.filter(a => a.serverMetrics?.networkScan);

  if (!withScan.length) return <EmptyState text="Brak danych skanu sieci" />;

  return (
    <div className="flex flex-col gap-6">
      {withScan.map(a => (
        <div key={a.id} className="flex flex-col gap-4">
          <NetworkMap agent={a} />
          <NetworkAgentCard agent={a} />
        </div>
      ))}
    </div>
  );
}

function NetworkAgentCard({ agent }: { agent: AgentWithMetrics }) {
  const scan = agent.serverMetrics!.networkScan!;
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={card} className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.12)' }}>
            <Globe className="h-5 w-5" style={{ color: '#60A5FA' }} />
          </div>
          <div>
            <span className="font-semibold text-[var(--t)]">{agentLabel(agent)}</span>
            {agent.client?.name && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA' }}>
                {agent.client.name}
              </span>
            )}
            <div className="flex items-center gap-4 mt-0.5 text-xs" style={{ color: 'var(--tm)' }}>
              <span>Podsieć: {scan.subnet}</span>
              <span>Brama: {scan.gateway}</span>
              <span>Urządzenia: {scan.devices.length}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(scan.scannedAt)}</span>
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown className="h-5 w-5 text-zinc-400" /> : <ChevronRight className="h-5 w-5 text-zinc-400" />}
      </button>

      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Typ</th>
                  <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>IP</th>
                  <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>MAC</th>
                  <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Hostname</th>
                  <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Otwarte porty</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {scan.devices.map((d, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {deviceIcon(d.type)}
                        <span className="text-xs capitalize" style={{ color: 'var(--ts)' }}>{d.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--tm)]">{d.ip}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--td)]">{d.mac}</td>
                    <td className="px-4 py-2.5 text-[var(--td)]">{d.hostname || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {d.ports.length > 0
                          ? d.ports.map(p => (
                              <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>
                                {p}
                              </span>
                            ))
                          : <span className="text-xs" style={{ color: 'var(--td)' }}>—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 3 — ZDROWIE SYSTEMU
   ══════════════════════════════════════════════════════════════════════════ */

function HealthTab({ agents }: { agents: AgentWithMetrics[] }) {
  const withMetrics = agents.filter(a => a.serverMetrics && (
    a.serverMetrics.smartDisks?.length ||
    a.serverMetrics.services?.length ||
    a.serverMetrics.criticalEvents?.length ||
    a.serverMetrics.topProcesses?.length ||
    a.serverMetrics.listeningPorts?.length ||
    a.serverMetrics.hyperVMs?.length
  ));

  if (!withMetrics.length) return <EmptyState text="Brak danych zdrowia systemu" />;

  return (
    <div className="flex flex-col gap-6">
      {withMetrics.map(a => (
        <HealthAgentCard key={a.id} agent={a} />
      ))}
    </div>
  );
}

function HealthAgentCard({ agent }: { agent: AgentWithMetrics }) {
  const m = agent.serverMetrics!;
  const [section, setSection] = useState<string | null>(null);
  const toggle = (s: string) => setSection(prev => prev === s ? null : s);

  const diskUsed = (agent.diskTotal && agent.diskFree) ? agent.diskTotal - agent.diskFree : null;
  const diskPct  = (agent.diskTotal && diskUsed != null) ? Math.round((diskUsed / agent.diskTotal) * 100) : null;

  return (
    <div style={card} className="overflow-hidden">
      {/* Agent header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(74,222,128,0.12)' }}>
            <Activity className="h-5 w-5" style={{ color: '#4ADE80' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--t)]">{agentLabel(agent)}</span>
              {agent.client?.name && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA' }}>
                  {agent.client.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-0.5 text-xs" style={{ color: 'var(--tm)' }}>
              {agent.cpuUsage != null && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU {agent.cpuUsage}%</span>}
              {agent.ramUsage != null && <span>RAM {agent.ramUsage}%</span>}
              {diskPct != null && <span>Dysk {diskPct}%</span>}
              {agent.lastSeen && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(agent.lastSeen)}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--border)' }}>
        {/* S.M.A.R.T. */}
        {m.smartDisks && m.smartDisks.length > 0 && (
          <CollapsibleSection
            title="S.M.A.R.T. Dyski"
            icon={<HardDrive className="h-4 w-4" />}
            open={section === 'smart'}
            onToggle={() => toggle('smart')}
            count={m.smartDisks.length}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {m.smartDisks.map(d => {
                const healthy = d.health?.toLowerCase() === 'healthy' || d.health?.toLowerCase() === 'ok';
                return (
                  <div
                    key={d.id}
                    className="p-3 rounded-lg"
                    style={{
                      background: healthy ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.08)',
                      border: `1px solid ${healthy ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.2)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-[var(--t)]">{d.name}</span>
                      <span
                        className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: healthy ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                          color: healthy ? '#4ADE80' : '#F87171',
                        }}
                      >
                        {d.health}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--tm)' }}>
                      {d.type} &middot; {d.sizeGb} GB &middot; {d.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Services */}
        {m.services && m.services.length > 0 && (
          <CollapsibleSection
            title="Usługi"
            icon={<Server className="h-4 w-4" />}
            open={section === 'svc'}
            onToggle={() => toggle('svc')}
            count={m.services.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--hover-bg)' }}>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Status</th>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Nazwa</th>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Nazwa wyświetlana</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {m.services.map(s => (
                    <tr key={s.name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: s.status === 'Running' ? '#4ADE80' : '#F87171' }}
                          />
                          <span className="text-xs" style={{ color: s.status === 'Running' ? '#4ADE80' : '#F87171' }}>
                            {s.status === 'Running' ? 'Działa' : 'Zatrzymana'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-[var(--td)]">{s.name}</td>
                      <td className="px-4 py-2 text-[var(--tm)]">{s.displayName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Critical events */}
        {m.criticalEvents && m.criticalEvents.length > 0 && (
          <CollapsibleSection
            title="Zdarzenia krytyczne"
            icon={<AlertTriangle className="h-4 w-4" style={{ color: '#FBBF24' }} />}
            open={section === 'events'}
            onToggle={() => toggle('events')}
            count={m.criticalEvents.length}
          >
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {m.criticalEvents.map((ev, i) => (
                <div key={i} className="px-4 py-3 flex gap-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: ev.level === 'Error' ? '#F87171' : '#FBBF24' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium" style={{ color: ev.level === 'Error' ? '#F87171' : '#FBBF24' }}>
                        {ev.level}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--tm)' }}>{ev.source}</span>
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--tm)' }}>
                        <Clock className="h-3 w-3" />{fmtDate(ev.time)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--td)] break-words">{ev.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Top processes */}
        {m.topProcesses && m.topProcesses.length > 0 && (
          <CollapsibleSection
            title="Najaktywniejsze procesy"
            icon={<Cpu className="h-4 w-4" />}
            open={section === 'proc'}
            onToggle={() => toggle('proc')}
            count={m.topProcesses.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--hover-bg)' }}>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>PID</th>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Proces</th>
                    <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>CPU %</th>
                    <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>RAM MB</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {m.topProcesses.map(p => (
                    <tr key={p.pid} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-[var(--td)]">{p.pid}</td>
                      <td className="px-4 py-2 text-[var(--tm)]">{p.name}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs" style={{ color: p.cpu > 50 ? '#F87171' : p.cpu > 20 ? '#FBBF24' : '#4ADE80' }}>
                        {p.cpu.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-[var(--td)]">
                        {p.ram.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Listening ports */}
        {m.listeningPorts && m.listeningPorts.length > 0 && (
          <CollapsibleSection
            title="Nasłuchujące porty"
            icon={<Wifi className="h-4 w-4" />}
            open={section === 'ports'}
            onToggle={() => toggle('ports')}
            count={m.listeningPorts.length}
          >
            <div className="flex flex-wrap gap-2 p-4">
              {m.listeningPorts.sort((a, b) => a - b).map(p => (
                <span
                  key={p}
                  className="text-xs font-mono px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(96,165,250,0.10)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.15)' }}
                >
                  {p}
                </span>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Hyper-V VMs */}
        {m.hyperVMs && m.hyperVMs.length > 0 && (
          <CollapsibleSection
            title="Maszyny wirtualne Hyper-V"
            icon={<Monitor className="h-4 w-4" />}
            open={section === 'vm'}
            onToggle={() => toggle('vm')}
            count={m.hyperVMs.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--hover-bg)' }}>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Nazwa</th>
                    <th className="text-left px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>Stan</th>
                    <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>CPU %</th>
                    <th className="text-right px-4 py-2 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--ts)' }}>RAM MB</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {m.hyperVMs.map(vm => {
                    const running = vm.state?.toLowerCase() === 'running';
                    return (
                      <tr key={vm.name} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2 text-[var(--t)] font-medium">{vm.name}</td>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: running ? '#4ADE80' : '#F87171' }} />
                            <span className="text-xs" style={{ color: running ? '#4ADE80' : '#F87171' }}>
                              {vm.state}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-[var(--td)]">{vm.cpuUsage.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-[var(--td)]">{vm.memoryMb.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Extra sections: SSL, RAID, Uptime */}
        <ExtraHealthSections agent={agent} />
      </div>
    </div>
  );
}

/* ── Shared UI pieces ───────────────────────────────────────────────────── */

function CollapsibleSection({ title, icon, open, onToggle, count, children }: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--ts)' }}>{icon}</span>
          <span className="text-sm font-medium text-[var(--tm)]">{title}</span>
          {count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--ts)' }}>
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Shield className="h-12 w-12 mb-3" style={{ color: 'var(--td)' }} />
      <p className="text-sm" style={{ color: 'var(--tm)' }}>{text}</p>
    </div>
  );
}

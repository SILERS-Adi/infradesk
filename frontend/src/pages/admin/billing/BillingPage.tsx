// @ts-nocheck
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Building2, Clock, AlertTriangle, CheckCircle2, Monitor, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { sessionsApi, WorkSession } from '../../../api/sessions';
import { tasksApi } from '../../../api/tasks';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDateTime } from '../../../utils/helpers';
import type { Task } from '../../../types';

function fmtDur(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMoney(val: number): string {
  return val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

/** Billing-relevant client data extracted from sessions */
interface BillingClient {
  id: string;
  name: string;
  hasContract?: boolean;
  contractHours?: number;
  contractMonthlyValue?: number;
  hourlyRate?: number;
  contractHourlyRateOverLimit?: number;
  billingIntervalMinutes?: number;
}

interface ClientBilling {
  client: BillingClient;
  sessions: WorkSession[];
  tasks: Task[];
  totalMinutes: number;
  onsiteMinutes: number;
  remoteMinutes: number;
  billableHours: number;
  contractHours: number;
  usedPct: number;
  overHours: number;
  hourlyRate: number;
  overRate: number;
  hasContract: boolean;
  contractValue: number;
  totalValue: number;
  onsiteCount: number;
  remoteCount: number;
}

// ── Progress bar ────────────────────────────────────────────────────────────
function UsageBar({ pct }: { pct: number }) {
  const color = pct > 100 ? '#EF4444' : pct > 80 ? '#FBBF24' : '#4ADE80';
  const clampedPct = Math.min(pct, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${clampedPct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-12 text-right" style={{ color }}>{Math.round(pct)}%</span>
    </div>
  );
}

// ── Client billing card ─────────────────────────────────────────────────────
function BillingCard({ b }: { b: ClientBilling }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${b.overHours > 0 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[14px] font-semibold text-violet-400 truncate block">
              {((b as any))?.client?.name}
            </span>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {b.hasContract ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#4ADE80' }}>
                  <CheckCircle2 className="h-3 w-3" /> Abonament {b.contractHours}h · {fmtMoney(b.contractValue)}/mies.
                </span>
              ) : b.hourlyRate > 0 ? (
                <span className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                  {b.hourlyRate} zł/h
                </span>
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--tm)' }}>Brak stawki</span>
              )}
              {/* Onsite / Remote split */}
              {b.onsiteCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: '#FB923C' }}>
                  <MapPin className="h-3 w-3" /> {b.onsiteCount} na miejscu
                </span>
              )}
              {b.remoteCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium"
                  style={{ color: '#60A5FA' }}>
                  <Monitor className="h-3 w-3" /> {b.remoteCount} zdalnie
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold" style={{ color: '#4ADE80' }}>{fmtMoney(b.totalValue)}</p>
            <p className="text-xs" style={{ color: 'var(--tm)' }}>{b.billableHours.toFixed(1)}h · {b.sessions.length} sesji</p>
          </div>
        </div>

        {/* Contract usage bar */}
        {b.hasContract && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span style={{ color: 'var(--tm)' }}>Wykorzystanie abonamentu</span>
              <span style={{ color: 'var(--ts)' }}>
                {b.billableHours.toFixed(1)}h / {b.contractHours}h
              </span>
            </div>
            <UsageBar pct={b.usedPct} />
            {b.overHours > 0 && (
              <div className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold" style={{ color: '#F87171' }}>
                <AlertTriangle className="h-3.5 w-3.5" />
                Przekroczenie: +{b.overHours.toFixed(1)}h = {fmtMoney(b.overHours * b.overRate)} ({b.overRate} zł/h)
              </div>
            )}
          </div>
        )}

        {/* Time split bar — onsite vs remote */}
        {b.totalMinutes > 0 && (b.onsiteMinutes > 0 || b.remoteMinutes > 0) && (
          <div className="mt-3 flex items-center gap-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hover-bg)' }}>
            {b.onsiteMinutes > 0 && (
              <div className="h-full rounded-full" style={{ width: `${(b.onsiteMinutes / b.totalMinutes) * 100}%`, background: '#FB923C' }} />
            )}
            {b.remoteMinutes > 0 && (
              <div className="h-full rounded-full" style={{ width: `${(b.remoteMinutes / b.totalMinutes) * 100}%`, background: '#60A5FA' }} />
            )}
          </div>
        )}
      </div>

      {/* Footer — expand sessions */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors"
          style={{ color: 'var(--tm)' }}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {b.sessions.length} sesji · {b.tasks.length} zadań
        </button>
        <div className="flex-1" />
        {b.onsiteMinutes > 0 && (
          <span className="text-[10px]" style={{ color: '#FB923C' }}>
            <MapPin className="h-3 w-3 inline" /> {fmtDur(b.onsiteMinutes)}
          </span>
        )}
        {b.remoteMinutes > 0 && (
          <span className="text-[10px] ml-2" style={{ color: '#60A5FA' }}>
            <Monitor className="h-3 w-3 inline" /> {fmtDur(b.remoteMinutes)}
          </span>
        )}
      </div>

      {/* Expanded sessions */}
      {expanded && (
        <div className="px-4 pb-3" style={{ background: 'var(--bg-card)' }}>
          <div className="space-y-1">
            {b.sessions.map(s => {
              const sMin = s.durationMin ?? 0;
              const mode = (s as any).ticket?.serviceMode;
              return (
                <div key={s.id} className="flex items-center gap-3 text-[11px] py-1.5 px-2 rounded-lg"
                  style={{ background: 'var(--bg-card)' }}>
                  {mode === 'ONSITE' ? <MapPin className="h-3 w-3 flex-shrink-0" style={{ color: '#FB923C' }} />
                    : mode === 'REMOTE' ? <Monitor className="h-3 w-3 flex-shrink-0" style={{ color: '#60A5FA' }} />
                    : <Clock className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--td)' }} />}
                  <span style={{ color: 'var(--ts)' }}>{formatDateTime(s.startedAt)}</span>
                  {s.ticket && <span className="font-mono text-violet-400">{s.ticket.ticketNumber}</span>}
                  <span className="font-semibold" style={{ color: 'var(--ts)' }}>{fmtDur(sMin)}</span>
                  <span className="ml-auto font-semibold" style={{ color: b.hasContract ? '#60A5FA' : '#4ADE80' }}>
                    {b.hasContract ? '' : b.hourlyRate > 0 ? fmtMoney(Math.ceil(sMin / (b.client.billingIntervalMinutes ?? 30)) * ((b.client.billingIntervalMinutes ?? 30) / 60) * b.hourlyRate) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export function BillingPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.000Z`;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions-billing', from, to],
    queryFn: async () => {

      const result = await sessionsApi.getAll({ from, to });

      return result;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-all'],
    queryFn: () => tasksApi.getAll({ all: true }),
  });

  const billingData = useMemo((): ClientBilling[] => {
    // Build client map from session.client data
    const clientMap = new Map<string, BillingClient>();
    for (const s of sessions) {
      if (s.clientId && s.client && !clientMap.has(s.clientId)) {
        const c = s.client as any;
        clientMap.set(s.clientId, {
          id: s.clientId,
          name: c.name ?? 'Nieznany',
          hasContract: c.hasContract,
          contractHours: c.contractHours,
          contractMonthlyValue: c.contractMonthlyValue,
          hourlyRate: c.hourlyRate,
          contractHourlyRateOverLimit: c.contractHourlyRateOverLimit,
          billingIntervalMinutes: c.billingIntervalMinutes,
        });
      }
    }

    const sessionsByClient = new Map<string, WorkSession[]>();
    for (const s of sessions) {
      if (!s.clientId) continue;
      const arr = sessionsByClient.get(s.clientId) ?? [];
      arr.push(s);
      sessionsByClient.set(s.clientId, arr);
    }

    const tasksByClient = new Map<string, Task[]>();
    for (const t of tasks) {
      const cid = t.ticket?.client?.id;
      if (!cid) continue;
      const arr = tasksByClient.get(cid) ?? [];
      arr.push(t);
      tasksByClient.set(cid, arr);
    }

    const result: ClientBilling[] = [];

    for (const [clientId, clientSessions] of sessionsByClient) {
      const client = clientMap.get(clientId);
      if (!client) continue;
      result.push(buildBilling(client, clientSessions, tasksByClient.get(clientId) ?? []));
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [sessions, tasks]);

  const totalRevenue = billingData.reduce((s, b) => s + b.totalValue, 0);
  const totalHours = billingData.reduce((s, b) => s + b.billableHours, 0);
  const contractClients = billingData.filter(b => b.hasContract).length;
  const hourlyClients = billingData.filter(b => !b.hasContract && b.sessions.length > 0).length;

  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  return (
    <div>
      <PageHeader
        title="Rozliczenia"
        subtitle={`${MONTHS[month]} ${year}`}
      />

      {/* Month picker */}
      <div className="flex items-center gap-3 mb-5">
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid var(--border)', color: 'var(--t)' }}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid var(--border)', color: 'var(--t)' }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4" style={{ color: '#4ADE80' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Przychód</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{fmtMoney(totalRevenue)}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4" style={{ color: '#60A5FA' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Godziny</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4" style={{ color: '#A78BFA' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Abonamenty</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{contractClients}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4" style={{ color: '#FB923C' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Godzinowo</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{hourlyClients}</p>
        </div>
      </div>

      {/* Client cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : billingData.length === 0 ? (
        <div className="rounded-2xl text-center py-16" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Receipt className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
          <p className="text-[13px]" style={{ color: 'var(--tm)' }}>Brak danych w wybranym miesiącu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {billingData.map(b => <BillingCard key={b.client.id} b={b} />)}

          {/* Total bar */}
          <div className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--ts)' }}>
              RAZEM: {billingData.length} klientów · {totalHours.toFixed(1)}h
            </span>
            <span className="text-lg font-bold" style={{ color: '#4ADE80' }}>{fmtMoney(totalRevenue)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper: build billing for one client ────────────────────────────────────
function buildBilling(client: BillingClient, clientSessions: WorkSession[], clientTasks: Task[]): ClientBilling {
  const totalMinutes = clientSessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
  const interval = client.billingIntervalMinutes ?? 30;
  const billableHours = totalMinutes > 0 ? Math.ceil(totalMinutes / interval) * (interval / 60) : 0;
  const contractHours = client.contractHours ?? 0;
  const hasContract = client.hasContract ?? false;
  const hourlyRate = client.hourlyRate ?? 0;
  const overRate = client.contractHourlyRateOverLimit ?? hourlyRate;
  const contractValue = client.contractMonthlyValue ?? 0;

  // Onsite vs Remote from task serviceMode
  const taskModes = new Map<string, string>();
  for (const t of clientTasks) {
    if (t.ticket?.serviceMode && t.ticketId) taskModes.set(t.ticketId, t.ticket.serviceMode);
  }

  let onsiteMinutes = 0, remoteMinutes = 0, onsiteCount = 0, remoteCount = 0;
  for (const s of clientSessions) {
    const mode = taskModes.get(s.ticketId ?? '') ?? (s as any).ticket?.serviceMode;
    const dur = s.durationMin ?? 0;
    if (mode === 'ONSITE') { onsiteMinutes += dur; onsiteCount++; }
    else if (mode === 'REMOTE') { remoteMinutes += dur; remoteCount++; }
  }

  let overHours = 0, totalValue = 0;
  if (hasContract) {
    overHours = Math.max(0, billableHours - contractHours);
    totalValue = contractValue + (overHours * overRate);
    // Even if no sessions, contract value is still due
    if (clientSessions.length === 0) totalValue = contractValue;
  } else {
    totalValue = billableHours * hourlyRate;
  }

  const usedPct = contractHours > 0 ? (billableHours / contractHours) * 100 : 0;

  return {
    client, sessions: clientSessions, tasks: clientTasks,
    totalMinutes, onsiteMinutes, remoteMinutes,
    billableHours, contractHours, usedPct, overHours,
    hourlyRate, overRate, hasContract, contractValue, totalValue,
    onsiteCount, remoteCount,
  };
}

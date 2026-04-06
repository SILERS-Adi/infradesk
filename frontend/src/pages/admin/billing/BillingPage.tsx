// @ts-nocheck
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Receipt, Building2, Clock, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, CalendarDays, User, Hash,
} from 'lucide-react';
import { apiClient } from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDateTime } from '../../../utils/helpers';

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number;
  status: string;
  tech: { firstName: string; lastName: string };
  ticket: { ticketNumber: string; title: string } | null;
  workspace: { id: string; name: string };
}

interface BillingEntry {
  relationId: string;
  client: { id: string; name: string; slug: string };
  billingType: 'subscription' | 'hourly';
  subscriptionMonthlyNet: number | null;
  subscriptionHours: number | null;
  overageRate: number | null;
  hourlyRate: number | null;
  billingIncrementMin: number;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  sessions: WorkSession[];
}

// ── Computed billing per client ────────────────────────────────────────────

interface ClientBilling {
  entry: BillingEntry;
  totalMinutes: number;
  billableHours: number;
  includedHours: number;
  overHours: number;
  usedPct: number;
  overageCost: number;
  baseCost: number;
  totalValue: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDur(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMoney(val: number): string {
  return val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zl';
}

function fmtHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'miesiecznie',
  quarterly: 'kwartalnie',
  yearly: 'rocznie',
};

// ── Build billing calculation ──────────────────────────────────────────────

function buildBilling(entry: BillingEntry): ClientBilling {
  const totalMinutes = entry.sessions.reduce((s, ses) => s + (ses.durationMin ?? 0), 0);
  const increment = entry.billingIncrementMin || 1;
  const billableMinutes = totalMinutes > 0
    ? Math.ceil(totalMinutes / increment) * increment
    : 0;
  const billableHours = billableMinutes / 60;

  const isSubscription = entry.billingType === 'subscription';
  const includedHours = entry.subscriptionHours ?? 0;
  const overageRate = entry.overageRate ?? 0;
  const hourlyRate = entry.hourlyRate ?? 0;

  let overHours = 0;
  let overageCost = 0;
  let baseCost = 0;
  let totalValue = 0;
  let usedPct = 0;

  if (isSubscription) {
    baseCost = entry.subscriptionMonthlyNet ?? 0;
    overHours = Math.max(0, billableHours - includedHours);
    overageCost = overHours * overageRate;
    totalValue = baseCost + overageCost;
    usedPct = includedHours > 0 ? (billableHours / includedHours) * 100 : 0;
  } else {
    baseCost = billableHours * hourlyRate;
    totalValue = baseCost;
  }

  return {
    entry,
    totalMinutes,
    billableHours,
    includedHours,
    overHours,
    usedPct,
    overageCost,
    baseCost,
    totalValue,
  };
}

// ── SVG Gauge ──────────────────────────────────────────────────────────────

function SvgGauge({ used, included }: { used: number; included: number }) {
  const size = 140;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arc from 135deg to 405deg (270deg sweep)
  const startAngle = 135;
  const totalSweep = 270;
  const pct = included > 0 ? Math.min(used / included, 1.5) : 0;
  const fillSweep = totalSweep * Math.min(pct, 1);

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const describeArc = (startA: number, sweep: number) => {
    if (sweep <= 0) return '';
    const endA = startA + sweep;
    const start = polarToCartesian(startA);
    const end = polarToCartesian(endA);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const over = used > included;
  const fillColor = over ? '#EF4444' : pct > 0.8 ? '#FBBF24' : '#4ADE80';
  const remaining = Math.max(0, included - used);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <path
          d={describeArc(startAngle, totalSweep)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {fillSweep > 0 && (
          <path
            d={describeArc(startAngle, fillSweep)}
            fill="none"
            stroke={fillColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${fillColor}40)` }}
          />
        )}
        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--t)" fontSize="15" fontWeight="700">
          {fmtHours(used)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--tm)" fontSize="11">
          / {fmtHours(included)}
        </text>
      </svg>
      <div className="text-[11px] font-semibold mt-[-8px]" style={{ color: over ? '#F87171' : '#4ADE80' }}>
        {over
          ? `Przekroczenie: +${fmtHours(used - included)}`
          : `Pozostalo: ${fmtHours(remaining)}`}
      </div>
    </div>
  );
}

// ── Progress bar (kept from original) ──────────────────────────────────────

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

// ── Session cost helper ────────────────────────────────────────────────────

function sessionCost(ses: WorkSession, entry: BillingEntry): number | null {
  if (entry.billingType === 'subscription') return null;
  const rate = entry.hourlyRate ?? 0;
  if (!rate) return null;
  const increment = entry.billingIncrementMin || 1;
  const dur = ses.durationMin ?? 0;
  const billableMin = Math.ceil(dur / increment) * increment;
  return (billableMin / 60) * rate;
}

// ── Client billing card ────────────────────────────────────────────────────

function BillingCard({ b }: { b: ClientBilling }) {
  const [expanded, setExpanded] = useState(false);
  const { entry } = b;
  const isSub = entry.billingType === 'subscription';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${b.overHours > 0 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[14px] font-semibold text-violet-400 truncate block">
              {entry.client.name}
            </span>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Billing type badge */}
              {isSub ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#4ADE80' }}
                >
                  <CheckCircle2 className="h-3 w-3" /> Abonament
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C' }}
                >
                  <Clock className="h-3 w-3" /> Godzinowo
                </span>
              )}
              {/* Billing period badge */}
              <span
                className="text-[10px] font-medium rounded-full px-2 py-0.5"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}
              >
                {PERIOD_LABELS[entry.billingPeriod] ?? entry.billingPeriod}
              </span>
              {/* Increment info */}
              {entry.billingIncrementMin > 1 && (
                <span className="text-[10px]" style={{ color: 'var(--tm)' }}>
                  naliczanie co {entry.billingIncrementMin}min
                </span>
              )}
            </div>
          </div>

          {/* Total value */}
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold" style={{ color: '#4ADE80' }}>{fmtMoney(b.totalValue)}</p>
            <p className="text-xs" style={{ color: 'var(--tm)' }}>
              {b.billableHours.toFixed(1)}h · {entry.sessions.length} sesji
            </p>
          </div>
        </div>

        {/* Subscription gauge + details */}
        {isSub && b.includedHours > 0 && (
          <div className="mt-4 flex items-center gap-5">
            <SvgGauge used={b.billableHours} included={b.includedHours} />
            <div className="flex-1 space-y-2">
              <div className="text-[11px]" style={{ color: 'var(--tm)' }}>
                Kwota abonamentu: <span className="font-semibold" style={{ color: 'var(--ts)' }}>{fmtMoney(entry.subscriptionMonthlyNet ?? 0)}/mies.</span>
              </div>
              {isSub && (entry.subscriptionHours ?? 0) > 0 && (
                <div className="text-[11px]" style={{ color: 'var(--tm)' }}>
                  W pakiecie: <span className="font-semibold" style={{ color: 'var(--ts)' }}>{fmtHours(entry.subscriptionHours ?? 0)}</span>
                  {entry.overageRate ? <> · Nadwyzka: <span className="font-semibold" style={{ color: '#F87171' }}>{entry.overageRate} zl/h</span></> : null}
                </div>
              )}
              <UsageBar pct={b.usedPct} />
              {b.overHours > 0 && (
                <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#F87171' }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Przekroczenie: +{b.overHours.toFixed(1)}h = {fmtMoney(b.overageCost)} ({entry.overageRate} zl/h)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subscription with no included hours — just show amount */}
        {isSub && !b.includedHours && (
          <div className="mt-3 text-[11px]" style={{ color: 'var(--tm)' }}>
            Kwota abonamentu: <span className="font-semibold" style={{ color: 'var(--ts)' }}>{fmtMoney(entry.subscriptionMonthlyNet ?? 0)}/mies.</span>
          </div>
        )}

        {/* Hourly details */}
        {!isSub && (
          <div className="mt-3 text-[11px]" style={{ color: 'var(--tm)' }}>
            {b.billableHours.toFixed(1)}h x {entry.hourlyRate ?? 0} zl/h = <span className="font-semibold" style={{ color: '#4ADE80' }}>{fmtMoney(b.baseCost)}</span>
          </div>
        )}
      </div>

      {/* Footer — expand sessions */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors"
          style={{ color: 'var(--tm)' }}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {entry.sessions.length} sesji
        </button>
      </div>

      {/* Expanded sessions */}
      {expanded && (
        <div className="px-4 pb-3" style={{ background: 'var(--bg-card)' }}>
          {entry.sessions.length === 0 ? (
            <p className="text-[11px] py-3 text-center" style={{ color: 'var(--td)' }}>
              Brak sesji w wybranym okresie
            </p>
          ) : (
            <div className="space-y-1">
              {entry.sessions.map(ses => {
                const cost = sessionCost(ses, entry);
                return (
                  <div
                    key={ses.id}
                    className="flex items-center gap-3 text-[11px] py-1.5 px-2 rounded-lg"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--td)' }} />
                    <span style={{ color: 'var(--ts)' }}>{formatDateTime(ses.startedAt)}</span>
                    {ses.tech && (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--tm)' }}>
                        <User className="h-3 w-3" />
                        {ses.tech.firstName} {ses.tech.lastName}
                      </span>
                    )}
                    {ses.ticket && (
                      <span className="inline-flex items-center gap-1 font-mono text-violet-400">
                        <Hash className="h-3 w-3" />
                        {ses.ticket.ticketNumber}
                      </span>
                    )}
                    <span className="font-semibold" style={{ color: 'var(--ts)' }}>
                      {fmtDur(ses.durationMin ?? 0)}
                    </span>
                    <span className="ml-auto font-semibold" style={{ color: cost != null ? '#4ADE80' : 'var(--td)' }}>
                      {cost != null ? fmtMoney(cost) : isSub ? 'w pakiecie' : '--'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function BillingPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.000Z`;

  const { data: entries = [], isLoading } = useQuery<BillingEntry[]>({
    queryKey: ['operator-billing', from, to],
    queryFn: async () => {
      const { data } = await apiClient.get('/operator/billing', { params: { from, to } });
      return data;
    },
  });

  const billingData = useMemo((): ClientBilling[] => {
    return entries
      .map(buildBilling)
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [entries]);

  const totalRevenue = billingData.reduce((s, b) => s + b.totalValue, 0);
  const totalHours = billingData.reduce((s, b) => s + b.billableHours, 0);
  const subscriptionCount = billingData.filter(b => b.entry.billingType === 'subscription').length;
  const hourlyCount = billingData.filter(b => b.entry.billingType === 'hourly').length;

  const MONTHS = [
    'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien',
  ];

  return (
    <div>
      <PageHeader title="Rozliczenia" subtitle={`${MONTHS[month]} ${year}`} />

      {/* Month picker */}
      <div className="flex items-center gap-3 mb-5">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid var(--border)', color: 'var(--t)' }}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid var(--border)', color: 'var(--t)' }}
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4" style={{ color: '#4ADE80' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Przychod</span>
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
          <p className="text-2xl font-bold text-white/90">{subscriptionCount}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4" style={{ color: '#FB923C' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Godzinowo</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{hourlyCount}</p>
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
          <p className="text-[13px]" style={{ color: 'var(--tm)' }}>Brak danych w wybranym miesiacu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {billingData.map(b => (
            <BillingCard key={b.entry.relationId} b={b} />
          ))}

          {/* Total bar */}
          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <span className="text-sm font-bold" style={{ color: 'var(--ts)' }}>
              RAZEM: {billingData.length} klientow · {totalHours.toFixed(1)}h
            </span>
            <span className="text-lg font-bold" style={{ color: '#4ADE80' }}>
              {fmtMoney(totalRevenue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

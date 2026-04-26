import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import {
  ChevronLeft, ChevronRight, Receipt, Clock, TrendingUp, Building2, Pencil,
  X, Loader2, AlertTriangle, CheckCircle2, CalendarDays, User, Hash, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatDatePl, cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type BillingType = 'HOURLY' | 'SUBSCRIPTION' | 'HYBRID';
type RelationStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

interface SummarySession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  billableMinutes: number | null;
  hourlyRateNet: string | number | null;
  technician: { id: string; firstName: string; lastName: string };
  ticketNumbers: string[];
}

interface BillingRow {
  relationId: string;
  status: RelationStatus;
  billingType: BillingType;
  hourlyRateNet: number | null;
  monthlyNet: number | null;
  monthlyHours: number | null;
  overageRateNet: number | null;
  billingIncrementMin: number;
  client: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    city: string | null;
  };
  sessionsCount: number;
  totalMinutes: number;
  billableMinutes: number;
  billableHours: number;
  baseCost: number;
  overageHours: number;
  overageCost: number;
  totalValue: number;
  sessions: SummarySession[];
}

interface BillingSummary {
  month: string;
  rows: BillingRow[];
  totals: {
    clients: number;
    activeContracts: number;
    subscriptionCount: number;
    hourlyCount: number;
    hybridCount: number;
    totalBillableMinutes: number;
    totalBillableHours: number;
    totalValue: number;
    totalOverageCost: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(v: number): string {
  return v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN';
}
function fmtHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}
function fmtDur(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
] as const;

const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  HOURLY: 'Godzinowo',
  SUBSCRIPTION: 'Abonament',
  HYBRID: 'Hybryda',
};

function billingTypeVariant(t: BillingType): 'success' | 'info' | 'warning' {
  if (t === 'SUBSCRIPTION') return 'success';
  if (t === 'HYBRID') return 'warning';
  return 'info';
}

// ── Page ───────────────────────────────────────────────────────────────────

export function BillingPage() {
  const [view, setView] = useViewPreference('billing', 'visual');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [typeFilter, setTypeFilter] = useState<'ALL' | BillingType>('ALL');
  const [editRow, setEditRow] = useState<BillingRow | null>(null);

  const { data, isLoading } = useQuery<BillingSummary>({
    queryKey: ['billing-summary', month, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = { month };
      if (typeFilter !== 'ALL') params.billingType = typeFilter;
      return (await api.get('/billing/summary', { params })).data;
    },
  });

  const prev = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y!, m! - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y!, m!, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthDisplay = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[m! - 1]} ${y}`;
  }, [month]);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-5 anim-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Rozliczenia</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            Abonamenty, godziny i szacowane przychody · {monthDisplay}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={setView} />
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={prev} aria-label="Poprzedni miesiąc">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[13px] font-semibold text-tx px-3 py-1 bg-sf-h rounded-[var(--r-s)] min-w-[130px] text-center">
              {monthDisplay}
            </span>
            <Button size="sm" variant="outline" onClick={next} aria-label="Następny miesiąc">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-9 w-auto text-[12px]"
          >
            <option value="ALL">Wszyscy klienci</option>
            <option value="SUBSCRIPTION">Tylko abonamenty</option>
            <option value="HOURLY">Tylko godzinowi</option>
            <option value="HYBRID">Tylko hybryda</option>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stg">
          <StatCard
            icon={TrendingUp}
            label="Do zafakturowania"
            value={fmtMoney(totals.totalValue)}
            accent="success"
          />
          <StatCard
            icon={Clock}
            label="Godzin pracy"
            value={fmtHours(totals.totalBillableHours)}
            accent="primary"
          />
          <StatCard
            icon={CheckCircle2}
            label="Aktywne umowy"
            value={totals.activeContracts}
            accent="neutral"
          />
          <StatCard
            icon={AlertTriangle}
            label="Przekroczenia"
            value={fmtMoney(totals.totalOverageCost)}
            accent={totals.totalOverageCost > 0 ? 'warning' : 'neutral'}
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Receipt className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak danych w {monthDisplay}</p>
          <p className="text-[13px] text-tx3">
            Brak klientów lub żadne sesje nie zostały rozliczone w tym miesiącu.
          </p>
        </Card>
      ) : view === 'visual' ? (
        <BillingGrid rows={rows} onEdit={setEditRow} />
      ) : (
        <BillingTable rows={rows} onEdit={setEditRow} />
      )}

      {/* Total footer */}
      {totals && rows.length > 0 && (
        <Card className="p-4 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-tx">
            RAZEM: {totals.clients} klientów · {fmtHours(totals.totalBillableHours)}
          </span>
          <span className="text-[18px] font-bold text-ok tabular-nums">
            {fmtMoney(totals.totalValue)}
          </span>
        </Card>
      )}

      {/* Edit modal */}
      {editRow && <BillingEditModal row={editRow} onClose={() => setEditRow(null)} />}
    </div>
  );
}

// ── Visual grid ────────────────────────────────────────────────────────────

function BillingGrid({ rows, onEdit }: { rows: BillingRow[]; onEdit: (r: BillingRow) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stg">
      {rows.map((r) => <BillingCard key={r.relationId} row={r} onEdit={onEdit} />)}
    </div>
  );
}

function BillingCard({ row, onEdit }: { row: BillingRow; onEdit: (r: BillingRow) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isSub = row.billingType === 'SUBSCRIPTION' || row.billingType === 'HYBRID';
  const overBudget = row.overageHours > 0;

  return (
    <Card className={cn('p-4 relative group', overBudget && 'border-wn-b')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0 text-[13px] font-bold text-white"
            style={{
              background: row.client.primaryColor
                ? `linear-gradient(135deg, ${row.client.primaryColor}, ${row.client.primaryColor}cc)`
                : 'linear-gradient(135deg, var(--pri), #7c3aed)',
            }}
          >
            {row.client.logoUrl
              ? <img src={row.client.logoUrl} alt="" className="w-full h-full object-contain rounded-[var(--r-s)]" />
              : row.client.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-tx truncate">{row.client.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge variant={billingTypeVariant(row.billingType)} className="text-[10px]">
                {BILLING_TYPE_LABEL[row.billingType]}
              </Badge>
              {row.status !== 'ACTIVE' && (
                <Badge variant="warning" className="text-[10px]">{row.status}</Badge>
              )}
              {row.billingIncrementMin > 1 && (
                <span className="text-[10px] text-tx3">
                  co {row.billingIncrementMin}min
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="text-right">
            <p className="text-[16px] font-bold text-ok tabular-nums leading-tight">
              {fmtMoney(row.totalValue)}
            </p>
            <p className="text-[10px] text-tx3">
              {fmtHours(row.billableHours)} · {row.sessionsCount} sesji
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="p-1.5 rounded opacity-0 group-hover:opacity-100 bg-sf border border-bd hover:border-pri text-tx3 hover:text-pri transition-all"
            title="Edytuj stawkę / abonament"
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>

      {/* Details */}
      {isSub ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-tx3">Abonament:</span>
            <span className="text-tx font-semibold tabular-nums">
              {row.monthlyNet != null ? fmtMoney(row.monthlyNet) : '—'}
              {row.monthlyHours != null && <span className="text-tx3 font-normal"> / {fmtHours(row.monthlyHours)}</span>}
            </span>
          </div>

          {row.monthlyHours != null && row.monthlyHours > 0 && (
            <UsageBar used={row.billableHours} included={row.monthlyHours} />
          )}

          {row.overageHours > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-wn">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Przekroczenie {fmtHours(row.overageHours)} × {row.overageRateNet ?? row.hourlyRateNet ?? 0} PLN/h
              <span className="ml-auto font-semibold tabular-nums">{fmtMoney(row.overageCost)}</span>
            </div>
          )}

          {row.billingType === 'HYBRID' && row.monthlyHours == null && row.hourlyRateNet && (
            <div className="text-[11px] text-tx3">
              + {fmtHours(row.billableHours)} × {row.hourlyRateNet} PLN/h = <span className="text-tx font-semibold">{fmtMoney(row.overageCost)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-tx2 tabular-nums">
          {fmtHours(row.billableHours)} × {row.hourlyRateNet ?? 0} PLN/h = <span className="text-ok font-semibold">{fmtMoney(row.baseCost)}</span>
        </div>
      )}

      {/* Expand sessions */}
      {row.sessionsCount > 0 && (
        <div className="mt-3 pt-3 border-t border-bd">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-[11px] font-medium text-tx3 hover:text-tx transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {row.sessionsCount} {row.sessionsCount === 1 ? 'sesja' : 'sesji'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {row.sessions.map((s) => <SessionRow key={s.id} session={s} billingType={row.billingType} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function UsageBar({ used, included }: { used: number; included: number }) {
  const pct = (used / included) * 100;
  const clamped = Math.min(pct, 100);
  const color = pct > 100 ? 'var(--er)' : pct > 80 ? 'var(--wn)' : 'var(--ok)';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-sf-h">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums w-10 text-right" style={{ color }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

function SessionRow({ session, billingType }: { session: SummarySession; billingType: BillingType }) {
  const rate = session.hourlyRateNet != null ? Number(session.hourlyRateNet) : null;
  const cost = billingType === 'HOURLY' && rate && session.billableMinutes
    ? (session.billableMinutes / 60) * rate
    : null;
  return (
    <div className="flex items-center gap-2 text-[11px] py-1 px-2 rounded bg-sf-h">
      <CalendarDays className="h-3 w-3 shrink-0 text-tx3" />
      <span className="text-tx2">{formatDatePl(session.startedAt)}</span>
      <span className="inline-flex items-center gap-1 text-tx3">
        <User className="h-3 w-3" />
        {session.technician.firstName} {session.technician.lastName}
      </span>
      {session.ticketNumbers.length > 0 && (
        <span className="inline-flex items-center gap-1 font-mono text-pri text-[10px]">
          <Hash className="h-3 w-3" />
          {session.ticketNumbers.join(', ')}
        </span>
      )}
      <span className="ml-auto font-semibold text-tx tabular-nums">
        {fmtDur(session.billableMinutes ?? session.durationMinutes ?? 0)}
      </span>
      <span className="font-semibold tabular-nums w-20 text-right" style={{ color: cost != null ? 'var(--ok)' : 'var(--tx3)' }}>
        {cost != null ? fmtMoney(cost) : billingType === 'HOURLY' ? '—' : 'w pakiecie'}
      </span>
    </div>
  );
}

// ── Tabular view ───────────────────────────────────────────────────────────

function BillingTable({ rows, onEdit }: { rows: BillingRow[]; onEdit: (r: BillingRow) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-sf-h border-b border-bd">
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
              <th className="px-4 py-2.5 font-bold">Klient</th>
              <th className="px-4 py-2.5 font-bold">Model</th>
              <th className="px-4 py-2.5 font-bold">Stawka / abonament</th>
              <th className="px-4 py-2.5 font-bold">Godziny</th>
              <th className="px-4 py-2.5 font-bold">Sesji</th>
              <th className="px-4 py-2.5 font-bold">Przekroczenie</th>
              <th className="px-4 py-2.5 font-bold text-right">Do zafakturowania</th>
              <th className="px-4 py-2.5 font-bold w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {rows.map((r) => (
              <tr key={r.relationId} className="hover:bg-sf-h group">
                <td className="px-4 py-3 text-tx">
                  <div className="font-medium">{r.client.name}</div>
                  {r.client.city && <div className="text-[11px] text-tx3">{r.client.city}</div>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={billingTypeVariant(r.billingType)}>{BILLING_TYPE_LABEL[r.billingType]}</Badge>
                </td>
                <td className="px-4 py-3 text-tx2 text-[12px] tabular-nums">
                  {r.billingType === 'HOURLY'
                    ? (r.hourlyRateNet != null ? `${r.hourlyRateNet} PLN/h` : '—')
                    : (
                      <span>
                        {r.monthlyNet != null ? `${r.monthlyNet} PLN` : '—'}
                        {r.monthlyHours != null && <span className="text-tx3"> / {r.monthlyHours}h</span>}
                      </span>
                    )
                  }
                </td>
                <td className="px-4 py-3 text-tx tabular-nums">{fmtHours(r.billableHours)}</td>
                <td className="px-4 py-3 text-tx2 tabular-nums">{r.sessionsCount}</td>
                <td className="px-4 py-3 tabular-nums">
                  {r.overageHours > 0
                    ? <span className="text-wn font-medium">+{fmtHours(r.overageHours)} = {fmtMoney(r.overageCost)}</span>
                    : <span className="text-tx3">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-right font-semibold text-ok tabular-nums">
                  {fmtMoney(r.totalValue)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri opacity-60 group-hover:opacity-100"
                    title="Edytuj stawkę / abonament"
                  >
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────

const MODAL_SHELL_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  margin: 'auto',
  height: 'fit-content',
  zIndex: 50,
  width: 'min(92vw, 32rem)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--sf)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r-xl)',
  boxShadow: 'var(--sh4)',
  overflow: 'hidden',
};

const MODAL_BODY_STYLE: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: '20px 24px',
};

function BillingEditModal({ row, onClose }: { row: BillingRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    billingType: row.billingType,
    hourlyRateNet: row.hourlyRateNet != null ? String(row.hourlyRateNet) : '',
    monthlyNet: row.monthlyNet != null ? String(row.monthlyNet) : '',
    monthlyHours: row.monthlyHours != null ? String(row.monthlyHours) : '',
    status: row.status,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        billingType: form.billingType,
        status: form.status,
        hourlyRateNet: form.hourlyRateNet === '' ? null : Number(form.hourlyRateNet),
        monthlyNet: form.monthlyNet === '' ? null : Number(form.monthlyNet),
        monthlyHours: form.monthlyHours === '' ? null : Number(form.monthlyHours),
      };
      return (await api.patch(`/clients/${row.client.id}`, payload)).data;
    },
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['billing-summary'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd zapisu';
      toast.error(msg);
    },
  });

  const isHourly = form.billingType === 'HOURLY';
  const isSub = form.billingType === 'SUBSCRIPTION';
  const isHybrid = form.billingType === 'HYBRID';

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Rozliczenia — {row.client.name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
            style={MODAL_BODY_STYLE}
            className="space-y-5"
          >
            {/* Billing type selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">Typ rozliczenia</label>
              <div className="grid grid-cols-3 gap-2">
                <TypeCard
                  icon={Clock}
                  label="Godzinowo"
                  desc="Stawka × czas"
                  selected={isHourly}
                  onClick={() => setForm({ ...form, billingType: 'HOURLY' })}
                />
                <TypeCard
                  icon={Receipt}
                  label="Abonament"
                  desc="Stała opłata"
                  selected={isSub}
                  onClick={() => setForm({ ...form, billingType: 'SUBSCRIPTION' })}
                />
                <TypeCard
                  icon={Building2}
                  label="Hybryda"
                  desc="Opłata + godz."
                  selected={isHybrid}
                  onClick={() => setForm({ ...form, billingType: 'HYBRID' })}
                />
              </div>
            </div>

            {/* Hourly rate */}
            {(isHourly || isHybrid) && (
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Stawka godzinowa (PLN/h netto)</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.hourlyRateNet}
                  onChange={(e) => setForm({ ...form, hourlyRateNet: e.target.value })}
                  placeholder="np. 150"
                />
                <p className="text-[10px] text-tx3 mt-1">
                  {isHybrid ? 'Używane po przekroczeniu godzin w abonamencie.' : 'Naliczane od każdej godziny pracy.'}
                </p>
              </div>
            )}

            {/* Subscription fields */}
            {(isSub || isHybrid) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Kwota abonamentu (PLN/msc netto)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.monthlyNet}
                    onChange={(e) => setForm({ ...form, monthlyNet: e.target.value })}
                    placeholder="np. 1500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-tx3 mb-1">Godziny w pakiecie</label>
                  <Input
                    type="number"
                    step="1"
                    min={0}
                    value={form.monthlyHours}
                    onChange={(e) => setForm({ ...form, monthlyHours: e.target.value })}
                    placeholder="np. 10"
                  />
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Status umowy</label>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as RelationStatus })}
              >
                <option value="ACTIVE">Aktywna</option>
                <option value="SUSPENDED">Zawieszona</option>
                <option value="TERMINATED">Zakończona</option>
              </Select>
            </div>

            {/* Live preview */}
            <div className="p-3 rounded-[var(--r-s)] bg-sf-h border border-bd">
              <p className="text-[10px] uppercase tracking-[.1em] font-bold text-tx3 mb-1">Podgląd — ten miesiąc</p>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-tx2">{fmtHours(row.billableHours)} · {row.sessionsCount} sesji</span>
                <span className="font-bold text-ok tabular-nums">
                  {fmtMoney(computePreview(form, row.billableHours))}
                </span>
              </div>
            </div>
          </form>

          <div className="px-6 py-4 border-t border-bd flex items-center justify-end gap-2 bg-sf-h" style={{ flexShrink: 0 }}>
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TypeCard({
  icon: Icon, label, desc, selected, onClick,
}: {
  icon: typeof Clock; label: string; desc: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 p-3 rounded-[var(--r-s)] border transition-all text-center',
        selected ? 'border-pri bg-pri-l' : 'border-bd hover:bg-sf-h',
      )}
    >
      <Icon className={cn('h-5 w-5', selected ? 'text-pri' : 'text-tx3')} />
      <span className={cn('text-[12px] font-semibold', selected ? 'text-pri' : 'text-tx')}>{label}</span>
      <span className="text-[10px] text-tx3">{desc}</span>
    </button>
  );
}

function computePreview(
  form: { billingType: BillingType; hourlyRateNet: string; monthlyNet: string; monthlyHours: string },
  actualHours: number,
): number {
  const rate = form.hourlyRateNet === '' ? 0 : Number(form.hourlyRateNet);
  const monthly = form.monthlyNet === '' ? 0 : Number(form.monthlyNet);
  const included = form.monthlyHours === '' ? 0 : Number(form.monthlyHours);

  if (form.billingType === 'HOURLY') return actualHours * rate;
  if (form.billingType === 'SUBSCRIPTION') {
    const over = included > 0 ? Math.max(0, actualHours - included) : 0;
    return monthly + over * rate;
  }
  // HYBRID
  const over = included > 0 ? Math.max(0, actualHours - included) : actualHours;
  return monthly + over * rate;
}

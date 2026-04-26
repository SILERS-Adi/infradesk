import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Zap, Check, Sparkles, Shield, Briefcase, CreditCard, Calendar,
  HardDrive, Archive, Bot, Ticket, Laptop, Clock, Users as UsersIcon,
  ShoppingCart, Plane, MapPin, Activity, Lock, TrendingUp, Wallet, FileText, Download,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { SkeletonCard } from '@/components/ui/Skeleton';

type PlanKey = 'STARTER' | 'PRO' | 'ENTERPRISE';

interface Workspace {
  id: string;
  plan: PlanKey;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
  currency: string;
}

interface ModuleRow {
  key: string;
  label: string;
  description: string;
  requiredPlan: PlanKey;
  unlocked: boolean;
  enabled: boolean;
}

interface CostsResponse {
  month: string;
  breakdown: {
    ai: { costPln: number; calls: number };
    storage: { costPln: number; bytes: number; gb: number };
    backup: { costPln: number };
  };
  totalPln: number;
  trend: Array<{ month: string; ai: number; storage: number; backup: number; total: number }>;
}

interface InvoiceRow {
  id: string;
  issuedAt: string;
  amountPln: number;
  periodFrom: string;
  periodTo: string;
  status: 'PAID' | 'PENDING' | 'FAILED';
  pdfUrl?: string | null;
}

const PLANS: Array<{
  key: PlanKey;
  label: string;
  price: string;
  priceSuffix: string;
  color: string;
  features: string[];
  popular?: boolean;
}> = [
  {
    key: 'STARTER',
    label: 'Starter',
    price: '0',
    priceSuffix: 'zawsze darmowe',
    color: 'var(--tx2)',
    features: [
      'Do 3 użytkowników',
      'Do 25 urządzeń',
      'Tickety + Sesje',
      'Sejf haseł',
      'Email support',
    ],
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: '299',
    priceSuffix: 'zł / miesiąc',
    color: 'var(--pri)',
    popular: true,
    features: [
      'Do 15 użytkowników',
      'Nielimitowane urządzenia',
      'Wszystko ze Starter +',
      'Backupy + Monitoring',
      'Desktop Asystent',
      'AI Copilot Iris',
      'Priority support',
    ],
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    price: 'Ustal',
    priceSuffix: 'indywidualnie',
    color: 'var(--wn)',
    features: [
      'Nielimitowani użytkownicy',
      'Wszystko z Pro +',
      'SLA 99.9%',
      'GPS Field Service',
      'Shadow AI Mode',
      'On-premise opcja',
      'Dedykowany CSM',
    ],
  },
];

const TIER_ORDER: Record<PlanKey, number> = { STARTER: 0, PRO: 1, ENTERPRISE: 2 };

const MODULE_ICONS: Record<string, LucideIcon> = {
  tickets:     Ticket,
  devices:     Laptop,
  sessions:    Clock,
  vault:       Shield,
  clients:     UsersIcon,
  orders:      ShoppingCart,
  delegations: Plane,
  backups:     Archive,
  monitoring:  Activity,
  'ai.copilot': Sparkles,
  downloads:   HardDrive,
  gps:         MapPin,
};

function moduleIcon(key: string): LucideIcon {
  return MODULE_ICONS[key] ?? Zap;
}

const PLN = (n: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(n);

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ────────────────────────────────────────────────────────────────────
// Sparkline (SVG): 6-month trend chart
// ────────────────────────────────────────────────────────────────────
function TrendChart({ data }: { data: CostsResponse['trend'] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const w = 560;
  const h = 120;
  const pad = 24;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: pad + i * step,
    y: pad + innerH - (d.total / max) * innerH,
    d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${(points[points.length - 1]?.x ?? pad).toFixed(1)} ${pad + innerH} L${pad} ${pad + innerH} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pri)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--pri)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={pad}
            x2={w - pad}
            y1={pad + innerH * frac}
            y2={pad + innerH * frac}
            stroke="var(--bd)"
            strokeDasharray="2 4"
            strokeWidth={0.5}
          />
        ))}
        <path d={areaD} fill="url(#costGrad)" />
        <path d={pathD} fill="none" stroke="var(--pri)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="var(--sf)" stroke="var(--pri)" strokeWidth={2} />
            <text x={p.x} y={h - 4} textAnchor="middle" fontSize={9} fill="var(--tx3)">
              {p.d.month.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────
export function PlanAndModulesPage() {
  const qc = useQueryClient();

  const planQ = useQuery<{ plan: Workspace }>({
    queryKey: ['workspace', 'plan'],
    queryFn: async () => (await api.get<{ plan: Workspace }>('/workspaces/current/plan')).data,
  });

  const modulesQ = useQuery<{ modules: ModuleRow[]; currentPlan: PlanKey }>({
    queryKey: ['workspace', 'modules'],
    queryFn: async () => (await api.get<{ modules: ModuleRow[]; currentPlan: PlanKey }>('/workspaces/current/modules')).data,
  });

  const costsQ = useQuery<CostsResponse>({
    queryKey: ['workspace', 'costs'],
    queryFn: async () => (await api.get<CostsResponse>('/workspaces/current/costs')).data,
  });

  const invoicesQ = useQuery<{ invoices: InvoiceRow[] }>({
    queryKey: ['workspace', 'invoices'],
    queryFn: async () => (await api.get<{ invoices: InvoiceRow[] }>('/workspaces/current/invoices')).data,
  });

  const meQ = useQuery<{ auth: { sub: string; email: string; isSuperAdmin?: boolean } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get<{ auth: { sub: string; email: string; isSuperAdmin?: boolean } }>('/auth/me')).data,
    staleTime: 5 * 60_000,
  });
  const isSuperAdmin = meQ.data?.auth?.isSuperAdmin === true;

  const planMut = useMutation({
    mutationFn: async (newPlan: PlanKey) =>
      (await api.put('/workspaces/current/plan', { plan: newPlan })).data,
    onSuccess: () => {
      toast.success('Plan zmieniony');
      qc.invalidateQueries({ queryKey: ['workspace', 'plan'] });
      qc.invalidateQueries({ queryKey: ['workspace', 'modules'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Nie udało się zmienić planu',
      ),
  });

  const toggleMut = useMutation({
    mutationFn: async (vars: { moduleKey: string; enabled: boolean }) =>
      (await api.patch('/workspaces/current/modules', vars)).data,
    onSuccess: () => {
      toast.success('Moduł zaktualizowany');
      qc.invalidateQueries({ queryKey: ['workspace', 'modules'] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Nie udało się zaktualizować modułu',
      ),
  });

  const currentPlan: PlanKey = planQ.data?.plan.plan ?? 'STARTER';
  const currentPlanMeta = useMemo(() => PLANS.find((p) => p.key === currentPlan)!, [currentPlan]);
  const currentTier = TIER_ORDER[currentPlan];

  if (planQ.isLoading) {
    return (
      <div className="space-y-[var(--sp-5)]">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const plan = planQ.data?.plan;
  const enabledModulesCount = modulesQ.data?.modules.filter((m) => m.enabled).length ?? 0;

  return (
    <div className="space-y-[var(--sp-5)]">
      {/* ═══════════════════════════════════════════════════════════════
          Header
         ═══════════════════════════════════════════════════════════════ */}
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Plan i moduły</h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Zarządzaj subskrypcją, aktywnymi modułami i kosztami miesięcznymi.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Section 1 — HERO: Current Plan
         ═══════════════════════════════════════════════════════════════ */}
      <Card
        className="p-[var(--sp-5)] relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${currentPlanMeta.color} 12%, var(--sf)) 0%, var(--sf) 60%)`,
          borderColor: currentPlanMeta.color,
        }}
      >
        <div
          aria-hidden
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${currentPlanMeta.color}, transparent 70%)` }}
        />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-[var(--sp-4)] justify-between">
          <div className="flex items-center gap-[var(--sp-4)]">
            <div
              className="w-14 h-14 rounded-[var(--r-m)] flex items-center justify-center shrink-0"
              style={{ background: `color-mix(in srgb, ${currentPlanMeta.color} 18%, transparent)`, color: currentPlanMeta.color }}
            >
              <CreditCard size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--tx3)]">
                  Aktywny plan
                </span>
                <Badge variant="success">Aktualny</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold" style={{ color: currentPlanMeta.color }}>
                  {currentPlanMeta.label}
                </span>
                <span className="text-[15px] text-[var(--tx2)]">
                  · {currentPlanMeta.price === '0' ? 'darmowy' : currentPlanMeta.price === 'Ustal' ? 'enterprise' : `${currentPlanMeta.price} zł/mc`}
                </span>
              </div>
              <div className="flex items-center gap-[var(--sp-3)] mt-1.5 text-[12px] text-[var(--tx3)]">
                <span className="flex items-center gap-1">
                  <Zap size={12} /> {enabledModulesCount} aktywnych modułów
                </span>
                {plan?.planExpiresAt && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> Następne rozliczenie: {formatDate(plan.planExpiresAt)}
                  </span>
                )}
                {plan?.trialEndsAt && (
                  <Badge variant="warning">Trial do {formatDate(plan.trialEndsAt)}</Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              document.getElementById('pricing-tiers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            Zmień plan
          </Button>
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════
          Section 2 — Pricing Tiers
         ═══════════════════════════════════════════════════════════════ */}
      <section id="pricing-tiers">
        <div className="mb-[var(--sp-3)]">
          <h2 className="text-[16px] font-semibold">Dostępne plany</h2>
          <p className="text-[12px] text-[var(--tx3)] mt-0.5">
            Wybierz plan dopasowany do rozmiaru Twojego zespołu.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
          {PLANS.map((p) => {
            const isActive = p.key === currentPlan;
            const isDowngrade = TIER_ORDER[p.key] < currentTier;
            return (
              <Card
                key={p.key}
                className="p-[var(--sp-5)] relative transition-all"
                style={isActive
                  ? { borderColor: p.color, borderWidth: 2, background: `color-mix(in srgb, ${p.color} 4%, var(--sf))` }
                  : p.popular
                    ? { borderColor: p.color, borderWidth: 1 }
                    : undefined}
              >
                {p.popular && !isActive && (
                  <Badge variant="accent" className="absolute top-3 right-3">Polecany</Badge>
                )}
                {isActive && <Badge variant="success" className="absolute top-3 right-3">Aktualny</Badge>}
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[18px] font-semibold" style={{ color: p.color }}>{p.label}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-[var(--sp-4)]">
                  <span className="text-[32px] font-bold tabular-nums">{p.price}</span>
                  <span className="text-[12px] text-[var(--tx3)]">{p.priceSuffix}</span>
                </div>
                <ul className="space-y-2 mb-[var(--sp-4)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <Check size={13} className="mt-0.5 shrink-0" style={{ color: p.color }} />
                      <span className="text-[var(--tx)]">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isActive ? 'outline' : p.popular ? 'primary' : 'outline'}
                  className="w-full"
                  disabled={isActive || (!isSuperAdmin) || planMut.isPending}
                  onClick={() => {
                    if (isActive || !isSuperAdmin) return;
                    if (window.confirm(`Zmienić plan na ${p.label}?`)) {
                      planMut.mutate(p.key);
                    }
                  }}
                  title={
                    isActive
                      ? 'To Twój aktualny plan'
                      : isSuperAdmin
                        ? `Zmień plan na ${p.label}`
                        : 'Tylko super-admin może zmienić plan'
                  }
                >
                  {isActive ? 'Aktualny plan' : isDowngrade ? 'Downgrade' : 'Wybierz plan'}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          Section 3 — Modules
         ═══════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-[var(--sp-3)] flex items-baseline justify-between">
          <div>
            <h2 className="text-[16px] font-semibold">Moduły</h2>
            <p className="text-[12px] text-[var(--tx3)] mt-0.5">
              Włącz lub wyłącz funkcjonalności dla Twojego workspace.
            </p>
          </div>
          {modulesQ.data && (
            <span className="text-[12px] text-[var(--tx3)]">
              {enabledModulesCount} / {modulesQ.data.modules.length} aktywnych
            </span>
          )}
        </div>
        {modulesQ.isLoading ? (
          <SkeletonCard />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-3)]">
            {modulesQ.data?.modules.map((m) => {
              const Icon = moduleIcon(m.key);
              const locked = !m.unlocked;
              return (
                <Card
                  key={m.key}
                  className="p-[var(--sp-4)] transition-all"
                  style={{ opacity: locked ? 0.65 : 1 }}
                >
                  <div className="flex items-start gap-[var(--sp-3)]">
                    <div
                      className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                      style={{
                        background: m.enabled
                          ? 'color-mix(in srgb, var(--ok) 12%, transparent)'
                          : 'var(--sf-h)',
                        color: m.enabled ? 'var(--ok)' : 'var(--tx3)',
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-semibold text-[var(--tx)]">{m.label}</span>
                        {locked && <Lock size={11} className="text-[var(--tx3)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--tx3)] leading-snug mb-[var(--sp-3)]">
                        {m.description}
                      </p>
                      <div className="flex items-center justify-between">
                        {locked ? (
                          <Badge variant="warning">Wymaga {m.requiredPlan}</Badge>
                        ) : m.enabled ? (
                          <Badge variant="success">Aktywny</Badge>
                        ) : (
                          <Badge variant="neutral">Wyłączony</Badge>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={m.enabled}
                          disabled={locked || toggleMut.isPending}
                          onClick={() => toggleMut.mutate({ moduleKey: m.key, enabled: !m.enabled })}
                          className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            background: m.enabled ? 'var(--ok)' : 'var(--bd)',
                          }}
                        >
                          <span
                            className="inline-block h-4 w-4 rounded-full bg-white shadow-1 transition-transform"
                            style={{ transform: m.enabled ? 'translateX(18px)' : 'translateX(2px)', marginTop: 2 }}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          Section 4 — Monthly costs + trend
         ═══════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-[var(--sp-3)]">
          <h2 className="text-[16px] font-semibold">Koszty miesięczne</h2>
          <p className="text-[12px] text-[var(--tx3)] mt-0.5">
            Zużycie AI, przestrzeń dyskowa i backupy w bieżącym miesiącu.
          </p>
        </div>
        {costsQ.isLoading ? (
          <SkeletonCard />
        ) : costsQ.data ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-[var(--sp-3)]">
            <div className="space-y-[var(--sp-3)]">
              <StatCard
                icon={Bot}
                label="AI (Iris)"
                value={PLN(costsQ.data.breakdown.ai.costPln)}
                accent="primary"
              />
              <StatCard
                icon={HardDrive}
                label={`Dysk · ${costsQ.data.breakdown.storage.gb.toFixed(2)} GB`}
                value={PLN(costsQ.data.breakdown.storage.costPln)}
                accent="success"
              />
              <StatCard
                icon={Archive}
                label="Backupy"
                value={PLN(costsQ.data.breakdown.backup.costPln)}
                accent="neutral"
              />
              <StatCard
                icon={Wallet}
                label="Razem w tym miesiącu"
                value={PLN(costsQ.data.totalPln)}
                accent="warning"
              />
            </div>
            <Card className="p-[var(--sp-4)]">
              <div className="flex items-center justify-between mb-[var(--sp-3)]">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-[var(--pri)]" />
                  <span className="text-[13px] font-semibold">Trend 6 miesięcy</span>
                </div>
                <Badge variant="accent">{costsQ.data.month}</Badge>
              </div>
              <TrendChart data={costsQ.data.trend} />
              <div className="mt-[var(--sp-3)] grid grid-cols-3 gap-[var(--sp-2)] text-[11px]">
                <div className="text-center">
                  <div className="text-[var(--tx3)]">Min</div>
                  <div className="font-semibold tabular-nums">
                    {PLN(Math.min(...costsQ.data.trend.map((t) => t.total)))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[var(--tx3)]">Średnio</div>
                  <div className="font-semibold tabular-nums">
                    {PLN(costsQ.data.trend.reduce((a, b) => a + b.total, 0) / costsQ.data.trend.length)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[var(--tx3)]">Max</div>
                  <div className="font-semibold tabular-nums">
                    {PLN(Math.max(...costsQ.data.trend.map((t) => t.total)))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          Section 5 — Invoice history
         ═══════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-[var(--sp-3)]">
          <h2 className="text-[16px] font-semibold">Historia płatności</h2>
          <p className="text-[12px] text-[var(--tx3)] mt-0.5">
            Faktury za subskrypcję i dodatkowe usługi.
          </p>
        </div>
        <Card className="overflow-hidden">
          {invoicesQ.isLoading ? (
            <div className="p-[var(--sp-5)] text-center text-[12px] text-[var(--tx3)]">Ładowanie…</div>
          ) : !invoicesQ.data || invoicesQ.data.invoices.length === 0 ? (
            <div className="p-[var(--sp-6)] text-center">
              <FileText size={32} className="mx-auto text-[var(--tx3)] mb-2" />
              <p className="text-[13px] font-medium text-[var(--tx2)]">Brak faktur</p>
              <p className="text-[11px] text-[var(--tx3)] mt-1">
                Faktury pojawią się tutaj po pierwszej płatności za plan Pro lub Enterprise.
              </p>
              {/* TODO: wire to Stripe invoices API in Sprint 6 */}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-[var(--bd)] bg-[var(--sf-h)]">
                  <tr className="text-left text-[10px] uppercase tracking-[.12em] text-[var(--tx3)]">
                    <th className="px-[var(--sp-4)] py-[var(--sp-3)]">Data</th>
                    <th className="px-[var(--sp-4)] py-[var(--sp-3)]">Okres</th>
                    <th className="px-[var(--sp-4)] py-[var(--sp-3)] text-right">Kwota</th>
                    <th className="px-[var(--sp-4)] py-[var(--sp-3)]">Status</th>
                    <th className="px-[var(--sp-4)] py-[var(--sp-3)] text-right">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesQ.data.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-[var(--bd)] last:border-0">
                      <td className="px-[var(--sp-4)] py-[var(--sp-3)]">{formatDate(inv.issuedAt)}</td>
                      <td className="px-[var(--sp-4)] py-[var(--sp-3)] text-[var(--tx3)]">
                        {formatDate(inv.periodFrom)} — {formatDate(inv.periodTo)}
                      </td>
                      <td className="px-[var(--sp-4)] py-[var(--sp-3)] text-right font-semibold tabular-nums">
                        {PLN(inv.amountPln)}
                      </td>
                      <td className="px-[var(--sp-4)] py-[var(--sp-3)]">
                        {inv.status === 'PAID' && <Badge variant="success">Opłacona</Badge>}
                        {inv.status === 'PENDING' && <Badge variant="warning">W toku</Badge>}
                        {inv.status === 'FAILED' && <Badge variant="danger">Nieudana</Badge>}
                      </td>
                      <td className="px-[var(--sp-4)] py-[var(--sp-3)] text-right">
                        {inv.pdfUrl ? (
                          <a href={inv.pdfUrl} className="inline-flex items-center gap-1 text-[var(--pri)] hover:underline">
                            <Download size={12} /> Pobierz
                          </a>
                        ) : (
                          <span className="text-[var(--tx3)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Footer note */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] justify-center pt-[var(--sp-2)]">
        <Briefcase size={11} />
        <span>Potrzebujesz Enterprise? Napisz na bok@infradesk.pl — przygotujemy ofertę dopasowaną do Ciebie.</span>
      </div>
    </div>
  );
}

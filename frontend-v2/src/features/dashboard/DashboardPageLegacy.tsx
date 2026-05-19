import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Ticket, Server, AlertTriangle, Clock, RefreshCw, Loader2, Send } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Gauge } from '@/components/ui/Gauge';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { StatusPill } from '@/components/ui/StatusPill';
import { IDCore, type IDCoreState } from '@/components/iris/IDCore';
import { useAuthStore } from '@/store/auth';
import { formatRelativePl } from '@/lib/utils';
import { OnboardingChecklist } from './OnboardingChecklist';

interface TicketRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface OverviewResp {
  summary: {
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    activeAlerts: number;
    criticalAlerts: number;
    avgAuditScore: number | null;
  };
}

const IRIS_SUGGESTIONS = [
  'Pokaż otwarte krytyczne tickety',
  'Które urządzenia nie raportowały dziś?',
  'Podsumuj co się działo wczoraj',
  'Zestawienie rozliczeń za ten miesiąc',
];

export function DashboardPageLegacy() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [irisQ, setIrisQ] = useState('');

  // Pay.infradesk.pl redirectuje tu po sukcesie z ?paid=ok — pokaż potwierdzenie i wyczyść param.
  useEffect(() => {
    if (searchParams.get('paid') === 'ok') {
      toast.success('🎉 Płatność przyjęta — plan zostanie aktywowany w ciągu kilku minut.');
      const next = new URLSearchParams(searchParams);
      next.delete('paid');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, isFetching, refetch } = useQuery<{ items: TicketRow[] }>({
    queryKey: ['dashboard', 'recent-tickets'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 10 } })).data,
  });

  // Monitoring overview drives IrisCore score + alerts + device counts.
  const { data: overview } = useQuery<OverviewResp>({
    queryKey: ['dashboard', 'monitoring-overview'],
    queryFn: async () => (await api.get('/monitoring/overview')).data,
    refetchInterval: 60_000,
    // If user has no access to monitoring module (403), don't retry forever.
    retry: false,
  });

  // P1.24 — wcześniej "Aktywne sesje" było hardcoded "—". Teraz: zapytanie do
  // /sessions/stats (chronione MODULES.SESSIONS:view). Przy braku dostępu —
  // fallback do "—".
  const { data: sessStats } = useQuery<{ stats: { active: number } }>({
    queryKey: ['dashboard', 'sessions-stats'],
    queryFn: async () => (await api.get('/sessions/stats')).data,
    refetchInterval: 60_000,
    retry: false,
  });

  const items = data?.items ?? [];
  const open = items.filter((t) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
  const critical = items.filter((t) => t.priority === 'CRITICAL').length;
  const inProgress = items.filter((t) => t.status === 'IN_PROGRESS').length;

  // Iris visual state driven by live monitoring data (if available).
  const sum = overview?.summary;
  const irisScore: number | undefined = sum?.avgAuditScore ?? undefined;
  const irisAlerts = sum?.activeAlerts ?? 0;
  const irisStatus: 'ok' | 'warning' | 'critical' | 'offline' = !sum
    ? 'ok'
    : (sum.criticalAlerts ?? 0) > 0
      ? 'critical'
      : (((sum as any).highAlerts ?? 0) > 0)
        ? 'warning'
        : 'ok';
  const devicesOnlineLabel: number | string = sum ? sum.onlineDevices : '—';

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';

  // SLA % — backend liczy w `/dashboard/summary` (tickets-with-policy / breached).
  // Gdy brakuje policy lub danych = null. Nie rysujemy gauge'a z fałszywą liczbą.
  const slaPct: number | null = (sum as { slaCompliancePct?: number | null } | undefined)?.slaCompliancePct ?? null;

  function mapIrisStateToIDCore(s: 'ok' | 'warning' | 'critical' | 'offline'): IDCoreState {
    if (s === 'critical') return 'critical';
    if (s === 'warning') return 'warning';
    return 'idle';
  }

  function askIris(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      navigate('/ai');
      return;
    }
    navigate(`/ai?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="anim-up space-y-5">
      <OnboardingChecklist />
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-tx">
            {greeting}{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {open.length > 0 ? `${open.length} otwart${open.length === 1 ? 'e zgłoszenie' : open.length < 5 ? 'e zgłoszenia' : 'ych zgłoszeń'}` : 'Brak otwartych zgłoszeń — spokój'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-[var(--r-s)] text-tx3 press hover:bg-sf-h transition-colors"
          title="Odśwież"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {/* Iris hero panel — visual identity + entry point */}
      <Card className="rounded-[var(--r-l)] p-6 anim-scale iris-hero">
        <div className="flex items-center gap-6 flex-wrap md:flex-nowrap">
          <button
            type="button"
            onClick={() => navigate('/ai')}
            aria-label="Otwórz Iris — asystent AI"
            className="flex items-center justify-center shrink-0 bg-transparent border-none p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pri/60 rounded-full"
            style={{ width: 220, height: 220 }}
          >
            <IDCore
              size={220}
              state={mapIrisStateToIDCore(irisStatus)}
              healthScore={irisScore ?? 0}
              metrics={{
                sla: slaPct ?? 0,
                alerts: irisAlerts,
                devices: typeof devicesOnlineLabel === 'number' ? devicesOnlineLabel : sum?.totalDevices ?? 0,
                sessions: inProgress,
              }}
              showOrbits={false}
            />
          </button>
          <div className="flex-1 min-w-[260px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: 'var(--pri)' }}>
              Iris
            </p>
            <h2 className="text-[24px] font-bold text-tx leading-tight mb-1">
              Asystent AI Twojej infrastruktury
            </h2>
            <p className="text-[13px] text-tx2 mb-4 max-w-[520px]">
              Zapytaj o tickety, urządzenia, klientów i rozliczenia. Iris zna Twój workspace i odpowie w ciągu sekund.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); askIris(irisQ); }}
              className="flex items-center gap-2 mb-3"
            >
              <input
                value={irisQ}
                onChange={(e) => setIrisQ(e.target.value)}
                placeholder="Zapytaj Iris…"
                aria-label="Zapytaj Iris"
                className="flex-1 px-3 py-[10px] text-[13px] rounded-[var(--r-s)] bg-sf2 border border-bd text-tx placeholder:text-tx3 focus:outline-none focus:ring-[3px] focus:ring-[var(--pri-glow)] focus:border-[var(--bd-f)]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-[10px] rounded-[var(--r-s)] text-[13px] font-medium text-white press transition-colors"
                style={{ background: 'var(--pri)' }}
              >
                <Send size={14} /> Zapytaj
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {IRIS_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => askIris(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-bd text-tx2 hover:bg-sf-h hover:text-tx transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Hero — SLA gauge + summary */}
      <Card className="rounded-[var(--r-l)] p-6 anim-scale">
        <div className="flex items-center gap-7 flex-wrap">
          {slaPct != null
            ? <Gauge pct={slaPct} size={160} label="SLA zgodność" />
            : <div className="w-[160px] h-[160px] flex items-center justify-center rounded-full border border-dashed border-bd text-tx3 text-[11px] text-center px-3">SLA<br/>brak danych</div>}
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-4 text-tx3">
              Dzisiaj w liczbach
            </p>
            <div className="grid grid-cols-2 gap-4 stg">
              <InlineStat icon={Ticket} n={open.length} l="Otwartych" color="var(--pri)" />
              <InlineStat icon={AlertTriangle} n={critical} l="Krytycznych" color="var(--er)" />
              <InlineStat icon={Clock} n={inProgress} l="W toku" color="var(--wn)" />
              <InlineStat icon={Server} n={devicesOnlineLabel} l="Urządzeń online" color="var(--ok)" />
            </div>
          </div>
        </div>
      </Card>

      {/* Stat cards below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stg">
        <StatCard icon={Ticket} label="Otwarte zgłoszenia" value={open.length} accent="primary" />
        <StatCard icon={AlertTriangle} label="Krytyczne" value={critical} accent="danger" />
        <StatCard icon={Server} label="Urządzenia" value={sum ? sum.totalDevices : '—'} accent="neutral" />
        <StatCard icon={Clock} label="Aktywne sesje" value={sessStats?.stats.active ?? '—'} accent="warning" />
      </div>

      <AgentVersionWidget />

      {/* Recent tickets */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Ostatnie zgłoszenia</CardTitle>
          <Link to="/tickets" className="text-[12px] font-medium" style={{ color: 'var(--pri)' }}>
            Wszystkie →
          </Link>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-[13px] text-tx3 py-6 text-center">Brak zgłoszeń. Kliknij „Zgłoszenia" aby dodać pierwsze.</p>
          ) : (
            <div className="divide-y divide-bd">
              {items.map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-sf-h -mx-5 px-5 transition-colors"
                >
                  <PriorityDot priority={t.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-tx truncate">
                      <span className="text-tx3 font-mono text-[11px] mr-2">{t.ticketNumber}</span>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-tx3 mt-0.5">
                      {formatRelativePl(t.createdAt)}
                    </p>
                  </div>
                  <StatusPill entity="ticket" value={t.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InlineStat({ icon: Icon, n, l, color }: { icon: typeof Ticket; n: number | string; l: string; color: string }) {
  const bg = `color-mix(in srgb, ${color} 12%, transparent)`;
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
        style={{ background: bg }}
      >
        <Icon style={{ width: 18, height: 18, color }} aria-hidden />
      </div>
      <div>
        <p className="text-[22px] font-black leading-tight tabular-nums" style={{ color }}>{n}</p>
        <p className="text-[10px] font-medium text-tx3">{l}</p>
      </div>
    </div>
  );
}

// R3+P5: monitoring agent versions — pokazuje rozkład wersji + ostrzeżenie dla outdated
function AgentVersionWidget() {
  const { data, isLoading } = useQuery<{
    total: number; online5m: number; offline1d: number; neverSeen: number;
    latest: string; outdated: number; byVersion: Record<string, number>;
  }>({
    queryKey: ['agent-version-stats'],
    queryFn: async () => (await api.get('/agents/admin/version-stats')).data,
    staleTime: 60_000,
  });
  if (isLoading || !data) return null;
  if (data.total === 0) return null;
  const versions = Object.entries(data.byVersion).sort((a, b) => b[1] - a[1]);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-tx">Asystenci — wersje</h3>
        <span className="text-[11px] text-tx3">
          Online: <span className="text-ok font-semibold">{data.online5m}</span> · Offline ({'>'}24h): {data.offline1d} · Never: {data.neverSeen} · Total: {data.total}
        </span>
      </div>
      {data.outdated > 0 && (
        <div className="mb-3 p-2.5 rounded-[var(--r-s)] bg-warn/10 border border-warn/30 text-[12px] text-warn">
          ⚠ {data.outdated} asystentów ma starszą wersję niż najnowszy <strong>v{data.latest}</strong>. Auto-update w ciągu 2h.
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {versions.map(([v, n]) => (
          <div key={v} className={`p-2 rounded-[var(--r-s)] text-center ${v === data.latest ? 'bg-ok/10 border border-ok/30' : v === 'unknown' ? 'bg-er/10 border border-er/30' : 'bg-sf-h border border-bd'}`}>
            <p className="text-[11px] text-tx font-semibold">v{v}</p>
            <p className="text-[18px] font-bold text-tx">{n}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

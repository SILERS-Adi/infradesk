import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Clock, Server, Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface Insights {
  ticketVelocity: { last7d: number; avg7dFromMonth: number; deltaPct: number };
  ticketsByCategory: { key: string | null; count: number }[];
  ticketsByPriority: { key: string; count: number }[];
  topAlertTypes: { type: string; count: number }[];
  topFailingDevices: {
    device: { id: string; name: string; hostname: string | null };
    ticketCount: number;
  }[];
  avgResolutionHours: { category: string; count: number; avgHours: number }[];
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--er)',
  HIGH: 'var(--wn)',
  MEDIUM: 'var(--in)',
  LOW: 'var(--tx3)',
};

export function AiInsightsPage() {
  const insightsQ = useQuery<Insights>({
    queryKey: ['ai', 'insights'],
    queryFn: async () => (await api.get<Insights>('/ai/insights')).data,
  });

  if (insightsQ.isLoading) return <SkeletonCard />;
  const i = insightsQ.data;
  if (!i) return null;

  const velocityIsUp = i.ticketVelocity.deltaPct > 0;
  const velocityBadgeVariant: 'warning' | 'success' | 'neutral' =
    Math.abs(i.ticketVelocity.deltaPct) < 10 ? 'neutral' : velocityIsUp ? 'warning' : 'success';

  return (
    <div className="space-y-[var(--sp-4)]">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Lightbulb size={18} className="text-[var(--wn)]" /> AI Insights
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Automatyczna analiza trendów i anomalii w Twoim workspace (ostatnie 30 dni).
        </p>
      </div>

      {/* Velocity alert */}
      <Card className="p-[var(--sp-4)]">
        <div className="flex items-start gap-[var(--sp-3)]">
          <div
            className="w-10 h-10 shrink-0 rounded-[var(--r-s)] flex items-center justify-center"
            style={{
              background: velocityIsUp ? 'var(--wn-l)' : 'var(--ok-l)',
              color: velocityIsUp ? 'var(--wn)' : 'var(--ok)',
            }}
          >
            {velocityIsUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold">Dynamika ticketów</span>
              <Badge variant={velocityBadgeVariant}>
                {i.ticketVelocity.deltaPct > 0 ? '+' : ''}{i.ticketVelocity.deltaPct}%
              </Badge>
            </div>
            <p className="text-[13px] text-[var(--tx2)] mt-1">
              W ostatnim tygodniu: <strong>{i.ticketVelocity.last7d}</strong> ticketów
              {' · średnia tygodniowa z miesiąca: '}
              <strong>{i.ticketVelocity.avg7dFromMonth}</strong>.
              {velocityIsUp && Math.abs(i.ticketVelocity.deltaPct) >= 30 &&
                ' Znaczący wzrost — warto sprawdzić co się dzieje.'}
              {!velocityIsUp && Math.abs(i.ticketVelocity.deltaPct) >= 30 &&
                ' Spadek problemów — albo wszystko działa lepiej, albo klienci nie zgłaszają.'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-4)]">
        {/* Top failing devices */}
        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] flex items-center justify-between">
            <span className="text-[13px] font-medium flex items-center gap-2">
              <Server size={12} /> Najbardziej problematyczne urządzenia
            </span>
            <Badge variant="neutral">30 dni</Badge>
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {i.topFailingDevices.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">
                Brak ticketów powiązanych z urządzeniami.
              </div>
            ) : (
              i.topFailingDevices.map((d) => (
                <Link
                  key={d.device.id}
                  to={`/devices/${d.device.id}`}
                  className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)] hover:bg-[var(--sf-h)] transition-colors"
                >
                  <div>
                    <div className="text-[13px] font-medium">{d.device.name}</div>
                    {d.device.hostname && (
                      <div className="text-[11px] text-[var(--tx3)] font-mono">{d.device.hostname}</div>
                    )}
                  </div>
                  <Badge variant="warning">{d.ticketCount} ticketów</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Top alert types */}
        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] flex items-center justify-between">
            <span className="text-[13px] font-medium flex items-center gap-2">
              <AlertTriangle size={12} /> Najczęstsze typy alertów
            </span>
            <Badge variant="neutral">30 dni</Badge>
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {i.topAlertTypes.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">Brak alertów.</div>
            ) : (
              i.topAlertTypes.map((a) => (
                <div key={a.type} className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)]">
                  <code className="text-[12px]">{a.type}</code>
                  <Badge variant="neutral">{a.count}×</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] flex items-center justify-between">
          <span className="text-[13px] font-medium flex items-center gap-2">
            <Clock size={12} /> Średni czas rozwiązania per kategoria
          </span>
        </div>
        <div className="divide-y divide-[var(--bd)]">
          {i.avgResolutionHours.length === 0 ? (
            <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">
              Jeszcze nie ma zakończonych ticketów.
            </div>
          ) : (
            i.avgResolutionHours.map((r) => (
              <div key={r.category} className="flex items-center justify-between px-[var(--sp-4)] py-[var(--sp-3)]">
                <div>
                  <div className="text-[13px]">{r.category}</div>
                  <div className="text-[11px] text-[var(--tx3)]">{r.count} ticketów</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.avgHours > 24 ? 'warning' : r.avgHours > 4 ? 'info' : 'success'}>
                    {r.avgHours < 1 ? `${Math.round(r.avgHours * 60)} min` : `${r.avgHours}h`}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <div className="flex items-center gap-2 mb-[var(--sp-3)]">
          <Activity size={14} />
          <span className="text-[13px] font-medium">Rozkład priorytetów (30 dni)</span>
        </div>
        <div className="flex items-center gap-1 h-8 rounded-[var(--r-xs)] overflow-hidden border border-[var(--bd)]">
          {i.ticketsByPriority.map((p) => {
            const total = i.ticketsByPriority.reduce((s, x) => s + x.count, 0) || 1;
            const pct = (p.count / total) * 100;
            return (
              <div
                key={p.key}
                className="h-full flex items-center justify-center text-[10px] font-semibold text-white"
                style={{ width: `${pct}%`, background: PRIORITY_COLOR[p.key] ?? 'var(--tx3)' }}
                title={`${p.key}: ${p.count} (${Math.round(pct)}%)`}
              >
                {pct > 5 ? `${p.key} ${p.count}` : ''}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

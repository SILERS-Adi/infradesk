import { useQuery } from '@tanstack/react-query';
import { Ticket, Server, AlertTriangle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Gauge } from '@/components/ui/Gauge';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuthStore } from '@/store/auth';
import { formatRelativePl } from '@/lib/utils';

interface TicketRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const { data, isFetching, refetch } = useQuery<{ items: TicketRow[] }>({
    queryKey: ['dashboard', 'recent-tickets'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 10 } })).data,
  });

  const items = data?.items ?? [];
  const open = items.filter((t) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
  const critical = items.filter((t) => t.priority === 'CRITICAL').length;
  const inProgress = items.filter((t) => t.status === 'IN_PROGRESS').length;

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';

  // Placeholder SLA — w realu wyliczana po stronie backendu z SlaPolicy + actual response times
  const slaPct = 94;

  return (
    <div className="anim-up space-y-5">
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

      {/* Hero — SLA gauge + summary */}
      <Card className="rounded-[var(--r-l)] p-6 anim-scale">
        <div className="flex items-center gap-7 flex-wrap">
          <Gauge pct={slaPct} size={160} label="SLA zgodność" />
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-4 text-tx3">
              Dzisiaj w liczbach
            </p>
            <div className="grid grid-cols-2 gap-4 stg">
              <InlineStat icon={Ticket} n={open.length} l="Otwartych" color="var(--pri)" />
              <InlineStat icon={AlertTriangle} n={critical} l="Krytycznych" color="var(--er)" />
              <InlineStat icon={Clock} n={inProgress} l="W toku" color="var(--wn)" />
              <InlineStat icon={Server} n={'—'} l="Urządzeń online" color="var(--ok)" />
            </div>
          </div>
        </div>
      </Card>

      {/* Stat cards below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stg">
        <StatCard icon={Ticket} label="Otwarte zgłoszenia" value={open.length} accent="primary" />
        <StatCard icon={AlertTriangle} label="Krytyczne" value={critical} accent="danger" />
        <StatCard icon={Server} label="Urządzenia" value="—" accent="neutral" />
        <StatCard icon={Clock} label="Aktywne sesje" value="—" accent="warning" />
      </div>

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

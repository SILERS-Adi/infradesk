import { useQuery } from '@tanstack/react-query';
import { Ticket, Server, AlertTriangle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface TicketRow { id: string; ticketNumber: string; title: string; status: string; priority: string; createdAt: string }

export function DashboardPage() {
  const { data } = useQuery<{ items: TicketRow[] }>({
    queryKey: ['dashboard', 'recent-tickets'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 5 } })).data,
  });

  const items = data?.items ?? [];
  const openCount = items.filter((t) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status)).length;
  const criticalCount = items.filter((t) => t.priority === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-t">Kokpit</h1>
        <p className="text-sm text-tm">Puls firmy — co się dzieje właśnie teraz.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Ticket} label="Otwarte zgłoszenia" value={openCount} accent="accent" />
        <KpiCard icon={AlertTriangle} label="Krytyczne" value={criticalCount} accent="danger" />
        <KpiCard icon={Server} label="Monitorowane urządzenia" value={'—'} accent="neutral" />
        <KpiCard icon={Clock} label="Aktywne sesje" value={'—'} accent="accent" />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Ostatnie zgłoszenia</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {items.length === 0 && <p className="text-sm text-tm">Brak zgłoszeń. Wszystko spokojnie.</p>}
          {items.map((t) => (
            <div key={t.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-t truncate">{t.ticketNumber} · {t.title}</div>
                <div className="text-xs text-tm mt-0.5">{new Date(t.createdAt).toLocaleString('pl-PL')}</div>
              </div>
              <PriorityBadge priority={t.priority} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: typeof Ticket; label: string; value: number | string; accent: 'accent' | 'danger' | 'neutral' }) {
  const accentMap = {
    accent: 'text-accent bg-accent/15',
    danger: 'text-danger bg-danger/15',
    neutral: 'text-ts bg-bg2',
  } as const;
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`h-11 w-11 rounded-[var(--rs)] flex items-center justify-center ${accentMap[accent]}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <div className="text-xs text-tm">{label}</div>
        <div className="text-2xl font-semibold text-t tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'danger' }> = {
    LOW: { label: 'Niski', variant: 'neutral' },
    MEDIUM: { label: 'Średni', variant: 'accent' },
    HIGH: { label: 'Wysoki', variant: 'warning' },
    CRITICAL: { label: 'Krytyczny', variant: 'danger' },
  };
  const cfg = map[priority] ?? map.MEDIUM!;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

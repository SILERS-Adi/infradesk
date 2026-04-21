import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Server as ServerIcon, Ticket as TicketIcon, Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn, formatRelativePl } from '@/lib/utils';

interface Alert {
  id: string;
  type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  resolved: boolean;
  resolvedAt: string | null;
  autoResolveReason: string | null;
  ticketId: string | null;
  createdAt: string;
  device: { id: string; name: string; hostname: string | null };
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  INFO:     { label: 'Info',       color: 'var(--in)', bg: 'var(--in-l)' },
  LOW:      { label: 'Niski',      color: 'var(--tx3)', bg: 'var(--sf-h)' },
  MEDIUM:   { label: 'Średni',     color: 'var(--wn)', bg: 'var(--wn-l)' },
  HIGH:     { label: 'Wysoki',     color: 'var(--wn)', bg: 'var(--wn-l)' },
  CRITICAL: { label: 'Krytyczny',  color: 'var(--er)', bg: 'var(--er-l)' },
};

export function AlertsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');

  const { data, isLoading } = useQuery<{ alerts: Alert[] }>({
    queryKey: ['alerts', filter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '200' };
      if (filter === 'open') params.resolved = 'false';
      if (filter === 'resolved') params.resolved = 'true';
      return (await api.get('/monitoring/alerts', { params })).data;
    },
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/monitoring/alerts/${id}/resolve`, { autoResolveReason: 'manual' })).data,
    onSuccess: () => { toast.success('Alert rozwiązany'); qc.invalidateQueries({ queryKey: ['alerts'] }); },
  });

  const alerts = data?.alerts ?? [];
  const openCount = alerts.filter((a) => !a.resolved).length;
  const criticalCount = alerts.filter((a) => !a.resolved && (a.severity === 'CRITICAL' || a.severity === 'HIGH')).length;

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Alerty i asystenci</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {openCount > 0 ? `${openCount} otwartych${criticalCount > 0 ? ` (${criticalCount} krytycznych/wysokich)` : ''}` : 'Wszystkie rozwiązane'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-bd">
        {([
          { id: 'open', label: 'Otwarte' },
          { id: 'resolved', label: 'Rozwiązane' },
          { id: 'all', label: 'Wszystkie' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={cn(
              'px-3 py-2 text-[12px] font-semibold transition-colors border-b-2',
              filter === t.id ? 'text-tx' : 'text-tx3 hover:text-tx2',
            )}
            style={filter === t.id ? { borderColor: 'var(--pri)' } : { borderColor: 'transparent' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : alerts.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak alertów</p>
          <p className="text-[13px] text-tx3">Spokój — nic się nie dzieje złego.</p>
        </Card>
      ) : (
        <div className="space-y-3 stg">
          {alerts.map((a) => {
            const meta = SEVERITY_META[a.severity] ?? SEVERITY_META.MEDIUM!;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                    style={{ background: meta.bg }}
                  >
                    {a.severity === 'CRITICAL' || a.severity === 'HIGH' ? (
                      <AlertTriangle style={{ width: 18, height: 18, color: meta.color }} />
                    ) : (
                      <Bell style={{ width: 18, height: 18, color: meta.color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant={a.severity === 'CRITICAL' ? 'danger' : a.severity === 'HIGH' ? 'warning' : a.severity === 'MEDIUM' ? 'warning' : 'neutral'}
                      >
                        {meta.label}
                      </Badge>
                      <Badge variant="neutral" className="text-[10px]">{a.type}</Badge>
                      {a.resolved && <Badge variant="success">Rozwiązane</Badge>}
                    </div>
                    <p className="text-[13px] text-tx font-medium mb-1">{a.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-tx3 flex-wrap">
                      <Link to={`/devices/${a.device.id}`} className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--pri)' }}>
                        <ServerIcon className="h-3 w-3" /> {a.device.name}
                      </Link>
                      <span>{formatRelativePl(a.createdAt)}</span>
                      {a.ticketId && (
                        <Link to={`/tickets/${a.ticketId}`} className="inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--pri)' }}>
                          <TicketIcon className="h-3 w-3" /> Auto-ticket
                        </Link>
                      )}
                      {a.resolved && a.autoResolveReason && (
                        <span className="text-tx3">Powód: {a.autoResolveReason}</span>
                      )}
                    </div>
                  </div>
                  {!a.resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate(a.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Rozwiąż
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

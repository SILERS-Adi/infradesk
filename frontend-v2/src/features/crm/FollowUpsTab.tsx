import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BellRing, ExternalLink, Phone, Mail, Calendar, FileText, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

interface CrmActivity {
  id: string;
  type: 'PHONE' | 'MEETING' | 'EMAIL' | 'QUOTE' | 'OTHER';
  title: string;
  notes: string | null;
  followUpAt: string | null;
  completedAt: string | null;
  linkedTicket: { id: string; ticketNumber: string; title: string } | null;
}

const TYPE_ICON = {
  PHONE: Phone, MEETING: Calendar, EMAIL: Mail, QUOTE: FileText, OTHER: FileText,
} as const;

export function FollowUpsTab() {
  const { data, isLoading } = useQuery<{ items: CrmActivity[] }>({
    queryKey: ['crm', 'followups'],
    queryFn: async () => (await api.get('/crm/activities', {
      params: { onlyMine: 'true', followUp: 'true', limit: 100 },
    })).data,
  });

  const pending = (data?.items ?? []).filter((a) => !a.completedAt);
  const now = Date.now();
  const overdue = pending.filter((a) => a.followUpAt && new Date(a.followUpAt).getTime() < now);
  const upcoming = pending.filter((a) => !a.followUpAt || new Date(a.followUpAt).getTime() >= now);

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[11px] text-tx3 uppercase tracking-wider">Do zrobienia</div>
          <div className="text-[24px] font-semibold mt-1 text-pri">{pending.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] text-tx3 uppercase tracking-wider">Przeterminowane</div>
          <div className="text-[24px] font-semibold mt-1 text-er">{overdue.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] text-tx3 uppercase tracking-wider">Nadchodzące</div>
          <div className="text-[24px] font-semibold mt-1 text-wn">{upcoming.length}</div>
        </Card>
      </div>

      {pending.length === 0 ? (
        <Card className="p-10 text-center">
          <BellRing className="h-10 w-10 mx-auto mb-3 text-tx3 opacity-40" />
          <p className="text-tx font-medium mb-1">Brak follow-upów</p>
          <p className="text-[13px] text-tx3">Wszystko zrobione — gratulacje.</p>
        </Card>
      ) : (
        <>
          {overdue.length > 0 && (
            <FollowUpSection title="Przeterminowane" items={overdue} color="var(--er)" />
          )}
          {upcoming.length > 0 && (
            <FollowUpSection title="Nadchodzące" items={upcoming} color="var(--wn)" />
          )}
        </>
      )}
    </div>
  );
}

function FollowUpSection({ title, items, color }: { title: string; items: CrmActivity[]; color: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-2 border-b border-bd text-[12px] font-bold uppercase tracking-wider" style={{ color }}>
        {title} ({items.length})
      </div>
      <div className="divide-y divide-bd">
        {items.map((a) => {
          const Icon = TYPE_ICON[a.type];
          return (
            <div key={a.id} className="flex items-start gap-3 p-3">
              <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-tx truncate">{a.title}</div>
                {a.notes && <div className="text-[11px] text-tx3 line-clamp-1 mt-0.5">{a.notes}</div>}
                <div className="flex items-center gap-3 mt-1 text-[11px] text-tx3">
                  {a.followUpAt && (
                    <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {formatRelativePl(a.followUpAt)}</span>
                  )}
                  {a.linkedTicket && (
                    <Link to={`/tickets/${a.linkedTicket.id}`} className="hover:text-pri inline-flex items-center gap-0.5">
                      <ExternalLink className="h-2.5 w-2.5" /> {a.linkedTicket.ticketNumber}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

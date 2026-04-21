import { Link } from 'react-router-dom';
import { Clock, User, Server as ServerIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatRelativePl } from '@/lib/utils';
import { statusBadge, type TicketListItem } from './TicketsPage';

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-tm',
  MEDIUM: 'bg-accent',
  HIGH: 'bg-warning',
  CRITICAL: 'bg-danger',
};

export function TicketsVisualGrid({ items }: { items: TicketListItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((t) => (
        <Link key={t.id} to={`/tickets/${t.id}`} className="block group">
          <Card className="p-4 h-full hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-tm'}`} aria-label={`Priorytet ${t.priority}`} />
                <span className="text-xs font-semibold text-tm">{t.ticketNumber}</span>
              </div>
              {statusBadge(t.status)}
            </div>
            <h3 className="text-sm font-medium text-t line-clamp-2 mb-3 min-h-[2.5rem] group-hover:text-accent transition-colors">{t.title}</h3>
            <div className="flex items-center gap-2 text-xs text-tm flex-wrap">
              {t.category && <Badge variant="neutral">{t.category}</Badge>}
              {t.device && (
                <span className="inline-flex items-center gap-1"><ServerIcon className="h-3 w-3" /> {t.device.name}</span>
              )}
              {t.assignedTo && (
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {t.assignedTo.firstName} {t.assignedTo.lastName[0]}.</span>
              )}
              <span className="inline-flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" /> {formatRelativePl(t.createdAt)}</span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

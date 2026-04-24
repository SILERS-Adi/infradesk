import { Link } from 'react-router-dom';
import { Clock, Server as ServerIcon, Calendar, Monitor, MapPin, Star, Building2, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { formatRelativePl } from '@/lib/utils';
import { statusBadge, type TicketListItem } from './TicketsPage';
import { TicketQuickActions, type QuickActionMember } from './TicketQuickActions';

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-tm',
  MEDIUM: 'bg-pri',
  HIGH: 'bg-warning',
  CRITICAL: 'bg-er',
};

const PRIORITY_PL: Record<string, string> = {
  LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', CRITICAL: 'Krytyczny',
};

interface Props {
  items: TicketListItem[];
  members: QuickActionMember[];
  onAssign: (ticketId: string, userId: string | null) => void;
  onServiceMode: (ticketId: string, mode: 'REMOTE' | 'ONSITE') => void;
  /** Set of field ids visible on each card. Pinned fields (ticketNumber,
   *  title, status) are always visible regardless. */
  visibleFields: Set<string>;
  /** Current preset id — controls card density. */
  density?: 'compact' | 'standard' | 'detailed' | string;
}

function has(set: Set<string>, id: string): boolean {
  return set.has(id);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
  } catch {
    return '—';
  }
}

export function TicketsVisualGrid({
  items,
  members,
  onAssign,
  onServiceMode,
  visibleFields,
  density = 'standard',
}: Props) {
  const isCompact = density === 'compact';
  const isDetailed = density === 'detailed';
  const padding = isCompact ? 'p-3' : isDetailed ? 'p-5' : 'p-4';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((t) => {
        const showPriority = has(visibleFields, 'priority');
        const showNumber = has(visibleFields, 'ticketNumber');
        const showStatus = has(visibleFields, 'status');
        const showTitle = has(visibleFields, 'title');
        const showClient = has(visibleFields, 'client');
        const showDevice = has(visibleFields, 'device');
        const showAssigned = has(visibleFields, 'assignedTo');
        const showCreatedAt = has(visibleFields, 'createdAt');
        const showDueAt = has(visibleFields, 'dueAt');
        const showServiceMode = has(visibleFields, 'serviceMode');
        const showChildCounts = has(visibleFields, 'childCounts');
        const showDescription = has(visibleFields, 'description');
        const showRating = has(visibleFields, 'rating');
        const showQuickActions = has(visibleFields, 'quickActions');

        const a = t.assignedTo;
        const assignedName = a ? `${a.firstName} ${a.lastName}`.trim() : null;
        const desc = (t as { description?: string | null }).description ?? null;
        const rating = (t as { rating?: number | null }).rating ?? null;
        const isClosed = t.status === 'CLOSED' || t.status === 'RESOLVED';

        return (
          <Link key={t.id} to={`/tickets/${t.id}`} className="block group">
            <Card className={`${padding} h-full hover:border-[var(--bd-f)] transition-colors relative`}>
              {/* Top row: priority dot + ticket number + status */}
              {(showNumber || showStatus || showPriority) && (
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    {showPriority && (
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-tm'}`}
                        aria-label={`Priorytet ${PRIORITY_PL[t.priority] ?? t.priority}`}
                        title={`Priorytet: ${PRIORITY_PL[t.priority] ?? t.priority}`}
                      />
                    )}
                    {showNumber && <span className="text-xs font-semibold text-tx3">{t.ticketNumber}</span>}
                  </div>
                  {showStatus && statusBadge(t.status)}
                </div>
              )}

              {/* Title */}
              {showTitle && (
                <h3
                  className={`text-sm font-medium text-tx mb-3 group-hover:text-pri transition-colors ${
                    isCompact ? 'line-clamp-1 min-h-[1.25rem]' : 'line-clamp-2 min-h-[2.5rem]'
                  }`}
                >
                  {t.title}
                </h3>
              )}

              {/* Description (only when shown, typically detailed) */}
              {showDescription && desc && (
                <p className="text-xs text-tx3 line-clamp-2 mb-3">{desc}</p>
              )}

              {/* Meta chips row */}
              {(showClient || showDevice || showCreatedAt || showDueAt || showServiceMode || showChildCounts || showRating) && (
                <div className="flex items-center gap-2 text-xs text-tx3 flex-wrap mb-3">
                  {showClient && t.clientWorkspace?.name && (
                    <span className="inline-flex items-center gap-1" title="Klient">
                      <Building2 className="h-3 w-3" />
                      <ClientName t={t} />
                    </span>
                  )}
                  {showDevice && t.device && (
                    <span className="inline-flex items-center gap-1" title="Urządzenie">
                      <ServerIcon className="h-3 w-3" /> {t.device.name}
                    </span>
                  )}
                  {showServiceMode && t.serviceMode && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-bd"
                      style={{ background: 'var(--sf-h)' }}
                      title={t.serviceMode === 'REMOTE' ? 'Tryb: zdalnie' : 'Tryb: u klienta'}
                    >
                      {t.serviceMode === 'REMOTE' ? <Monitor className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                      {t.serviceMode === 'REMOTE' ? 'Zdalnie' : 'U klienta'}
                    </span>
                  )}
                  {showChildCounts && t.childCounts && t.childCounts.total > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-bd"
                      style={{ background: 'var(--sf-h)' }}
                      title={`Zadania/Zamówienia/CRM: ${t.childCounts.done}/${t.childCounts.total}`}
                    >
                      <ListChecks className="h-3 w-3" />
                      {t.childCounts.done}/{t.childCounts.total}
                    </span>
                  )}
                  {showRating && isClosed && rating != null && (
                    <span className="inline-flex items-center gap-1" title={`Ocena: ${rating}/5`}>
                      <Star className="h-3 w-3" /> {rating}
                    </span>
                  )}
                  {showDueAt && t.dueAt && (
                    <span className="inline-flex items-center gap-1" title="Termin">
                      <Calendar className="h-3 w-3" /> {fmtDate(t.dueAt)}
                    </span>
                  )}
                  {showCreatedAt && (
                    <span className="inline-flex items-center gap-1 ml-auto" title="Utworzone">
                      <Clock className="h-3 w-3" /> {formatRelativePl(t.createdAt)}
                    </span>
                  )}
                </div>
              )}

              {/* Bottom row: assignee + quick actions */}
              {(showAssigned || showQuickActions) && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-bd">
                  {showAssigned ? (
                    a ? (
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Avatar
                          email={a.email ?? null}
                          firstName={a.firstName}
                          lastName={a.lastName}
                          size={20}
                        />
                        <span className="text-[11px] text-tx3 truncate">{assignedName}</span>
                      </span>
                    ) : (
                      <Badge variant="neutral">Nieprzypisany</Badge>
                    )
                  ) : (
                    <span />
                  )}
                  {showQuickActions && (
                    <TicketQuickActions
                      ticket={t}
                      members={members}
                      onAssign={onAssign}
                      onServiceMode={onServiceMode}
                    />
                  )}
                </div>
              )}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

/** Stub — ClientName is a tiny fetch-free component. We don't have client
 *  name in TicketListItem today (only clientWorkspaceId), so we render a
 *  generic label. Upgrade later when the list API embeds client name. */
function ClientName({ t }: { t: TicketListItem }) {
  if (t.clientWorkspace?.name) return <>{t.clientWorkspace.name}</>;
  return <>—</>;
}

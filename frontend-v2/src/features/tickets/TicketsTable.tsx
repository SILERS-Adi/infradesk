import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
const PRIORITY_PL: Record<string, string> = { LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', CRITICAL: 'Krytyczny' };

import type { Column } from '@/components/ui/ColumnPicker';
import type { TicketListItem } from './TicketsPage';
import { TicketQuickActions, type QuickActionMember } from './TicketQuickActions';
import { Avatar } from '@/components/ui/Avatar';

interface Props {
  items: TicketListItem[];
  columns: Column<TicketListItem>[];
  members?: QuickActionMember[];
  onAssign?: (ticketId: string, userId: string | null) => void;
  onServiceMode?: (ticketId: string, mode: 'REMOTE' | 'ONSITE') => void;
}

export function TicketsTable({ items, columns, members, onAssign, onServiceMode }: Props) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sf2/50 border-b border-bd">
            <tr className="text-left text-xs uppercase tracking-wide text-tx3">
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="px-4 py-2.5 font-medium whitespace-nowrap"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-sf2/40 transition-colors">
                {columns.map((c) => (
                  <td key={c.id} className="px-4 py-3 align-middle">
                    {c.id === 'quickActions' && members && onAssign && onServiceMode
                      ? <TicketQuickActions ticket={t} members={members} onAssign={onAssign} onServiceMode={onServiceMode} compact />
                      : c.id === 'assignedTo'
                        ? <AssignedCell t={t} />
                        : (c.render ? c.render(t) : null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AssignedCell({ t }: { t: TicketListItem }) {
  if (!t.assignedTo) return <span className="text-tx3">—</span>;
  const a = t.assignedTo;
  const name = `${a.firstName} ${a.lastName}`.trim();
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar email={a.email ?? null} firstName={a.firstName} lastName={a.lastName} size={22} />
      <span className="text-tx3">{name}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column definitions — single source of truth for tabular Tickets view.
// Extend this list (and bump ColumnPicker STORAGE_VERSION if needed) when
// adding/removing columns.
// ---------------------------------------------------------------------------

function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  if (!p) return '—';
  return `${p.firstName} ${p.lastName}`;
}

function countBadge(n: number | undefined): string {
  if (!n || n <= 0) return '—';
  return String(n);
}

function chip(label: string, active: boolean | undefined) {
  if (!active) return null;
  return (
    <span
      key={label}
      className="inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-semibold border mr-1"
      style={{
        background: 'var(--sf-h)',
        borderColor: 'var(--bd)',
        color: 'var(--tx2)',
      }}
    >
      {label}
    </span>
  );
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

// Lazy import avoidance: we re-implement statusBadge shape inline to avoid a circular import.
// We import statusBadge from TicketsPage where it is already exported.
// (TicketsPage -> TicketsTable import chain is acceptable because statusBadge
// does not pull table code transitively.)
import { statusBadge } from './TicketsPage';

export const TICKET_COLUMNS: Column<TicketListItem>[] = [
  {
    id: 'quickActions',
    label: 'Akcje',
    defaultVisible: true,
    width: '140px',
    // Rendering for this column is handled directly in TicketsTable because
    // it needs access to page-level state (members list + mutations) that
    // cannot travel through the static column definition.
    render: () => null,
  },
  {
    id: 'ticketNumber',
    label: 'Nr',
    pinned: true,
    width: '120px',
    render: (t) => (
      <Link to={`/tickets/${t.id}`} className="font-mono text-xs text-tx3 hover:text-pri">
        {t.ticketNumber}
      </Link>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    pinned: true,
    width: '130px',
    render: (t) => statusBadge(t.status),
  },
  {
    id: 'title',
    label: 'Tytuł',
    defaultVisible: true,
    render: (t) => (
      <Link to={`/tickets/${t.id}`} className="text-tx hover:text-pri">
        {t.title}
      </Link>
    ),
  },
  {
    id: 'priority',
    label: 'Priorytet',
    defaultVisible: true,
    width: '110px',
    render: (t) => <span className="text-tx3">{PRIORITY_PL[t.priority] ?? t.priority}</span>,
  },
  {
    id: 'category',
    label: 'Kategoria',
    defaultVisible: false,
    width: '120px',
    render: (t) => <span className="text-tx3">{t.category ?? '—'}</span>,
  },
  {
    id: 'assignedTo',
    label: 'Przypisany',
    defaultVisible: true,
    width: '160px',
    render: (t) => <span className="text-tx3">{fullName(t.assignedTo)}</span>,
  },
  {
    id: 'device',
    label: 'Urządzenie',
    defaultVisible: true,
    width: '160px',
    render: (t) => <span className="text-tx3">{t.device?.name ?? '—'}</span>,
  },
  {
    id: 'clientWorkspace',
    label: 'Klient',
    defaultVisible: false,
    width: '160px',
    render: (t) => <span className="text-tx3">{t.clientWorkspace?.name ?? "—"}</span>,
  },
  {
    id: 'createdAt',
    label: 'Utworzony',
    defaultVisible: true,
    width: '140px',
    render: (t) => <span className="text-tx3 text-xs">{fmtDate(t.createdAt)}</span>,
  },
  {
    id: 'dueAt',
    label: 'Termin',
    defaultVisible: false,
    width: '140px',
    render: (t) => <span className="text-tx3 text-xs">{fmtDate(t.dueAt)}</span>,
  },
  {
    id: 'linkedTasks',
    label: 'Zadania',
    defaultVisible: false,
    width: '90px',
    render: (t) => <span className="text-tx3 text-xs">{countBadge(t.childCounts?.total)}</span>,
  },
  {
    id: 'linkedOrders',
    label: 'Zamówienia',
    defaultVisible: false,
    width: '110px',
    render: () => <span className="text-tx3 text-xs">—</span>,
  },
  {
    id: 'linkedCrmActivities',
    label: 'CRM',
    defaultVisible: false,
    width: '80px',
    render: () => <span className="text-tx3 text-xs">—</span>,
  },
  {
    id: 'chips',
    label: 'Powiązania',
    defaultVisible: false,
    width: '160px',
    render: (t) => (
      <div className="flex flex-wrap gap-1">
        {chip('SERW', t.hasService)}
        {chip('ZAM', t.hasOrder)}
        {chip('CRM', t.hasCrm)}
        {!t.hasService && !t.hasOrder && !t.hasCrm && <span className="text-tx3 text-xs">—</span>}
      </div>
    ),
  },
  {
    id: 'updatedAt',
    label: 'Aktualizacja',
    defaultVisible: false,
    width: '140px',
    render: (t) => <span className="text-tx3 text-xs">{fmtDate((t as { updatedAt?: string }).updatedAt)}</span>,
  },
  {
    id: 'resolutionSummary',
    label: 'Podsumowanie',
    defaultVisible: false,
    render: (t) => {
      const v = (t as { resolutionSummary?: string | null }).resolutionSummary;
      if (!v) return <span className="text-tx3 text-xs">—</span>;
      return <span className="text-tx3 text-xs line-clamp-1">{v}</span>;
    },
  },
];

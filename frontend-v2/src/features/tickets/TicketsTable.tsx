import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { formatDatePl } from '@/lib/utils';
import { statusBadge, type TicketListItem } from './TicketsPage';

export function TicketsTable({ items }: { items: TicketListItem[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-sf2/50 border-b border-bd">
          <tr className="text-left text-xs uppercase tracking-wide text-tx3">
            <th className="px-4 py-2.5 font-medium">Nr</th>
            <th className="px-4 py-2.5 font-medium">Tytuł</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Priorytet</th>
            <th className="px-4 py-2.5 font-medium">Urządzenie</th>
            <th className="px-4 py-2.5 font-medium">Przypisany</th>
            <th className="px-4 py-2.5 font-medium">Utworzony</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {items.map((t) => (
            <tr key={t.id} className="hover:bg-sf2/40 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-tx3">
                <Link to={`/tickets/${t.id}`} className="hover:text-pri">{t.ticketNumber}</Link>
              </td>
              <td className="px-4 py-3 text-tx">
                <Link to={`/tickets/${t.id}`} className="hover:text-pri">{t.title}</Link>
              </td>
              <td className="px-4 py-3">{statusBadge(t.status)}</td>
              <td className="px-4 py-3 text-tx3">{t.priority}</td>
              <td className="px-4 py-3 text-tx3">{t.device?.name ?? '—'}</td>
              <td className="px-4 py-3 text-tx3">
                {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
              </td>
              <td className="px-4 py-3 text-tx3 text-xs">{formatDatePl(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

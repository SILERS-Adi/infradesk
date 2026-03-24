import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Bot, Globe, Phone, Mail, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { NewRecordWizard } from '../../../components/wizard/NewRecordWizard';
import { formatDate } from '../../../utils/helpers';
import type { Ticket } from '../../../types';

type TabKey = 'pending' | 'assigned' | 'completed' | 'cancelled';

const SOURCE_ICON: Record<string, React.ReactNode> = {
  AGENT:         <Bot className="h-3.5 w-3.5 text-violet-500" />,
  CLIENT_PORTAL: <Globe className="h-3.5 w-3.5 text-blue-500" />,
  PHONE:         <Phone className="h-3.5 w-3.5 text-green-500" />,
  EMAIL:         <Mail className="h-3.5 w-3.5 text-amber-500" />,
  QR_SCAN:       <QrCode className="h-3.5 w-3.5 text-gray-500" />,
  INTERNAL:      <span className="text-gray-400 text-xs">—</span>,
};

function InlineAssign({ ticket, technicians }: { ticket: Ticket; technicians: { id: string; firstName: string; lastName: string }[] }) {
  const qc = useQueryClient();
  const [assigning, setAssigning] = useState(false);

  const assignMutation = useMutation({
    mutationFn: (userId: string) => ticketsApi.assign(ticket.id, userId),
    onSuccess: () => {
      toast.success('Zgłoszenie przydzielone');
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
    },
    onError: () => toast.error('Błąd przydzielenia'),
  });

  if (assigning) {
    return (
      <select
        autoFocus
        className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        defaultValue=""
        onBlur={() => setAssigning(false)}
        onChange={e => {
          if (e.target.value) {
            assignMutation.mutate(e.target.value);
            setAssigning(false);
          }
        }}
        onClick={e => e.stopPropagation()}
      >
        <option value="" disabled>Wybierz…</option>
        {technicians.map(u => (
          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
        ))}
      </select>
    );
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setAssigning(true); }}
      disabled={assignMutation.isPending}
      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
    >
      {assignMutation.isPending ? 'Przydzielam…' : 'Przydziel'}
    </button>
  );
}

export function TicketsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: allTickets = [], isLoading } = useQuery({
    queryKey: ['tickets-all'],
    queryFn: () => ticketsApi.getAll({ limit: '500' }),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });

  const technicians = allUsers.filter(u => u.role !== 'CLIENT' && u.isActive);

  // Partition tickets into tabs
  const pending   = allTickets.filter(t => t.status === 'PENDING');
  const assigned  = allTickets.filter(t => t.status === 'ASSIGNED');
  const completed = allTickets.filter(t => t.status === 'COMPLETED');
  const cancelled = allTickets.filter(t => t.status === 'CANCELLED');

  const tabData: Record<TabKey, Ticket[]> = {
    pending,
    assigned,
    completed,
    cancelled,
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'pending',   label: 'Oczekujące',   count: pending.length },
    { key: 'assigned',  label: 'Przydzielone', count: assigned.length },
    { key: 'completed', label: 'Zakończone',   count: completed.length },
    { key: 'cancelled', label: 'Anulowane',    count: cancelled.length },
  ];

  // Local search filter
  const q = search.toLowerCase();
  const filtered = tabData[activeTab].filter(t =>
    !q ||
    t.title.toLowerCase().includes(q) ||
    t.ticketNumber.toLowerCase().includes(q) ||
    (t.client?.name ?? '').toLowerCase().includes(q)
  );

  const hideStatus = true; // status widoczny w zakładce, nie w kolumnie

  const baseColumns: Column<Ticket>[] = [
    {
      key: 'ticketNumber',
      header: 'Nr',
      render: (row) => (
        <span className="font-mono text-xs text-indigo-600 font-semibold">{row.ticketNumber}</span>
      ),
    },
    {
      key: 'title',
      header: 'Tytuł',
      render: (row) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{row.title}</div>
          {row.description && (
            <div className="text-xs text-gray-500 truncate">
              {row.description.substring(0, 60)}{row.description.length > 60 ? '…' : ''}
            </div>
          )}
        </div>
      ),
    },
    { key: 'client', header: 'Klient', render: (row) => row.client?.name ?? '—' },
    { key: 'priority', header: 'Priorytet', render: (row) => <PriorityBadge priority={row.priority} /> },
    ...(!hideStatus ? [
      { key: 'status', header: 'Status', render: (row: Ticket) => <TicketStatusBadge status={row.status} /> },
    ] as Column<Ticket>[] : []),
    {
      key: 'assignedTo',
      header: 'Przypisany',
      render: (row) => {
        if (activeTab === 'pending') {
          return <InlineAssign ticket={row} technicians={technicians} />;
        }
        return row.assignedTo
          ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`
          : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      key: 'source',
      header: 'Źródło',
      render: (row) => (
        <span className="flex items-center gap-1">
          {SOURCE_ICON[row.source] ?? <span className="text-gray-400 text-xs">—</span>}
        </span>
      ),
    },
    {
      key: 'reportedAt',
      header: 'Data',
      render: (row) => <span className="text-xs text-gray-500">{formatDate(row.reportedAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Zgłoszenia"
        subtitle={`${allTickets.length} zgłoszeń`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowe zgłoszenie
          </Button>
        }
      />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  tab.key === 'pending'   ? 'bg-red-100 text-red-700' :
                  tab.key === 'assigned'  ? 'bg-yellow-100 text-yellow-700' :
                  tab.key === 'completed' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nr zgłoszenia, tytuł, klient…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <DataTable
          columns={baseColumns}
          data={filtered}
          loading={isLoading}
          onRowClick={(row) => navigate(`/tickets/${row.id}`)}
          keyExtractor={(row) => row.id}
          emptyTitle="Brak zgłoszeń"
          emptyDescription="Brak zgłoszeń w tej kategorii."
        />
      </div>

      <NewRecordWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ['tickets-all'] });
          toast.success('Zgłoszenie utworzone');
        }}
      />
    </div>
  );
}

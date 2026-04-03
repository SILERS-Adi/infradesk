/**
 * IDS 1.0 — PakOps Orders / Shipments List (Full)
 * Connected to: GET /api/packaging/packing/queue, etc.
 * Status filter tabs, search, sort, pagination, batch actions
 */
import { useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, RefreshCw, Layers, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ORDER_STATUS, ORDER_STATUS_TABS } from './constants';
import { fmtMoney, fmtDate } from './utils';
import type { BadgeColor } from './types';

interface OrderRow {
  id: string;
  externalOrderId?: string;
  status: string;
  addressName?: string;
  addressCity?: string;
  addressPhone?: string;
  totalAmount: number | string;
  courierName?: string;
  deliveryMethod?: string;
  dispatchDeadline?: string;
  createdAt: string;
  _count?: { items: number };
}

function DeadlineBadge({ iso }: { iso?: string }) {
  if (!iso) return <span style={{ color: 'var(--td)' }}>—</span>;
  const dl = new Date(iso);
  const now = new Date();
  const overdue = dl < now;
  const hoursLeft = (dl.getTime() - now.getTime()) / 3600000;
  const isToday = dl.toDateString() === now.toDateString();
  let text: string, color: string;
  if (overdue) { text = 'OPÓŹNIONE'; color = '#F87171'; }
  else if (isToday && hoursLeft < 4) { text = 'DZIŚ!'; color = '#F87171'; }
  else if (isToday) { text = 'DZIŚ'; color = '#FBBF24'; }
  else { text = dl.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }); color = 'var(--tm)'; }
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{text}</span>;
}

export function ShipmentsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: result, isLoading } = useQuery({
    queryKey: ['packaging', 'orders', page, search, statusFilter, sortBy, sortDir],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sortBy) params.sort = sortBy;
      if (sortDir) params.order = sortDir;
      const { data } = await api.get('/packaging/orders', { params });
      return data as { items: OrderRow[]; total: number };
    },
  });

  const createBatchMut = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const { data } = await api.post('/packaging/batches', { orderIds });
      return data;
    },
    onSuccess: () => {
      toast.success('Batch utworzony');
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['packaging'] });
    },
    onError: () => toast.error('Nie udało się utworzyć batcha'),
  });

  const syncMut = useMutation({
    mutationFn: async () => { await api.post('/packaging/orders/sync'); },
    onSuccess: () => {
      toast.success('Synchronizacja zakończona');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'orders'] });
    },
    onError: () => toast.error('Synchronizacja nie powiodła się'),
  });

  const items = result?.items || [];
  const total = result?.total || 0;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .15s',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--tm)',
  });

  const sortIcon = (key: string) => {
    if (sortBy !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const columns: Column<OrderRow>[] = [
    {
      key: 'select', header: (
        <input type="checkbox" checked={selected.size === items.length && items.length > 0}
          onChange={toggleAll} style={{ cursor: 'pointer' }} />
      ) as any, render: r => (
        <input type="checkbox" checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
      ),
    },
    { key: 'externalOrderId', header: `Nr zamówienia${sortIcon('externalOrderId')}`, render: r => (
      <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>{r.externalOrderId || '—'}</span>
    )},
    { key: 'addressName', header: 'Klient', render: r => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--t)', fontSize: 13 }}>{r.addressName || '—'}</div>
        {r.addressPhone && <div style={{ fontSize: 11, color: 'var(--tm)' }}>{r.addressPhone}</div>}
      </div>
    )},
    { key: 'items', header: 'Poz.', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{r._count?.items || 0}</span> },
    { key: 'totalAmount', header: `Kwota${sortIcon('totalAmount')}`, render: r => (
      <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(r.totalAmount)} zł</span>
    )},
    { key: 'courierName', header: 'Kurier', render: r => r.courierName ? <Badge color="indigo">{r.courierName}</Badge> : <span style={{ color: 'var(--td)' }}>—</span> },
    { key: 'deadline', header: 'Deadline', render: r => <DeadlineBadge iso={r.dispatchDeadline} /> },
    { key: 'status', header: 'Status', render: r => {
      const s = ORDER_STATUS[r.status] || { label: r.status, color: 'gray' as BadgeColor };
      return <Badge color={s.color}>{s.label}</Badge>;
    }},
    { key: 'createdAt', header: `Data${sortIcon('createdAt')}`, render: r => <span style={{ color: 'var(--tm)', fontSize: 12 }}>{fmtDate(r.createdAt)}</span> },
    { key: 'actions', header: '', render: r => (
      <Link to={`/packaging/orders/${r.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} onClick={e => e.stopPropagation()}>
        <Eye size={15} />
      </Link>
    )},
  ];

  return (
    <>
      <PageHeader title="Zamówienia" subtitle="Lista zamówień do realizacji" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={syncMut.isPending}
            onClick={() => syncMut.mutate()}>Sync</Button>
          {selected.size > 0 && (
            <Button variant="secondary" size="sm" icon={<Layers size={14} />} loading={createBatchMut.isPending}
              onClick={() => createBatchMut.mutate(Array.from(selected))}>
              Utwórz batch ({selected.size})
            </Button>
          )}
        </div>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap', padding: '4px', borderRadius: 10, background: 'var(--hover-bg)' }}>
          {ORDER_STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => { setStatusFilter(t.value); setPage(1); }}
              style={tabStyle(statusFilter === t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Nr zamówienia, klient, telefon..." />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} zamówień</span>
        </div>

        <DataTable columns={columns} data={items} loading={isLoading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/packaging/orders/${r.id}`)}
          emptyTitle="Brak zamówień" emptyDescription="Zamówienia pojawią się po synchronizacji."
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
    </>
  );
}

export default ShipmentsListPage;

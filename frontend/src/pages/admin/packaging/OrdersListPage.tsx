/**
 * IDS 1.0 — Packing Orders List (replicating PakOps OrdersListPage)
 * 10-status workflow: NEW → PAID → PICKING → PICKED → PACKING → PACKED → SHIPPED → DELIVERED
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import type { BadgeColor } from './types';

const ORDER_STATUS: Record<string, { label: string; color: BadgeColor }> = {
  NEW: { label: 'Nowe', color: 'blue' },
  PAID: { label: 'Opłacone', color: 'green' },
  PICKING: { label: 'Zbieranie', color: 'yellow' },
  PICKED: { label: 'Zebrane', color: 'indigo' },
  PACKING: { label: 'Pakowanie', color: 'yellow' },
  PACKED: { label: 'Spakowane', color: 'purple' },
  SHIPPED: { label: 'Wysłane', color: 'blue' },
  DELIVERED: { label: 'Dostarczone', color: 'green' },
  CANCELLED: { label: 'Anulowane', color: 'red' },
  RETURNED: { label: 'Zwrot', color: 'red' },
};

const STATUS_FILTER = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'NEW', label: 'Nowe' },
  { value: 'PAID', label: 'Opłacone' },
  { value: 'PICKING', label: 'Zbieranie' },
  { value: 'PICKED', label: 'Zebrane' },
  { value: 'PACKING', label: 'Pakowanie' },
  { value: 'PACKED', label: 'Spakowane' },
  { value: 'SHIPPED', label: 'Wysłane' },
  { value: 'DELIVERED', label: 'Dostarczone' },
  { value: 'CANCELLED', label: 'Anulowane' },
];

interface OrderRow {
  id: string; externalOrderId?: string; status: string; addressName?: string; addressCity?: string;
  totalAmount: number | string; courierName?: string; deliveryMethod?: string;
  dispatchDeadline?: string; createdAt: string; _count?: { items: number };
}

const fmt = (n: number | string) => Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2 });

function DeadlineBadge({ iso }: { iso?: string }) {
  if (!iso) return <span style={{ color: 'var(--td)' }}>—</span>;
  const dl = new Date(iso);
  const now = new Date();
  const overdue = dl < now;
  const hoursLeft = (dl.getTime() - now.getTime()) / 3600000;
  const isToday = dl.toDateString() === now.toDateString();
  let text: string, color: string;
  if (overdue) { text = 'SPÓŹNIONE'; color = '#F87171'; }
  else if (isToday && hoursLeft < 4) { text = 'DZIŚ!'; color = '#F87171'; }
  else if (isToday) { text = 'DZIŚ'; color = '#FBBF24'; }
  else { text = dl.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }); color = 'var(--tm)'; }
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{text}</span>;
}

export function OrdersListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data: res } = await api.get('/packaging/orders', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch { toast.error('Nie udało się pobrać zamówień'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { load(); }, [load]);

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
    border: '1px solid var(--border)', background: 'var(--hover-bg)',
    color: 'var(--t)', fontSize: 13, outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  };

  const columns: Column<OrderRow>[] = [
    { key: 'externalOrderId', header: 'Nr zamówienia', render: r => <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>{r.externalOrderId || '—'}</span> },
    { key: 'addressName', header: 'Klient', render: r => <span style={{ fontWeight: 500, color: 'var(--t)' }}>{r.addressName || '—'}</span> },
    { key: 'items', header: 'Pozycje', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{r._count?.items || 0}</span> },
    { key: 'totalAmount', header: 'Kwota', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{fmt(r.totalAmount)} zł</span> },
    { key: 'courierName', header: 'Kurier', render: r => r.courierName ? <Badge color="indigo">{r.courierName}</Badge> : <span style={{ color: 'var(--td)' }}>—</span> },
    { key: 'deadline', header: 'Deadline', render: r => <DeadlineBadge iso={r.dispatchDeadline} /> },
    { key: 'status', header: 'Status', render: r => {
      const s = ORDER_STATUS[r.status] || ORDER_STATUS.NEW;
      return <Badge color={s.color}>{s.label}</Badge>;
    }},
    { key: 'createdAt', header: 'Data', render: r => <span style={{ color: 'var(--tm)', fontSize: 12 }}>{r.createdAt?.slice(0, 10)}</span> },
    { key: 'actions', header: '', render: r => (
      <Link to={`/packaging/orders/${r.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} onClick={e => e.stopPropagation()}>
        <Eye size={15} />
      </Link>
    )},
  ];

  return (
    <>
      <PageHeader title="Zamówienia" subtitle="Zamówienia do realizacji" actions={
        <Link to="/packaging/orders/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowe zamówienie</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj (nr zamówienia, klient, miasto)..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            {STATUS_FILTER.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} zamówień</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/packaging/orders/${r.id}`)}
          emptyTitle="Brak zamówień" emptyDescription="Utwórz pierwsze zamówienie lub zsynchronizuj z Allegro."
          emptyAction={<Link to="/packaging/orders/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowe zamówienie</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
    </>
  );
}

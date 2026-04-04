/**
 * IDS 1.0 — PakOps Orders / Shipments List (Original Design)
 * Header with sync + count, search bar, status filter tabs, full data table, pagination
 * Connected to: GET /api/packaging/orders, POST /api/packaging/orders/sync, POST /api/packaging/batches
 */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, RefreshCw, Layers, Mail, Phone } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Alert } from '../../../components/ui/Alert';
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
  addressEmail?: string;
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

  const { data: result, isLoading, isError } = useQuery({
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

  const sortIcon = (key: string) => {
    if (sortBy !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .15s',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--tm)',
  });

  const thStyle = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
    padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: align,
    background: 'var(--hover-bg)', whiteSpace: 'nowrap', cursor: 'pointer',
    userSelect: 'none',
  });

  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', fontSize: 13, borderBottom: '1px solid var(--border)',
  };

  return (
    <>
      <PageHeader title="Zamówienia" subtitle={`${total} zamówień w systemie`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={syncMut.isPending}
              onClick={() => syncMut.mutate()}>Synchronizuj</Button>
            {selected.size > 0 && (
              <Button variant="secondary" size="sm" icon={<Layers size={14} />} loading={createBatchMut.isPending}
                onClick={() => createBatchMut.mutate(Array.from(selected))}>
                Utwórz batch ({selected.size})
              </Button>
            )}
          </div>
        }
      />
      <div style={{ padding: '0 24px 24px' }}>
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Szukaj wg numeru, klienta, telefonu..." />
        </div>

        {/* Status tabs */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap',
          padding: 4, borderRadius: 10, background: 'var(--hover-bg)',
        }}>
          {ORDER_STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => { setStatusFilter(t.value); setPage(1); }}
              style={tabStyle(statusFilter === t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Data table */}
        {isError ? (
          <div style={{ marginBottom: 16 }}><Alert type="error">Nie udało się załadować danych</Alert></div>
        ) : isLoading ? <LoadingSpinner /> : items.length === 0 ? (
          <div className="page-card" style={{ padding: 40 }}>
            <EmptyState title="Brak zamówień" description="Zamówienia pojawią się po synchronizacji." />
          </div>
        ) : (
          <div className="page-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle(), width: 36 }}>
                      <input type="checkbox" checked={selected.size === items.length && items.length > 0}
                        onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </th>
                    <th style={thStyle()} onClick={() => handleSort('externalOrderId')}>Nr{sortIcon('externalOrderId')}</th>
                    <th style={thStyle()}>Klient</th>
                    <th style={thStyle('right')} onClick={() => handleSort('totalAmount')}>Kwota{sortIcon('totalAmount')}</th>
                    <th style={thStyle('center')}>Status</th>
                    <th style={thStyle('center')}>Kurier</th>
                    <th style={thStyle('center')}>Termin</th>
                    <th style={thStyle('right')}>Ilość</th>
                    <th style={thStyle('center')}>Mail</th>
                    <th style={thStyle('center')}>Telefon</th>
                    <th style={{ ...thStyle('center'), width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => {
                    const st = ORDER_STATUS[r.status] || { label: r.status, color: 'gray' as BadgeColor };
                    return (
                      <tr key={r.id}
                        onClick={() => navigate(`/packaging/orders/${r.id}`)}
                        style={{ cursor: 'pointer', transition: 'background .12s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>
                          {r.externalOrderId || '—'}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500, color: 'var(--t)' }}>{r.addressName || '—'}</div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: 'var(--t)' }}>
                          {fmtMoney(r.totalAmount)} zł
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <Badge color={st.color}>{st.label}</Badge>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {r.courierName ? <Badge color="indigo">{r.courierName}</Badge> : <span style={{ color: 'var(--td)' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <DeadlineBadge iso={r.dispatchDeadline} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--ts)' }}>
                          {r._count?.items || 0}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {r.addressEmail ? (
                            <Mail size={14} style={{ color: 'var(--tm)' }} />
                          ) : <span style={{ color: 'var(--td)' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {r.addressPhone ? (
                            <Phone size={14} style={{ color: 'var(--tm)' }} />
                          ) : <span style={{ color: 'var(--td)' }}>—</span>}
                        </td>
                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                          <Link to={`/packaging/orders/${r.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }}>
                            <Eye size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination + Sync button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={syncMut.isPending}
            onClick={() => syncMut.mutate()}>Synchronizuj</Button>
        </div>
      </div>
    </>
  );
}

export default ShipmentsListPage;

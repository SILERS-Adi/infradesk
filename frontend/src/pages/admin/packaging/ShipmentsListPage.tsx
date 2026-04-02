/**
 * IDS 1.0 — Shipments List (Standard List Pattern)
 * Connected to: GET /api/packaging/shipments
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { STATUS_MAP, COURIER_MAP, STATUS_FILTER_OPTIONS, COURIER_FILTER_OPTIONS } from './constants';
import { fmtWeight, fmtDate } from './utils';
import type { ShipmentRow } from './types';

export function ShipmentsListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [courierFilter, setCourierFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (courierFilter) params.courier = courierFilter;
      const { data: res } = await api.get('/packaging/shipments', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch {
      toast.error('Nie udało się pobrać przesyłek');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, courierFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter, courierFilter]);
  useEffect(() => { load(); }, [load]);

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
    border: '1px solid var(--border)', background: 'var(--hover-bg)',
    color: 'var(--t)', fontSize: 13, outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  };

  const columns: Column<ShipmentRow>[] = [
    { key: 'orderNumber', header: 'Zamówienie', render: r => <span style={{ fontWeight: 600, color: 'var(--t)', fontFamily: 'monospace', fontSize: 12 }}>{r.orderNumber}</span> },
    { key: 'clientName', header: 'Klient' },
    { key: 'itemCount', header: 'Pozycje', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{r.itemCount} szt</span> },
    { key: 'totalWeight', header: 'Waga', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{fmtWeight(r.totalWeight)}</span> },
    { key: 'courier', header: 'Kurier', render: r => <Badge color={COURIER_MAP[r.courier]?.color || 'gray'}>{COURIER_MAP[r.courier]?.label || r.courier}</Badge> },
    { key: 'status', header: 'Status', render: r => <Badge color={STATUS_MAP[r.status]?.color || 'gray'}>{STATUS_MAP[r.status]?.label || r.status}</Badge> },
    { key: 'createdAt', header: 'Data', render: r => <span style={{ color: 'var(--tm)' }}>{fmtDate(r.createdAt)}</span> },
    { key: 'actions', header: '', render: r => (
      <Link to={`/packaging/shipments/${r.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Podgląd" onClick={e => e.stopPropagation()}>
        <Eye size={15} />
      </Link>
    )},
  ];

  return (
    <>
      <PageHeader title="Przesyłki" subtitle="Lista przesyłek i paczek" actions={
        <Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowa przesyłka</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj zamówienia, klienta..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={courierFilter} onChange={e => setCourierFilter(e.target.value)} style={selectStyle}>
            {COURIER_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} przesyłek</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/packaging/shipments/${r.id}`)}
          emptyTitle="Brak przesyłek" emptyDescription="Utwórz pierwszą przesyłkę."
          emptyAction={<Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowa przesyłka</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
    </>
  );
}

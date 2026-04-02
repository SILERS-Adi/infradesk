/**
 * IDS 1.0 — Inspections List (Standard List Pattern)
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
import { INSPECTION_STATUS_MAP, INSPECTION_RESULT_MAP, INSPECTION_TYPE_MAP, STATUS_FILTER_OPTIONS } from './constants';
import type { Inspection, BadgeColor } from './types';

export function InspectionsListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Inspection[]>([]);
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
      const { data: res } = await api.get('/service/inspections', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch { toast.error('Nie udało się pobrać przeglądów'); }
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

  const columns: Column<Inspection>[] = [
    { key: 'inspectionNumber', header: 'Numer', render: r => <span style={{ fontWeight: 600, color: 'var(--t)', fontFamily: 'monospace', fontSize: 12 }}>{r.inspectionNumber}</span> },
    { key: 'vehicle', header: 'Pojazd', render: r => <span style={{ color: 'var(--ts)' }}>{r.vehicle?.plate} — {r.vehicle?.brand} {r.vehicle?.model}</span> },
    { key: 'owner', header: 'Właściciel', render: r => <span style={{ color: 'var(--tm)' }}>{r.vehicle?.ownerName || '—'}</span> },
    { key: 'type', header: 'Typ', render: r => <span style={{ fontSize: 12, color: 'var(--tm)' }}>{INSPECTION_TYPE_MAP[r.type] || r.type}</span> },
    { key: 'scheduledAt', header: 'Data', render: r => <span style={{ color: 'var(--tm)' }}>{r.scheduledAt?.slice(0, 10)}</span> },
    { key: 'result', header: 'Wynik', render: r => r.result ? <Badge color={(INSPECTION_RESULT_MAP[r.result]?.color || 'gray') as BadgeColor}>{INSPECTION_RESULT_MAP[r.result]?.label}</Badge> : <span style={{ color: 'var(--td)' }}>—</span> },
    { key: 'status', header: 'Status', render: r => <Badge color={(INSPECTION_STATUS_MAP[r.status]?.color || 'gray') as BadgeColor}>{INSPECTION_STATUS_MAP[r.status]?.label}</Badge> },
    { key: 'actions', header: '', render: r => (
      <Link to={`/service/inspections/${r.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Szczegóły" onClick={e => e.stopPropagation()}>
        <Eye size={15} />
      </Link>
    )},
  ];

  return (
    <>
      <PageHeader title="Przeglądy" subtitle="Lista inspekcji pojazdów" actions={
        <Link to="/service/inspections/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowy przegląd</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj (numer, rejestracja, właściciel)..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} przeglądów</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/service/inspections/${r.id}`)}
          emptyTitle="Brak przeglądów" emptyDescription="Zaplanuj pierwszy przegląd pojazdu."
          emptyAction={<Link to="/service/inspections/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowy przegląd</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
    </>
  );
}

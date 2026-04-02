/**
 * IDS 1.0 — Vehicles List (Standard List Pattern)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';
import type { Vehicle } from './types';

export function VehiclesListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      const { data: res } = await api.get('/service/vehicles', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch { toast.error('Nie udało się pobrać pojazdów'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/service/vehicles/${deleteTarget.id}`);
      toast.success('Pojazd usunięty');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Nie udało się usunąć pojazdu'); }
    finally { setDeleting(false); }
  };

  const columns: Column<Vehicle>[] = [
    { key: 'plate', header: 'Rejestracja', render: r => <span style={{ fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>{r.plate}</span> },
    { key: 'brand', header: 'Marka / Model', render: r => <span style={{ color: 'var(--ts)' }}>{r.brand} {r.model}</span> },
    { key: 'year', header: 'Rok', render: r => <span style={{ color: 'var(--tm)' }}>{r.year || '—'}</span> },
    { key: 'ownerName', header: 'Właściciel', render: r => <span style={{ fontWeight: 500, color: 'var(--ts)' }}>{r.ownerName}</span> },
    { key: 'inspections', header: 'Przeglądy', render: r => {
      const cnt = r._count?.inspections || 0;
      return cnt > 0 ? <Badge color="indigo">{cnt}</Badge> : <span style={{ color: 'var(--td)' }}>0</span>;
    }},
    { key: 'actions', header: '', render: r => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Link to={`/service/vehicles/${r.id}/edit`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Edytuj" onClick={e => e.stopPropagation()}><Eye size={15} /></Link>
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(r); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }} title="Usuń"><Trash2 size={15} /></button>
      </div>
    )},
  ];

  return (
    <>
      <PageHeader title="Pojazdy" subtitle="Baza pojazdów" actions={
        <Link to="/service/vehicles/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowy pojazd</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj (rejestracja, marka, właściciel, VIN)..." />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} pojazdów</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/service/vehicles/${r.id}/edit`)}
          emptyTitle="Brak pojazdów" emptyDescription="Dodaj pierwszy pojazd."
          emptyAction={<Link to="/service/vehicles/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Dodaj pojazd</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Usuń pojazd" size="sm"
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Anuluj</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Usuń</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--ts)', margin: 0 }}>Czy na pewno chcesz usunąć pojazd <strong>{deleteTarget?.plate}</strong>? Wszystkie przeglądy zostaną usunięte.</p>
      </Modal>
    </>
  );
}

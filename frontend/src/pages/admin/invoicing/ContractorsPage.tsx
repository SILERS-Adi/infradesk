/**
 * IDS 1.0 — Contractors List (Standard List Pattern)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';

interface Contractor {
  id: string;
  name: string;
  nip: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
}

export function ContractorsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      const { data: res } = await api.get('/invoicing/contractors', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch {
      toast.error('Nie udało się pobrać kontrahentów');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/invoicing/contractors/${deleteTarget.id}`);
      toast.success('Kontrahent usunięty');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Nie udało się usunąć kontrahenta');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<Contractor>[] = [
    { key: 'name', header: 'Nazwa', render: r => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span> },
    { key: 'nip', header: 'NIP', render: r => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--tm)' }}>{r.nip || '—'}</span> },
    { key: 'email', header: 'Email', render: r => <span style={{ color: 'var(--ts)' }}>{r.email || '—'}</span> },
    { key: 'phone', header: 'Telefon', render: r => <span style={{ color: 'var(--ts)' }}>{r.phone || '—'}</span> },
    { key: 'city', header: 'Miasto', render: r => <span style={{ color: 'var(--tm)' }}>{r.city || '—'}</span> },
    { key: 'actions', header: '', render: r => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Link to={`/invoicing/contractors/${r.id}/edit`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Edytuj" onClick={e => e.stopPropagation()}>
          <Eye size={15} />
        </Link>
        <button onClick={e => { e.stopPropagation(); setDeleteTarget(r); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }} title="Usun">
          <Trash2 size={15} />
        </button>
      </div>
    )},
  ];

  return (
    <>
      <PageHeader title="Kontrahenci" subtitle="Klienci i dostawcy" actions={
        <Link to="/invoicing/contractors/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowy kontrahent</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj kontrahenta..." />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} kontrahentów</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/invoicing/contractors/${r.id}/edit`)}
          emptyTitle="Brak kontrahentów" emptyDescription="Dodaj pierwszego kontrahenta."
          emptyAction={<Link to="/invoicing/contractors/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Dodaj kontrahenta</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Usun kontrahenta" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Anuluj</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Usun</Button>
          </>
        }>
        <p style={{ fontSize: 13, color: 'var(--ts)', margin: 0 }}>
          Czy na pewno chcesz usunac kontrahenta <strong>{deleteTarget?.name}</strong>?
        </p>
      </Modal>
    </>
  );
}

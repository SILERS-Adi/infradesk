/**
 * IDS 1.0 — Products List (Standard List Pattern)
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

interface Product {
  id: string; name: string; sku: string | null; unit: string;
  priceNet: number | string; vatRate: string;
}

const fmtPrice = (v: number | string) => Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProductsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      const { data: res } = await api.get('/invoicing/products', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch { toast.error('Nie udalo sie pobrac produktow'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/invoicing/products/${deleteTarget.id}`);
      toast.success('Produkt usuniety');
      setDeleteTarget(null);
      load();
    } catch { toast.error('Nie udalo sie usunac produktu'); }
    finally { setDeleting(false); }
  };

  const columns: Column<Product>[] = [
    { key: 'name', header: 'Nazwa', render: r => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span> },
    { key: 'sku', header: 'SKU', render: r => <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--tm)' }}>{r.sku || '—'}</span> },
    { key: 'unit', header: 'Jm', render: r => <span style={{ color: 'var(--tm)' }}>{r.unit}</span> },
    { key: 'priceNet', header: 'Cena netto', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{fmtPrice(r.priceNet)} zl</span> },
    { key: 'vatRate', header: 'VAT', render: r => <Badge color="indigo">{r.vatRate}%</Badge> },
    { key: 'actions', header: '', render: r => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Link to={`/invoicing/products/${r.id}/edit`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Edytuj" onClick={e => e.stopPropagation()}>
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
      <PageHeader title="Produkty" subtitle="Katalog produktow i uslug" actions={
        <Link to="/invoicing/products/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowy produkt</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj produktu (nazwa, SKU)..." />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} produktow</span>
        </div>
        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.id}
          onRowClick={r => navigate(`/invoicing/products/${r.id}/edit`)}
          emptyTitle="Brak produktow" emptyDescription="Dodaj pierwszy produkt."
          emptyAction={<Link to="/invoicing/products/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Dodaj produkt</Button></Link>}
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Usun produkt" size="sm"
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Anuluj</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Usun</Button></>}>
        <p style={{ fontSize: 13, color: 'var(--ts)', margin: 0 }}>Czy na pewno chcesz usunac produkt <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </>
  );
}

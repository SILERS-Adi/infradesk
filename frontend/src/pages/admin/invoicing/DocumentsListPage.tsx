/**
 * IDS 1.0 — Invoicing Documents List
 * Based on: ModuleListTemplate
 * Pattern: PageHeader → Toolbar (SearchInput + filters) → DataTable → Pagination
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Download, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';

// IDS Components
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';

// Module
import type { DocumentRow, DocumentViewMode } from './types';
import { STATUS_MAP, TYPE_LABELS, TYPE_COLORS, SALE_DOC_TYPES_CSV, STATUS_FILTER_OPTIONS, TYPE_FILTER_OPTIONS } from './constants';
import { fmtPLN, downloadBlob } from './utils';
import { ExportButtons } from './components/ExportButtons';

export function DocumentsListPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<DocumentViewMode>('documents');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (viewMode === 'documents' && !typeFilter) params.type = SALE_DOC_TYPES_CSV;
      if (typeFilter) params.type = typeFilter;

      const { data } = await api.get('/invoicing/documents', { params });
      setDocs(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Nie udało się pobrać dokumentów');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, viewMode, page]);

  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, viewMode]);
  useEffect(() => { load(); }, [load]);

  const handleDownloadPdf = async (e: React.MouseEvent, id: string, number_: string) => {
    e.stopPropagation();
    try {
      const { data } = await api.get(`/invoicing/documents/${id}/pdf`, { responseType: 'blob' });
      downloadBlob(data, `${number_.replace(/\//g, '_')}.pdf`);
    } catch {
      toast.error('PDF nie jest jeszcze dostępny');
    }
  };

  // ── DataTable columns (IDS pattern) ──
  const columns: Column<DocumentRow>[] = [
    {
      key: 'type',
      header: 'Typ',
      render: (row) => {
        const label = TYPE_LABELS[row.type] || row.type?.toUpperCase() || '';
        const color = TYPE_COLORS[row.type] || 'var(--tm)';
        return label ? (
          <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}15`, padding: '2px 7px', borderRadius: 5 }}>
            {label}
          </span>
        ) : null;
      },
    },
    {
      key: 'number',
      header: 'Numer',
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{row.number}</span>,
    },
    {
      key: 'buyer_name',
      header: 'Kontrahent',
      render: (row) => <span>{row.buyer_name || '—'}</span>,
    },
    {
      key: 'net_total',
      header: 'Netto',
      render: (row) => <span style={{ display: 'block', textAlign: 'right' }}>{fmtPLN(row.net_total)}</span>,
    },
    {
      key: 'vat_total',
      header: 'VAT',
      render: (row) => <span style={{ display: 'block', textAlign: 'right', color: 'var(--tm)' }}>{fmtPLN(row.vat_total)}</span>,
    },
    {
      key: 'gross_total',
      header: 'Brutto',
      render: (row) => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600, color: 'var(--t)' }}>{fmtPLN(row.gross_total)} zł</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const s = STATUS_MAP[row.status] || STATUS_MAP.draft;
        return <Badge color={s.color}>{s.label}</Badge>;
      },
    },
    {
      key: 'issue_date',
      header: 'Data',
      render: (row) => <span style={{ color: 'var(--tm)' }}>{row.issue_date}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Link to={`/invoicing/documents/${row.id}`}
            style={{ color: 'var(--accent)', display: 'flex', padding: 4 }}
            title="Podgląd" onClick={(e) => e.stopPropagation()}>
            <Eye size={15} />
          </Link>
          <button onClick={(e) => handleDownloadPdf(e, row.id, row.number)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}
            title="Pobierz PDF">
            <Download size={15} />
          </button>
        </div>
      ),
    },
  ];

  // ── Filter select style (IDS pattern) ──
  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
    border: '1px solid var(--border)', background: 'var(--hover-bg)',
    color: 'var(--t)', fontSize: 13, outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  };

  return (
    <>
      {/* ── PAGE HEADER (IDS) ── */}
      <PageHeader
        title="Dokumenty"
        subtitle="Faktury, korekty, proformy i inne dokumenty sprzedażowe"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ExportButtons entity="documents" params={statusFilter ? { status: statusFilter } : undefined} />
            <Link to="/invoicing/documents/new" style={{ textDecoration: 'none' }}>
              <Button variant="primary" icon={<Plus size={14} />}>Nowy dokument</Button>
            </Link>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>

        {/* ── VIEW MODE TOGGLE ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--hover-bg)', borderRadius: 'var(--rs)', padding: 3, width: 'fit-content' }}>
          {(['documents', 'invoices'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: viewMode === mode ? 650 : 500,
              background: viewMode === mode ? 'var(--bg-card)' : 'transparent',
              color: viewMode === mode ? 'var(--accent)' : 'var(--tm)',
              boxShadow: viewMode === mode ? 'var(--shadow-soft)' : 'none',
              transition: 'var(--trf)',
            }}>
              {mode === 'documents' ? 'Dokumenty' : 'Legacy (faktury)'}
            </button>
          ))}
        </div>

        {/* ── TOOLBAR (IDS) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj dokumentów..." />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {viewMode === 'documents' && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
              {TYPE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} dok.</span>
        </div>

        {/* ── DATA TABLE (IDS) ── */}
        <DataTable
          columns={columns}
          data={docs}
          loading={loading}
          onRowClick={(row) => navigate(`/invoicing/documents/${row.id}`)}
          keyExtractor={(row) => row.id}
          emptyTitle="Brak dokumentów"
          emptyDescription='Utwórz pierwszy dokument klikając przycisk "Nowy dokument" powyżej.'
          emptyAction={
            <Link to="/invoicing/documents/new" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowy dokument</Button>
            </Link>
          }
        />

        {/* ── PAGINATION (IDS) ── */}
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>
    </>
  );
}

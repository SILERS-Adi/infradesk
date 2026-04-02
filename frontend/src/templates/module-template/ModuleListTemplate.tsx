/**
 * IDS 1.0 — Module List Template (STANDARD LIST PATTERN)
 *
 * USE WHEN: Simple CRUD list page with table, filters, pagination.
 * PATTERN:  PageHeader → Toolbar (SearchInput + Select filters) → DataTable → Pagination
 *
 * This is the MOST COMMON page type in InfraDesk (~75% of all list screens).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ DO NOT USE THIS TEMPLATE for screens that need:                    │
 * │                                                                    │
 * │  • Sortable column headers (click TH to sort)                     │
 * │  • Column visibility toggle (user hides/shows columns)            │
 * │  • Column drag & drop reorder                                     │
 * │  • Inline actions in rows (assign popup, status change)           │
 * │  • Tab navigation with badge counts                               │
 * │                                                                    │
 * │ For those screens → see AdvancedListPattern.md                    │
 * │ Use custom <table> with IDS components around it.                 │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Qualification test (all must be NO for this template):
 * 1. Does the user sort columns by clicking headers?
 * 2. Does the user perform inline actions in rows?
 * 3. Does the user customize column visibility/order?
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { DataTable, type Column } from '../../components/ui/DataTable';

// ── Replace with your module's types ──
interface ListItem {
  id: string;
  name: string;
  status: string;
  value: number;
  date: string;
}

// ── Replace with your module's status map ──
const STATUS_MAP: Record<string, { label: string; color: 'gray' | 'blue' | 'green' | 'red' | 'yellow' }> = {
  active:   { label: 'Aktywny',    color: 'green' },
  pending:  { label: 'Oczekujący', color: 'yellow' },
  closed:   { label: 'Zamknięty',  color: 'gray' },
  error:    { label: 'Błąd',       color: 'red' },
};

// ── Replace with your module's filter options ──
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'active', label: 'Aktywne' },
  { value: 'pending', label: 'Oczekujące' },
  { value: 'closed', label: 'Zamknięte' },
];

export function ModuleListTemplate() {
  const navigate = useNavigate();
  const [data, setData] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── DATA FETCHING ──
  // Replace with useQuery for production:
  //   const { data, isLoading } = useQuery({
  //     queryKey: ['module-items', { page, search, status: statusFilter }],
  //     queryFn: () => api.get('/module/items', { params }).then(r => r.data),
  //   });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Replace with real API call
      // const { data } = await api.get('/module/items', { params: { page, search, status: statusFilter } });
      // setData(data.items);
      // setTotal(data.total);
      setData([
        { id: '1', name: 'Element testowy #1', status: 'active', value: 1200, date: '2026-04-01' },
        { id: '2', name: 'Element testowy #2', status: 'pending', value: 580, date: '2026-04-02' },
        { id: '3', name: 'Element testowy #3', status: 'closed', value: 3400, date: '2026-03-28' },
      ]);
      setTotal(3);
    } catch {
      toast.error('Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { load(); }, [load]);

  // ── COLUMN DEFINITIONS ──
  // The Column<T> interface: { key, header, render?, className? }
  // render() is optional — without it, DataTable shows row[key] as text
  const columns: Column<ListItem>[] = [
    {
      key: 'name',
      header: 'Nazwa',
      render: (row) => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{row.name}</span>,
    },
    {
      key: 'value',
      header: 'Wartość',
      render: (row) => (
        <span style={{ fontWeight: 600, textAlign: 'right', display: 'block' }}>
          {row.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const s = STATUS_MAP[row.status] || STATUS_MAP.active;
        return <Badge color={s.color}>{s.label}</Badge>;
      },
    },
    {
      key: 'date',
      header: 'Data',
      render: (row) => <span style={{ color: 'var(--tm)' }}>{row.date}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Link to={`./${row.id}`} style={{ color: 'var(--accent)', display: 'flex', padding: 4 }} title="Podgląd">
            <Eye size={16} />
          </Link>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }} title="Usuń">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* ── PAGE HEADER ──
          Standard: title + subtitle + CTA button on the right
          The CTA always uses variant="primary" with Plus icon */}
      <PageHeader
        title="Lista elementów"
        subtitle="Zarządzanie elementami modułu"
        actions={
          <Link to="./new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" icon={<Plus size={14} />}>Nowy element</Button>
          </Link>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>

        {/* ── TOOLBAR ──
            Standard layout: SearchInput (flex 1, max 320px) + filter Selects + right-aligned count
            Wrap on mobile. Gap 12px. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Szukaj elementów..."
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
              border: '1px solid var(--border)', background: 'var(--hover-bg)',
              color: 'var(--t)', fontSize: 13, outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
            }}
          >
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>
            {total} elementów
          </span>
        </div>

        {/* ── DATA TABLE ──
            DataTable handles loading spinner and empty state internally.
            onRowClick navigates to detail page. */}
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          onRowClick={(row) => navigate(`./${row.id}`)}
          keyExtractor={(row) => row.id}
          emptyTitle="Brak elementów"
          emptyDescription="Dodaj pierwszy element klikając przycisk powyżej."
          emptyAction={
            <Link to="./new" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowy element</Button>
            </Link>
          }
        />

        {/* ── PAGINATION ──
            IDS Pagination auto-hides when totalPages <= 1.
            Placed directly below DataTable, inside a Card or standalone. */}
        <Card noPadding>
          <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
        </Card>

      </div>
    </>
  );
}

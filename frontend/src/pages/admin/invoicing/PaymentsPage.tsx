/**
 * IDS 1.0 — Payments List (Standard List Pattern)
 * Shows payment status of all documents
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { KpiCard } from '../../../components/ui/KpiCard';
import { fmtPLN } from './utils';
import type { BadgeColor } from './types';

interface PaymentRow {
  documentId: string;
  documentNumber: string;
  contractorName: string;
  gross: number;
  paid: number;
  remaining: number;
  dueDate: string | null;
  issuedAt: string;
  paymentStatus: string;
  paymentsCount: number;
}

const PAY_STATUS: Record<string, { label: string; color: BadgeColor }> = {
  paid: { label: 'Oplacona', color: 'green' },
  partial: { label: 'Czesciowo', color: 'yellow' },
  unpaid: { label: 'Nieoplacona', color: 'gray' },
  overdue: { label: 'Przeterminowana', color: 'red' },
};

const STATUS_FILTER = [
  { value: '', label: 'Wszystkie' },
  { value: 'unpaid', label: 'Nieoplacone' },
  { value: 'partial', label: 'Czesciowo oplacone' },
  { value: 'paid', label: 'Oplacone' },
  { value: 'overdue', label: 'Przeterminowane' },
];

const METHOD_OPTIONS = [
  { value: 'przelew', label: 'Przelew' },
  { value: 'gotowka', label: 'Gotowka' },
  { value: 'karta', label: 'Karta' },
  { value: 'blik', label: 'BLIK' },
];

export function PaymentsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Add payment modal
  const [payModal, setPayModal] = useState<PaymentRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('przelew');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), per_page: '50' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data: res } = await api.get('/invoicing/payments', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch { toast.error('Nie udalo sie pobrac platnosci'); }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { load(); }, [load]);

  const handlePay = async () => {
    if (!payModal || !payAmount) return;
    setPaying(true);
    try {
      await api.post('/invoicing/payments', {
        documentId: payModal.documentId,
        amount: parseFloat(payAmount),
        method: payMethod,
      });
      toast.success('Platnosc zarejestrowana');
      setPayModal(null);
      setPayAmount('');
      load();
    } catch { toast.error('Nie udalo sie dodac platnosci'); }
    finally { setPaying(false); }
  };

  // KPI from loaded data
  const totalGross = data.reduce((s, d) => s + d.gross, 0);
  const totalPaid = data.reduce((s, d) => s + d.paid, 0);
  const totalRemaining = data.reduce((s, d) => s + d.remaining, 0);
  const overdueCount = data.filter(d => d.paymentStatus === 'overdue').length;

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px', borderRadius: 'var(--rs)',
    border: '1px solid var(--border)', background: 'var(--hover-bg)',
    color: 'var(--t)', fontSize: 13, outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  };

  const columns: Column<PaymentRow>[] = [
    { key: 'documentNumber', header: 'Dokument', render: r => (
      <Link to={`/invoicing/documents/${r.documentId}`} onClick={e => e.stopPropagation()} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
        {r.documentNumber}
      </Link>
    )},
    { key: 'contractorName', header: 'Kontrahent' },
    { key: 'gross', header: 'Kwota', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{fmtPLN(r.gross)} zl</span> },
    { key: 'paid', header: 'Zaplacono', render: r => <span style={{ display: 'block', textAlign: 'right', color: r.paid > 0 ? '#4ADE80' : 'var(--tm)' }}>{fmtPLN(r.paid)} zl</span> },
    { key: 'remaining', header: 'Pozostalo', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600, color: r.remaining > 0 ? '#F87171' : '#4ADE80' }}>{fmtPLN(r.remaining)} zl</span> },
    { key: 'dueDate', header: 'Termin', render: r => <span style={{ color: r.paymentStatus === 'overdue' ? '#F87171' : 'var(--tm)' }}>{r.dueDate || '—'}</span> },
    { key: 'paymentStatus', header: 'Status', render: r => {
      const s = PAY_STATUS[r.paymentStatus] || PAY_STATUS.unpaid;
      return <Badge color={s.color}>{s.label}</Badge>;
    }},
    { key: 'actions', header: '', render: r => r.remaining > 0 ? (
      <button onClick={e => { e.stopPropagation(); setPayModal(r); setPayAmount(String(r.remaining)); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 4, display: 'flex' }} title="Dodaj platnosc">
        <CreditCard size={15} />
      </button>
    ) : null },
  ];

  return (
    <>
      <PageHeader title="Platnosci" subtitle="Rozliczenia dokumentow sprzedazowych" />

      <div style={{ padding: '0 24px 24px' }}>
        {/* KPI */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Do rozliczenia" value={`${fmtPLN(totalGross)} zl`} icon={<CreditCard size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Zaplacono" value={`${fmtPLN(totalPaid)} zl`} icon={<CreditCard size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Pozostalo" value={`${fmtPLN(totalRemaining)} zl`} icon={<CreditCard size={20} color="#fff" />} color={totalRemaining > 0 ? '#F87171' : '#4ADE80'} />
          <KpiCard label="Przeterminowane" value={String(overdueCount)} icon={<CreditCard size={20} color="#fff" />} color={overdueCount > 0 ? '#F87171' : '#4ADE80'} />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj dokumentu, kontrahenta..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            {STATUS_FILTER.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} dokumentow</span>
        </div>

        <DataTable columns={columns} data={data} loading={loading} keyExtractor={r => r.documentId}
          onRowClick={r => navigate(`/invoicing/documents/${r.documentId}`)}
          emptyTitle="Brak dokumentow" emptyDescription="Wystaw pierwszy dokument, aby sledzic platnosci."
        />
        <Pagination page={page} total={total} perPage={50} onPageChange={setPage} />
      </div>

      {/* Add payment modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Dodaj platnosc" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayModal(null)}>Anuluj</Button>
            <Button variant="primary" onClick={handlePay} loading={paying} disabled={!payAmount}>Zaplac</Button>
          </>
        }>
        {payModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--ts)' }}>
              Dokument: <strong style={{ color: 'var(--t)' }}>{payModal.documentNumber}</strong>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ts)' }}>
              Pozostalo: <strong style={{ color: '#F87171' }}>{fmtPLN(payModal.remaining)} zl</strong>
            </div>
            <Input label="Kwota platnosci (PLN)" type="number" min="0.01" step="0.01" value={payAmount}
              onChange={e => setPayAmount(e.target.value)} />
            <Select label="Metoda platnosci" options={METHOD_OPTIONS} value={payMethod}
              onChange={e => setPayMethod(e.target.value)} />
          </div>
        )}
      </Modal>
    </>
  );
}

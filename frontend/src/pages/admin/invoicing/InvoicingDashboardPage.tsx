/**
 * IDS 1.0 — Invoicing Dashboard
 * Based on: ModuleDashboardTemplate
 * Pattern: PageHeader → KPI strip → Main grid (recent + statuses) → Quick actions
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, ArrowUpRight, FileSpreadsheet, BarChart3, FileText, Plus, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';

// IDS Components
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

// Module
import type { DocumentRow } from './types';
import { STATUS_MAP, TYPE_LABELS } from './constants';
import { fmtPLN } from './utils';

export function InvoicingDashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalGross: 0, totalNet: 0, totalVat: 0, count: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/invoicing/documents', { params: { per_page: '10' } });
      const items: DocumentRow[] = data.items || [];
      setDocs(items);

      // Compute KPI from loaded data
      const totalGross = items.reduce((s: number, d: DocumentRow) => s + (d.gross_total || 0), 0);
      const totalNet = items.reduce((s: number, d: DocumentRow) => s + (d.net_total || 0), 0);
      const totalVat = items.reduce((s: number, d: DocumentRow) => s + (d.vat_total || 0), 0);
      setStats({ totalGross, totalNet, totalVat, count: data.total || items.length });
    } catch {
      toast.error('Nie udało się pobrać danych dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Status breakdown from loaded docs
  const statusCounts: Record<string, number> = {};
  docs.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });

  const overdueCount = statusCounts['overdue'] || 0;

  if (loading) return (
    <>
      <PageHeader title="Faktury — Dashboard" />
      <LoadingSpinner />
    </>
  );

  return (
    <>
      {/* ── PAGE HEADER (IDS) ── */}
      <PageHeader
        title="Faktury — Dashboard"
        subtitle="Przegląd modułu fakturowego"
        actions={
          <Link to="/invoicing/documents/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" icon={<Plus size={14} />}>Nowa faktura</Button>
          </Link>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>

        {/* ── KPI STRIP (IDS) ── */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard
            label="Obroty brutto"
            value={stats.totalGross > 0 ? `${fmtPLN(stats.totalGross)} zł` : '—'}
            icon={<TrendingUp size={20} color="#fff" />}
            color="var(--accent)"
            onClick={() => navigate('/invoicing/reports')}
          />
          <KpiCard
            label="Netto"
            value={stats.totalNet > 0 ? `${fmtPLN(stats.totalNet)} zł` : '—'}
            icon={<ArrowUpRight size={20} color="#fff" />}
            color="#4ADE80"
          />
          <KpiCard
            label="VAT"
            value={stats.totalVat > 0 ? `${fmtPLN(stats.totalVat)} zł` : '—'}
            icon={<FileSpreadsheet size={20} color="#fff" />}
            color="#FBBF24"
          />
          <KpiCard
            label="Dokumentów"
            value={String(stats.count)}
            sub={overdueCount > 0 ? `${overdueCount} przeterminowanych` : undefined}
            icon={<BarChart3 size={20} color="#fff" />}
            color="#60A5FA"
            onClick={() => navigate('/invoicing/documents')}
          />
        </div>

        {/* ── MAIN GRID (IDS) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

          {/* Left: Recent documents */}
          <Card title="Ostatnie dokumenty" noPadding>
            {docs.length === 0 ? (
              <EmptyState
                title="Brak dokumentów"
                description="Utwórz pierwszy dokument."
                action={
                  <Link to="/invoicing/documents/new" style={{ textDecoration: 'none' }}>
                    <Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowa faktura</Button>
                  </Link>
                }
              />
            ) : (
              <div>
                {docs.slice(0, 6).map(doc => (
                  <Link key={doc.id} to={`/invoicing/documents/${doc.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px', borderBottom: '1px solid var(--border)',
                      textDecoration: 'none', transition: 'background .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                        {TYPE_LABELS[doc.type] ? <span style={{ color: 'var(--tm)', fontWeight: 400, marginRight: 6 }}>{TYPE_LABELS[doc.type]}</span> : null}
                        {doc.number}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{doc.buyer_name || '—'} · {doc.issue_date}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ts)' }}>{fmtPLN(doc.gross_total)} zł</div>
                      <Badge color={STATUS_MAP[doc.status]?.color || 'gray'}>{STATUS_MAP[doc.status]?.label || doc.status}</Badge>
                    </div>
                  </Link>
                ))}
                {docs.length > 6 && (
                  <Link to="/invoicing/documents" style={{
                    display: 'block', padding: '10px 20px', textAlign: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
                  }}>
                    Zobacz wszystkie →
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* Right: Status breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card title="Statusy dokumentów">
              {Object.keys(statusCounts).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--tm)', padding: 12 }}>Brak danych</div>
              ) : (
                Object.entries(statusCounts).map(([status, count]) => {
                  const s = STATUS_MAP[status] || { label: status, color: 'gray' as const };
                  return (
                    <div key={status} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <Badge color={s.color}>{s.label}</Badge>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{count}</span>
                    </div>
                  );
                })
              )}
            </Card>

            {/* Quick actions */}
            <Card title="Szybkie akcje">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link to="/invoicing/documents/new" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm" icon={<FileText size={14} />} style={{ width: '100%' }}>Nowa faktura</Button>
                </Link>
                <Link to="/invoicing/contractors" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" size="sm" style={{ width: '100%' }}>Kontrahenci</Button>
                </Link>
                <Link to="/invoicing/reports" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" size="sm" style={{ width: '100%' }}>Raporty</Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

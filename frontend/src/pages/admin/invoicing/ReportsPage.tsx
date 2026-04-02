/**
 * IDS 1.0 — Invoicing Sales Report
 * Connected to: GET /api/invoicing/reports/sales
 */
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, ArrowUpRight, FileSpreadsheet, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { STATUS_MAP } from './constants';
import { fmtPLN } from './utils';
import type { BadgeColor } from './types';

interface SalesReport {
  totalDocuments: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  byStatus: { status: string; count: number; gross: number }[];
  dailySales: { date: string; count: number; gross: number; net: number }[];
  topContractors: { name: string; count: number; gross: number }[];
}

export function ReportsPage() {
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/invoicing/reports/sales');
      setData(res);
    } catch {
      toast.error('Nie udało się pobrać raportu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <><PageHeader title="Raporty — Sprzedaż" /><LoadingSpinner /></>;
  if (!data) return <><PageHeader title="Raporty — Sprzedaż" /><div style={{ padding: 24, color: 'var(--tm)' }}>Brak danych</div></>;

  // Bar chart max for scaling
  const maxDaily = Math.max(...data.dailySales.map(d => d.gross), 1);

  const contractorColumns: Column<{ name: string; count: number; gross: number }>[] = [
    { key: 'name', header: 'Kontrahent', render: r => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span> },
    { key: 'count', header: 'Dokumenty', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{r.count}</span> },
    { key: 'gross', header: 'Brutto', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{fmtPLN(r.gross)} zł</span> },
  ];

  return (
    <>
      <PageHeader title="Raporty — Sprzedaż" subtitle="Podsumowanie dokumentów sprzedazowych" />

      <div style={{ padding: '0 24px 24px' }}>

        {/* KPI Strip */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Obroty brutto" value={`${fmtPLN(data.totalGross)} zł`} icon={<TrendingUp size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Netto" value={`${fmtPLN(data.totalNet)} zł`} icon={<ArrowUpRight size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="VAT" value={`${fmtPLN(data.totalVat)} zł`} icon={<FileSpreadsheet size={20} color="#fff" />} color="#FBBF24" />
          <KpiCard label="Dokumentow" value={String(data.totalDocuments)} icon={<BarChart3 size={20} color="#fff" />} color="#60A5FA" />
        </div>

        {/* Main grid: chart + status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>

          {/* Daily sales bar chart */}
          <Card title="Sprzedaż dzienna (brutto)">
            {data.dailySales.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, padding: '0 4px', overflow: 'hidden' }}>
                {data.dailySales.slice(-31).map((d, i) => {
                  const h = Math.max(2, (d.gross / maxDaily) * 160);
                  const shortLabel = d.date.slice(5);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
                      <div
                        title={`${d.date}: ${fmtPLN(d.gross)} zł`}
                        style={{
                          width: '100%', maxWidth: 32, height: h, borderRadius: '4px 4px 0 0',
                          background: 'linear-gradient(180deg, var(--accent), var(--accent-s))',
                          opacity: 0.85, cursor: 'default',
                        }}
                      />
                      {data.dailySales.length <= 14 && (
                        <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 4, whiteSpace: 'nowrap' }}>{shortLabel}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Status breakdown */}
          <Card title="Statusy dokumentów">
            {data.byStatus.length === 0 ? (
              <div style={{ padding: 12, color: 'var(--tm)', fontSize: 12 }}>Brak danych</div>
            ) : (
              data.byStatus.map(s => {
                const sm = STATUS_MAP[s.status] || { label: s.status, color: 'gray' as BadgeColor };
                return (
                  <div key={s.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <Badge color={sm.color}>{sm.label}</Badge>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                      <span style={{ color: 'var(--tm)' }}>{s.count} dok.</span>
                      <span style={{ fontWeight: 600, color: 'var(--t)' }}>{fmtPLN(s.gross)} zł</span>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        {/* Top contractors */}
        <Card title="Top kontrahenci wg wartości brutto" noPadding>
          <DataTable
            columns={contractorColumns}
            data={data.topContractors}
            keyExtractor={r => r.name}
            emptyTitle="Brak danych"
            emptyDescription="Brak dokumentów z kontrahentami."
          />
        </Card>

        {/* Daily sales table */}
        {data.dailySales.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Card title="Sprzedaż dzienna — szczegoly" noPadding>
              <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Data', 'Dokumenty', 'Netto', 'Brutto'].map(h => (
                        <th key={h} style={{
                          padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                          textAlign: h === 'Data' ? 'left' : 'right', position: 'sticky', top: 0,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.dailySales].reverse().map(d => (
                      <tr key={d.date} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{d.date}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--tm)', textAlign: 'right' }}>{d.count}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtPLN(d.net)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>{fmtPLN(d.gross)} zł</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

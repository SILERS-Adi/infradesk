/**
 * IDS 1.0 — Packaging Reports
 * Connected to: GET /api/packaging/reports/stats
 */
import { useState, useEffect, useCallback } from 'react';
import { Package, Truck, Weight, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { STATUS_MAP, COURIER_MAP } from './constants';
import { fmtWeight } from './utils';
import type { BadgeColor } from './types';

interface StatsData {
  total: number;
  totalWeight: number;
  totalItems: number;
  byStatus: { status: string; count: number }[];
  byCourier: { courier: string; count: number; weight: number }[];
  dailyStats: { date: string; count: number }[];
}

export function PackagingReportsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/packaging/reports/stats');
      setData(res);
    } catch {
      toast.error('Nie udało się pobrać statystyk');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <><PageHeader title="Pakowanie — Statystyki" /><LoadingSpinner /></>;
  if (!data) return <><PageHeader title="Pakowanie — Statystyki" /><div style={{ padding: 24, color: 'var(--tm)' }}>Brak danych</div></>;

  const maxDaily = Math.max(...data.dailyStats.map(d => d.count), 1);

  const courierColumns: Column<{ courier: string; count: number; weight: number }>[] = [
    { key: 'courier', header: 'Kurier', render: r => <Badge color={(COURIER_MAP[r.courier]?.color || 'gray') as BadgeColor}>{COURIER_MAP[r.courier]?.label || r.courier}</Badge> },
    { key: 'count', header: 'Przesyłek', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{r.count}</span> },
    { key: 'weight', header: 'Łączna waga', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{fmtWeight(r.weight)}</span> },
  ];

  return (
    <>
      <PageHeader title="Pakowanie — Statystyki" subtitle="Podsumowanie przesyłek i pakowania" />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Przesyłek" value={String(data.total)} icon={<Package size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Pozycji" value={String(data.totalItems)} icon={<BarChart3 size={20} color="#fff" />} color="#60A5FA" />
          <KpiCard label="Łączna waga" value={fmtWeight(data.totalWeight)} icon={<Truck size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Kurierów" value={String(data.byCourier.length)} icon={<Truck size={20} color="#fff" />} color="#FBBF24" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
          <Card title="Przesyłki dziennie">
            {data.dailyStats.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, padding: '0 4px', overflow: 'hidden' }}>
                {data.dailyStats.slice(-31).map((d, i) => {
                  const h = Math.max(2, (d.count / maxDaily) * 160);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
                      <div title={`${d.date}: ${d.count} przesyłek`}
                        style={{ width: '100%', maxWidth: 32, height: h, borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg, var(--accent), var(--accent-s))', opacity: 0.85 }} />
                      {data.dailyStats.length <= 14 && (
                        <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.date.slice(5)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Statusy">
            {data.byStatus.map(s => (
              <div key={s.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <Badge color={(STATUS_MAP[s.status]?.color || 'gray') as BadgeColor}>{STATUS_MAP[s.status]?.label || s.status}</Badge>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{s.count}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card title="Kurierzy" noPadding>
          <DataTable columns={courierColumns} data={data.byCourier} keyExtractor={r => r.courier}
            emptyTitle="Brak danych" emptyDescription="Brak przesyłek." />
        </Card>
      </div>
    </>
  );
}

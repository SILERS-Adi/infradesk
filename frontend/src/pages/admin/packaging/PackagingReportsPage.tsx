/**
 * IDS 1.0 — PakOps Reports (Full)
 * Date range, summary stats, charts
 * Connected to: GET /api/packaging/dashboard/stats, /dashboard/chart
 */
import { useState } from 'react';
import { Package, Truck, BarChart3, TrendingUp, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ORDER_STATUS, COURIER_MAP } from './constants';
import { fmtMoney, fmtWeight } from './utils';
import type { DashboardStats, DashboardChartPoint, BadgeColor } from './types';

type Range = '7' | '14' | '30' | '90';

export function PackagingReportsPage() {
  const [range, setRange] = useState<Range>('30');

  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ['packaging', 'reports', 'stats'],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/stats'); return data; },
  });

  const { data: chart, isLoading: loadingChart } = useQuery<DashboardChartPoint[]>({
    queryKey: ['packaging', 'reports', 'chart', range],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/chart', { params: { days: range } }); return data; },
  });

  // Also try old reports endpoint for extra data
  const { data: oldStats } = useQuery<any>({
    queryKey: ['packaging', 'reports', 'legacy'],
    queryFn: async () => {
      try { const { data } = await api.get('/packaging/reports/stats'); return data; }
      catch { return null; }
    },
  });

  if (loadingStats) return <><PageHeader title="Raporty pakowania" /><LoadingSpinner /></>;

  const s = stats || {} as DashboardStats;
  const chartData = chart || [];
  const maxOrders = Math.max(...chartData.map(c => c.orders), 1);
  const maxRevenue = Math.max(...chartData.map(c => c.revenue), 1);
  const totalOrders = chartData.reduce((sum, c) => sum + c.orders, 0);
  const totalRevenue = chartData.reduce((sum, c) => sum + c.revenue, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusEntries = Object.entries(s).filter(([key]) =>
    ['NEW', 'PAID', 'PICKING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(key)
  );
  const totalCount = statusEntries.reduce((sum, [, val]) => sum + (typeof val === 'number' ? val : 0), 0);

  const rangeLabel = (r: Range) => ({ '7': '7 dni', '14': '14 dni', '30': '30 dni', '90': '90 dni' }[r]);

  return (
    <>
      <PageHeader title="Raporty pakowania" subtitle="Statystyki i analiza operacji" />
      <div style={{ padding: '0 24px 24px' }}>
        {/* Date range selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 10, background: 'var(--hover-bg)' }}>
          {(['7', '14', '30', '90'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all .15s',
                background: range === r ? 'var(--accent)' : 'transparent',
                color: range === r ? '#fff' : 'var(--tm)',
              }}>
              {rangeLabel(r)}
            </button>
          ))}
        </div>

        {/* Summary KPIs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Zamówień (okres)" value={String(totalOrders)} icon={<Package size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Przychód (okres)" value={`${fmtMoney(totalRevenue)} zł`} icon={<TrendingUp size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Średnia wartość" value={`${fmtMoney(avgOrderValue)} zł`} icon={<BarChart3 size={20} color="#fff" />} color="#60A5FA" />
          <KpiCard label="Przychód dzisiaj" value={`${fmtMoney(s.revenueToday || 0)} zł`} icon={<Calendar size={20} color="#fff" />} color="#FBBF24" />
          <KpiCard label="Przychód miesiąc" value={`${fmtMoney(s.revenueMonth || 0)} zł`} icon={<Truck size={20} color="#fff" />} color="#A78BFA" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
          {/* Chart */}
          <Card title={`Zamówienia i przychody (${rangeLabel(range)})`}>
            {loadingChart ? <LoadingSpinner /> : chartData.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--tm)' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', marginRight: 4 }} />Zamówienia</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#4ADE80', marginRight: 4 }} />Przychód</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, padding: '0 4px', overflow: 'hidden' }}>
                  {chartData.map((d, i) => {
                    const hOrders = Math.max(4, (d.orders / maxOrders) * 180);
                    const hRevenue = Math.max(2, (d.revenue / maxRevenue) * 180);
                    return (
                      <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div title={`${d.date}: ${d.orders} zam. / ${fmtMoney(d.revenue)} zł`}
                          style={{ display: 'flex', gap: 1, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                          <div style={{ width: '40%', maxWidth: 14, height: hOrders, borderRadius: '3px 3px 0 0', background: 'var(--accent)', opacity: 0.85 }} />
                          <div style={{ width: '40%', maxWidth: 14, height: hRevenue, borderRadius: '3px 3px 0 0', background: '#4ADE80', opacity: 0.7 }} />
                        </div>
                        {chartData.length <= 14 && (
                          <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.date.slice(5)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Axis labels for larger ranges */}
                {chartData.length > 14 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--tm)' }}>
                    <span>{chartData[0]?.date.slice(5)}</span>
                    <span>{chartData[Math.floor(chartData.length / 2)]?.date.slice(5)}</span>
                    <span>{chartData[chartData.length - 1]?.date.slice(5)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Status breakdown */}
          <Card title="Podział wg statusu">
            {statusEntries.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--tm)' }}>Brak danych</div>
            ) : (
              <div>
                {statusEntries.map(([status, count]) => {
                  const st = ORDER_STATUS[status] || { label: status, color: 'gray' as BadgeColor };
                  const pct = totalCount > 0 ? ((count as number) / totalCount) * 100 : 0;
                  return (
                    <div key={status} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Badge color={st.color}>{st.label}</Badge>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{count as number}</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: 'var(--border)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent)', width: `${pct}%`, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Legacy stats if available */}
        {oldStats && oldStats.byCourier && oldStats.byCourier.length > 0 && (
          <Card title="Podział wg kuriera" noPadding>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Kurier', 'Przesyłek', 'Waga'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                        textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                        textAlign: h !== 'Kurier' ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {oldStats.byCourier.map((c: any) => (
                    <tr key={c.courier} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <Badge color={(COURIER_MAP[c.courier]?.color || 'gray') as BadgeColor}>
                          {COURIER_MAP[c.courier]?.label || c.courier}
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'var(--t)' }}>{c.count}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: 'var(--ts)' }}>{fmtWeight(c.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export default PackagingReportsPage;

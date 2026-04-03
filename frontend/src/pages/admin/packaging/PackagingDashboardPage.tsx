/**
 * IDS 1.0 — PakOps Dashboard (Full)
 * Connected to: GET /api/packaging/dashboard/*
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Package, Truck, CreditCard, ShoppingCart, ClipboardList,
  CheckCircle2, Send, Star,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ORDER_STATUS } from './constants';
import { fmtMoney, fmtDate } from './utils';
import type { DashboardStats, DashboardChartPoint, TopProduct, RecentShipment, BadgeColor } from './types';

type ChartRange = '7' | '14' | '30';

export function PackagingDashboardPage() {
  const navigate = useNavigate();
  const [chartRange, setChartRange] = useState<ChartRange>('7');

  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ['packaging', 'dashboard', 'stats'],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/stats'); return data; },
  });

  const { data: chart, isLoading: loadingChart } = useQuery<DashboardChartPoint[]>({
    queryKey: ['packaging', 'dashboard', 'chart', chartRange],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/chart', { params: { days: chartRange } }); return data; },
  });

  const { data: topProducts } = useQuery<TopProduct[]>({
    queryKey: ['packaging', 'dashboard', 'top-products'],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/top-products'); return data; },
  });

  const { data: recent } = useQuery<RecentShipment[]>({
    queryKey: ['packaging', 'dashboard', 'recent'],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/recent'); return data; },
  });

  if (loadingStats) return <><PageHeader title="PakOps Dashboard" /><LoadingSpinner /></>;

  const s = stats || {} as DashboardStats;
  const maxChartOrders = Math.max(...(chart || []).map(c => c.orders), 1);
  const maxChartRevenue = Math.max(...(chart || []).map(c => c.revenue), 1);

  const kpis: { label: string; value: string; icon: React.ReactNode; color: string; status?: string }[] = [
    { label: 'Nowe', value: String(s.NEW || 0), icon: <ShoppingCart size={20} color="#fff" />, color: '#60A5FA', status: 'NEW' },
    { label: 'Opłacone', value: String(s.PAID || 0), icon: <CreditCard size={20} color="#fff" />, color: '#4ADE80', status: 'PAID' },
    { label: 'Zbieranie', value: String(s.PICKING || 0), icon: <ClipboardList size={20} color="#fff" />, color: '#FBBF24', status: 'PICKING' },
    { label: 'Pakowanie', value: String(s.PACKING || 0), icon: <Package size={20} color="#fff" />, color: '#FB923C', status: 'PACKING' },
    { label: 'Spakowane', value: String(s.PACKED || 0), icon: <CheckCircle2 size={20} color="#fff" />, color: '#A78BFA', status: 'PACKED' },
    { label: 'Wysłane', value: String(s.SHIPPED || 0), icon: <Send size={20} color="#fff" />, color: '#818CF8', status: 'SHIPPED' },
    { label: 'Dostarczone', value: String(s.DELIVERED || 0), icon: <Truck size={20} color="#fff" />, color: '#34D399', status: 'DELIVERED' },
  ];

  return (
    <>
      <PageHeader title="PakOps Dashboard" subtitle="Przegląd operacji pakowania i wysyłek" />
      <div style={{ padding: '0 24px 24px' }}>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {kpis.map(k => (
            <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color}
              onClick={() => navigate(`/packaging/orders?status=${k.status || ''}`)} />
          ))}
        </div>

        {/* Revenue cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div className="page-card" style={{ flex: '1 1 200px', padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Przychód dzisiaj</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#4ADE80', letterSpacing: '-0.02em' }}>{fmtMoney(s.revenueToday || 0)} zł</div>
          </div>
          <div className="page-card" style={{ flex: '1 1 200px', padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Przychód miesiąc</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{fmtMoney(s.revenueMonth || 0)} zł</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginBottom: 24 }}>
          {/* Chart */}
          <Card title="Zamówienia i przychody" action={
            <div style={{ display: 'flex', gap: 4 }}>
              {(['7', '14', '30'] as ChartRange[]).map(r => (
                <button key={r} onClick={() => setChartRange(r)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    background: chartRange === r ? 'var(--accent)' : 'var(--hover-bg)',
                    color: chartRange === r ? '#fff' : 'var(--tm)',
                  }}>
                  {r}d
                </button>
              ))}
            </div>
          }>
            {loadingChart ? <LoadingSpinner /> : (
              !chart || chart.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--tm)' }}>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', marginRight: 4 }} />Zamówienia</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#4ADE80', marginRight: 4 }} />Przychód</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, padding: '0 4px' }}>
                    {chart.map((d, i) => {
                      const hOrders = Math.max(4, (d.orders / maxChartOrders) * 160);
                      const hRevenue = Math.max(2, (d.revenue / maxChartRevenue) * 160);
                      return (
                        <div key={i} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div title={`${d.date}: ${d.orders} zam. / ${fmtMoney(d.revenue)} zł`}
                            style={{ display: 'flex', gap: 1, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                            <div style={{ width: '40%', maxWidth: 16, height: hOrders, borderRadius: '3px 3px 0 0', background: 'var(--accent)', opacity: 0.85 }} />
                            <div style={{ width: '40%', maxWidth: 16, height: hRevenue, borderRadius: '3px 3px 0 0', background: '#4ADE80', opacity: 0.7 }} />
                          </div>
                          {chart.length <= 14 && (
                            <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.date.slice(5)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </Card>

          {/* Top products */}
          <Card title="Top produkty" noPadding action={<Star size={14} style={{ color: 'var(--accent)' }} />}>
            {!topProducts || topProducts.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
            ) : (
              <div>
                {topProducts.slice(0, 8).map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, background: 'var(--hover-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      fontSize: 12, fontWeight: 800, color: i < 3 ? 'var(--accent)' : 'var(--tm)',
                    }}>
                      {i + 1}
                    </div>
                    {p.image && (
                      <img src={p.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{p.sku}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{p.totalQty}</div>
                      <div style={{ fontSize: 10, color: 'var(--tm)' }}>{p.orderCount} zam.</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Recent shipments */}
        <Card title="Ostatnie zamówienia" noPadding action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/packaging/orders')}>Zobacz wszystkie</Button>
        }>
          {!recent || recent.length === 0 ? (
            <EmptyState title="Brak zamówień" description="Zamówienia pojawią się automatycznie." />
          ) : (
            <div>
              {recent.slice(0, 8).map(r => {
                const st = ORDER_STATUS[r.status] || { label: r.status, color: 'gray' as BadgeColor };
                return (
                  <div key={r.id}
                    onClick={() => navigate(`/packaging/orders/${r.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>{r.externalOrderId || r.id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{r.addressName || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {r.courierName && <Badge color="indigo">{r.courierName}</Badge>}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', minWidth: 80, textAlign: 'right' }}>{fmtMoney(r.totalAmount)} zł</span>
                      <Badge color={st.color}>{st.label}</Badge>
                      <span style={{ fontSize: 11, color: 'var(--tm)', minWidth: 60, textAlign: 'right' }}>{fmtDate(r.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default PackagingDashboardPage;

/**
 * IDS 1.0 — PakOps Dashboard (Original Design)
 * Circular progress gauge, KPI cards, courier waves, quick-action cards
 * Connected to: GET /api/packaging/dashboard/*
 */
import { useNavigate } from 'react-router-dom';
import {
  Package, Truck, CheckCircle2, Send, RotateCcw,
  ShoppingCart, ClipboardList, Clock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { fmtMoney } from './utils';
import type { DashboardStats, Wave } from './types';

/* ── Circular progress gauge (SVG) ── */
function CircularGauge({ value, max, size = 120 }: { value: number; max: number; size?: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--border)" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--accent)" strokeWidth={10}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

/* ── Courier wave row ── */
function WaveRow({ wave }: { wave: Wave }) {
  const pct = wave.orderCount > 0
    ? Math.round((wave.packedCount / wave.orderCount) * 100) : 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Courier name */}
      <div style={{ width: 100, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{wave.courierName}</div>
      </div>
      {/* Progress bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--tm)' }}>{wave.packedCount}/{wave.orderCount} spakowane</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#059669' : 'var(--accent)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: pct === 100 ? '#059669' : 'var(--accent)',
            width: `${pct}%`, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
      {/* Pickup time badge */}
      {wave.pickupTime && (
        <Badge color="indigo">
          <Clock size={10} style={{ marginRight: 3 }} />
          {wave.pickupTime}
        </Badge>
      )}
      {/* Status */}
      <Badge color={wave.status === 'COMPLETED' ? 'green' : wave.status === 'LATE' ? 'red' : 'yellow'}>
        {wave.status === 'COMPLETED' ? 'Gotowa' : wave.status === 'LATE' ? 'Opóźniona' : 'W toku'}
      </Badge>
    </div>
  );
}

export function PackagingDashboardPage() {
  const navigate = useNavigate();

  const { data: stats, isLoading: loadingStats } = useQuery<DashboardStats>({
    queryKey: ['packaging', 'dashboard', 'stats'],
    queryFn: async () => { const { data } = await api.get('/packaging/dashboard/stats'); return data; },
  });

  const { data: waves } = useQuery<Wave[]>({
    queryKey: ['packaging', 'waves'],
    queryFn: async () => { const { data } = await api.get('/packaging/waves'); return data; },
  });

  if (loadingStats) return <><PageHeader title="PakOps Dashboard" /><LoadingSpinner /></>;

  const s = stats || {} as DashboardStats;
  const totalOrders = (s.NEW || 0) + (s.PAID || 0) + (s.PICKING || 0) + (s.PACKING || 0) + (s.PACKED || 0) + (s.SHIPPED || 0) + (s.DELIVERED || 0);
  const packed = (s.PACKED || 0) + (s.SHIPPED || 0) + (s.DELIVERED || 0);
  const toProcess = (s.NEW || 0) + (s.PAID || 0) + (s.PICKING || 0) + (s.PACKING || 0);
  const returns = s.CANCELLED || 0;
  const gaugePct = totalOrders > 0 ? Math.round((packed / totalOrders) * 100) : 0;

  const kpis = [
    { label: 'Wszystkie zamówienia', value: totalOrders, icon: <ShoppingCart size={20} color="#fff" />, color: 'var(--accent)' },
    { label: 'Spakowane', value: packed, icon: <CheckCircle2 size={20} color="#fff" />, color: '#059669' },
    { label: 'Do realizacji', value: toProcess, icon: <Send size={20} color="#fff" />, color: '#FB923C' },
    { label: 'Zwroty', value: returns, icon: <RotateCcw size={20} color="#fff" />, color: '#F87171' },
  ];

  const quickActions = [
    { label: 'Zamówienia', count: totalOrders, icon: <ShoppingCart size={22} />, path: '/packaging/orders', color: 'var(--accent)' },
    { label: 'Zbieranie', count: s.PAID || 0, icon: <ClipboardList size={22} />, path: '/packaging/picking', color: '#FBBF24' },
    { label: 'Pakowanie', count: s.PACKING || 0, icon: <Package size={22} />, path: '/packaging/packing', color: '#FB923C' },
    { label: 'Wysyłki', count: s.SHIPPED || 0, icon: <Truck size={22} />, path: '/packaging/batches', color: 'var(--accent)' },
  ];

  return (
    <>
      <PageHeader title="PakOps Dashboard" />
      <div style={{ padding: '0 24px 24px' }}>

        {/* Hero: Circular gauge + headline */}
        <div className="page-card" style={{ padding: '28px 32px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
            <CircularGauge value={packed} max={totalOrders} size={120} />
            <div style={{
              position: 'absolute', top: 0, left: 0, width: 120, height: 120,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em' }}>{gaugePct}%</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em', marginBottom: 4 }}>
              {toProcess} zamówień do realizacji
            </div>
            <div style={{ fontSize: 14, color: 'var(--tm)' }}>
              Spakowano {packed} z {totalOrders} zamówień
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Przychód dziś</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{fmtMoney(s.revenueToday || 0)} zł</div>
            <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 6 }}>Miesiąc: <b style={{ color: 'var(--accent)' }}>{fmtMoney(s.revenueMonth || 0)} zł</b></div>
          </div>
        </div>

        {/* KPI cards row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          {kpis.map(k => (
            <div key={k.label} className="page-card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em' }}>{k.value}</div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: k.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {k.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Courier waves */}
        <Card title="Fale kurierskie" noPadding>
          <div style={{ padding: '4px 20px 12px' }}>
            {(!waves || waves.length === 0) ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
                Brak aktywnych fal kurierskich
              </div>
            ) : (
              waves.map(w => <WaveRow key={w.id} wave={w} />)
            )}
          </div>
        </Card>

        {/* Quick action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 24 }}>
          {quickActions.map(a => (
            <div key={a.label} className="page-card"
              onClick={() => navigate(a.path)}
              style={{
                padding: '24px 22px', cursor: 'pointer', transition: 'var(--trf)',
                textAlign: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = ''; }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: a.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px', color: a.color,
              }}>
                {a.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>{a.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{a.count}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default PackagingDashboardPage;

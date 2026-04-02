/**
 * IDS 1.0 — Packaging Dashboard (ModuleDashboardTemplate)
 * Connected to: GET /api/packaging/shipments
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Truck, Clock, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { STATUS_MAP, COURIER_MAP } from './constants';
import { fmtWeight } from './utils';
import type { ShipmentRow, BadgeColor } from './types';

export function PackagingDashboardPage() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/packaging/shipments', { params: { per_page: '20' } });
      setShipments(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusCounts: Record<string, number> = {};
  shipments.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });

  const packed = (statusCounts['packed'] || 0) + (statusCounts['shipped'] || 0) + (statusCounts['delivered'] || 0);
  const pending = (statusCounts['pending'] || 0) + (statusCounts['packing'] || 0);
  const errors = statusCounts['error'] || 0;

  if (loading) return <><PageHeader title="Pakowanie — Dashboard" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Pakowanie — Dashboard" subtitle="Przegląd przesyłek i pakowania" actions={
        <Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowa przesyłka</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Wszystkich" value={String(total)} icon={<Package size={20} color="#fff" />} color="var(--accent)" onClick={() => navigate('/packaging/shipments')} />
          <KpiCard label="Spakowane" value={String(packed)} icon={<Truck size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Oczekujące" value={String(pending)} icon={<Clock size={20} color="#fff" />} color="#FBBF24" />
          <KpiCard label="Błędy" value={String(errors)} icon={<AlertTriangle size={20} color="#fff" />} color="#F87171" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <Card title="Ostatnie przesyłki" noPadding>
            {shipments.length === 0 ? (
              <EmptyState title="Brak przesyłek" description="Utwórz pierwszą przesyłkę."
                action={<Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowa przesyłka</Button></Link>} />
            ) : (
              <div>
                {shipments.slice(0, 6).map(s => (
                  <Link key={s.id} to={`/packaging/shipments/${s.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', textDecoration: 'none', transition: 'background .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{s.orderNumber}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{s.clientName} · {s.itemCount} szt · {fmtWeight(s.totalWeight)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Badge color={STATUS_MAP[s.status]?.color || 'gray'}>{STATUS_MAP[s.status]?.label || s.status}</Badge>
                    </div>
                  </Link>
                ))}
                {shipments.length > 6 && (
                  <Link to="/packaging/shipments" style={{ display: 'block', padding: '10px 20px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                    Zobacz wszystkie →
                  </Link>
                )}
              </div>
            )}
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card title="Statusy">
              {Object.keys(statusCounts).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--tm)', padding: 12 }}>Brak danych</div>
              ) : (
                Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <Badge color={(STATUS_MAP[status]?.color || 'gray') as BadgeColor}>{STATUS_MAP[status]?.label || status}</Badge>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{count}</span>
                  </div>
                ))
              )}
            </Card>
            <Card title="Szybkie akcje">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm" icon={<Package size={14} />} style={{ width: '100%' }}>Nowa przesyłka</Button>
                </Link>
                <Link to="/packaging/shipments" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" size="sm" style={{ width: '100%' }}>Lista przesyłek</Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * IDS 1.0 — Service Dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Car, ClipboardCheck, Clock, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { INSPECTION_STATUS_MAP, INSPECTION_RESULT_MAP, INSPECTION_TYPE_MAP } from './constants';
import type { Inspection, BadgeColor } from './types';

export function ServiceDashboardPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [vehicleCount, setVehicleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insp, veh] = await Promise.all([
        api.get('/service/inspections', { params: { per_page: '20' } }),
        api.get('/service/vehicles', { params: { per_page: '1' } }),
      ]);
      setInspections(insp.data.items || []);
      setVehicleCount(veh.data.total || 0);
    } catch { toast.error('Nie udało się pobrać danych'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <><PageHeader title="Serwis — Dashboard" /><LoadingSpinner /></>;

  const statusCounts: Record<string, number> = {};
  inspections.forEach(i => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });
  const scheduled = statusCounts['SCHEDULED'] || 0;
  const inProgress = statusCounts['IN_PROGRESS'] || 0;
  const completed = statusCounts['COMPLETED'] || 0;

  return (
    <>
      <PageHeader title="Serwis — Dashboard" subtitle="Przeglądy pojazdów i inspekcje" actions={
        <Link to="/service/inspections/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<Plus size={14} />}>Nowy przegląd</Button>
        </Link>
      } />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Pojazdy" value={String(vehicleCount)} icon={<Car size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Zaplanowane" value={String(scheduled)} icon={<Clock size={20} color="#fff" />} color="#FBBF24" />
          <KpiCard label="W trakcie" value={String(inProgress)} icon={<ClipboardCheck size={20} color="#fff" />} color="#60A5FA" />
          <KpiCard label="Zakończone" value={String(completed)} icon={<ClipboardCheck size={20} color="#fff" />} color="#4ADE80" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <Card title="Ostatnie przeglądy" noPadding>
            {inspections.length === 0 ? (
              <EmptyState title="Brak przeglądów" description="Zaplanuj pierwszy przegląd pojazdu."
                action={<Link to="/service/inspections/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<Plus size={14} />}>Nowy przegląd</Button></Link>} />
            ) : (
              <div>
                {inspections.slice(0, 8).map(i => (
                  <Link key={i.id} to={`/service/inspections/${i.id}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', textDecoration: 'none', transition: 'background .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{i.vehicle?.plate} — {i.vehicle?.brand} {i.vehicle?.model}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{i.inspectionNumber} · {INSPECTION_TYPE_MAP[i.type] || i.type} · {i.scheduledAt?.slice(0, 10)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {i.result && <Badge color={(INSPECTION_RESULT_MAP[i.result]?.color || 'gray') as BadgeColor}>{INSPECTION_RESULT_MAP[i.result]?.label}</Badge>}
                      <Badge color={(INSPECTION_STATUS_MAP[i.status]?.color || 'gray') as BadgeColor}>{INSPECTION_STATUS_MAP[i.status]?.label}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card title="Statusy">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <Badge color={(INSPECTION_STATUS_MAP[status]?.color || 'gray') as BadgeColor}>{INSPECTION_STATUS_MAP[status]?.label || status}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{count}</span>
                </div>
              ))}
            </Card>
            <Card title="Szybkie akcje">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link to="/service/inspections/new" style={{ textDecoration: 'none' }}><Button variant="primary" size="sm" icon={<ClipboardCheck size={14} />} style={{ width: '100%' }}>Nowy przegląd</Button></Link>
                <Link to="/service/vehicles" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm" style={{ width: '100%' }}>Pojazdy</Button></Link>
                <Link to="/service/inspections" style={{ textDecoration: 'none' }}><Button variant="secondary" size="sm" style={{ width: '100%' }}>Przeglądy</Button></Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

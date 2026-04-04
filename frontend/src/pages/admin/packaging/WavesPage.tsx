/**
 * IDS 1.0 — PakOps Waves (Today's shipping waves)
 * Connected to: GET /api/packaging/waves/today
 */
import {
  Clock, Truck, Package, CheckCircle2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { WAVE_STATUS } from './constants';
import type { Wave, BadgeColor } from './types';

export function WavesPage() {
  const queryClient = useQueryClient();

  const { data: waves, isLoading } = useQuery<Wave[]>({
    queryKey: ['packaging', 'waves', 'today'],
    queryFn: async () => { const { data } = await api.get('/packaging/waves/today'); return data; },
    refetchInterval: 60_000, // auto-refresh every minute
  });

  if (isLoading) return <><PageHeader title="Fale wysyłkowe" /><LoadingSpinner /></>;

  const waveList = waves || [];

  // Group by courier
  const grouped = new Map<string, Wave[]>();
  waveList.forEach(w => {
    const key = w.courierName || 'Inny';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(w);
  });

  // Sort groups by earliest pickup time
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const aTime = a[1][0]?.pickupTime || '23:59';
    const bTime = b[1][0]?.pickupTime || '23:59';
    return aTime.localeCompare(bTime);
  });

  const totalOrders = waveList.reduce((s, w) => s + w.orderCount, 0);
  const totalPacked = waveList.reduce((s, w) => s + w.packedCount, 0);
  const totalShipped = waveList.reduce((s, w) => s + w.shippedCount, 0);

  return (
    <>
      <PageHeader title="Fale wysyłkowe" subtitle="Dzisiejsze fale pogrupowane wg kuriera i godziny odbioru"
        actions={
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['packaging', 'waves'] })}>
            Odśwież
          </Button>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div className="page-card" style={{ flex: '1 1 160px', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fale dzisiaj</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t)' }}>{waveList.length}</div>
          </div>
          <div className="page-card" style={{ flex: '1 1 160px', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Zamówień</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{totalOrders}</div>
          </div>
          <div className="page-card" style={{ flex: '1 1 160px', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Spakowane</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{totalPacked}</div>
          </div>
          <div className="page-card" style={{ flex: '1 1 160px', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Wysłane</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{totalShipped}</div>
          </div>
        </div>

        {waveList.length === 0 ? (
          <Card>
            <EmptyState icon={<Clock style={{ width: 28, height: 28, color: 'var(--td)' }} />}
              title="Brak fal na dzisiaj" description="Fale pojawiają się automatycznie na podstawie zamówień i konfiguracji kurierów." />
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {sortedGroups.map(([courierName, courierWaves]) => (
              <div key={courierName}>
                {/* Courier group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                }}>
                  <Truck size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{courierName}</span>
                  <span style={{ fontSize: 12, color: 'var(--tm)' }}>({courierWaves.length} fal)</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {courierWaves.sort((a, b) => a.pickupTime.localeCompare(b.pickupTime)).map(w => {
                    const ws = WAVE_STATUS[w.status] || { label: w.status, color: 'gray' as BadgeColor };
                    const progress = w.orderCount > 0 ? (w.packedCount / w.orderCount) * 100 : 0;
                    const isLate = w.status === 'LATE';
                    const isComplete = w.status === 'COMPLETED';

                    return (
                      <div key={w.id} className="page-card" style={{
                        padding: 0, overflow: 'hidden',
                        borderLeft: `3px solid ${isLate ? '#F87171' : isComplete ? '#059669' : 'var(--accent)'}`,
                      }}>
                        <div style={{ padding: '16px 18px' }}>
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{w.name}</span>
                              <Badge color={ws.color}>{ws.label}</Badge>
                            </div>
                            {isLate && <AlertTriangle size={16} style={{ color: '#F87171' }} />}
                            {isComplete && <CheckCircle2 size={16} style={{ color: '#059669' }} />}
                          </div>

                          {/* Pickup time */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <Clock size={14} style={{ color: 'var(--tm)' }} />
                            <span style={{
                              fontSize: 18, fontWeight: 800,
                              color: isLate ? '#F87171' : 'var(--accent)',
                            }}>
                              {w.pickupTime}
                            </span>
                          </div>

                          {/* Stats */}
                          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--tm)' }}>
                              <Package size={13} /> {w.orderCount} zamówień
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#A78BFA' }}>
                              <CheckCircle2 size={13} /> {w.packedCount} spakowanych
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#059669' }}>
                              <Truck size={13} /> {w.shippedCount} wysłanych
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--tm)' }}>
                              <span>Postęp pakowania</span>
                              <span style={{ fontWeight: 600 }}>{Math.round(progress)}%</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
                              <div style={{
                                height: '100%', borderRadius: 3, transition: 'width 0.3s',
                                background: isComplete ? '#059669' : isLate ? '#F87171' : 'var(--accent)',
                                width: `${progress}%`,
                              }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default WavesPage;

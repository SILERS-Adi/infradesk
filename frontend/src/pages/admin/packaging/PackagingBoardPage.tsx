/**
 * IDS 1.0 — PakOps Packaging Board (Original Design)
 * Grid of order/batch cards with progress bars, "Pakuj" buttons
 * 2-column grid, color-coded progress
 * Connected to: GET/POST /api/packaging/batches/*
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, Plus, RefreshCw, Package, Truck, ChevronRight, Clock,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { BATCH_STATUS } from './constants';
import { fmtDate } from './utils';
import type { Batch, BadgeColor } from './types';

function progressColor(pct: number): string {
  if (pct === 100) return '#4ADE80';
  if (pct >= 70) return '#A78BFA';
  if (pct >= 40) return '#FBBF24';
  return '#6366F1';
}

export function PackagingBoardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'date' | 'courier'>('date');

  const { data: batches, isLoading } = useQuery<Batch[]>({
    queryKey: ['packaging', 'batches', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/packaging/batches', { params });
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/packaging/batches', { mode: createMode });
      return data;
    },
    onSuccess: () => {
      toast.success('Batch utworzony');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'batches'] });
    },
    onError: () => toast.error('Nie udało się utworzyć batcha'),
  });

  const takeMut = useMutation({
    mutationFn: async (batchId: string) => {
      await api.post(`/packaging/batches/${batchId}/take`);
    },
    onSuccess: () => {
      toast.success('Batch przypisany');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'batches'] });
    },
    onError: () => toast.error('Nie udało się przypisać batcha'),
  });

  const batchList = batches || [];
  const filterTabs = [
    { value: '', label: 'Wszystkie' },
    { value: 'OPEN', label: 'Otwarte' },
    { value: 'IN_PROGRESS', label: 'W realizacji' },
    { value: 'COMPLETED', label: 'Zakończone' },
  ];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .15s',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--tm)',
  });

  if (isLoading) return <><PageHeader title="Pakowanie" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Pakowanie" subtitle="Batche do realizacji" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['packaging', 'batches'] })}>Odśwież</Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />}
            onClick={() => setShowCreate(true)} style={{ background: '#6366F1' }}>Nowy batch</Button>
        </div>
      } />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 10, background: 'var(--hover-bg)' }}>
          {filterTabs.map(t => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              style={tabStyle(statusFilter === t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {batchList.length === 0 ? (
          <Card>
            <EmptyState icon={<Layers style={{ width: 28, height: 28, color: 'var(--td)' }} />}
              title="Brak batchy" description="Utwórz nowy batch, aby pogrupować zamówienia."
              action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Nowy batch</Button>} />
          </Card>
        ) : (
          /* ── 2-column grid of batch cards ── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {batchList.map(b => {
              const bs = BATCH_STATUS[b.status] || { label: b.status, color: 'gray' as BadgeColor };
              const pct = b.orderCount > 0 ? Math.round((b.packedCount / b.orderCount) * 100) : 0;
              const barColor = progressColor(pct);

              return (
                <div key={b.id} className="page-card" style={{
                  padding: 0, overflow: 'hidden', transition: 'var(--trf)',
                  cursor: 'pointer',
                }}
                  onClick={() => navigate(`/packaging/batches/${b.id}`)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; }}
                >
                  <div style={{ padding: '18px 20px' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9, background: barColor + '18',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Package size={18} style={{ color: barColor }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>
                            {b.name || `Paczka ${b.courierName || ''} ${fmtDate(b.createdAt)}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tm)' }}>
                            {b.orderCount} zamówień · {b.mode === 'courier' ? 'Wg kuriera' : 'Wg daty'}
                          </div>
                        </div>
                      </div>
                      <Badge color={bs.color}>{bs.label}</Badge>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--tm)' }}>
                          <Package size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{b.packedCount}/{b.orderCount}
                          <span style={{ marginLeft: 10 }}><Truck size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{b.shippedCount}</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: barColor }}>{pct}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--border)' }}>
                        <div style={{
                          height: '100%', borderRadius: 4, background: barColor,
                          width: `${pct}%`, transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--tm)' }}>
                        <Clock size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {fmtDate(b.createdAt)}
                      </span>
                      {b.status === 'OPEN' ? (
                        <button onClick={e => { e.stopPropagation(); takeMut.mutate(b.id); }}
                          style={{
                            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#4F46E5'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#6366F1'; }}
                        >
                          Pakuj <ChevronRight size={14} />
                        </button>
                      ) : b.status === 'IN_PROGRESS' ? (
                        <button onClick={e => { e.stopPropagation(); navigate(`/packaging/batches/${b.id}`); }}
                          style={{
                            padding: '8px 18px', borderRadius: 8, border: '1px solid var(--accent)',
                            background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                          Kontynuuj <ChevronRight size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create batch modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nowy batch" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Anuluj</Button>
            <Button variant="primary" loading={createMut.isPending} onClick={() => createMut.mutate()}
              style={{ background: '#6366F1' }}>Utwórz</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ts)' }}>Wybierz tryb grupowania zamówień:</div>
          {(['date', 'courier'] as const).map(mode => (
            <label key={mode}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                borderRadius: 10, border: `2px solid ${createMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                background: createMode === mode ? 'var(--accent-g, rgba(99,102,241,0.06))' : 'transparent',
                cursor: 'pointer', transition: 'all .15s',
              }}>
              <input type="radio" checked={createMode === mode} onChange={() => setCreateMode(mode)}
                style={{ accentColor: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>
                  {mode === 'date' ? 'Wg daty' : 'Wg kuriera'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tm)' }}>
                  {mode === 'date'
                    ? 'Grupuje zamówienia z dzisiejszego dnia'
                    : 'Grupuje zamówienia wg wybranego kuriera'
                  }
                </div>
              </div>
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}

export default PackagingBoardPage;

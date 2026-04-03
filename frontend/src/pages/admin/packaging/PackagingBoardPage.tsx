/**
 * IDS 1.0 — PakOps Batches Page (Full)
 * Batch management: create, list, detail, assign
 * Connected to: GET/POST /api/packaging/batches/*
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, Plus, RefreshCw, Eye, ChevronRight, Package, Truck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { BATCH_STATUS, ORDER_STATUS } from './constants';
import { fmtDate, fmtMoney } from './utils';
import type { Batch, BatchOrder, BadgeColor } from './types';

export function PackagingBoardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'date' | 'courier'>('date');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery<Batch[]>({
    queryKey: ['packaging', 'batches', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/packaging/batches', { params });
      return data;
    },
  });

  const { data: batchDetail } = useQuery<Batch>({
    queryKey: ['packaging', 'batches', expandedBatch],
    queryFn: async () => { const { data } = await api.get(`/packaging/batches/${expandedBatch}`); return data; },
    enabled: !!expandedBatch,
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

  if (isLoading) return <><PageHeader title="Batche" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Batche" subtitle="Zarządzanie partiami zamówień" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['packaging', 'batches'] })}>Odśwież</Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />}
            onClick={() => setShowCreate(true)}>Nowy batch</Button>
        </div>
      } />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 10, background: 'var(--hover-bg)' }}>
          {filterTabs.map(t => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all .15s',
                background: statusFilter === t.value ? 'var(--accent)' : 'transparent',
                color: statusFilter === t.value ? '#fff' : 'var(--tm)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {batchList.length === 0 ? (
          <Card>
            <EmptyState icon={<Layers style={{ width: 28, height: 28, color: 'var(--td)' }} />}
              title="Brak batchy" description="Utwórz nowy batch, aby pogrupować zamówienia do realizacji."
              action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Nowy batch</Button>} />
          </Card>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {batchList.map(b => {
              const bs = BATCH_STATUS[b.status] || { label: b.status, color: 'gray' as BadgeColor };
              const isExpanded = expandedBatch === b.id;
              const progress = b.orderCount > 0 ? (b.packedCount / b.orderCount) * 100 : 0;
              return (
                <div key={b.id}>
                  <div className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedBatch(isExpanded ? null : b.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px', cursor: 'pointer', transition: 'background .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, background: 'var(--hover-bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Layers size={18} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>
                            {b.name || `Batch #${b.id.slice(0, 6)}`}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 2 }}>
                            {b.orderCount} zamówień · {b.mode === 'courier' ? 'Wg kuriera' : 'Wg daty'}
                            {b.courierName && ` · ${b.courierName}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Mini progress */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--tm)', marginBottom: 4 }}>
                            <span><Package size={11} style={{ marginRight: 2 }} />{b.packedCount}/{b.orderCount}</span>
                            <span><Truck size={11} style={{ marginRight: 2 }} />{b.shippedCount}</span>
                          </div>
                          <div style={{ width: 100, height: 4, borderRadius: 2, background: 'var(--border)' }}>
                            <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent)', width: `${progress}%`, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                        <Badge color={bs.color}>{bs.label}</Badge>
                        <span style={{ fontSize: 12, color: 'var(--tm)' }}>{fmtDate(b.createdAt)}</span>
                        <ChevronRight size={16} style={{
                          color: 'var(--tm)', transition: 'transform .2s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                        }} />
                      </div>
                    </div>

                    {/* Expanded: batch orders */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {/* Actions */}
                        <div style={{ padding: '10px 20px', display: 'flex', gap: 8, background: 'var(--hover-bg)' }}>
                          {b.status === 'OPEN' && (
                            <Button size="sm" variant="primary" icon={<ChevronRight size={12} />}
                              loading={takeMut.isPending} onClick={() => takeMut.mutate(b.id)}>
                              Przejmij batch
                            </Button>
                          )}
                        </div>
                        {/* Orders in batch */}
                        {batchDetail?.orders ? (
                          batchDetail.orders.map(o => {
                            const os = ORDER_STATUS[o.status] || { label: o.status, color: 'gray' as BadgeColor };
                            return (
                              <div key={o.id}
                                onClick={() => navigate(`/packaging/orders/${o.id}`)}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '10px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                  transition: 'background .15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <div>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>
                                    {o.externalOrderId || o.id.slice(0, 8)}
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--tm)', marginLeft: 8 }}>{o.addressName || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{fmtMoney(o.totalAmount)} zł</span>
                                  <Badge color={os.color}>{os.label}</Badge>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: 16, textAlign: 'center' }}><LoadingSpinner /></div>
                        )}
                      </div>
                    )}
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
            <Button variant="primary" loading={createMut.isPending} onClick={() => createMut.mutate()}>Utwórz</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ts)' }}>Wybierz tryb grupowania zamówień:</div>
          {(['date', 'courier'] as const).map(mode => (
            <label key={mode}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 8, border: `1px solid ${createMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                background: createMode === mode ? 'var(--accent-g)' : 'transparent',
                cursor: 'pointer', transition: 'all .15s',
              }}>
              <input type="radio" checked={createMode === mode} onChange={() => setCreateMode(mode)}
                style={{ accentColor: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
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

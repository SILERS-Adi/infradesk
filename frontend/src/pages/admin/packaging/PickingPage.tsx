/**
 * IDS 1.0 — PakOps Picking Page (Original Design)
 * Grid of product cards with images, "Rozpocznij zbieranie" button,
 * batch creation modal with courier/date mode selection
 * Connected to: GET /api/packaging/picking/*
 */
import { useState } from 'react';
import {
  ClipboardList, CheckCircle2, RefreshCw, Play, Square, Package,
  Plus, Minus, Layers,
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
import { Alert } from '../../../components/ui/Alert';
import { COURIER_OPTIONS } from './constants';
import type { PickingListItem, PickingSession, PickingSessionItem } from './types';

export function PickingPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchMode, setBatchMode] = useState<'date' | 'courier'>('date');
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);

  // Aggregated products
  const { data: pickingList, isLoading: loadingList, isError } = useQuery<PickingListItem[]>({
    queryKey: ['packaging', 'picking', 'list'],
    queryFn: async () => { const { data } = await api.get('/packaging/picking/list'); return data; },
  });

  // Active session
  const { data: session, isLoading: loadingSession } = useQuery<PickingSession | null>({
    queryKey: ['packaging', 'picking', 'session', activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return null;
      const { data } = await api.get(`/packaging/picking/sessions/${activeSessionId}`);
      return data;
    },
    enabled: !!activeSessionId,
  });

  // Start session
  const startMut = useMutation({
    mutationFn: async (params?: { mode?: string; courier?: string }) => {
      const { data } = await api.post('/packaging/picking/sessions', params || {});
      return data;
    },
    onSuccess: (data) => {
      setActiveSessionId(data.id);
      setShowBatchModal(false);
      toast.success('Sesja zbierania rozpoczęta');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'picking'] });
    },
    onError: () => toast.error('Nie udało się rozpocząć sesji'),
  });

  // Pick item
  const pickMut = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) => {
      await api.post('/packaging/picking/pick-item', {
        sessionId: activeSessionId, itemId, quantity: qty,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'picking', 'session', activeSessionId] });
    },
    onError: () => toast.error('Nie udało się zarejestrować pobrania'),
  });

  // Complete session
  const completeMut = useMutation({
    mutationFn: async () => {
      await api.post(`/packaging/picking/sessions/${activeSessionId}/complete`);
    },
    onSuccess: () => {
      toast.success('Zbieranie zakończone!');
      setActiveSessionId(null);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'picking'] });
    },
    onError: () => toast.error('Nie udało się zakończyć zbierania'),
  });

  // Cancel session
  const cancelMut = useMutation({
    mutationFn: async () => {
      await api.delete(`/packaging/picking/sessions/${activeSessionId}`);
    },
    onSuccess: () => {
      setActiveSessionId(null);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'picking'] });
      toast.success('Sesja anulowana');
    },
    onError: () => toast.error('Nie udało się anulować'),
  });

  const products = pickingList || [];
  const sessionItems = session?.items || [];
  const totalRequired = sessionItems.reduce((s, i) => s + i.requiredQty, 0);
  const totalPicked = sessionItems.reduce((s, i) => s + i.pickedQty, 0);
  const allPicked = totalRequired > 0 && totalPicked >= totalRequired;

  if (loadingList) return <><PageHeader title="Zbieranie" /><LoadingSpinner /></>;
  if (isError) return <><PageHeader title="Zbieranie" /><div style={{ padding: '0 24px' }}><Alert type="error">Nie udało się załadować danych</Alert></div></>;


  return (
    <>
      <PageHeader title="Zbieranie" subtitle={`${products.length} produktów do zebrania`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['packaging', 'picking'] })}>
              Odśwież
            </Button>
            {!activeSessionId && products.length > 0 && (
              <Button variant="primary" size="sm" icon={<Play size={14} />}
                onClick={() => setShowBatchModal(true)}
                style={{ background: 'var(--accent)' }}>
                Rozpocznij zbieranie
              </Button>
            )}
            {activeSessionId && allPicked && (
              <Button variant="primary" size="sm" icon={<CheckCircle2 size={14} />}
                loading={completeMut.isPending} onClick={() => completeMut.mutate()}>
                Zakończ zbieranie
              </Button>
            )}
            {activeSessionId && (
              <Button variant="ghost" size="sm" icon={<Square size={14} />}
                loading={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                Anuluj sesję
              </Button>
            )}
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>
        {products.length === 0 && !activeSessionId ? (
          <Card>
            <EmptyState icon={<ClipboardList style={{ width: 28, height: 28, color: 'var(--td)' }} />}
              title="Brak produktów do zebrania" description="Wszystkie opłacone zamówienia zostały zebrane." />
          </Card>
        ) : !activeSessionId ? (
          /* ── Product cards grid ── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {products.map((p, i) => (
              <div key={i} className="page-card" style={{
                padding: 0, overflow: 'hidden', transition: 'var(--trf)',
              }}>
                {/* Image area */}
                <div style={{
                  height: 140, background: 'var(--hover-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                }}>
                  {p.image ? (
                    <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Package size={36} style={{ color: 'var(--td)' }} />
                  )}
                  {/* Quantity badge */}
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 14, fontWeight: 800, borderRadius: 8,
                    padding: '4px 10px', minWidth: 32, textAlign: 'center',
                  }}>
                    x{p.totalQty}
                  </div>
                </div>
                {/* Card body */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--t)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 4,
                  }}>{p.name}</div>
                  {p.sku && (
                    <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace', marginBottom: 4 }}>{p.sku}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--tm)' }}>{p.orderCount} zamówień</div>
                  {p.locations && p.locations.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4 }}>
                      {p.locations.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Active picking session ── */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
            <Card title="Zbieranie pozycji" noPadding>
              {/* Progress */}
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: allPicked ? 'rgba(34,197,94,0.06)' : 'transparent',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: allPicked ? '#059669' : 'var(--ts)' }}>
                  {allPicked ? 'Wszystko zebrane!' : `${totalPicked} / ${totalRequired} sztuk`}
                </span>
                <div style={{ width: 160, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: allPicked ? '#059669' : 'var(--accent)',
                    width: `${totalRequired > 0 ? (totalPicked / totalRequired) * 100 : 0}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {loadingSession ? <LoadingSpinner /> : (
                <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                  {sessionItems.map(item => {
                    const done = item.pickedQty >= item.requiredQty;
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: done ? 'rgba(34,197,94,0.04)' : 'transparent',
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                          border: done ? 'none' : '2px solid var(--border)',
                          background: done ? '#059669' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {done && <CheckCircle2 size={16} color="#fff" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600,
                            color: done ? 'var(--tm)' : 'var(--t)',
                            textDecoration: done ? 'line-through' : 'none',
                          }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => pickMut.mutate({ itemId: item.id, qty: Math.max(0, item.pickedQty - 1) })}
                            style={{
                              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: 'var(--hover-bg)', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', color: 'var(--tm)',
                            }}
                            disabled={item.pickedQty <= 0}>
                            <Minus size={14} />
                          </button>
                          <span style={{
                            fontSize: 16, fontWeight: 800, minWidth: 50, textAlign: 'center',
                            color: done ? '#059669' : 'var(--t)',
                          }}>
                            {item.pickedQty}/{item.requiredQty}
                          </span>
                          <button onClick={() => pickMut.mutate({ itemId: item.id, qty: item.pickedQty + 1 })}
                            style={{
                              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                              background: done ? 'rgba(34,197,94,0.1)' : 'var(--hover-bg)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: done ? '#059669' : 'var(--accent)',
                            }}>
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Right panel: orders overview */}
            <Card title="Zamówienia" noPadding>
              <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                {products.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{p.sku}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>x{p.totalQty}</div>
                      <div style={{ fontSize: 10, color: 'var(--tm)' }}>{p.orderCount} zam.</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Batch creation modal */}
      <Modal open={showBatchModal} onClose={() => setShowBatchModal(false)} title="Rozpocznij zbieranie" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowBatchModal(false)}>Anuluj</Button>
            <Button variant="primary" loading={startMut.isPending}
              onClick={() => startMut.mutate({ mode: batchMode, courier: selectedCourier || undefined })}
              style={{ background: 'var(--accent)' }}>
              Rozpocznij
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ts)', marginBottom: 4 }}>Wybierz tryb:</div>

          {/* Mode selection */}
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { value: 'date' as const, label: 'Wg daty', desc: 'Zamówienia z dzisiejszego dnia' },
              { value: 'courier' as const, label: 'Wg kuriera', desc: 'Grupowanie wg kuriera' },
            ]).map(m => (
              <div key={m.value}
                onClick={() => setBatchMode(m.value)}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${batchMode === m.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: batchMode === m.value ? 'var(--accent-g, rgba(99,102,241,0.06))' : 'transparent',
                  transition: 'all .15s',
                }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 11, color: 'var(--tm)' }}>{m.desc}</div>
              </div>
            ))}
          </div>

          {/* Courier selection (when mode=courier) */}
          {batchMode === 'courier' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)', marginBottom: 8 }}>Wybierz kuriera:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {COURIER_OPTIONS.map(c => (
                  <div key={c.value}
                    onClick={() => setSelectedCourier(c.value)}
                    style={{
                      padding: '12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                      border: `2px solid ${selectedCourier === c.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: selectedCourier === c.value ? 'var(--accent-g, rgba(99,102,241,0.06))' : 'transparent',
                      transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default PickingPage;

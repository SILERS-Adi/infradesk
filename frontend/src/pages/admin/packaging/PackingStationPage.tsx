/**
 * IDS 1.0 — PakOps Packing Station (Full)
 * Queue -> Start session -> Scan items -> Photo -> Complete
 * Connected to: GET /api/packaging/packing/*
 */
import { useState, useRef } from 'react';
import {
  Package, CheckCircle2, Truck, AlertTriangle, RefreshCw,
  Camera, X, Barcode, Upload,
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
import type { PackingQueueItem, PackingSession, BadgeColor } from './types';
import { fmtMoney } from './utils';

const STATUS_COLORS: Record<string, BadgeColor> = {
  PAID: 'green', PICKING: 'yellow', PICKED: 'indigo', PACKING: 'orange', PACKED: 'purple',
};

export function PackingStationPage() {
  const queryClient = useQueryClient();
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [scanInput, setScanInput] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Queue
  const { data: queue, isLoading: loadingQueue, refetch: refetchQueue } = useQuery<PackingQueueItem[]>({
    queryKey: ['packaging', 'packing', 'queue'],
    queryFn: async () => { const { data } = await api.get('/packaging/packing/queue'); return data; },
  });

  // Active session
  const { data: activeSession } = useQuery<PackingSession | null>({
    queryKey: ['packaging', 'packing', 'active'],
    queryFn: async () => {
      try { const { data } = await api.get('/packaging/packing/active'); return data; }
      catch { return null; }
    },
  });

  // Active order detail
  const { data: activeOrder, isLoading: loadingOrder } = useQuery<PackingQueueItem>({
    queryKey: ['packaging', 'packing', 'order', activeOrderId],
    queryFn: async () => { const { data } = await api.get(`/packaging/orders/${activeOrderId}`); return data; },
    enabled: !!activeOrderId,
  });

  // Start session
  const startMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post('/packaging/packing/sessions', { orderId });
      return data;
    },
    onSuccess: (data, orderId) => {
      setActiveOrderId(orderId);
      setCheckedItems(new Set(data.checkedItems || []));
      setPhotos(data.photos || []);
      toast.success('Sesja pakowania rozpoczęta');
    },
    onError: () => toast.error('Nie udało się rozpocząć sesji'),
  });

  // Scan item
  const scanMut = useMutation({
    mutationFn: async (barcode: string) => {
      const { data } = await api.post('/packaging/packing/scan', { barcode, orderId: activeOrderId });
      return data;
    },
    onSuccess: (data) => {
      if (data.itemId) {
        setCheckedItems(prev => new Set([...prev, data.itemId]));
        toast.success(`Zeskanowano: ${data.itemName || data.itemId}`);
      }
      setScanInput('');
    },
    onError: () => { toast.error('Nie znaleziono produktu'); setScanInput(''); },
  });

  // Upload photo
  const photoMut = useMutation({
    mutationFn: async (base64: string) => {
      const sessionId = activeSession?.id;
      if (!sessionId) throw new Error('No session');
      await api.post(`/packaging/packing/sessions/${sessionId}/photo`, { photo: base64 });
      return base64;
    },
    onSuccess: (base64) => {
      setPhotos(prev => [...prev, base64]);
      toast.success('Zdjęcie dodane');
    },
    onError: () => toast.error('Nie udało się dodać zdjęcia'),
  });

  // Complete
  const completeMut = useMutation({
    mutationFn: async () => {
      const sessionId = activeSession?.id;
      if (sessionId) {
        await api.post(`/packaging/packing/sessions/${sessionId}/complete`);
      } else {
        await api.put(`/packaging/orders/${activeOrderId}`, { status: 'PACKED' });
      }
    },
    onSuccess: () => {
      toast.success('Zamówienie spakowane!');
      setActiveOrderId(null);
      setCheckedItems(new Set());
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'packing'] });
    },
    onError: () => toast.error('Nie udało się zakończyć pakowania'),
  });

  // Cancel
  const cancelMut = useMutation({
    mutationFn: async () => {
      const sessionId = activeSession?.id;
      if (sessionId) await api.delete(`/packaging/packing/sessions/${sessionId}`);
      else if (activeOrderId) await api.put(`/packaging/orders/${activeOrderId}`, { status: 'PAID' });
    },
    onSuccess: () => {
      setActiveOrderId(null);
      setCheckedItems(new Set());
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'packing'] });
      toast.success('Sesja anulowana');
    },
    onError: () => toast.error('Nie udało się anulować'),
  });

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const handleScan = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      scanMut.mutate(scanInput.trim());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      photoMut.mutate(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const selectOrder = (order: PackingQueueItem) => {
    startMut.mutate(order.id);
  };

  const allChecked = activeOrder ? activeOrder.items.every(i => checkedItems.has(i.id)) : false;
  const queueItems = queue || [];

  if (loadingQueue) return <><PageHeader title="Stacja pakowania" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Stacja pakowania" subtitle={`${queueItems.length} zamówień w kolejce`}
        actions={<Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetchQueue()}>Odśwież</Button>} />

      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, minHeight: 500 }}>

          {/* Left: Queue */}
          <Card title="Kolejka pakowania" noPadding>
            {queueItems.length === 0 ? (
              <EmptyState title="Brak zamówień" description="Wszystkie zamówienia zostały spakowane." />
            ) : (
              <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                {queueItems.map(o => {
                  const isActive = activeOrderId === o.id;
                  return (
                    <button key={o.id} onClick={() => selectOrder(o)} type="button"
                      style={{
                        display: 'block', width: '100%', padding: '14px 16px', textAlign: 'left',
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        background: isActive ? 'var(--accent-g)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'var(--trf)',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--accent-g)' : 'transparent'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>
                          {o.externalOrderId || o.id.slice(0, 8)}
                        </span>
                        <Badge color={STATUS_COLORS[o.status] || 'gray'}>{o.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ts)' }}>{o.addressName || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>
                        {o._count?.items || o.items?.length || '?'} poz. · {o.courierName || '—'} · {fmtMoney(o.totalAmount)} zł
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Right: Packing area */}
          <div>
            {!activeOrderId ? (
              <Card>
                <EmptyState
                  icon={<Package style={{ width: 28, height: 28, color: 'var(--td)' }} />}
                  title="Wybierz zamówienie"
                  description="Kliknij zamówienie z kolejki po lewej, aby rozpocząć pakowanie."
                />
              </Card>
            ) : loadingOrder ? <LoadingSpinner /> : activeOrder ? (
              <>
                {/* Order header */}
                <Card noPadding>
                  <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', fontFamily: 'monospace' }}>
                        {activeOrder.externalOrderId || activeOrder.id.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ts)', marginTop: 4 }}>{activeOrder.addressName} · {activeOrder.addressCity}</div>
                      {activeOrder.addressStreet && <div style={{ fontSize: 12, color: 'var(--tm)' }}>{activeOrder.addressStreet}, {activeOrder.addressZip}</div>}
                      {activeOrder.addressPhone && <div style={{ fontSize: 12, color: 'var(--tm)' }}>Tel: {activeOrder.addressPhone}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(activeOrder.totalAmount)} zł</div>
                      {activeOrder.courierName && <Badge color="indigo">{activeOrder.courierName}</Badge>}
                    </div>
                  </div>
                </Card>

                {/* Scan input */}
                <div style={{
                  margin: '12px 0', padding: '10px 16px', borderRadius: 'var(--rs)',
                  background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Barcode size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <input
                    type="text" value={scanInput} onChange={e => setScanInput(e.target.value)}
                    onKeyDown={handleScan} placeholder="Skanuj kod kreskowy / wpisz SKU..."
                    autoFocus
                    style={{
                      flex: 1, padding: '8px 0', border: 'none', background: 'transparent',
                      color: 'var(--t)', fontSize: 14, fontFamily: 'monospace', outline: 'none',
                    }}
                  />
                  {scanMut.isPending && <LoadingSpinner />}
                </div>

                {/* Progress */}
                <div style={{
                  margin: '0 0 12px', padding: '8px 16px', borderRadius: 'var(--rs)',
                  background: allChecked ? 'rgba(34,197,94,0.08)' : 'var(--hover-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: allChecked ? '#4ADE80' : 'var(--ts)' }}>
                    {allChecked ? 'Wszystkie pozycje sprawdzone' : `${checkedItems.size} / ${activeOrder.items.length} pozycji`}
                  </span>
                  <div style={{ width: 140, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: allChecked ? '#4ADE80' : 'var(--accent)',
                      width: `${activeOrder.items.length > 0 ? (checkedItems.size / activeOrder.items.length) * 100 : 0}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>

                {/* Items checklist */}
                <Card title="Pozycje do spakowania" noPadding>
                  {activeOrder.items.map(item => {
                    const checked = checkedItems.has(item.id);
                    return (
                      <button key={item.id} onClick={() => toggleItem(item.id)} type="button"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                          background: checked ? 'rgba(34,197,94,0.06)' : 'transparent', transition: 'var(--trf)',
                        }}
                        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(34,197,94,0.06)' : 'transparent'; }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          border: checked ? 'none' : '2px solid var(--border)',
                          background: checked ? '#4ADE80' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <CheckCircle2 size={16} color="#fff" />}
                        </div>
                        {item.image && (
                          <img src={item.image} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: checked ? 'var(--tm)' : 'var(--t)', textDecoration: checked ? 'line-through' : 'none' }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>x{item.quantity}</div>
                          <div style={{ fontSize: 11, color: 'var(--tm)' }}>{fmtMoney(item.unitPrice)} zł</div>
                        </div>
                      </button>
                    );
                  })}
                </Card>

                {/* Photo section */}
                <div style={{ marginTop: 12 }}>
                  <Card title="Zdjęcia paczki" action={
                    <Button variant="ghost" size="sm" icon={<Camera size={14} />}
                      onClick={() => fileRef.current?.click()} loading={photoMut.isPending}>
                      Dodaj zdjęcie
                    </Button>
                  }>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment"
                      onChange={handleFileUpload} style={{ display: 'none' }} />
                    {photos.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
                        Brak zdjęć. Kliknij "Dodaj zdjęcie" aby zrobić zdjęcie paczki.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {photos.map((p, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img src={p} alt={`Zdjęcie ${i + 1}`}
                              style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                            <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                              style={{
                                position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                                background: '#F87171', border: 'none', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                              }}>
                              <X size={12} color="#fff" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                  <Button
                    variant="primary" size="lg"
                    icon={allChecked ? <Truck size={16} /> : <AlertTriangle size={16} />}
                    onClick={() => completeMut.mutate()}
                    loading={completeMut.isPending}
                    disabled={!allChecked}
                    style={{ flex: 1 }}
                  >
                    {allChecked ? 'Oznacz jako spakowane' : `Sprawdź wszystkie (${activeOrder.items.length - checkedItems.size} pozostało)`}
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => cancelMut.mutate()} loading={cancelMut.isPending}>
                    Anuluj
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default PackingStationPage;

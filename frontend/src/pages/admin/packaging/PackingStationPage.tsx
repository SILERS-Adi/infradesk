/**
 * IDS 1.0 — PakOps Packing Station (Original Design)
 * Left: product items with large images, qty, price, "Spakuj" per item
 * Right: customer info, delivery info, package dimensions
 * Bottom bar: totals + "Generuj list przewozowy"
 * Connected to: GET /api/packaging/packing/*
 */
import { useState, useRef } from 'react';
import {
  Package, CheckCircle2, Truck, RefreshCw,
  Camera, X, Barcode, MapPin, User, Box,
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

  // Complete / generate waybill
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
      toast.success('List przewozowy wygenerowany!');
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

  const packItem = (itemId: string) => {
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
    reader.onloadend = () => { photoMut.mutate(reader.result as string); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const selectOrder = (order: PackingQueueItem) => {
    startMut.mutate(order.id);
  };

  const allChecked = activeOrder ? activeOrder.items.every(i => checkedItems.has(i.id)) : false;
  const queueItems = queue || [];
  const totalItemsCount = activeOrder ? activeOrder.items.reduce((s, i) => s + i.quantity, 0) : 0;
  const totalAmount = activeOrder ? Number(activeOrder.totalAmount) : 0;

  if (loadingQueue) return <><PageHeader title="Stacja pakowania" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Stacja pakowania" subtitle={`${queueItems.length} zamówień w kolejce`}
        actions={<Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => refetchQueue()}>Odśwież</Button>} />

      <div style={{ padding: '0 24px 24px' }}>
        {!activeOrderId ? (
          /* ── Queue: select an order ── */
          queueItems.length === 0 ? (
            <Card>
              <EmptyState icon={<Package style={{ width: 28, height: 28, color: 'var(--td)' }} />}
                title="Brak zamówień" description="Wszystkie zamówienia zostały spakowane." />
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {queueItems.map(o => {
                return (
                  <div key={o.id} className="page-card" style={{ padding: '16px 20px', cursor: 'pointer', transition: 'var(--trf)' }}
                    onClick={() => selectOrder(o)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>
                        {o.externalOrderId || o.id.slice(0, 8)}
                      </span>
                      <Badge color={STATUS_COLORS[o.status] || 'gray'}>{o.status}</Badge>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ts)', marginBottom: 4 }}>{o.addressName || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--tm)' }}>
                      {o._count?.items || o.items?.length || '?'} poz. · {o.courierName || '—'} · {fmtMoney(o.totalAmount)} zł
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : loadingOrder ? <LoadingSpinner /> : activeOrder ? (
          /* ── Active packing: left items / right info ── */
          <>
            {/* Scan bar */}
            <div style={{
              marginBottom: 16, padding: '10px 16px', borderRadius: 'var(--rs, 10px)',
              background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Barcode size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <input type="text" value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleScan} placeholder="Skanuj kod kreskowy / wpisz SKU..." autoFocus
                style={{
                  flex: 1, padding: '8px 0', border: 'none', background: 'transparent',
                  color: 'var(--t)', fontSize: 14, fontFamily: 'monospace', outline: 'none',
                }} />
              {scanMut.isPending && <LoadingSpinner />}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, marginBottom: 16 }}>
              {/* LEFT: Product items with large images */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeOrder.items.map(item => {
                  const packed = checkedItems.has(item.id);
                  return (
                    <div key={item.id} className="page-card" style={{
                      padding: 0, overflow: 'hidden',
                      opacity: packed ? 0.6 : 1,
                      borderLeft: packed ? '4px solid #4ADE80' : '4px solid transparent',
                      transition: 'all .2s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        {/* Image */}
                        <div style={{
                          width: 120, minHeight: 100, background: 'var(--hover-bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {item.image ? (
                            <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Package size={32} style={{ color: 'var(--td)' }} />
                          )}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{
                              fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 4,
                              textDecoration: packed ? 'line-through' : 'none',
                            }}>{item.name}</div>
                            {item.sku && <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace', marginBottom: 4 }}>{item.sku}</div>}
                            <div style={{ fontSize: 13, color: 'var(--tm)' }}>{fmtMoney(item.unitPrice)} zł/szt</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                              fontSize: 22, fontWeight: 800, color: 'var(--accent)',
                              background: 'var(--accent-g, rgba(99,102,241,0.08))',
                              borderRadius: 8, padding: '4px 12px',
                            }}>
                              x{item.quantity}
                            </div>
                            <button onClick={() => packItem(item.id)}
                              style={{
                                padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: packed ? '#4ADE80' : '#6366F1', color: '#fff',
                                fontSize: 13, fontWeight: 700, transition: 'all .15s',
                                display: 'flex', alignItems: 'center', gap: 6,
                              }}>
                              {packed ? <><CheckCircle2 size={16} /> Spakowano</> : 'Spakuj'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Photos section */}
                <Card title="Zdjęcia paczki" action={
                  <Button variant="ghost" size="sm" icon={<Camera size={14} />}
                    onClick={() => fileRef.current?.click()} loading={photoMut.isPending}>
                    Dodaj
                  </Button>
                }>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment"
                    onChange={handleFileUpload} style={{ display: 'none' }} />
                  {photos.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--tm)', fontSize: 12 }}>
                      Brak zdjęć. Dodaj zdjęcie paczki przed wysyłką.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {photos.map((p, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={p} alt="" style={{ width: 70, height: 70, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                          <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                            style={{
                              position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                              background: '#F87171', border: 'none', cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                            <X size={10} color="#fff" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* RIGHT: Customer & delivery info panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Customer card */}
                <Card noPadding>
                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                      <User size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Klient</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>
                      {activeOrder.addressName || '—'}
                    </div>
                    {activeOrder.addressPhone && (
                      <div style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 2 }}>Tel: {activeOrder.addressPhone}</div>
                    )}

                    <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <MapPin size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Adres dostawy</span>
                    </div>
                    {activeOrder.addressStreet && (
                      <div style={{ fontSize: 13, color: 'var(--ts)', marginBottom: 2 }}>{activeOrder.addressStreet}</div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--ts)' }}>
                      {activeOrder.addressZip} {activeOrder.addressCity}
                    </div>
                  </div>
                </Card>

                {/* Delivery card */}
                <Card noPadding>
                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                      <Truck size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dostawa</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--tm)' }}>Kurier</span>
                      <Badge color="indigo">{activeOrder.courierName || activeOrder.deliveryMethod || '—'}</Badge>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--tm)' }}>Metoda</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{activeOrder.deliveryMethod || '—'}</span>
                    </div>
                  </div>
                </Card>

                {/* Package dimensions card */}
                <Card noPadding>
                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                      <Box size={14} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wymiary paczki</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {['Szer.', 'Wys.', 'Gł.'].map(d => (
                        <div key={d} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--tm)', marginBottom: 4 }}>{d}</div>
                          <div style={{
                            padding: '8px', borderRadius: 6, background: 'var(--hover-bg)',
                            fontSize: 14, fontWeight: 700, color: 'var(--t)',
                          }}>—</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Order summary */}
                <div className="page-card" style={{
                  padding: '16px 20px', background: 'var(--accent-g, rgba(99,102,241,0.04))',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', fontFamily: 'monospace', marginBottom: 6 }}>
                    {activeOrder.externalOrderId || activeOrder.id.slice(0, 8)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--tm)' }}>Pozycje</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{totalItemsCount} szt</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--tm)' }}>Wartość</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(totalAmount)} zł</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom bar: totals + actions */}
            <div className="page-card" style={{
              padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', bottom: 0, zIndex: 10,
            }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pozycje</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)' }}>{checkedItems.size}/{activeOrder.items.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Łączna kwota</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(totalAmount)} zł</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => cancelMut.mutate()} loading={cancelMut.isPending}>
                  Anuluj
                </Button>
                <Button variant="primary" size="lg"
                  icon={allChecked ? <Truck size={16} /> : <Package size={16} />}
                  onClick={() => completeMut.mutate()}
                  loading={completeMut.isPending}
                  disabled={!allChecked}
                  style={{ background: allChecked ? '#6366F1' : undefined }}>
                  Generuj list przewozowy
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export default PackingStationPage;

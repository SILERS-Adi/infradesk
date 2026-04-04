/**
 * PakOps Packing Station — 1:1 pixel-perfect port from pakops.silers.pl
 * 3-view architecture: batches → batch-orders → packing
 * Fullscreen layout when packing with 2-column grid (items + workflow boxes)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Package, Camera, Printer, CheckCircle2, X,
  ChevronRight, Loader2, Scan, User, FileText, AlertTriangle, Truck, Download, ExternalLink,
} from 'lucide-react';
import api from '../../../api/client';
import { soundCollect, soundSuccess } from './useSound';
import type { PakOpsBatch, PakOpsOrderToPack, PakOpsSessionData } from './types';

export default function PackingStationPage() {
  /* ═══ State ═══ */
  const [view, setView] = useState<'batches' | 'batch-orders' | 'packing'>('batches');
  const [batches, setBatches] = useState<PakOpsBatch[]>([]);
  const [batchOrders, setBatchOrders] = useState<PakOpsOrderToPack[]>([]);
  const [activeBatch, setActiveBatch] = useState<PakOpsBatch | null>(null);
  const [session, setSession] = useState<PakOpsSessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const [_selectedIdx, setSelectedIdx] = useState(0);
  const [photosTaken, setPhotosTaken] = useState<string[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipInfo, setShipInfo] = useState<any>(null);

  const [pkgSize, setPkgSize] = useState('small');
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [shipmentResult, setShipmentResult] = useState<{ shipment_id: string; waybill: string } | null>(null);
  const [pkgLength, setPkgLength] = useState('30');
  const [pkgWidth, setPkgWidth] = useState('20');
  const [pkgHeight, setPkgHeight] = useState('15');
  const [pkgWeight, setPkgWeight] = useState('1.0');
  const [productModal, setProductModal] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanBuffer, setScanBuffer] = useState('');

  /* ═══ Load batches ═══ */
  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/packaging/batches/ready-for-packing');
      setBatches(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  /* ═══ Open batch ═══ */
  const openBatch = async (batch: PakOpsBatch) => {
    setActiveBatch(batch);
    const { data } = await api.get(`/packaging/batches/${batch.id}/orders-to-pack`);
    setBatchOrders(data);
    setView('batch-orders');
  };

  /* ═══ Start packing order ═══ */
  const startPacking = async (orderId: string) => {
    try {
      const { data: created } = await api.post('/packaging/packing/sessions', { order_id: orderId });
      const sessionId = created.session_id || created.id;
      const { data: full } = await api.get(`/packaging/packing/sessions/${sessionId}`);
      setSession(full);
      setSelectedIdx(0);
      setPhotosTaken([]);
      setCameraActive(false);
      setShipmentResult(null);
      setShipInfo(null);
      setView('packing');
      // Load shipment requirements
      const oid = created.order_id || full.order?.id;
      api.get(`/packaging/shipping/shipment-info/${oid}`).then(r => setShipInfo(r.data)).catch(() => {});
    } catch {
      // Order might already have active session — try to find and resume
      try {
        const { data: active } = await api.get('/packaging/packing/active');
        if (active.active && active.session_id) {
          const { data: full } = await api.get(`/packaging/packing/sessions/${active.session_id}`);
          setSession(full);
          setSelectedIdx(0);
          setPhotosTaken([]);
          setCameraActive(false);
          setView('packing');
        }
      } catch { /* silent */ }
    }
  };

  /* ═══ Check item + auto-advance ═══ */
  const items = session ? Object.entries(session.items_checked || {}) : [];
  const checkedCount = items.filter(([, i]) => i.scanned).length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  const checkItem = async (itemId: string) => {
    if (!session) return;
    await api.post(`/packaging/packing/sessions/${session.id}/check-item?item_id=${itemId}`);
    const { data } = await api.get(`/packaging/packing/sessions/${session.id}`);
    setSession(data);
    soundCollect();
    const newItems = Object.entries(data.items_checked || {});
    const nextUnchecked = newItems.findIndex(([, i]: [string, any]) => !i.scanned);
    if (nextUnchecked >= 0) setSelectedIdx(nextUnchecked);
  };

  /* ═══ Camera ═══ */
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      let stream: MediaStream;
      if (cameras.length > 0 && cameras[0].deviceId) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cameras[0].deviceId } } });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        });
      });
    } catch (err) {
      console.error('Camera error:', err);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const takePhoto = async () => {
    if (!session || !videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.85);
    setPhotosTaken(p => [...p, url]);
    try {
      await api.post(`/packaging/packing/sessions/${session.id}/photo`, { photo_base64: url.split(',')[1] });
    } catch { /* silent */ }
  };

  /* ═══ Shipment creation ═══ */
  const isInPostOrder = () => {
    const dm = (session?.order?.delivery_method || '').toLowerCase();
    return dm.includes('inpost') || dm.includes('paczkomat');
  };

  const createShipment = async () => {
    if (!session) return;
    setShipmentLoading(true);
    try {
      const { data } = await api.post('/packaging/shipping/create-shipment', {
        order_id: session.order?.id,
        length: parseFloat(pkgLength) || 30,
        width: parseFloat(pkgWidth) || 20,
        height: parseFloat(pkgHeight) || 15,
        weight: parseFloat(pkgWeight) || 1.0,
      });
      setShipmentResult(data);
      if (data.shipment_id) {
        await new Promise(r => setTimeout(r, isInPostOrder() ? 1000 : 3000));
        try {
          const labelResp = await api.post(`/packaging/shipping/label?shipment_ids=${data.shipment_id}`, {}, { responseType: 'blob' });
          if (labelResp.data.size > 100) {
            const url = window.URL.createObjectURL(new Blob([labelResp.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
          }
        } catch { /* silent */ }
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Blad tworzenia przesylki');
    } finally { setShipmentLoading(false); }
  };

  /* ═══ Complete + auto-next ═══ */
  const complete = async () => {
    if (!session || !activeBatch) return;
    setCompleting(true);
    try {
      await api.post(`/packaging/packing/sessions/${session.id}/complete`, {});
      soundSuccess();
      stopCamera();
      const { data: allOrders } = await api.get(`/packaging/batches/${activeBatch.id}/orders-to-pack`);
      const nextOrder = allOrders.find((o: any) => o.status === 'picked' || o.status === 'packing' || o.status === 'PICKED' || o.status === 'PACKING');
      if (nextOrder) {
        await startPacking(nextOrder.id);
      } else {
        setSession(null);
        setView('batches');
        loadBatches();
      }
    } finally { setCompleting(false); }
  };

  /* ═══ Scanner ═══ */
  useEffect(() => {
    if (view === 'packing' && scanRef.current) {
      const i = setInterval(() => scanRef.current?.focus(), 500);
      return () => clearInterval(i);
    }
  }, [view]);

  const handleScan = async () => {
    if (!session || !scanBuffer.trim()) return;
    await api.post(`/packaging/packing/sessions/${session.id}/scan`, { barcode: scanBuffer.trim() });
    setScanBuffer('');
    const { data } = await api.get(`/packaging/packing/sessions/${session.id}`);
    setSession(data);
    soundCollect();
    const newItems = Object.entries(data.items_checked || {});
    const nextUnchecked = newItems.findIndex(([, i]: [string, any]) => !i.scanned);
    if (nextUnchecked >= 0) setSelectedIdx(nextUnchecked);
  };

  /* ═══════════════════════════════════════════
     VIEW 1: BATCHES LIST
     ═══════════════════════════════════════════ */
  const activeBatches = batches.filter(b => b.percent_packed < 100);
  const archivedBatches = batches.filter(b => b.percent_packed >= 100);

  if (view === 'batches') {
    return (
      <div className="pakops" style={{ maxWidth: 1200, animation: 'fadeUp .3s ease-out both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--tx)' }}>Pakowanie</h1>
            <p style={{ fontSize: 13, marginTop: 2, fontWeight: 500, color: 'var(--tx2)' }}>Partie gotowe do spakowania</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <Loader2 style={{ width: 24, height: 24, color: 'var(--pri)', animation: 'pakSpin .6s linear infinite' }} />
          </div>
        ) : batches.length === 0 ? (
          <div style={{ borderRadius: 'var(--pk-r)', textAlign: 'center', padding: '64px 0', background: 'var(--sf)', border: '1px solid var(--bd)', boxShadow: 'var(--sh1)' }}>
            <Package style={{ width: 40, height: 40, color: 'var(--tx3)', strokeWidth: 1.5, margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>Brak partii do spakowania</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--tx3)' }}>Najpierw zbierz towary w zakladce Zbieranie</p>
          </div>
        ) : (
          <>
            {/* Active batches */}
            {activeBatches.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, color: 'var(--tx3)' }}>
                  Do spakowania ({activeBatches.length})
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
                  {activeBatches.map((b, i) => (
                    <div key={b.id}
                      style={{
                        borderRadius: 'var(--pk-r)', overflow: 'hidden', cursor: 'pointer',
                        background: 'var(--sf)', border: '1px solid var(--bd)', boxShadow: 'var(--sh1)',
                        animationDelay: `${i * 40}ms`, transition: 'transform .15s, box-shadow .15s',
                        animation: 'fadeUp .3s ease-out both',
                      }}
                      onClick={() => openBatch(b)}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--sh3)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--sh1)'; }}>
                      <div style={{ height: 2, background: 'var(--pri)' }} />
                      <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>{b.name}</p>
                            <p style={{ fontSize: 10, marginTop: 2, color: 'var(--tx3)' }}>{b.total_orders} zamowien &middot; {b.ready_orders} do spakowania</p>
                          </div>
                          <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--pri)' }}>{b.percent_packed}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: 'var(--bd-l)', overflow: 'hidden' }}>
                          <div style={{ width: `${b.percent_packed}%`, height: '100%', borderRadius: 99, background: 'var(--pri)', transition: 'width .6s' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--tx2)' }}>{b.packed_orders}/{b.total_orders} spakowanych</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--pri)' }}>
                            Pakuj <ChevronRight style={{ width: 14, height: 14 }} />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archived batches — 100% packed */}
            {archivedBatches.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, color: 'var(--ok)' }}>
                  <CheckCircle2 style={{ width: 11, height: 11, display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  Archiwum — spakowane ({archivedBatches.length})
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
                  {archivedBatches.map((b, i) => (
                    <div key={b.id}
                      style={{
                        borderRadius: 'var(--pk-r)', overflow: 'hidden', cursor: 'pointer',
                        background: 'var(--sf)', border: '1px solid var(--ok-b)', boxShadow: 'var(--sh1)',
                        opacity: 0.7, animationDelay: `${i * 40}ms`, transition: 'transform .15s, box-shadow .15s, opacity .15s',
                        animation: 'fadeUp .3s ease-out both',
                      }}
                      onClick={() => openBatch(b)}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'none'; }}>
                      <div style={{ height: 2, background: 'var(--ok)' }} />
                      <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>{b.name}</p>
                            <p style={{ fontSize: 10, marginTop: 2, color: 'var(--tx3)' }}>{b.total_orders} zamowien</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: 'var(--ok-l)', border: '1px solid var(--ok-b)' }}>
                            <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--ok)' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)' }}>100%</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)' }}>{b.packed_orders}/{b.total_orders} spakowanych</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--tx3)' }}>
                            Podglad <ChevronRight style={{ width: 14, height: 14 }} />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW 2: BATCH ORDERS
     ═══════════════════════════════════════════ */
  if (view === 'batch-orders') {
    const toPack = batchOrders.filter(o => o.status !== 'packed' && o.status !== 'shipped' && o.status !== 'PACKED' && o.status !== 'SHIPPED');
    const done = batchOrders.filter(o => o.status === 'packed' || o.status === 'shipped' || o.status === 'PACKED' || o.status === 'SHIPPED');

    return (
      <div className="pakops" style={{ maxWidth: 1200, animation: 'fadeUp .3s ease-out both' }}>
        <button
          onClick={() => { setView('batches'); setActiveBatch(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 12, color: 'var(--tx2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          &larr; Partie
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--tx)' }}>{activeBatch?.name}</h1>
            <p style={{ fontSize: 13, marginTop: 2, fontWeight: 500, color: 'var(--tx2)' }}>{batchOrders.length} zamowien do spakowania</p>
          </div>
        </div>

        {toPack.length === 0 && done.length > 0 && (
          <div style={{ borderRadius: 'var(--pk-r)', textAlign: 'center', padding: '48px 0', marginBottom: 12, background: 'var(--ok-l)', border: '1px solid var(--ok-b)' }}>
            <CheckCircle2 style={{ width: 36, height: 36, color: 'var(--ok)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>Wszystko spakowane!</p>
          </div>
        )}

        {toPack.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, color: 'var(--tx3)' }}>
              Do spakowania ({toPack.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {toPack.map((o, i) => (
                <div key={o.id}
                  style={{
                    borderRadius: 'var(--pk-rs)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                    background: 'var(--sf)', border: '1px solid var(--bd)', boxShadow: 'var(--sh1)',
                    animationDelay: `${i * 30}ms`, transition: 'transform .15s, box-shadow .15s',
                    animation: 'fadeUp .3s ease-out both',
                  }}
                  onClick={() => startPacking(o.id)}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = 'var(--sh2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--sh1)'; }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--pk-rs)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: 'color-mix(in srgb, var(--pri) 8%, transparent)',
                  }}>
                    <Package style={{ width: 18, height: 18, color: 'var(--pri)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{o.customer_name || (o.allegro_order_id || o.id).slice(0, 10)}</p>
                    <p style={{ fontSize: 10, marginTop: 2, color: 'var(--tx3)' }}>
                      {o.items_count} pozycji &middot; {o.total_amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN &middot; {(o.delivery_method || '').replace('Allegro ', '')}
                    </p>
                  </div>
                  {o.buyer_note && <AlertTriangle style={{ width: 14, height: 14, color: 'var(--wn)' }} />}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--pri)', display: 'flex', alignItems: 'center' }}>
                    Pakuj <ChevronRight style={{ width: 14, height: 14 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, color: 'var(--ok)' }}>
              Spakowane ({done.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {done.map(o => (
                <div key={o.id}
                  style={{
                    borderRadius: 'var(--pk-rs)', display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                    background: 'color-mix(in srgb, var(--ok) 5%, transparent)', border: '1px solid var(--ok-b)',
                  }}>
                  <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--ok)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ok)' }}>{o.customer_name || (o.allegro_order_id || o.id).slice(0, 10)}</p>
                    <p style={{ fontSize: 9, color: 'var(--tx3)' }}>{o.items_count} poz. &middot; {o.total_amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW 3: PACKING STATION (fullscreen)
     ═══════════════════════════════════════════ */
  if (!session) return null;
  const progressColor = allChecked ? 'var(--ok)' : checkedCount > 0 ? 'var(--wn)' : 'var(--er)';

  return (
    <div className="pakops" style={{ display: 'flex', flexDirection: 'column', background: 'var(--pk-bg)', position: 'fixed', left: 240, top: 0, right: 0, bottom: 0, zIndex: 10 }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input
        ref={scanRef}
        value={scanBuffer}
        onChange={e => setScanBuffer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
        style={{ position: 'absolute', opacity: 0 }}
        autoFocus
      />

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--bd)', background: 'var(--sf)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { setView('batch-orders'); setSession(null); stopCamera(); }}
            style={{ padding: 6, borderRadius: 6, color: 'var(--tx3)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--pri)' }}>
            {session.order?.allegro_order_id?.slice(0, 10) || session.order?.id?.slice(0, 10)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{session.order?.customer_name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99,
            background: `color-mix(in srgb, ${progressColor} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${progressColor} 20%, transparent)`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: progressColor }}>{checkedCount}/{items.length}</span>
            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--tx3)' }}>spakowanych</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 99, border: '1px solid var(--bd)' }}>
            <Scan style={{ width: 10, height: 10, color: 'var(--ok)' }} />
            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Skaner</span>
          </div>
        </div>
      </div>

      {/* ── 2-column layout ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 500px', gap: 0 }}>

        {/* ════ LEFT: Product rows ════ */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', background: 'var(--pk-bg)' }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexShrink: 0,
            borderBottom: '2px solid var(--bd)', background: 'var(--sf)',
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>Pozycje zamowienia</p>
              <p style={{ fontSize: 11, marginTop: 2, color: 'var(--tx3)' }}>
                {session.order?.customer_name} &middot; {(session.order?.allegro_order_id || session.order?.id || '').slice(0, 10)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--tx3)' }}>Wartosc zamowienia</p>
              <p style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--tx)' }}>
                {session.order?.total_amount?.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}{' '}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx3)' }}>PLN</span>
              </p>
            </div>
          </div>

          {/* Product rows */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {items.map(([itemId, item]) => {
              const unitPrice = (session.order?.items || []).find((i: any) => i.name === item.name);
              const price = unitPrice?.unit_price || 0;
              const value = price * item.quantity;
              const isDone = item.scanned;

              return (
                <div key={itemId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: 16, marginBottom: 8, borderRadius: 'var(--pk-r)',
                    background: isDone ? 'color-mix(in srgb, var(--ok) 5%, var(--sf))' : 'var(--sf)',
                    border: isDone ? '2px solid var(--ok-b)' : '2px solid var(--bd)',
                    opacity: isDone ? 0.7 : 1,
                    transition: 'all .2s',
                  }}>

                  {/* Photo — clickable lightbox */}
                  <div
                    style={{
                      width: 160, height: 160, borderRadius: 'var(--pk-r)', overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                      background: 'var(--sf2)', border: '1px solid var(--bd-l)',
                    }}
                    onClick={() => item.image_url && setLightboxImg(item.image_url)}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package style={{ width: 48, height: 48, color: 'var(--tx3)', opacity: 0.3 }} />
                      </div>
                    )}
                  </div>

                  {/* Info: name, ID, price */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: isDone ? 'var(--ok)' : 'var(--tx)' }}>{item.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                      {item.allegro_offer_id && (
                        <a href={`https://allegro.pl/oferta/${item.allegro_offer_id}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: 'var(--pri)', textDecoration: 'none' }}>
                          <ExternalLink style={{ width: 9, height: 9 }} /> {item.allegro_offer_id}
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--tx3)' }}>
                        Cena: <strong style={{ color: 'var(--tx)' }}>{price.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</strong> PLN
                      </span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--tx3)' }}>
                        Ilosc: <strong style={{ color: 'var(--tx)' }}>{item.quantity}</strong>
                      </span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--pri)' }}>
                        Wartosc: {value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
                      </span>
                    </div>
                  </div>

                  {/* Separator */}
                  <div style={{ width: 1, height: 60, background: 'var(--bd)', flexShrink: 0 }} />

                  {/* Quantity + Pack button */}
                  {!isDone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', padding: '0 12px', color: 'var(--pri)' }}>
                        x{item.quantity}
                      </span>
                      <button onClick={() => checkItem(itemId)}
                        style={{
                          height: 52, padding: '0 24px', borderRadius: 'var(--pk-r)', display: 'flex', alignItems: 'center', gap: 8,
                          background: 'var(--ok)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                          boxShadow: '0 3px 10px color-mix(in srgb, var(--ok) 30%, transparent)',
                        }}>
                        <CheckCircle2 style={{ width: 18, height: 18 }} /> Spakuj
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <CheckCircle2 style={{ width: 28, height: 28, color: 'var(--ok)' }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ok)' }}>Spakowany</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom summary */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexShrink: 0,
            borderTop: '2px solid var(--bd)', background: 'var(--sf)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx3)' }}>
                Pozycji: <strong style={{ color: 'var(--tx)' }}>{items.length}</strong>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: progressColor }}>
                Spakowanych: <strong>{checkedCount}/{items.length}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--tx3)' }}>Wysylka:</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--tx2)' }}>
                    {session.order?.delivery_cost != null ? (session.order.delivery_cost > 0 ? session.order.delivery_cost.toFixed(2) + ' PLN' : 'Smart! Allegro') : '0.00 PLN'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--tx3)' }}>Razem:</span>
                  <span style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--tx)' }}>
                    {session.order?.total_amount?.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}{' '}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)' }}>PLN</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ RIGHT: Steps panel ════ */}
        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--bd)', background: 'var(--sf2)' }}>

          {/* BOX 1: Customer */}
          <div style={{
            padding: 12, borderRadius: 'var(--pk-rs)',
            background: 'var(--sf)', border: `1px solid ${session.order?.buyer_note ? 'var(--wn-b)' : 'var(--bd)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <User style={{ width: 12, height: 12, color: 'var(--tx3)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tx3)' }}>Kupujacy</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{session.order?.customer_name || '—'}</p>
            {session.order?.customer_login && (
              <p style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: 'var(--pri)' }}>Allegro: {session.order.customer_login}</p>
            )}
            {session.order?.address_phone && (
              <p style={{ fontSize: 11, marginTop: 4, color: 'var(--tx2)' }}>
                Tel: <a href={'tel:' + session.order.address_phone} style={{ color: 'var(--pri)', fontWeight: 600, textDecoration: 'none' }}>{session.order.address_phone}</a>
              </p>
            )}
            {session.order?.customer_email && (
              <p style={{ fontSize: 11, marginTop: 2, color: 'var(--tx2)' }}>Email: {session.order.customer_email}</p>
            )}
            {session.order?.is_cod && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 5, background: 'var(--wn-l)', border: '1px solid var(--wn-b)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wn)' }}>COD: {session.order.cod_amount?.toFixed(2)} zl</span>
              </div>
            )}
            {session.order?.buyer_note && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 5, background: 'var(--wn-l)', border: '1px solid var(--wn-b)' }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--wn)' }}>Uwagi</p>
                <p style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: 'var(--tx)' }}>{session.order.buyer_note}</p>
              </div>
            )}
            <a
              href={`https://allegro.pl/moje-allegro/sprzedaz/zamowienia/${session.order?.allegro_order_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, width: '100%', padding: '8px 0',
                background: 'var(--sf2)', color: 'var(--pri)', border: '1px solid var(--bd)', borderRadius: 'var(--pk-rs)',
                fontSize: 11, fontWeight: 700, textDecoration: 'none', cursor: 'pointer',
              }}>
              <ExternalLink style={{ width: 11, height: 11 }} /> Zobacz zamowienie na Allegro
            </a>
          </div>

          {/* BOX 2: Camera */}
          <div style={{ padding: 12, borderRadius: 'var(--pk-rs)', background: 'var(--sf)', border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera style={{ width: 12, height: 12, color: 'var(--tx3)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tx3)' }}>Zdjecie</span>
              </div>
              {photosTaken.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ok)' }}>{photosTaken.length} foto</span>}
            </div>
            {!cameraActive ? (
              <button onClick={startCamera}
                style={{
                  width: '100%', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'var(--sf-h)', color: 'var(--tx2)', border: '1px solid var(--bd)', borderRadius: 'var(--pk-rs)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                <Camera style={{ width: 13, height: 13 }} /> Wlacz kamere
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ borderRadius: 'var(--pk-rs)', overflow: 'hidden', background: '#000' }}>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={takePhoto}
                    style={{
                      flex: 1, padding: '6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      background: 'var(--pri)', color: '#fff', border: 'none', borderRadius: 'var(--pk-rs)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    }}>
                    <Camera style={{ width: 11, height: 11 }} /> Zdjecie
                  </button>
                  <button onClick={stopCamera}
                    style={{
                      padding: '6px 8px', background: 'var(--sf-h)', color: 'var(--tx3)', border: '1px solid var(--bd)',
                      borderRadius: 'var(--pk-rs)', cursor: 'pointer',
                    }}>
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </div>
              </div>
            )}
            {photosTaken.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {photosTaken.map((s, i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--bd-l)' }}>
                    <img src={s} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOX 3: Shipment + Label */}
          <div style={{
            padding: 16, borderRadius: 'var(--pk-r)',
            background: 'var(--sf)',
            border: `1px solid ${shipmentResult ? 'var(--ok-b)' : session.order?.is_cod ? 'var(--er-b)' : 'var(--bd)'}`,
          }}>
            {/* Header with carrier info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck style={{ width: 16, height: 16, color: shipmentResult ? 'var(--ok)' : 'var(--tx3)' }} />
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: shipmentResult ? 'var(--ok)' : 'var(--tx)' }}>
                  {shipmentResult ? 'Nadano' : 'Przesylka'}
                </span>
              </div>
              {shipmentResult && <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--ok)' }}>{shipmentResult.waybill}</span>}
            </div>

            {/* Carrier name + logo */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: 10, borderRadius: 'var(--pk-rs)',
              background: 'var(--sf2)', border: '1px solid var(--bd)',
            }}>
              {shipInfo?.carrier_logo ? (
                <img src={shipInfo.carrier_logo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--pri-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck style={{ width: 14, height: 14, color: 'var(--pri)' }} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{(session.order?.delivery_method || '').replace('Allegro ', '')}</p>
                {session.order?.delivery_point_id && (
                  <p style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--pri)' }}>{session.order.delivery_point_id}</p>
                )}
              </div>
            </div>

            {/* Address compact */}
            <div style={{ marginBottom: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{session.order?.address_name}</span>
              <span style={{ color: 'var(--tx3)', marginLeft: 6 }}>
                {session.order?.address_street}, {session.order?.address_zip} {session.order?.address_city}
              </span>
            </div>

            {/* COD warning */}
            {session.order?.is_cod && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 'var(--pk-rs)', marginBottom: 12, background: 'var(--er-l)', border: '1px solid var(--er-b)' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--er)' }}>POBRANIE: {session.order.cod_amount?.toFixed(2)} zl</span>
              </div>
            )}

            {/* Costs row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 11, color: 'var(--tx3)' }}>
              <span>Wysylka: <strong style={{ color: 'var(--tx2)' }}>
                {session.order?.delivery_cost != null && session.order.delivery_cost > 0 ? session.order.delivery_cost.toFixed(2) + ' zl' : 'Smart! Allegro'}
              </strong></span>
              <span style={{ color: 'var(--bd)' }}>|</span>
              <span>Wartosc: <strong style={{ color: 'var(--tx2)' }}>{session.order?.total_amount?.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</strong></span>
            </div>

            {!shipmentResult ? (
              <>
                {/* Smart package form — adapts to carrier requirements */}
                {shipInfo?.size_options ? (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, display: 'block', color: 'var(--tx3)' }}>Gabaryt</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {shipInfo.size_options.map((opt: any) => (
                        <button key={opt.value} onClick={() => setPkgSize(opt.value)}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 8, textAlign: 'center',
                            background: pkgSize === opt.value ? 'var(--pri)' : 'var(--sf2)',
                            color: pkgSize === opt.value ? '#fff' : 'var(--tx3)',
                            border: `1px solid ${pkgSize === opt.value ? 'var(--pri)' : 'var(--bd-l)'}`,
                            transition: 'all .15s', cursor: 'pointer',
                          }}>
                          <p style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</p>
                          <p style={{ fontSize: 9, marginTop: 2 }}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Dlugosc', unit: 'cm', value: pkgLength, set: setPkgLength, step: '1' },
                      { label: 'Szerokosc', unit: 'cm', value: pkgWidth, set: setPkgWidth, step: '1' },
                      { label: 'Wysokosc', unit: 'cm', value: pkgHeight, set: setPkgHeight, step: '1' },
                      { label: 'Waga', unit: 'kg', value: pkgWeight, set: setPkgWeight, step: '0.1' },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2, display: 'block', color: 'var(--tx3)' }}>
                          {f.label} ({f.unit})
                        </label>
                        <input value={f.value} onChange={e => f.set(e.target.value)} type="number" step={f.step}
                          style={{
                            width: '100%', padding: 8, borderRadius: 6, fontSize: 15, fontWeight: 900, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                            background: 'var(--sf2)', border: '1px solid var(--bd)', color: 'var(--tx)', outline: 'none',
                          }} />
                      </div>
                    ))}
                  </div>
                )}
                {shipInfo?.requires_weight && shipInfo?.size_options && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4, display: 'block', color: 'var(--tx2)' }}>Waga (kg)</label>
                    <input value={pkgWeight} onChange={e => setPkgWeight(e.target.value)} type="number" step="0.1"
                      style={{
                        width: '100%', padding: '4px 6px', borderRadius: 4, fontSize: 11, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                        background: 'var(--sf2)', border: '1px solid var(--bd-l)', color: 'var(--tx)', outline: 'none',
                      }} />
                  </div>
                )}

                {/* Create shipment button */}
                <button onClick={createShipment} disabled={shipmentLoading}
                  style={{
                    width: '100%', padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'var(--pri)', color: '#fff', border: 'none', borderRadius: 'var(--pk-r)', fontSize: 16, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 4px 12px var(--pri-glow)',
                  }}>
                  {shipmentLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'pakSpin .6s linear infinite' }} /> : <Printer style={{ width: 18, height: 18 }} />}
                  {shipmentLoading ? 'Generowanie listu...' : 'Generuj list przewozowy'}
                </button>
                <a href={`https://salescenter.allegro.com/ship-with-allegro/swa/create-shipment/${session.order?.allegro_order_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 8, padding: '8px 0',
                    background: 'transparent', color: 'var(--tx3)', border: '1px solid var(--bd-l)', borderRadius: 'var(--pk-rs)',
                    fontSize: 11, fontWeight: 600, textDecoration: 'none',
                  }}>
                  <ExternalLink style={{ width: 12, height: 12 }} /> Nadaj recznie na Allegro
                </a>
              </>
            ) : (
              <>
                {/* Already shipped — download label again */}
                <button onClick={async () => {
                  try {
                    const resp = await api.post(`/packaging/shipping/label?shipment_ids=${shipmentResult.shipment_id}`, {}, { responseType: 'blob' });
                    if (resp.data.size > 100) {
                      const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
                      window.open(url, '_blank');
                    } else {
                      alert('Etykieta jeszcze nie gotowa — sprobuj za chwile');
                    }
                  } catch (err: any) { alert(err?.response?.data?.detail || 'Blad pobierania etykiety'); }
                }}
                  style={{
                    width: '100%', padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'var(--ok)', color: '#fff', border: 'none', borderRadius: 'var(--pk-r)', fontSize: 16, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 4px 12px color-mix(in srgb, var(--ok) 30%, transparent)',
                  }}>
                  <Download style={{ width: 18, height: 18 }} /> Pobierz etykiete PDF
                </button>
              </>
            )}
          </div>

          {/* BOX 4: Documents */}
          <div style={{
            padding: 12, borderRadius: 'var(--pk-rs)',
            background: session.order?.wants_invoice ? 'color-mix(in srgb, var(--pri) 4%, var(--sf))' : 'var(--sf)',
            border: `1px solid ${session.order?.wants_invoice ? 'var(--pri-50)' : 'var(--bd)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FileText style={{ width: 12, height: 12, color: session.order?.wants_invoice ? 'var(--pri)' : 'var(--tx3)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: session.order?.wants_invoice ? 'var(--pri)' : 'var(--tx3)' }}>
                {session.order?.wants_invoice ? 'Faktura VAT' : 'Paragon'}
              </span>
            </div>
            {session.order?.wants_invoice ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {session.order.invoice_company && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{session.order.invoice_company}</p>
                )}
                {session.order.invoice_nip && (
                  <p style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: 'var(--pri)' }}>NIP: {session.order.invoice_nip}</p>
                )}
                {session.order.invoice_address && (
                  <p style={{ fontSize: 11, color: 'var(--tx2)' }}>{session.order.invoice_address}</p>
                )}
                {!session.order.invoice_company && !session.order.invoice_nip && (
                  <p style={{ fontSize: 11, color: 'var(--wn)' }}>Klient zaznaczy fakture, ale brak danych firmy</p>
                )}
                <button style={{
                  marginTop: 4, width: '100%', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'var(--pri)', color: '#fff', border: 'none', borderRadius: 'var(--pk-rs)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                  <FileText style={{ width: 11, height: 11 }} /> Wystaw fakture
                </button>
              </div>
            ) : (
              <button style={{
                width: '100%', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: 'var(--sf2)', color: 'var(--tx2)', border: '1px solid var(--bd)', borderRadius: 'var(--pk-rs)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>
                <FileText style={{ width: 11, height: 11 }} /> Drukuj paragon
              </button>
            )}
          </div>

          {/* BOX 5: Progress + Complete */}
          <div style={{
            padding: 14, borderRadius: 'var(--pk-rs)', marginTop: 'auto',
            background: 'var(--sf)', border: `1px solid ${allChecked ? 'var(--ok-b)' : 'var(--bd)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tx3)' }}>Spakowanych</span>
              <span style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: progressColor }}>{checkedCount}/{items.length}</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--bd-l)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%`, height: '100%', borderRadius: 99, background: progressColor, transition: 'width .4s' }} />
            </div>
            <button onClick={complete} disabled={completing}
              style={{
                width: '100%', padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: allChecked ? 'var(--ok)' : 'var(--sf-h)',
                color: allChecked ? '#fff' : 'var(--tx3)',
                border: allChecked ? 'none' : '1px solid var(--bd)',
                borderRadius: 'var(--pk-rs)', fontSize: 13, fontWeight: 700,
                cursor: allChecked ? 'pointer' : 'default',
                animation: allChecked ? 'pakGlow 1.5s ease-in-out infinite' : 'none',
              }}>
              {completing ? <Loader2 style={{ width: 16, height: 16, animation: 'pakSpin .6s linear infinite' }} /> : <CheckCircle2 style={{ width: 16, height: 16 }} />}
              {completing ? 'Finalizacja...' : 'GOTOWE'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightboxImg && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={() => setLightboxImg(null)}>
          <button onClick={() => setLightboxImg(null)}
            style={{
              position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 28, border: 'none', cursor: 'pointer',
            }}>
            ✕
          </button>
          <img src={lightboxImg} alt=""
            style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 'var(--pk-r)', objectFit: 'contain', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── Product modal ── */}
      {productModal && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setProductModal(null)}>
          <div
            style={{ width: '100%', maxWidth: 448, borderRadius: 'var(--pk-rl)', overflow: 'hidden', background: 'var(--sf)', boxShadow: 'var(--sh4)', animation: 'fadeUp .2s ease-out' }}
            onClick={e => e.stopPropagation()}>
            {productModal.image_url && (
              <div style={{ height: 200, background: 'var(--sf2)' }}>
                <img src={productModal.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 16 }} />
              </div>
            )}
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, color: 'var(--tx)' }}>{productModal.name}</h3>
              {productModal.allegro_offer_id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 10, color: 'var(--tx3)' }}>ID: {productModal.allegro_offer_id}</span>
                  <span style={{ fontSize: 10, color: 'var(--tx3)' }}>Ilosc: x{productModal.quantity}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {productModal.allegro_offer_id && (
                  <a href={`https://allegro.pl/oferta/${productModal.allegro_offer_id}`} target="_blank" rel="noopener noreferrer"
                    style={{
                      flex: 1, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      background: 'var(--pri)', color: '#fff', borderRadius: 'var(--pk-rs)', fontSize: 11, fontWeight: 600, textDecoration: 'none',
                    }}>
                    Zobacz na Allegro
                  </a>
                )}
                <button onClick={() => setProductModal(null)}
                  style={{
                    padding: '8px 16px', background: 'var(--sf-h)', color: 'var(--tx2)', border: '1px solid var(--bd)',
                    borderRadius: 'var(--pk-rs)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

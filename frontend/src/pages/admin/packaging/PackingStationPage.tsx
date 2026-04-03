/**
 * IDS 1.0 — Packing Station (Advanced Operational View)
 * Replicates core PakOps packing workflow:
 * Select order → Check items → Mark as packed → Create shipment
 */
import { useState, useEffect, useCallback } from 'react';
import { Package, CheckCircle2, ChevronRight, Truck, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { BadgeColor } from './types';

interface OrderToPack {
  id: string; externalOrderId?: string; addressName?: string; addressCity?: string;
  addressStreet?: string; addressZip?: string; addressPhone?: string;
  totalAmount: number | string; courierName?: string; deliveryMethod?: string;
  status: string; items: { id: string; name: string; sku?: string; quantity: number; unitPrice: number | string }[];
}

const STATUS_COLORS: Record<string, BadgeColor> = {
  PAID: 'green', PICKING: 'yellow', PICKED: 'indigo', PACKING: 'yellow', PACKED: 'purple',
};

export function PackingStationPage() {
  const [orders, setOrders] = useState<OrderToPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<OrderToPack | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [packing, setPacking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get orders ready for packing (PAID, PICKED, or PACKING status)
      const { data } = await api.get('/packaging/orders', { params: { per_page: '100' } });
      const ready = (data.items || []).filter((o: any) => ['PAID', 'PICKED', 'PACKING'].includes(o.status));
      setOrders(ready);
    } catch { toast.error('Nie udało się pobrać zamówień'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectOrder = async (order: OrderToPack) => {
    try {
      // Load full order with items
      const { data } = await api.get(`/packaging/orders/${order.id}`);
      setActiveOrder(data);
      setCheckedItems(new Set());
      // Update status to PACKING if not already
      if (data.status !== 'PACKING') {
        await api.put(`/packaging/orders/${order.id}`, { status: 'PACKING' });
      }
    } catch { toast.error('Nie udało się załadować zamówienia'); }
  };

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const allChecked = activeOrder ? activeOrder.items.every(i => checkedItems.has(i.id)) : false;

  const markAsPacked = async () => {
    if (!activeOrder) return;
    setPacking(true);
    try {
      await api.put(`/packaging/orders/${activeOrder.id}`, { status: 'PACKED' });
      toast.success(`Zamówienie ${activeOrder.externalOrderId || activeOrder.id.slice(0, 8)} spakowane!`);
      setActiveOrder(null);
      setCheckedItems(new Set());
      load();
    } catch { toast.error('Nie udało się oznaczyć jako spakowane'); }
    finally { setPacking(false); }
  };

  if (loading) return <><PageHeader title="Stacja pakowania" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title="Stacja pakowania" subtitle={`${orders.length} zamówień do spakowania`}
        actions={<Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Odśwież</Button>} />

      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, minHeight: 500 }}>

          {/* Left: Order queue */}
          <Card title="Kolejka zamówień" noPadding>
            {orders.length === 0 ? (
              <EmptyState title="Brak zamówień" description="Wszystkie zamówienia zostały spakowane." />
            ) : (
              <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                {orders.map(o => {
                  const isActive = activeOrder?.id === o.id;
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>{o.externalOrderId || o.id.slice(0, 8)}</span>
                        <Badge color={STATUS_COLORS[o.status] || 'gray'}>{o.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ts)' }}>{o.addressName || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>
                        {o._count?.items || '?'} poz. · {o.courierName || '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Right: Packing area */}
          <div>
            {!activeOrder ? (
              <Card>
                <EmptyState
                  icon={<Package style={{ width: 28, height: 28, color: 'var(--td)' }} />}
                  title="Wybierz zamówienie"
                  description="Kliknij zamówienie z kolejki po lewej, aby rozpocząć pakowanie."
                />
              </Card>
            ) : (
              <>
                {/* Order header */}
                <Card noPadding>
                  <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', fontFamily: 'monospace' }}>{activeOrder.externalOrderId || activeOrder.id.slice(0, 8)}</div>
                      <div style={{ fontSize: 13, color: 'var(--ts)', marginTop: 4 }}>{activeOrder.addressName} · {activeOrder.addressCity}</div>
                      {activeOrder.addressStreet && <div style={{ fontSize: 12, color: 'var(--tm)' }}>{activeOrder.addressStreet}, {activeOrder.addressZip}</div>}
                      {activeOrder.addressPhone && <div style={{ fontSize: 12, color: 'var(--tm)' }}>Tel: {activeOrder.addressPhone}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{Number(activeOrder.totalAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</div>
                      <div style={{ marginTop: 4 }}>
                        {activeOrder.courierName && <Badge color="indigo">{activeOrder.courierName}</Badge>}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Progress */}
                <div style={{ margin: '12px 0', padding: '8px 16px', borderRadius: 'var(--rs)', background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: allChecked ? '#4ADE80' : 'var(--ts)' }}>
                    {allChecked ? '✓ Wszystkie pozycje sprawdzone' : `${checkedItems.size} / ${activeOrder.items.length} pozycji`}
                  </span>
                  <div style={{ width: 120, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: allChecked ? '#4ADE80' : 'var(--accent)', width: `${activeOrder.items.length > 0 ? (checkedItems.size / activeOrder.items.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: checked ? 'var(--tm)' : 'var(--t)', textDecoration: checked ? 'line-through' : 'none' }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>×{item.quantity}</div>
                          <div style={{ fontSize: 11, color: 'var(--tm)' }}>{Number(item.unitPrice).toFixed(2)} zł</div>
                        </div>
                      </button>
                    );
                  })}
                </Card>

                {/* Action */}
                <div style={{ marginTop: 16 }}>
                  <Button
                    variant="primary"
                    size="lg"
                    icon={allChecked ? <Truck size={16} /> : <AlertTriangle size={16} />}
                    onClick={markAsPacked}
                    loading={packing}
                    disabled={!allChecked}
                    style={{ width: '100%' }}
                  >
                    {allChecked ? 'Oznacz jako spakowane' : `Sprawdź wszystkie pozycje (${activeOrder.items.length - checkedItems.size} pozostało)`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

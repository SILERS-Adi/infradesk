/**
 * IDS 1.0 — PakOps Shipment/Batch Detail (Original Design)
 * List of customers/orders in a batch with "Pakuj >" buttons
 * Expandable rows showing items, green accent for completed
 * Connected to: GET /api/packaging/orders/:id, GET /api/packaging/batches/:id
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Package, User, Truck, Calendar, Copy, Trash2, MapPin,
  Edit3, Clock, MessageSquare, Play, ChevronRight, ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ORDER_STATUS } from './constants';
import { fmtMoney, fmtDateTime, fmtDate } from './utils';
import type { BadgeColor } from './types';

interface OrderDetail {
  id: string;
  externalOrderId?: string;
  status: string;
  paymentStatus?: string;
  addressName?: string;
  addressStreet?: string;
  addressCity?: string;
  addressZip?: string;
  addressPhone?: string;
  addressEmail?: string;
  totalAmount: number | string;
  courierName?: string;
  deliveryMethod?: string;
  trackingNumber?: string;
  notes?: string;
  internalNotes?: string;
  createdAt: string;
  paidAt?: string;
  packedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  packingSessionId?: string;
  batchId?: string;
  items: {
    id: string; name: string; sku?: string; quantity: number;
    unitPrice: number | string; image?: string;
  }[];
  statusHistory?: { status: string; changedAt: string; changedBy?: string }[];
}

interface BatchDetail {
  id: string;
  name?: string;
  status: string;
  courierName?: string;
  orderCount: number;
  packedCount: number;
  orders?: OrderDetail[];
}

export function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  // Try to load as order first
  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['packaging', 'order', id],
    queryFn: async () => { const { data } = await api.get(`/packaging/orders/${id}`); return data; },
    enabled: !!id,
  });

  // Also try batch
  const { data: batch } = useQuery<BatchDetail>({
    queryKey: ['packaging', 'batch', id],
    queryFn: async () => {
      try { const { data } = await api.get(`/packaging/batches/${id}`); return data; }
      catch { return null; }
    },
    enabled: !!id,
  });

  const statusMut = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: string }) => {
      await api.put(`/packaging/orders/${orderId}`, { status: newStatus });
    },
    onSuccess: () => {
      toast.success('Status zmieniony');
      queryClient.invalidateQueries({ queryKey: ['packaging'] });
    },
    onError: () => toast.error('Nie udało się zmienić statusu'),
  });

  const notesMut = useMutation({
    mutationFn: async (notes: string) => {
      await api.patch(`/packaging/orders/${id}`, { internalNotes: notes });
    },
    onSuccess: () => {
      toast.success('Notatki zapisane');
      setEditingNotes(false);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'order', id] });
    },
    onError: () => toast.error('Nie udało się zapisać notatek'),
  });

  const deleteMut = useMutation({
    mutationFn: async () => { await api.delete(`/packaging/orders/${id}`); },
    onSuccess: () => { toast.success('Zamówienie usunięte'); navigate('/packaging/orders'); },
    onError: () => toast.error('Nie udało się usunąć'),
  });

  if (isLoading) return <><PageHeader title="Szczegóły" back="/packaging/orders" /><LoadingSpinner /></>;

  /* ── Batch detail view: list of customers/orders ── */
  if (batch && batch.orders && batch.orders.length > 0) {
    const pct = batch.orderCount > 0 ? Math.round((batch.packedCount / batch.orderCount) * 100) : 0;

    return (
      <>
        <PageHeader
          title={batch.name || `Batch #${id?.slice(0, 6)}`}
          subtitle={`${batch.orderCount} zamówień · ${batch.courierName || 'Mix'}`}
          back="/packaging/batches"
        />
        <div style={{ padding: '0 24px 24px', maxWidth: 900 }}>
          {/* Batch progress */}
          <div className="page-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ts)' }}>
                {batch.packedCount}/{batch.orderCount} spakowane
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? 'var(--success)' : 'var(--accent)' }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--border)' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: pct === 100 ? 'var(--success)' : 'var(--accent)',
                width: `${pct}%`, transition: 'width 0.4s',
              }} />
            </div>
          </div>

          {/* Order rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {batch.orders.map(o => {
              const st = ORDER_STATUS[o.status] || { label: o.status, color: 'gray' as BadgeColor };
              const isPacked = ['PACKED', 'SHIPPED', 'DELIVERED'].includes(o.status);
              const isExpanded = expandedOrder === o.id;

              return (
                <div key={o.id} className="page-card" style={{
                  padding: 0, overflow: 'hidden',
                  borderLeft: isPacked ? '4px solid var(--success)' : '4px solid transparent',
                }}>
                  {/* Main row */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 20px', cursor: 'pointer', transition: 'background .12s',
                    }}
                    onClick={() => setExpandedOrder(isExpanded ? null : o.id)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Status indicator */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: isPacked ? 'rgba(34,197,94,0.1)' : 'var(--hover-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isPacked ? (
                          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                        ) : (
                          <Package size={18} style={{ color: 'var(--tm)' }} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>
                          {o.addressName || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--tm)' }}>
                          {o.externalOrderId || o.id.slice(0, 8)} · {o.items?.length || 0} poz. · {fmtMoney(o.totalAmount)} zł
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Badge color={st.color}>{st.label}</Badge>
                      {!isPacked && (
                        <Button variant="primary" size="sm" icon={<ChevronRight size={14} />}
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/packaging/packing?order=${o.id}`);
                          }}>
                          Pakuj
                        </Button>
                      )}
                      {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--tm)' }} /> : <ChevronRight size={16} style={{ color: 'var(--tm)' }} />}
                    </div>
                  </div>

                  {/* Expanded: items */}
                  {isExpanded && o.items && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                      {o.items.map(item => (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px 10px 64px',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {item.image ? (
                            <img src={item.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-card, var(--bg))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Package size={14} style={{ color: 'var(--td)' }} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{item.name}</div>
                            {item.sku && <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku}</div>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>x{item.quantity}</span>
                          <span style={{ fontSize: 12, color: 'var(--tm)', minWidth: 70, textAlign: 'right' }}>{fmtMoney(item.unitPrice)} zł</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  /* ── Single order detail view ── */
  if (!order) return (
    <>
      <PageHeader title="Zamówienie" back="/packaging/orders" />
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--tm)' }}>Zamówienie nie zostało znalezione</p>
        <Button variant="secondary" onClick={() => navigate('/packaging/orders')}>Wróć do listy</Button>
      </div>
    </>
  );

  const st = ORDER_STATUS[order.status] || { label: order.status, color: 'gray' as BadgeColor };
  const steps = ['NEW', 'PAID', 'PICKING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const stepLabels = ['Nowe', 'Opłacone', 'Zbieranie', 'Pakowanie', 'Spakowane', 'Wysłane', 'Dostarczone'];
  const currentIdx = steps.indexOf(order.status);
  const progress = currentIdx >= 0 ? ((currentIdx + 1) / steps.length) * 100 : 0;

  return (
    <>
      <PageHeader
        title={`Zamówienie ${order.externalOrderId || order.id.slice(0, 8)}`}
        subtitle={`ID: ${id}`}
        back="/packaging/orders"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {order.packingSessionId && (
              <Button size="sm" variant="secondary" icon={<Play size={14} />}
                onClick={() => navigate(`/packaging/packing?session=${order.packingSessionId}`)}>
                Sesja pakowania
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Copy size={14} />}>Duplikuj</Button>
          </div>
        }
      />
      <div style={{ padding: '0 24px 24px', maxWidth: 1100 }}>
        {/* Status badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <Badge color={st.color}>{st.label}</Badge>
          {order.paymentStatus && <Badge color={order.paymentStatus === 'PAID' ? 'green' : 'yellow'}>{order.paymentStatus}</Badge>}
          {order.courierName && <Badge color="indigo">{order.courierName}</Badge>}
          {order.trackingNumber && <Badge color="purple">Tracking: {order.trackingNumber}</Badge>}
        </div>

        {/* Progress bar */}
        {order.status !== 'CANCELLED' && order.status !== 'RETURNED' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              {stepLabels.map((label, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, color: i <= currentIdx ? 'var(--accent)' : 'var(--td)' }}>{label}</span>
              ))}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--hover-bg)' }}>
              <div style={{ height: '100%', borderRadius: 2, background: 'var(--accent)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Customer info */}
          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <User size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Klient</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)', marginBottom: 4 }}>{order.addressName || '—'}</div>
              {order.addressEmail && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressEmail}</div>}
              {order.addressPhone && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressPhone}</div>}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <MapPin size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Adres dostawy</span>
              </div>
              {order.addressStreet && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressStreet}</div>}
              {(order.addressZip || order.addressCity) && (
                <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressZip} {order.addressCity}</div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Truck size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dostawa</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--tm)' }}>Kurier</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{order.courierName || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--tm)' }}>Metoda</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{order.deliveryMethod || '—'}</span>
              </div>
              {order.trackingNumber && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--tm)' }}>Tracking</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)', fontFamily: 'monospace' }}>{order.trackingNumber}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Dates & notes */}
          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Calendar size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Daty</span>
              </div>
              {[
                { label: 'Utworzono', value: fmtDateTime(order.createdAt) },
                order.paidAt && { label: 'Opłacono', value: fmtDateTime(order.paidAt) },
                order.packedAt && { label: 'Spakowano', value: fmtDateTime(order.packedAt) },
                order.shippedAt && { label: 'Wysłano', value: fmtDateTime(order.shippedAt) },
                order.deliveredAt && { label: 'Dostarczono', value: fmtDateTime(order.deliveredAt) },
              ].filter(Boolean).map((row: any) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--tm)' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{row.value}</span>
                </div>
              ))}

              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <MessageSquare size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notatki wewnętrzne</span>
              </div>
              {editingNotes ? (
                <div>
                  <textarea value={notesText}
                    onChange={e => setNotesText(e.target.value)}
                    style={{
                      width: '100%', minHeight: 80, padding: 10, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--hover-bg)',
                      color: 'var(--t)', fontSize: 13, resize: 'vertical', outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    placeholder="Wpisz notatki wewnętrzne..." />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button size="sm" variant="primary" loading={notesMut.isPending}
                      onClick={() => notesMut.mutate(notesText)}>Zapisz</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingNotes(false)}>Anuluj</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, margin: '0 0 8px' }}>
                    {order.internalNotes || order.notes || 'Brak notatek'}
                  </p>
                  <Button size="sm" variant="ghost" icon={<Edit3 size={12} />}
                    onClick={() => { setNotesText(order.internalNotes || order.notes || ''); setEditingNotes(true); }}>
                    Edytuj
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Items */}
        <Card title="Pozycje zamówienia" noPadding>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['', 'Nazwa', 'SKU', 'Ilość', 'Cena', 'Wartość'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                      textAlign: ['Ilość', 'Cena', 'Wartość'].includes(h) ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', width: 40 }}>
                      {item.image ? (
                        <img src={item.image} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={14} style={{ color: 'var(--td)' }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{item.quantity} szt</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtMoney(item.unitPrice)} zł</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>{fmtMoney(item.quantity * Number(item.unitPrice))} zł</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--hover-bg)' }}>
                  <td colSpan={5} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--t)', textAlign: 'right' }}>Razem:</td>
                  <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, color: 'var(--accent)', textAlign: 'right' }}>{fmtMoney(order.totalAmount)} zł</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Status history */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Card title="Historia statusów" noPadding>
              <div style={{ padding: '12px 20px' }}>
                {order.statusHistory.map((h, i) => {
                  const hs = ORDER_STATUS[h.status] || { label: h.status, color: 'gray' as BadgeColor };
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < order.statusHistory!.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: i === 0 ? 'var(--accent)' : 'var(--border)',
                      }} />
                      <Badge color={hs.color}>{hs.label}</Badge>
                      <span style={{ fontSize: 12, color: 'var(--tm)' }}>{fmtDateTime(h.changedAt)}</span>
                      {h.changedBy && <span style={{ fontSize: 11, color: 'var(--td)' }}>przez {h.changedBy}</span>}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 20 }}>
          <Card noPadding>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {order.status === 'NEW' && (
                <Button size="sm" variant="secondary" loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'PAID' })}>Oznacz jako opłacone</Button>
              )}
              {order.status === 'PAID' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'PICKING' })}>Rozpocznij zbieranie</Button>
              )}
              {(order.status === 'PICKING' || order.status === 'PICKED') && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'PACKING' })}>Rozpocznij pakowanie</Button>
              )}
              {order.status === 'PACKING' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'PACKED' })}>Oznacz jako spakowane</Button>
              )}
              {order.status === 'PACKED' && (
                <Button size="sm" variant="secondary" icon={<Truck size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'SHIPPED' })}>Oznacz jako wysłane</Button>
              )}
              {order.status === 'SHIPPED' && (
                <Button size="sm" variant="secondary" icon={<Truck size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate({ orderId: order.id, newStatus: 'DELIVERED' })}>Oznacz jako dostarczone</Button>
              )}
              {!['CANCELLED', 'DELIVERED', 'RETURNED'].includes(order.status) && (
                <Button size="sm" variant="ghost" loading={statusMut.isPending}
                  onClick={() => { if (confirm('Anulować zamówienie?')) statusMut.mutate({ orderId: order.id, newStatus: 'CANCELLED' }); }}>Anuluj zamówienie</Button>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />} loading={deleteMut.isPending}
                  onClick={() => { if (confirm('Usunąć zamówienie?')) deleteMut.mutate(); }}>Usuń</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export default ShipmentDetailPage;

/**
 * IDS 1.0 — PakOps Order/Shipment Detail (Full)
 * Connected to: GET /api/packaging/orders/:id
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Package, User, Truck, Calendar, Copy, Trash2, MapPin, Edit3, Clock, MessageSquare, Play } from 'lucide-react';
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
  items: {
    id: string; name: string; sku?: string; quantity: number;
    unitPrice: number | string; image?: string;
  }[];
  statusHistory?: { status: string; changedAt: string; changedBy?: string }[];
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--tm)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <Icon size={14} style={{ color: 'var(--accent)' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}

export function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['packaging', 'order', id],
    queryFn: async () => { const { data } = await api.get(`/packaging/orders/${id}`); return data; },
    enabled: !!id,
  });

  const statusMut = useMutation({
    mutationFn: async (newStatus: string) => {
      await api.put(`/packaging/orders/${id}`, { status: newStatus });
    },
    onSuccess: () => {
      toast.success('Status zmieniony');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'order', id] });
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

  if (isLoading) return <><PageHeader title="Zamówienie" back="/packaging/orders" /><LoadingSpinner /></>;

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

  // Progress
  const steps = ['NEW', 'PAID', 'PICKING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'];
  const stepLabels = ['Nowe', 'Opłacone', 'Zbieranie', 'Pakowanie', 'Spakowane', 'Wysłane', 'Dostarczone'];
  const currentIdx = steps.indexOf(order.status);
  const progress = currentIdx >= 0 ? ((currentIdx + 1) / steps.length) * 100 : 0;

  const itemsTotal = order.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);

  return (
    <>
      <PageHeader
        title={`Zamówienie ${order.externalOrderId || order.id.slice(0, 8)}`}
        subtitle={`ID: ${id}`}
        back="/packaging/orders"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {order.packingSessionId && (
              <Link to={`/packaging/packing?session=${order.packingSessionId}`} style={{ textDecoration: 'none' }}>
                <Button size="sm" variant="secondary" icon={<Play size={14} />}>Sesja pakowania</Button>
              </Link>
            )}
            <Button size="sm" variant="secondary" icon={<Copy size={14} />}>Duplikuj</Button>
          </div>
        }
      />
      <div style={{ padding: '0 24px 24px', maxWidth: 1100 }}>
        {/* Status badge */}
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
              <SectionLabel icon={User} label="Klient" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)', marginBottom: 4 }}>{order.addressName || '—'}</div>
              {order.addressEmail && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressEmail}</div>}
              {order.addressPhone && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressPhone}</div>}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <SectionLabel icon={MapPin} label="Adres dostawy" />
              {order.addressStreet && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressStreet}</div>}
              {(order.addressZip || order.addressCity) && (
                <div style={{ fontSize: 13, color: 'var(--ts)' }}>{order.addressZip} {order.addressCity}</div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <SectionLabel icon={Truck} label="Dostawa" />
              <InfoRow label="Kurier" value={order.courierName || '—'} />
              <InfoRow label="Metoda" value={order.deliveryMethod || '—'} />
              {order.trackingNumber && <InfoRow label="Tracking" value={<span style={{ fontFamily: 'monospace' }}>{order.trackingNumber}</span>} />}
            </div>
          </Card>

          {/* Dates & notes */}
          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <SectionLabel icon={Calendar} label="Daty" />
              <InfoRow label="Utworzono" value={fmtDateTime(order.createdAt)} />
              {order.paidAt && <InfoRow label="Opłacono" value={fmtDateTime(order.paidAt)} />}
              {order.packedAt && <InfoRow label="Spakowano" value={fmtDateTime(order.packedAt)} />}
              {order.shippedAt && <InfoRow label="Wysłano" value={fmtDateTime(order.shippedAt)} />}
              {order.deliveredAt && <InfoRow label="Dostarczono" value={fmtDateTime(order.deliveredAt)} />}

              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <SectionLabel icon={MessageSquare} label="Notatki wewnętrzne" />
              {editingNotes ? (
                <div>
                  <textarea value={notesText}
                    onChange={e => setNotesText(e.target.value)}
                    style={{
                      width: '100%', minHeight: 80, padding: 10, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--hover-bg)',
                      color: 'var(--t)', fontSize: 13, resize: 'vertical', outline: 'none',
                    }} />
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
                  onClick={() => statusMut.mutate('PAID')}>Oznacz jako opłacone</Button>
              )}
              {order.status === 'PAID' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('PICKING')}>Rozpocznij zbieranie</Button>
              )}
              {(order.status === 'PICKING' || order.status === 'PICKED') && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('PACKING')}>Rozpocznij pakowanie</Button>
              )}
              {order.status === 'PACKING' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('PACKED')}>Oznacz jako spakowane</Button>
              )}
              {order.status === 'PACKED' && (
                <Button size="sm" variant="secondary" icon={<Truck size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('SHIPPED')}>Oznacz jako wysłane</Button>
              )}
              {order.status === 'SHIPPED' && (
                <Button size="sm" variant="secondary" icon={<Truck size={14} />} loading={statusMut.isPending}
                  onClick={() => statusMut.mutate('DELIVERED')}>Oznacz jako dostarczone</Button>
              )}
              {!['CANCELLED', 'DELIVERED', 'RETURNED'].includes(order.status) && (
                <Button size="sm" variant="ghost" loading={statusMut.isPending}
                  onClick={() => { if (confirm('Anulować zamówienie?')) statusMut.mutate('CANCELLED'); }}>Anuluj zamówienie</Button>
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

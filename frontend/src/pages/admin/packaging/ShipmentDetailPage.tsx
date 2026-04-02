/**
 * IDS 1.0 — Shipment Detail (ModuleDetailTemplate)
 * Connected to: GET /api/packaging/shipments/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, User, Truck, Calendar, Copy, Trash2, Printer, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { STATUS_MAP, COURIER_MAP } from './constants';
import { fmtWeight, fmtDateTime } from './utils';
import type { Shipment } from './types';

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
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/packaging/shipments/${id}`);
      setShipment(data);
    } catch {
      toast.error('Nie udało się pobrać przesyłki');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirm('Czy na pewno chcesz usunąć tę przesyłkę?')) return;
    try {
      await api.delete(`/packaging/shipments/${id}`);
      toast.success('Przesyłka usunięta');
      navigate('/packaging/shipments');
    } catch {
      toast.error('Nie udało się usunąć');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.put(`/packaging/shipments/${id}`, { status: newStatus });
      toast.success('Status zmieniony');
      load();
    } catch {
      toast.error('Nie udało się zmienić statusu');
    }
  };

  if (loading) return <><PageHeader title="Przesyłka" back="/packaging/shipments" /><LoadingSpinner /></>;

  if (!shipment) return (
    <>
      <PageHeader title="Przesyłka" back="/packaging/shipments" />
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--tm)' }}>Przesyłka nie została znaleziona</p>
        <Button variant="secondary" onClick={() => navigate('/packaging/shipments')}>Wróć do listy</Button>
      </div>
    </>
  );

  const sb = STATUS_MAP[shipment.status] || STATUS_MAP.pending;
  const cr = COURIER_MAP[shipment.courier] || { label: shipment.courier, color: 'gray' as const };

  return (
    <>
      <PageHeader title={`Przesyłka ${shipment.orderNumber}`} subtitle={`ID: ${id}`} back="/packaging/shipments"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" icon={<Printer size={14} />}>Etykieta</Button>
            <Button size="sm" variant="secondary" icon={<Copy size={14} />}>Duplikuj</Button>
          </div>
        }
      />
      <div style={{ padding: '0 24px 24px', maxWidth: 1100 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Badge color={sb.color}>{sb.label}</Badge>
          <Badge color={cr.color}>{cr.label}</Badge>
          {shipment.trackingNumber && <Badge color="indigo">Tracking: {shipment.trackingNumber}</Badge>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <SectionLabel icon={User} label="Klient" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)', marginBottom: 4 }}>{shipment.clientName}</div>
              {shipment.clientEmail && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{shipment.clientEmail}</div>}
              {shipment.clientPhone && <div style={{ fontSize: 13, color: 'var(--ts)' }}>{shipment.clientPhone}</div>}
              <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              <SectionLabel icon={Truck} label="Dostawa" />
              <InfoRow label="Kurier" value={cr.label} />
              {shipment.trackingNumber && <InfoRow label="Tracking" value={<span style={{ fontFamily: 'monospace' }}>{shipment.trackingNumber}</span>} />}
              <InfoRow label="Waga" value={fmtWeight(shipment.totalWeight)} />
            </div>
          </Card>

          <Card noPadding>
            <div style={{ padding: '20px 24px' }}>
              <SectionLabel icon={Calendar} label="Daty" />
              <InfoRow label="Utworzono" value={fmtDateTime(shipment.createdAt)} />
              {shipment.packedAt && <InfoRow label="Spakowano" value={fmtDateTime(shipment.packedAt)} />}
              {shipment.shippedAt && <InfoRow label="Wysłano" value={fmtDateTime(shipment.shippedAt)} />}
              {shipment.notes && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
                  <SectionLabel icon={MapPin} label="Notatki" />
                  <p style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, margin: 0 }}>{shipment.notes}</p>
                </>
              )}
            </div>
          </Card>
        </div>

        <Card title="Pozycje przesyłki" noPadding>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Nazwa', 'SKU', 'Ilość', 'Waga'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)', textAlign: ['Ilość', 'Waga'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shipment.items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--tm)', fontFamily: 'monospace' }}>{item.sku || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{item.quantity} szt</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{fmtWeight(item.weight * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <Card noPadding>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<Printer size={14} />}>Drukuj etykietę</Button>
              {shipment.status === 'pending' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} onClick={() => handleStatusChange('PACKING')}>Rozpocznij pakowanie</Button>
              )}
              {shipment.status === 'packing' && (
                <Button size="sm" variant="secondary" icon={<Package size={14} />} onClick={() => handleStatusChange('PACKED')}>Oznacz jako spakowane</Button>
              )}
              {shipment.status === 'packed' && (
                <Button size="sm" variant="secondary" icon={<Truck size={14} />} onClick={() => handleStatusChange('SHIPPED')}>Oznacz jako wysłane</Button>
              )}
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={handleDelete}>Usuń</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

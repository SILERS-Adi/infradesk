/**
 * IDS 1.0 — Edit Shipment (ModuleFormTemplate)
 * Loads from GET /api/packaging/orders/:id
 * Saves via PUT /api/packaging/orders/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { COURIER_OPTIONS } from './constants';
import { fmtWeight } from './utils';

interface LineItem { name: string; sku: string; quantity: number; weight: number; }
const EMPTY_ITEM: LineItem = { name: '', sku: '', quantity: 1, weight: 0 };

export function ShipmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');

  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [courier, setCourier] = useState('inpost');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  const loadShipment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/packaging/orders/${id}`);
      setTitle(data.orderNumber || '');
      setOrderNumber(data.orderNumber || '');
      setCustomerName(data.clientName || '');
      setCustomerEmail(data.clientEmail || '');
      setCustomerPhone(data.clientPhone || '');
      setCourier(data.courier || 'inpost');
      setTrackingNumber(data.trackingNumber || '');
      setNotes(data.notes || '');
      if (data.items?.length > 0) {
        setItems(data.items.map((it: any) => ({
          name: it.name || '', sku: it.sku || '', quantity: it.quantity || 1, weight: it.weight || 0,
        })));
      }
    } catch {
      toast.error('Nie udało się pobrać przesyłki');
      navigate('/packaging/shipments');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { loadShipment(); }, [loadShipment]);

  const totalWeight = items.reduce((s, i) => s + i.weight * i.quantity, 0);

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }
  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) { if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== idx)); }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!orderNumber.trim()) e.orderNumber = 'Numer zamówienia jest wymagany';
    if (!customerName.trim()) e.customerName = 'Nazwa klienta jest wymagana';
    if (items.every(i => !i.name.trim())) e.items = 'Dodaj przynajmniej jedną pozycję';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.put(`/packaging/orders/${id}`, {
        orderNumber: orderNumber.trim(),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        courier,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.filter(i => i.name.trim()).map(i => ({
          name: i.name.trim(), sku: i.sku.trim() || undefined, quantity: i.quantity, weight: i.weight,
        })),
      });
      toast.success('Przesyłka zaktualizowana');
      navigate(`/packaging/orders/${id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udało się zapisać przesyłki');
    } finally { setSaving(false); }
  }

  if (loading) return <><PageHeader title="Edytuj przesyłkę" back="/packaging/shipments" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title={`Edytuj ${title}`} subtitle="Zmień dane przesyłki" back={`/packaging/orders/${id}`} />
      <div style={{ padding: '0 24px 120px', maxWidth: 920, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert>
          </div>
        )}

        <Card title="Dane zamówienia">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Numer zamówienia" value={orderNumber}
              onChange={e => { setOrderNumber(e.target.value); setErrors(p => { const { orderNumber: _, ...r } = p; return r; }); }} error={errors.orderNumber} />
            <Select label="Kurier" options={COURIER_OPTIONS} value={courier} onChange={e => setCourier(e.target.value)} />
            <Input label="Numer tracking" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <Card title="Klient">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <Input label="Nazwa klienta" value={customerName}
                onChange={e => { setCustomerName(e.target.value); setErrors(p => { const { customerName: _, ...r } = p; return r; }); }} error={errors.customerName} />
              <Input label="Email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              <Input label="Telefon" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Pozycje" noPadding>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Nazwa', 'SKU', 'Ilość', 'Waga (g)', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)', textAlign: ['Ilość', 'Waga (g)'].includes(h) ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', minWidth: 200 }}>
                        <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Nazwa produktu"
                          style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 120 }}>
                        <input value={item.sku} onChange={e => updateItem(idx, 'sku', e.target.value)} placeholder="SKU"
                          style={{ width: '100%', padding: '8px 6px', fontSize: 12, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', fontFamily: 'monospace' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 80 }}>
                        <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 100 }}>
                        <input type="number" min={0} value={item.weight} onChange={e => updateItem(idx, 'weight', parseInt(e.target.value) || 0)}
                          style={{ width: '100%', padding: '8px 6px', fontSize: 13, borderRadius: 'var(--rs)', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 6px', width: 40 }}>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4, display: 'flex' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--tm)'; }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <button onClick={addItem} type="button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-g)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                <Plus size={14} /> Dodaj pozycję
              </button>
              <span style={{ fontSize: 13, color: 'var(--tm)' }}>Waga: <strong style={{ color: 'var(--t)' }}>{fmtWeight(totalWeight)}</strong></span>
            </div>
            {errors.items && <div style={{ padding: '0 16px 12px' }}><p style={{ fontSize: 11, color: '#F87171' }}>{errors.items}</p></div>}
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Uwagi">
            <Textarea label="Notatki" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate(`/packaging/orders/${id}`)} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>Zapisz zmiany</Button>
      </div>
    </>
  );
}

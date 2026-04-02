/**
 * IDS 1.0 — Product Form (New + Edit)
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
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

const UNIT_OPTIONS = [
  { value: 'szt', label: 'szt (sztuka)' },
  { value: 'godz', label: 'godz (godzina)' },
  { value: 'mies', label: 'mies (miesiac)' },
  { value: 'kpl', label: 'kpl (komplet)' },
  { value: 'mb', label: 'mb (metr biezacy)' },
  { value: 'kg', label: 'kg (kilogram)' },
  { value: 'usl', label: 'usl (usluga)' },
];

const VAT_OPTIONS = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw.' },
];

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('szt');
  const [priceNet, setPriceNet] = useState('');
  const [vatRate, setVatRate] = useState('23');
  const [notes, setNotes] = useState('');

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/products/${id}`);
      setName(data.name || '');
      setSku(data.sku || '');
      setUnit(data.unit || 'szt');
      setPriceNet(String(Number(data.priceNet) || ''));
      setVatRate(data.vatRate || '23');
      setNotes(data.notes || '');
    } catch {
      toast.error('Nie udalo sie pobrac produktu');
      navigate('/invoicing/products');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nazwa jest wymagana';
    if (priceNet && isNaN(Number(priceNet))) e.priceNet = 'Cena musi byc liczba';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit,
        priceNet: parseFloat(priceNet) || 0,
        vatRate,
        notes: notes.trim() || undefined,
      };
      if (isEdit) {
        await api.put(`/invoicing/products/${id}`, payload);
        toast.success('Produkt zaktualizowany');
      } else {
        await api.post('/invoicing/products', payload);
        toast.success('Produkt dodany');
      }
      navigate('/invoicing/products');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udalo sie zapisac');
    } finally { setSaving(false); }
  }

  if (loading) return <><PageHeader title={isEdit ? 'Edytuj produkt' : 'Nowy produkt'} back="/invoicing/products" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title={isEdit ? `Edytuj: ${name}` : 'Nowy produkt'} subtitle={isEdit ? 'Zmien dane produktu' : 'Dodaj nowy produkt lub usluge'} back="/invoicing/products" />
      <div style={{ padding: '0 24px 120px', maxWidth: 720, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}><Alert type="error" title="Popraw bledy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert></div>
        )}
        <Card title="Dane produktu">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Input label="Nazwa" placeholder="np. Usluga IT — wsparcie techniczne" value={name}
              onChange={e => { setName(e.target.value); setErrors(p => { const { name: _, ...r } = p; return r; }); }} error={errors.name} />
            <Input label="SKU" placeholder="np. SRV-IT-001" value={sku} onChange={e => setSku(e.target.value)} />
          </div>
        </Card>
        <div style={{ marginTop: 20 }}>
          <Card title="Cena i jednostka">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Input label="Cena netto (PLN)" type="number" min="0" step="0.01" placeholder="0.00" value={priceNet}
                onChange={e => setPriceNet(e.target.value)} error={errors.priceNet} />
              <Select label="Stawka VAT" options={VAT_OPTIONS} value={vatRate} onChange={e => setVatRate(e.target.value)} />
              <Select label="Jednostka" options={UNIT_OPTIONS} value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </Card>
        </div>
        <div style={{ marginTop: 20 }}>
          <Card title="Notatki">
            <Textarea label="Uwagi" placeholder="Dodatkowe informacje o produkcie" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/invoicing/products')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>{isEdit ? 'Zapisz zmiany' : 'Dodaj produkt'}</Button>
      </div>
    </>
  );
}

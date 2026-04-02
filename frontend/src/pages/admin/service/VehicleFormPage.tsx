/**
 * IDS 1.0 — Vehicle Form (New + Edit)
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

export function VehicleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [notes, setNotes] = useState('');

  const loadVehicle = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/service/vehicles/${id}`);
      setPlate(data.plate || ''); setVin(data.vin || ''); setBrand(data.brand || ''); setModel(data.model || '');
      setYear(data.year ? String(data.year) : ''); setOwnerName(data.ownerName || '');
      setOwnerPhone(data.ownerPhone || ''); setOwnerEmail(data.ownerEmail || ''); setNotes(data.notes || '');
    } catch { toast.error('Nie udało się pobrać pojazdu'); navigate('/service/vehicles'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { loadVehicle(); }, [loadVehicle]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!plate.trim()) e.plate = 'Numer rejestracyjny jest wymagany';
    if (!brand.trim()) e.brand = 'Marka jest wymagana';
    if (!model.trim()) e.model = 'Model jest wymagany';
    if (!ownerName.trim()) e.ownerName = 'Właściciel jest wymagany';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { plate: plate.trim().toUpperCase(), vin: vin.trim() || undefined, brand: brand.trim(), model: model.trim(), year: year ? parseInt(year) : undefined, ownerName: ownerName.trim(), ownerPhone: ownerPhone.trim() || undefined, ownerEmail: ownerEmail.trim() || undefined, notes: notes.trim() || undefined };
      if (isEdit) { await api.put(`/service/vehicles/${id}`, payload); toast.success('Pojazd zaktualizowany'); }
      else { await api.post('/service/vehicles', payload); toast.success('Pojazd dodany'); }
      navigate('/service/vehicles');
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Nie udało się zapisać'); }
    finally { setSaving(false); }
  }

  if (loading) return <><PageHeader title={isEdit ? 'Edytuj pojazd' : 'Nowy pojazd'} back="/service/vehicles" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader title={isEdit ? `Edytuj: ${plate}` : 'Nowy pojazd'} subtitle={isEdit ? 'Zmień dane pojazdu' : 'Dodaj nowy pojazd do bazy'} back="/service/vehicles" />
      <div style={{ padding: '0 24px 120px', maxWidth: 720, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && <div style={{ marginBottom: 20 }}><Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert></div>}
        <Card title="Dane pojazdu">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Input label="Rejestracja" placeholder="np. WGR 12345" value={plate} onChange={e => { setPlate(e.target.value); setErrors(p => { const { plate: _, ...r } = p; return r; }); }} error={errors.plate} />
            <Input label="Marka" placeholder="np. Toyota" value={brand} onChange={e => { setBrand(e.target.value); setErrors(p => { const { brand: _, ...r } = p; return r; }); }} error={errors.brand} />
            <Input label="Model" placeholder="np. Corolla" value={model} onChange={e => { setModel(e.target.value); setErrors(p => { const { model: _, ...r } = p; return r; }); }} error={errors.model} />
            <Input label="Rok produkcji" type="number" placeholder="np. 2020" value={year} onChange={e => setYear(e.target.value)} />
            <Input label="VIN" placeholder="np. WVWZZZ3CZ..." value={vin} onChange={e => setVin(e.target.value)} style={{ gridColumn: 'span 2' }} />
          </div>
        </Card>
        <div style={{ marginTop: 20 }}>
          <Card title="Właściciel">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
              <Input label="Imię i nazwisko" value={ownerName} onChange={e => { setOwnerName(e.target.value); setErrors(p => { const { ownerName: _, ...r } = p; return r; }); }} error={errors.ownerName} />
              <Input label="Telefon" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} />
              <Input label="Email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
            </div>
          </Card>
        </div>
        <div style={{ marginTop: 20 }}>
          <Card title="Notatki"><Textarea label="Uwagi" value={notes} onChange={e => setNotes(e.target.value)} /></Card>
        </div>
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/service/vehicles')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>{isEdit ? 'Zapisz zmiany' : 'Dodaj pojazd'}</Button>
      </div>
    </>
  );
}

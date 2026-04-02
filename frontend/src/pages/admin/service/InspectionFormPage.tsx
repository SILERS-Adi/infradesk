/**
 * IDS 1.0 — Inspection Form (New + Edit)
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
import { TYPE_OPTIONS, RESULT_OPTIONS } from './constants';
import type { Vehicle } from './types';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function InspectionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [vehicleId, setVehicleId] = useState('');
  const [inspectionNumber, setInspectionNumber] = useState('');
  const [type, setType] = useState('PERIODIC');
  const [scheduledAt, setScheduledAt] = useState(todayStr());
  const [technicianName, setTechnicianName] = useState('');
  const [mileage, setMileage] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.get('/service/vehicles', { params: { per_page: '200' } }).then(r => setVehicles(r.data.items || [])).catch(() => {});
  }, []);

  const loadInspection = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/service/inspections/${id}`);
      setVehicleId(data.vehicleId || ''); setInspectionNumber(data.inspectionNumber || '');
      setType(data.type || 'PERIODIC'); setScheduledAt(data.scheduledAt?.slice(0, 10) || todayStr());
      setTechnicianName(data.technicianName || ''); setMileage(data.mileage ? String(data.mileage) : '');
      setResult(data.result || ''); setNotes(data.notes || '');
    } catch { toast.error('Nie udało się pobrać przeglądu'); navigate('/service/inspections'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { loadInspection(); }, [loadInspection]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!vehicleId) e.vehicleId = 'Wybierz pojazd';
    if (!inspectionNumber.trim()) e.inspectionNumber = 'Numer przeglądu jest wymagany';
    if (!scheduledAt) e.scheduledAt = 'Data jest wymagana';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        vehicleId, inspectionNumber: inspectionNumber.trim(), type, scheduledAt,
        technicianName: technicianName.trim() || undefined, mileage: mileage ? parseInt(mileage) : undefined,
        result: result || undefined, notes: notes.trim() || undefined,
        ...(result ? { status: 'COMPLETED', completedAt: new Date().toISOString() } : {}),
      };
      if (isEdit) { await api.put(`/service/inspections/${id}`, payload); toast.success('Przegląd zaktualizowany'); }
      else { await api.post('/service/inspections', payload); toast.success('Przegląd dodany'); }
      navigate('/service/inspections');
    } catch (err: any) { toast.error(err?.response?.data?.error || 'Nie udało się zapisać'); }
    finally { setSaving(false); }
  }

  if (loading) return <><PageHeader title={isEdit ? 'Edytuj przegląd' : 'Nowy przegląd'} back="/service/inspections" /><LoadingSpinner /></>;

  const vehicleOptions = vehicles.map(v => ({ value: v.id, label: `${v.plate} — ${v.brand} ${v.model} (${v.ownerName})` }));

  return (
    <>
      <PageHeader title={isEdit ? `Edytuj: ${inspectionNumber}` : 'Nowy przegląd'} subtitle={isEdit ? 'Zmień dane przeglądu' : 'Zaplanuj nowy przegląd pojazdu'} back="/service/inspections" />
      <div style={{ padding: '0 24px 120px', maxWidth: 720, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && <div style={{ marginBottom: 20 }}><Alert type="error" title="Popraw błędy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert></div>}
        <Card title="Dane przeglądu">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Select label="Pojazd" options={vehicleOptions} value={vehicleId} onChange={e => { setVehicleId(e.target.value); setErrors(p => { const { vehicleId: _, ...r } = p; return r; }); }} placeholder="Wybierz pojazd..." error={errors.vehicleId} />
            </div>
            <Input label="Numer przeglądu" placeholder="np. SKP/2026/0001" value={inspectionNumber} onChange={e => { setInspectionNumber(e.target.value); setErrors(p => { const { inspectionNumber: _, ...r } = p; return r; }); }} error={errors.inspectionNumber} />
            <Select label="Typ przeglądu" options={TYPE_OPTIONS} value={type} onChange={e => setType(e.target.value)} />
            <Input label="Data przeglądu" type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} error={errors.scheduledAt} />
            <Input label="Technik / Diagnosta" placeholder="np. Adam Mechanik" value={technicianName} onChange={e => setTechnicianName(e.target.value)} />
            <Input label="Przebieg (km)" type="number" placeholder="np. 85000" value={mileage} onChange={e => setMileage(e.target.value)} />
            <Select label="Wynik" options={RESULT_OPTIONS} value={result} onChange={e => setResult(e.target.value)} />
          </div>
        </Card>
        <div style={{ marginTop: 20 }}>
          <Card title="Notatki"><Textarea label="Uwagi" placeholder="Dodatkowe informacje o przeglądzie" value={notes} onChange={e => setNotes(e.target.value)} /></Card>
        </div>
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/service/inspections')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>{isEdit ? 'Zapisz zmiany' : 'Dodaj przegląd'}</Button>
      </div>
    </>
  );
}

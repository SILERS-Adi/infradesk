/**
 * IDS 1.0 — Contractor Form (New + Edit)
 * New:  /invoicing/contractors/new
 * Edit: /invoicing/contractors/:id/edit
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

export function ContractorFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const loadContractor = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/invoicing/contractors/${id}`);
      setName(data.name || '');
      setNip(data.nip || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setCity(data.city || '');
      setAddress(data.address || '');
      setNotes(data.notes || '');
    } catch {
      toast.error('Nie udalo sie pobrac kontrahenta');
      navigate('/invoicing/contractors');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadContractor(); }, [loadContractor]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nazwa jest wymagana';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        nip: nip.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (isEdit) {
        await api.put(`/invoicing/contractors/${id}`, payload);
        toast.success('Kontrahent zaktualizowany');
      } else {
        await api.post('/invoicing/contractors', payload);
        toast.success('Kontrahent dodany');
      }
      navigate('/invoicing/contractors');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Nie udalo sie zapisac');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <><PageHeader title={isEdit ? 'Edytuj kontrahenta' : 'Nowy kontrahent'} back="/invoicing/contractors" /><LoadingSpinner /></>;
  }

  return (
    <>
      <PageHeader
        title={isEdit ? `Edytuj: ${name}` : 'Nowy kontrahent'}
        subtitle={isEdit ? 'Zmien dane kontrahenta' : 'Dodaj nowego klienta lub dostawce'}
        back="/invoicing/contractors"
      />
      <div style={{ padding: '0 24px 120px', maxWidth: 720, margin: '0 auto' }}>
        {Object.keys(errors).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <Alert type="error" title="Popraw bledy">{Object.values(errors).map((e, i) => <div key={i}>• {e}</div>)}</Alert>
          </div>
        )}

        <Card title="Dane podstawowe">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Input label="Nazwa firmy" placeholder="np. Firma XYZ Sp. z o.o." value={name}
              onChange={e => { setName(e.target.value); setErrors(p => { const { name: _, ...r } = p; return r; }); }} error={errors.name} />
            <Input label="NIP" placeholder="np. 1234567890" value={nip} onChange={e => setNip(e.target.value)} />
          </div>
        </Card>

        <div style={{ marginTop: 20 }}>
          <Card title="Kontakt">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Email" placeholder="biuro@firma.pl" value={email} onChange={e => setEmail(e.target.value)} />
              <Input label="Telefon" placeholder="+48 22 100 2000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Adres">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Miasto" placeholder="np. Warszawa" value={city} onChange={e => setCity(e.target.value)} />
              <Input label="Adres" placeholder="np. ul. Testowa 1" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 20 }}>
          <Card title="Notatki">
            <Textarea label="Uwagi" placeholder="Dodatkowe informacje o kontrahencie" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </div>
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--bg2)', borderTop: '1px solid var(--border)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      }}>
        <Button variant="ghost" onClick={() => navigate('/invoicing/contractors')} disabled={saving}>Anuluj</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} loading={saving}>
          {isEdit ? 'Zapisz zmiany' : 'Dodaj kontrahenta'}
        </Button>
      </div>
    </>
  );
}

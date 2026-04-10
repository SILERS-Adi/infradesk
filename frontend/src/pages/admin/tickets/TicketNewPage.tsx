import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Send, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../../api/tickets';
import { locationsApi } from '../../../api/locations';
import { devicesApi } from '../../../api/devices';
import { PageHeader } from '../../../components/ui/PageHeader';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

const TYPES = [
  { value: 'INCIDENT', label: 'Awaria / Incydent' },
  { value: 'REQUEST', label: 'Zlecenie / Prośba' },
  { value: 'MAINTENANCE', label: 'Konserwacja' },
  { value: 'INSTALLATION', label: 'Instalacja' },
  { value: 'OTHER', label: 'Inne' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Niski' },
  { value: 'MEDIUM', label: 'Średni' },
  { value: 'HIGH', label: 'Wysoki' },
  { value: 'CRITICAL', label: 'Krytyczny' },
];

export default function TicketNewPage() {
  const navigate = useNavigate();

  const { data: locations, isLoading: locsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.getAll(),
  });

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'INCIDENT',
    priority: 'MEDIUM',
    locationId: '',
    deviceId: '',
  });

  const createMut = useMutation({
    mutationFn: (data: any) => ticketsApi.create(data),
    onSuccess: (ticket) => {
      toast.success(`Zgłoszenie ${ticket.ticketNumber} utworzone`);
      navigate('/tickets');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Błąd tworzenia zgłoszenia');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Tytuł jest wymagany'); return; }
    if (!form.description.trim()) { toast.error('Opis jest wymagany'); return; }

    createMut.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      priority: form.priority,
      locationId: form.locationId || undefined,
      deviceId: form.deviceId || undefined,
      source: 'INTERNAL',
    });
  };

  if (locsLoading) return <LoadingSpinner />;

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="Nowe zgłoszenie" subtitle="Utwórz nowe zgłoszenie serwisowe" back="/tickets" helpKey="portalNewRequest" />

      <form onSubmit={handleSubmit}>
        <div className="page-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Tytuł */}
            <Field label="Temat zgłoszenia" required>
              <input
                className="input"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Krótki opis problemu"
                maxLength={500}
                autoFocus
              />
            </Field>

            {/* Opis */}
            <Field label="Opis" required>
              <textarea
                className="input"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Opisz szczegółowo problem, co się dzieje i kiedy..."
                rows={5}
                style={{ resize: 'vertical' }}
              />
            </Field>

            {/* Typ + Priorytet */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Kategoria">
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Priorytet">
                <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            {/* Lokalizacja + Urządzenie */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Lokalizacja">
                <select className="input" value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                  <option value="">— Automatyczna —</option>
                  {(locations ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Urządzenie">
                <select className="input" value={form.deviceId} onChange={e => setForm(f => ({ ...f, deviceId: e.target.value }))}>
                  <option value="">— Brak —</option>
                  {(devices ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('/tickets')}>
            Anuluj
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={createMut.isPending || !form.title.trim() || !form.description.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {createMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Wyślij zgłoszenie
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

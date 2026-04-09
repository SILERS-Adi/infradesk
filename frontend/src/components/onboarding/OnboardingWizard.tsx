import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Monitor, Users, ChevronRight, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  optional?: boolean;
}

const STEPS: OnboardingStep[] = [
  { id: 'company', title: 'Dane firmy', description: 'Uzupełnij podstawowe dane swojej firmy', icon: <Building2 className="h-5 w-5" /> },
  { id: 'location', title: 'Pierwsza lokalizacja', description: 'Dodaj biuro, serwerownię lub oddział', icon: <MapPin className="h-5 w-5" /> },
  { id: 'device', title: 'Pierwsze urządzenie', description: 'Dodaj komputer, serwer lub drukarkę', icon: <Monitor className="h-5 w-5" />, optional: true },
  { id: 'invite', title: 'Zaproś technika', description: 'Dodaj osobę do zespołu IT', icon: <Users className="h-5 w-5" />, optional: true },
];

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [locationId, setLocationId] = useState<string | null>(null);
  const qc = useQueryClient();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) { onComplete(); return; }
    setStep(s => s + 1);
  };

  const skip = () => {
    if (isLast) { onComplete(); return; }
    setStep(s => s + 1);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 520, borderRadius: 20,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: 'var(--t)', fontSize: 20, fontWeight: 700, margin: 0 }}>Konfiguracja InfraDesk</h2>
            <p style={{ color: 'var(--tm)', fontSize: 13, margin: '4px 0 0' }}>Krok {step + 1} z {STEPS.length}</p>
          </div>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X className="h-5 w-5" style={{ color: 'var(--tm)' }} />
          </button>
        </div>

        {/* Progress */}
        <div style={{ padding: '16px 28px', display: 'flex', gap: 6 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? 'var(--accent, #6D28D9)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '0 28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(109,40,217,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#A78BFA',
            }}>
              {current.icon}
            </div>
            <div>
              <h3 style={{ color: 'var(--t)', fontSize: 16, fontWeight: 600, margin: 0 }}>{current.title}</h3>
              <p style={{ color: 'var(--tm)', fontSize: 13, margin: 0 }}>{current.description}</p>
            </div>
          </div>

          {step === 0 && <CompanyStep onDone={next} />}
          {step === 1 && <LocationStep onDone={(id) => { setLocationId(id); next(); }} />}
          {step === 2 && <DeviceStep locationId={locationId} onDone={next} onSkip={skip} />}
          {step === 3 && <InviteStep onDone={next} onSkip={skip} />}
        </div>
      </div>
    </div>
  );
}

/* ── Step Components ────────────────────────────────────────── */

function CompanyStep({ onDone }: { onDone: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { legalName: '', taxId: '', city: '' } });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.put('/workspaces/onboarding', { organizationType: 'internal_it', ...data }),
    onSuccess: () => { toast.success('Dane zapisane'); onDone(); },
    onError: () => toast.error('Błąd zapisu danych'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StepInput label="Nazwa firmy" {...register('legalName')} placeholder="np. Firma IT Sp. z o.o." />
      <StepInput label="NIP" {...register('taxId')} placeholder="np. 1234567890" />
      <StepInput label="Miasto" {...register('city')} placeholder="np. Warszawa" />
      <StepButton loading={mutation.isPending}>Zapisz i kontynuuj</StepButton>
    </form>
  );
}

function LocationStep({ onDone }: { onDone: (id: string) => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { name: '', type: 'office', city: '' } });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/locations', data),
    onSuccess: (res) => { toast.success('Lokalizacja dodana'); onDone(res.data?.id || res.data?.data?.id || ''); },
    onError: () => toast.error('Błąd dodawania lokalizacji'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StepInput label="Nazwa lokalizacji" {...register('name')} placeholder="np. Biuro główne" required />
      <StepSelect label="Typ" {...register('type')}>
        <option value="office">Biuro</option>
        <option value="server_room">Serwerownia</option>
        <option value="warehouse">Magazyn</option>
        <option value="branch">Oddział</option>
        <option value="other">Inny</option>
      </StepSelect>
      <StepInput label="Miasto" {...register('city')} placeholder="np. Warszawa" />
      <StepButton loading={mutation.isPending}>Dodaj lokalizację</StepButton>
    </form>
  );
}

function DeviceStep({ locationId, onDone, onSkip }: { locationId: string | null; onDone: () => void; onSkip: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { name: '', hostname: '' } });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/devices', { ...data, locationId }),
    onSuccess: () => { toast.success('Urządzenie dodane'); onDone(); },
    onError: () => toast.error('Błąd dodawania urządzenia'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StepInput label="Nazwa urządzenia" {...register('name')} placeholder="np. Serwer-01" required />
      <StepInput label="Hostname" {...register('hostname')} placeholder="np. SRV-DC01" />
      <div style={{ display: 'flex', gap: 8 }}>
        <StepButton loading={mutation.isPending}>Dodaj urządzenie</StepButton>
        <button type="button" onClick={onSkip} style={skipBtnStyle}>Pomiń</button>
      </div>
    </form>
  );
}

function InviteStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { email: '', firstName: '', lastName: '' } });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/users', { ...data, role: 'TECHNICIAN', password: 'Temp1234!' }),
    onSuccess: () => { toast.success('Technik zaproszony'); onDone(); },
    onError: () => toast.error('Błąd zaproszenia'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StepInput label="Email" {...register('email')} placeholder="technik@firma.pl" type="email" required />
      <div style={{ display: 'flex', gap: 8 }}>
        <StepInput label="Imię" {...register('firstName')} placeholder="Jan" style={{ flex: 1 }} />
        <StepInput label="Nazwisko" {...register('lastName')} placeholder="Kowalski" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <StepButton loading={mutation.isPending}>Zaproś technika</StepButton>
        <button type="button" onClick={onSkip} style={skipBtnStyle}>Zakończ</button>
      </div>
    </form>
  );
}

/* ── Shared UI ──────────────────────────────────────────────── */

const StepInput = ({ label, style, ...props }: any) => (
  <div style={style}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 4 }}>{label}</label>
    <input {...props} style={{
      width: '100%', padding: '10px 14px', borderRadius: 10,
      border: '1px solid var(--border)', background: 'var(--bg)',
      color: 'var(--t)', fontSize: 14, outline: 'none',
    }} />
  </div>
);

const StepSelect = ({ label, children, ...props }: any) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 4 }}>{label}</label>
    <select {...props} style={{
      width: '100%', padding: '10px 14px', borderRadius: 10,
      border: '1px solid var(--border)', background: 'var(--bg)',
      color: 'var(--t)', fontSize: 14, outline: 'none',
    }}>{children}</select>
  </div>
);

function StepButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} style={{
      flex: 1, padding: '10px 20px', borderRadius: 10, border: 'none',
      background: 'var(--accent, #6D28D9)', color: '#fff', fontSize: 14, fontWeight: 600,
      cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      {loading ? 'Zapisywanie...' : children}
      {!loading && <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

const skipBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--tm)', fontSize: 14, cursor: 'pointer',
};

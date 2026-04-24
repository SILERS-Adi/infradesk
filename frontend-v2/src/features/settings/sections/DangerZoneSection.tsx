import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SectionCard } from '../SectionCard';

export function DangerZoneSection() {
  return (
    <div className="space-y-[var(--sp-5)]">
      <ExportCard />
      <DeleteAccountCard />
    </div>
  );
}

function ExportCard() {
  const [loading, setLoading] = useState(false);
  async function exportData() {
    setLoading(true);
    try {
      // Endpoint stub — when available the backend should return a ZIP stream.
      await api.post('/users/me/export');
      toast.success('Rozpoczęto eksport — otrzymasz e-mail z linkiem do pobrania.');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 404) {
        toast.error('Funkcja eksportu GDPR w przygotowaniu');
      } else {
        toast.error('Nie udało się uruchomić eksportu');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Eksport moich danych (GDPR)"
      description="Pobierz wszystkie swoje dane: ticketty, komentarze, sesje, pliki."
    >
      <Button
        variant="outline"
        onClick={exportData}
        disabled={loading}
        className="gap-1.5"
      >
        <Download size={14} />
        {loading ? 'Przygotowywanie…' : 'Eksportuj moje dane'}
      </Button>
    </SectionCard>
  );
}

function DeleteAccountCard() {
  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.user?.email);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'idle' | 'ask' | 'final'>('idle');
  const [loading, setLoading] = useState(false);

  async function doDelete() {
    if (confirm !== email) {
      toast.error('Wpisz swój adres e-mail aby potwierdzić');
      return;
    }
    if (!password) {
      toast.error('Podaj hasło');
      return;
    }
    setLoading(true);
    try {
      await api.delete('/users/me', { data: { password } });
      toast.success('Konto oznaczone do usunięcia');
      logout();
      window.location.href = '/login';
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Błąd';
      if (status === 404) {
        toast.error('Funkcja usuwania konta w przygotowaniu');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Usuń konto"
      description="Operacja nieodwracalna. Usunięcie twardego skasuje dane po 30 dniach."
      danger
    >
      <div
        className="p-[var(--sp-3)] rounded-[var(--r-s)] mb-[var(--sp-3)] text-[12px] flex items-start gap-2"
        style={{ background: 'var(--er-l)', border: '1px solid var(--er-b)' }}
      >
        <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--er)' }} />
        <div>
          <div className="font-semibold" style={{ color: 'var(--er)' }}>
            Co zostanie usunięte
          </div>
          <ul className="list-disc ml-4 mt-1 text-[var(--tx2)]">
            <li>Twoje dane osobowe (imię, telefon, avatar)</li>
            <li>Dostęp do wszystkich workspace</li>
            <li>Refresh tokeny, klucze API, integracje Google</li>
          </ul>
          <p className="mt-1 text-[var(--tx3)]">
            Komentarze i przypisane ticketty zostaną w bazie jako anonimowe.
          </p>
        </div>
      </div>

      {step === 'idle' && (
        <Button
          variant="danger"
          onClick={() => setStep('ask')}
          className="gap-1.5"
        >
          <Trash2 size={14} /> Usuń konto
        </Button>
      )}

      {step === 'ask' && (
        <div className="space-y-[var(--sp-3)]">
          <p className="text-[12px] text-[var(--tx2)]">
            Na pewno chcesz usunąć konto? Potwierdź klikając dalej.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setStep('final')} className="gap-1.5">
              <Trash2 size={14} /> Tak, dalej
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {step === 'final' && (
        <div className="space-y-[var(--sp-3)]">
          <div>
            <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">
              Wpisz swój email aby potwierdzić
            </label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={email ?? ''}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">
              Hasło
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={doDelete}
              disabled={loading || confirm !== email || !password}
              className="gap-1.5"
            >
              <Trash2 size={14} /> Usuń konto nieodwracalnie
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')} disabled={loading}>
              Anuluj
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

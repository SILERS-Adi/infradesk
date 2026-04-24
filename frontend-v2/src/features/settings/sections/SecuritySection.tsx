import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound, ShieldCheck, ShieldOff, Copy, LogOut, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SectionCard, Field } from '../SectionCard';

interface MeAuthResponse {
  user: {
    twoFactorEnabled: boolean;
  };
}

export function SecuritySection() {
  return (
    <div className="space-y-[var(--sp-5)]">
      <ChangePasswordCard />
      <TwoFactorCard />
      <SessionsCard />
      <ApiKeysCard />
    </div>
  );
}

/* ============================== Change password ============================== */

function ChangePasswordCard() {
  const logout = useAuthStore((s) => s.logout);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    currentPwd.length > 0 || newPwd.length > 0 || confirmPwd.length > 0;

  async function submit() {
    if (!currentPwd || !newPwd) return;
    if (newPwd.length < 10) {
      toast.error('Nowe hasło musi mieć co najmniej 10 znaków');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('Hasła nie pasują do siebie');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
      toast.success('Hasło zmienione. Zaloguj się ponownie.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      logout();
      window.location.href = '/login';
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Błąd zmiany hasła';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="Zmiana hasła"
      description="Po zmianie zostaniesz wylogowany ze wszystkich urządzeń."
      footer={
        <Button
          onClick={submit}
          disabled={submitting || !dirty}
          className="gap-1.5"
        >
          <KeyRound size={14} />
          {submitting ? 'Zapisywanie…' : 'Zmień hasło'}
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
        <Field label="Obecne hasło" wide>
          <Input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Nowe hasło">
          <Input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Min. 10 znaków"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Powtórz nowe hasło">
          <Input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </SectionCard>
  );
}

/* ================================== 2FA ==================================== */

function TwoFactorCard() {
  const qc = useQueryClient();
  const meQ = useQuery<MeAuthResponse>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get<MeAuthResponse>('/users/me')).data,
  });
  const enabled = meQ.data?.user.twoFactorEnabled ?? false;

  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePwd, setDisablePwd] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const setupMut = useMutation({
    mutationFn: async () =>
      (await api.post<{ secret: string; otpauthUri: string }>('/auth/2fa/setup')).data,
    onSuccess: (data) => setSetup(data),
    onError: () => toast.error('Nie udało się uruchomić 2FA'),
  });

  const confirmMut = useMutation({
    mutationFn: async () =>
      (await api.post<{ backupCodes: string[] }>('/auth/2fa/confirm', { code })).data,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetup(null);
      setCode('');
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      toast.success('2FA włączone');
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Nieprawidłowy kod';
      toast.error(msg);
    },
  });

  const disableMut = useMutation({
    mutationFn: async () =>
      (
        await api.post('/auth/2fa/disable', {
          password: disablePwd,
          code: disableCode,
        })
      ).data,
    onSuccess: () => {
      setDisablePwd('');
      setDisableCode('');
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      toast.success('2FA wyłączone');
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Nie udało się wyłączyć 2FA';
      toast.error(msg);
    },
  });

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success('Skopiowano do schowka');
  }

  return (
    <SectionCard
      title="Dwuetapowa weryfikacja (2FA)"
      description="Dodatkowy kod z aplikacji TOTP (Google Authenticator, 1Password, Authy)."
    >
      <div className="flex items-center justify-between gap-3 mb-[var(--sp-3)]">
        <div className="flex items-center gap-2">
          {enabled ? (
            <Badge variant="success">
              <ShieldCheck size={12} /> Aktywne
            </Badge>
          ) : (
            <Badge variant="neutral">
              <ShieldOff size={12} /> Wyłączone
            </Badge>
          )}
        </div>
      </div>

      {/* Not enabled — "enable" flow */}
      {!enabled && !setup && !backupCodes && (
        <Button
          onClick={() => setupMut.mutate()}
          disabled={setupMut.isPending}
          className="gap-1.5"
        >
          <ShieldCheck size={14} />
          {setupMut.isPending ? 'Generuję…' : 'Włącz 2FA'}
        </Button>
      )}

      {/* Setup step — show secret + ask for code */}
      {!enabled && setup && (
        <div className="space-y-[var(--sp-3)]">
          <div
            className="p-[var(--sp-3)] rounded-[var(--r-s)] text-[12px]"
            style={{ background: 'var(--sf2)', border: '1px solid var(--bd)' }}
          >
            <p className="text-[var(--tx2)] mb-2">
              Zeskanuj kod QR w aplikacji TOTP lub wprowadź klucz ręcznie:
            </p>
            <div className="flex items-start gap-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(setup.otpauthUri)}`}
                alt="QR"
                className="rounded bg-white p-1"
                width={140}
                height={140}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider mb-1">
                  Klucz
                </div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-[12px] break-all">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(setup.secret)}
                    className="p-1 rounded hover:bg-[var(--sf-h)] text-[var(--tx3)]"
                    title="Kopiuj"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <Field label="Kod z aplikacji (6 cyfr)">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={code.length !== 6 || confirmMut.isPending}
              className="gap-1.5"
            >
              <Check size={14} />
              Potwierdź
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {/* Backup codes displayed once after activation */}
      {backupCodes && (
        <div
          className="p-[var(--sp-3)] rounded-[var(--r-s)] space-y-2"
          style={{ background: 'var(--wn-l)', border: '1px solid var(--wn-b)' }}
        >
          <div className="text-[13px] font-semibold" style={{ color: 'var(--wn)' }}>
            Zapisz kody zapasowe
          </div>
          <p className="text-[12px] text-[var(--tx2)]">
            Każdy kod działa tylko raz. Użyj ich gdy stracisz dostęp do aplikacji TOTP.
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[12px]">
            {backupCodes.map((c) => (
              <code
                key={c}
                className="px-2 py-1 rounded"
                style={{ background: 'var(--sf2)' }}
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(backupCodes.join('\n'))}
              className="gap-1.5"
            >
              <Copy size={12} /> Kopiuj wszystkie
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBackupCodes(null)}>
              Schowaj
            </Button>
          </div>
        </div>
      )}

      {/* Enabled — disable flow */}
      {enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
          <Field label="Hasło do konta">
            <Input
              type="password"
              value={disablePwd}
              onChange={(e) => setDisablePwd(e.target.value)}
            />
          </Field>
          <Field label="Kod 2FA (6 cyfr)">
            <Input
              value={disableCode}
              onChange={(e) =>
                setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              inputMode="numeric"
            />
          </Field>
          <div className="md:col-span-2">
            <Button
              variant="danger"
              onClick={() => disableMut.mutate()}
              disabled={
                !disablePwd || disableCode.length !== 6 || disableMut.isPending
              }
              className="gap-1.5"
            >
              <ShieldOff size={14} /> Wyłącz 2FA
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ============================== Active sessions ============================= */

function SessionsCard() {
  const logout = useAuthStore((s) => s.logout);

  async function logoutEverywhere() {
    if (
      !window.confirm(
        'Wylogować ze wszystkich urządzeń? Zostaniesz wylogowany również tutaj.',
      )
    ) {
      return;
    }
    try {
      await api.post('/auth/logout-everywhere');
      toast.success('Wylogowano ze wszystkich sesji');
    } catch {
      // still log out locally
    }
    logout();
    window.location.href = '/login';
  }

  return (
    <SectionCard
      title="Aktywne sesje"
      description="Lista urządzeń zostanie dodana wkrótce. Możesz już teraz wylogować się zdalnie ze wszystkich."
    >
      <div
        className="p-[var(--sp-3)] rounded-[var(--r-s)] text-[12px] text-[var(--tx3)] mb-[var(--sp-3)]"
        style={{ background: 'var(--sf2)', border: '1px dashed var(--bd)' }}
      >
        Funkcja listy sesji jest w przygotowaniu. Na razie dostępny jest przycisk
        „Wyloguj wszędzie" — unieważnia wszystkie refresh tokeny.
      </div>
      <Button variant="outline" onClick={logoutEverywhere} className="gap-1.5">
        <LogOut size={14} /> Wyloguj ze wszystkich urządzeń
      </Button>
    </SectionCard>
  );
}

/* ================================ API keys ================================= */

function ApiKeysCard() {
  return (
    <SectionCard
      title="Klucze API"
      description="Tokeny dla integracji z zewnętrznymi narzędziami."
    >
      <div
        className="p-[var(--sp-3)] rounded-[var(--r-s)] text-[12px] text-[var(--tx3)]"
        style={{ background: 'var(--sf2)', border: '1px dashed var(--bd)' }}
      >
        Funkcja w przygotowaniu. Do czasu uruchomienia użyj webhooków lub klucza
        serwisowego workspace.
      </div>
    </SectionCard>
  );
}

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound, ShieldCheck, ShieldOff, Copy, LogOut, Check, Search, Monitor, X } from 'lucide-react';
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

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function parseUA(ua: string | null): { browser: string; os: string; device: 'Komputer' | 'Mobile' | 'Tablet' | 'Inne' } {
  if (!ua) return { browser: 'Nieznana', os: '—', device: 'Inne' };
  let browser = 'Inna przegl.';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\/(?!.*OPR)/.test(ua)) browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  let os = 'Inny';
  if (/Windows NT 10\.0/.test(ua)) os = 'Windows 10/11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let device: 'Komputer' | 'Mobile' | 'Tablet' | 'Inne' = 'Komputer';
  if (/iPad|Tablet/.test(ua)) device = 'Tablet';
  else if (/Mobile|Android.*Mobile|iPhone/.test(ua)) device = 'Mobile';
  return { browser, os, device };
}

function relativePl(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'przed chwilą';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min temu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} godz. temu`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} d. temu`;
  return new Date(iso).toLocaleDateString('pl');
}

function SessionsManageModal({
  open, onOpenChange, sessions, onRevoke, onLogoutAll, isRevoking,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessions: SessionRow[];
  onRevoke: (id: string) => void;
  onLogoutAll: () => void;
  isRevoking: boolean;
}) {
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState<'all' | 'Komputer' | 'Mobile' | 'Tablet'>('all');

  const enriched = sessions.map((s) => ({ ...s, ua: parseUA(s.userAgent) }));
  const filtered = enriched.filter((s) => {
    if (device !== 'all' && s.ua.device !== device) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${s.ipAddress ?? ''} ${s.userAgent ?? ''} ${s.ua.os} ${s.ua.browser} ${s.ua.device}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: enriched.length,
    Komputer: enriched.filter((s) => s.ua.device === 'Komputer').length,
    Mobile: enriched.filter((s) => s.ua.device === 'Mobile').length,
    Tablet: enriched.filter((s) => s.ua.device === 'Tablet').length,
  };

  const FilterChip = ({ value, label }: { value: typeof device; label: string }) => (
    <button
      type="button"
      onClick={() => setDevice(value)}
      className="px-3 py-1 rounded-full text-[11px] font-medium transition-colors"
      style={{
        background: device === value ? 'var(--pri)' : 'var(--sf-h)',
        color: device === value ? '#fff' : 'var(--tx2)',
        border: `1px solid ${device === value ? 'var(--pri)' : 'var(--bd)'}`,
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>· {counts[value]}</span>
    </button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-2xl -translate-x-1/2 rounded-[var(--r-xl)] max-h-[96vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Monitor size={16} /> Zarządzaj aktywnymi sesjami
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h" aria-label="Zamknij">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 pt-4 pb-3 border-b border-bd shrink-0 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj po IP, OS, przeglądarce, UA..."
                className="w-full pl-9 pr-3 py-2 text-[13px] rounded-[var(--r-s)] outline-none"
                style={{ background: 'var(--sf-h)', border: '1px solid var(--bd)', color: 'var(--tx)' }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip value="all" label="Wszystkie" />
              <FilterChip value="Komputer" label="Komputer" />
              <FilterChip value="Mobile" label="Mobile" />
              <FilterChip value="Tablet" label="Tablet" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
            {filtered.length === 0 ? (
              <div className="text-[12px] text-[var(--tx3)] text-center py-8">
                Nic nie pasuje do filtra.
              </div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-[var(--r-s)]"
                  style={{
                    background: s.isCurrent ? 'var(--ok-l)' : 'var(--sf2)',
                    border: `1px solid ${s.isCurrent ? 'var(--ok-b)' : 'var(--bd)'}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[13px] font-semibold text-[var(--tx)]">
                        {s.ua.device} · {s.ua.os}
                      </span>
                      <span className="text-[11px] text-[var(--tx3)]">{s.ua.browser}</span>
                      {s.isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--ok)', color: '#fff' }}>
                          TA SESJA
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--tx3)]">
                      IP {s.ipAddress ?? '?'} · zalogowano {relativePl(s.createdAt)}
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      variant="ghost"
                      onClick={() => onRevoke(s.id)}
                      disabled={isRevoking}
                      className="shrink-0 gap-1.5"
                    >
                      <LogOut size={12} /> Wyloguj
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-4 border-t border-bd shrink-0 flex items-center justify-between gap-2">
            <div className="text-[11px] text-[var(--tx3)]">
              Pokazano {filtered.length} z {sessions.length} sesji
            </div>
            <Button variant="outline" onClick={onLogoutAll} className="gap-1.5">
              <LogOut size={14} /> Wyloguj wszystkie
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SessionsCard() {
  const logout = useAuthStore((s) => s.logout);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const sessQ = useQuery<{ sessions: SessionRow[] }>({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => (await api.get<{ sessions: SessionRow[] }>('/auth/sessions')).data,
    staleTime: 30_000,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Sesja wylogowana');
      qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: () => toast.error('Nie udało się wylogować sesji'),
  });

  async function logoutEverywhere() {
    if (!window.confirm('Wylogować ze wszystkich urządzeń? Zostaniesz wylogowany również tutaj.')) {
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

  const sessions = sessQ.data?.sessions ?? [];
  const current = sessions.find((s) => s.isCurrent);
  const otherCount = sessions.length - (current ? 1 : 0);
  const currentUa = current ? parseUA(current.userAgent) : null;

  return (
    <>
      <SectionCard
        title="Aktywne sesje"
        description="Urządzenia, na których jesteś zalogowany. Zarządzaj sesjami i wyloguj nieznane."
      >
        {sessQ.isLoading ? (
          <div className="text-[12px] text-[var(--tx3)] mb-[var(--sp-3)]">Ładowanie...</div>
        ) : (
          <div className="flex items-center justify-between gap-[var(--sp-3)] mb-[var(--sp-3)] p-[var(--sp-3)] rounded-[var(--r-s)]"
               style={{ background: 'var(--sf2)', border: '1px solid var(--bd)' }}>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--tx)]">
                {sessions.length} {sessions.length === 1 ? 'aktywna sesja' : (sessions.length < 5 ? 'aktywne sesje' : 'aktywnych sesji')}
                {otherCount > 0 && (
                  <span className="ml-2 text-[11px] font-normal text-[var(--tx3)]">
                    ({otherCount} na innych urządzeniach)
                  </span>
                )}
              </div>
              {currentUa && (
                <div className="text-[11px] text-[var(--tx3)] mt-0.5">
                  Ta sesja: {currentUa.device} · {currentUa.os} · {currentUa.browser}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
            <Monitor size={14} /> Zarządzaj sesjami
          </Button>
          <Button variant="outline" onClick={logoutEverywhere} className="gap-1.5">
            <LogOut size={14} /> Wyloguj wszędzie
          </Button>
        </div>
      </SectionCard>

      <SessionsManageModal
        open={open}
        onOpenChange={setOpen}
        sessions={sessions}
        onRevoke={(id) => revokeMut.mutate(id)}
        onLogoutAll={logoutEverywhere}
        isRevoking={revokeMut.isPending}
      />
    </>
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

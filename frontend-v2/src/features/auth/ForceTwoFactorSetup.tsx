// Modal blokujący aplikację dopóki OWNER nie skonfiguruje 2FA.
// Pokazuje się gdy `user.mustEnable2FA === true`. Po setup → flaga znika i modal zamyka się.

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Loader2, Shield, AlertTriangle, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth';

interface SetupResponse {
  secret: string;
  otpauthUri: string;
}

interface ConfirmResponse {
  backupCodes: string[];
}

export function ForceTwoFactorSetup() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [step, setStep] = useState<'init' | 'qr' | 'verify' | 'backup'>('init');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const setupMut = useMutation({
    mutationFn: async () => (await api.post<SetupResponse>('/auth/2fa/setup')).data,
    onSuccess: async (data) => {
      setSetup(data);
      try {
        const dataUrl = await QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 220 });
        setQrDataUrl(dataUrl);
      } catch {
        // Fallback: jeśli generacja QR padła, user może wpisać secret ręcznie.
      }
      setStep('qr');
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Nie udało się rozpocząć konfiguracji'),
  });

  const confirmMut = useMutation({
    mutationFn: async () => (await api.post<ConfirmResponse>('/auth/2fa/confirm', { code })).data,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      // Aktualizuj store: 2FA włączone, flaga zniknęła
      if (user) {
        setSession({ ...user, twoFactorEnabled: true, mustEnable2FA: false }, accessToken!, workspaceId ?? undefined);
      }
      setStep('backup');
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Nieprawidłowy kod'),
  });

  // Auto-start setup tylko gdy: (a) OWNER faktycznie musi włączyć 2FA, (b) mamy ważny accessToken.
  // user.mustEnable2FA siedzi w localStorage i może być true mimo wygasłej sesji — bez guard
  // na accessToken komponent wali POST /auth/2fa/setup → 401 zaraz przy restore sesji.
  useEffect(() => {
    if (user?.mustEnable2FA && accessToken && step === 'init') setupMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.mustEnable2FA, accessToken]);

  if (!user?.mustEnable2FA) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-2fa-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        className="glass rounded-[var(--r-xl)] p-6 max-w-[440px] w-full"
        style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}
          >
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 id="force-2fa-title" className="text-[16px] font-bold text-tx">
              Wymagane: 2FA dla właściciela
            </h2>
            <p className="text-[11px] text-tx3">Konto OWNER musi mieć włączone 2FA.</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-[var(--r-s)] mb-4" style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-[11px]">
            Konto OWNER ma pełny dostęp do workspace'a. Dla bezpieczeństwa wymuszamy
            uwierzytelnianie dwuskładnikowe (TOTP — Google Authenticator, Authy, 1Password).
          </p>
        </div>

        {step === 'init' && (
          <div className="text-center py-6">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-pri" />
            <p className="text-[12px] text-tx3 mt-2">Generowanie sekretu...</p>
          </div>
        )}

        {step === 'qr' && setup && (
          <div className="space-y-3">
            <div className="rounded-[var(--r-s)] p-3 bg-white flex justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code 2FA" width={180} height={180} />
              ) : (
                <p className="text-[11px] text-tx2 text-center py-8">QR niedostępny — użyj sekretu poniżej ręcznie.</p>
              )}
            </div>
            <p className="text-[11px] text-tx3 text-center">
              Zeskanuj w aplikacji TOTP. Lub wpisz ręcznie sekret:
            </p>
            <div className="flex items-center gap-2 p-2 rounded-[var(--r-s)] bg-sf-h font-mono text-[11px]">
              <span className="flex-1 break-all">{setup.secret}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(setup.secret).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-tx2 hover:text-pri press p-1"
                title="Kopiuj"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <Button onClick={() => setStep('verify')} size="md" className="w-full">
              Mam to — przejdź dalej
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-3">
            <p className="text-[12px] text-tx2">Wpisz 6-cyfrowy kod z aplikacji:</p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full text-center text-[20px] tracking-[0.5em] font-mono py-3 rounded-[var(--r-s)] bg-sf2 border border-bd text-tx focus:outline-none focus:border-pri"
              placeholder="123456"
            />
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={code.length !== 6 || confirmMut.isPending}
              size="md"
              className="w-full"
            >
              {confirmMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Potwierdź'}
            </Button>
          </div>
        )}

        {step === 'backup' && backupCodes && (
          <div className="space-y-3">
            <p className="text-[12px] text-tx font-semibold">2FA aktywne ✓</p>
            <p className="text-[11px] text-tx3">
              Zapisz kody zapasowe — pomagają odzyskać dostęp gdy stracisz telefon.
              Każdy działa <strong>tylko raz</strong>.
            </p>
            <div className="grid grid-cols-2 gap-1 p-3 rounded-[var(--r-s)] bg-sf-h font-mono text-[11px]">
              {backupCodes.map((c) => (
                <div key={c} className="text-tx">{c}</div>
              ))}
            </div>
            <Button
              onClick={() => {
                const blob = new Blob(
                  [`InfraDesk — kody zapasowe 2FA dla ${user?.email}\n\n${backupCodes.join('\n')}\n\nKażdy kod działa raz. Trzymaj w sejfie.`],
                  { type: 'text/plain' },
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `infradesk-2fa-backup-${user?.email}.txt`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              size="md"
              className="w-full"
              variant="ghost"
            >
              Pobierz kody (.txt)
            </Button>
            <Button
              onClick={() => window.location.reload()}
              size="md"
              className="w-full"
            >
              Gotowe — wejdź do panelu
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

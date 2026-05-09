import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import { useMutation } from '@tanstack/react-query';
import { X, Share2, Copy, Check, Loader2, ShieldCheck, Mail, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type ShareResourceType = 'DEVICE' | 'CREDENTIAL' | 'RUSTDESK_LAUNCH';

interface Props {
  open: boolean;
  onClose: () => void;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceLabel?: string;
}

interface CreatedShare {
  shareUrl: string;
  expiresAt: string;
}

const RESOURCE_TITLES: Record<ShareResourceType, { title: string; desc: string }> = {
  DEVICE: {
    title: 'Udostępnij urządzenie partnerowi',
    desc: 'Partner zobaczy hostname, IP, OS, lokalizację oraz wszystkie ID zdalnego dostępu (RustDesk, RDP, AnyDesk).',
  },
  RUSTDESK_LAUNCH: {
    title: 'Udostępnij sesję RustDesk',
    desc: 'Partner zobaczy tylko link do otwarcia połączenia w RustDesk. Bez dostępu do innych danych urządzenia.',
  },
  CREDENTIAL: {
    title: 'Udostępnij hasło partnerowi',
    desc: '⚠️ JEDNORAZOWE odsłonięcie. Po pierwszym wejściu link nie zadziała. Polecane dla wrażliwych haseł.',
  },
};

const HOUR_OPTIONS = [
  { value: 1,    label: '1 godzina' },
  { value: 4,    label: '4 godziny' },
  { value: 24,   label: '24 godziny' },
  { value: 72,   label: '3 dni' },
  { value: 168,  label: '7 dni' },
  { value: 336,  label: '14 dni' },
];

export function PartnerShareDialog({ open, onClose, resourceType, resourceId, resourceLabel }: Props) {
  const meta = RESOURCE_TITLES[resourceType];
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState(24);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: async () => (await api.post<{ share: CreatedShare }>('/partner-shares', {
      resourceType,
      resourceId,
      expiresInHours: hours,
      partnerEmail: partnerEmail.trim() || undefined,
      partnerName: partnerName.trim() || undefined,
      note: note.trim() || undefined,
    })).data.share,
    onSuccess: (s) => {
      setCreated(s);
      toast.success('Link wygenerowany');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Nie udało się wygenerować linku');
    },
  });

  function reset() {
    setPartnerEmail(''); setPartnerName(''); setNote(''); setHours(24); setCreated(null); setCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function copyLink() {
    if (!created) return;
    navigator.clipboard.writeText(created.shareUrl).then(() => {
      setCopied(true);
      toast.success('Link skopiowany');
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error('Nie udało się skopiować'));
  }

  function emailLink() {
    if (!created) return;
    const subj = encodeURIComponent(`InfraDesk: ${resourceLabel ?? 'udostępnione zasoby'}`);
    const body = encodeURIComponent(
      `Cześć,\n\nUdostępniam Ci ${resourceType === 'CREDENTIAL' ? 'hasło' : 'urządzenie'} przez InfraDesk:\n${created.shareUrl}\n\n` +
      `Link wygasa: ${new Date(created.expiresAt).toLocaleString('pl-PL')}\n\n${note ? `Notatka: ${note}\n\n` : ''}— ${partnerName || 'InfraDesk'}`,
    );
    window.location.href = `mailto:${partnerEmail}?subject=${subj}&body=${body}`;
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale max-h-[92vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[15px] font-bold text-tx flex items-center gap-2">
              <Share2 className="h-4 w-4 text-pri" />
              {meta.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
            {!created ? (
              <>
                <p className="text-[12px] text-tx2 leading-relaxed mb-4">{meta.desc}</p>
                {resourceLabel && (
                  <div
                    className="rounded-[var(--r-s)] border p-2 mb-4 text-[12px]"
                    style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
                  >
                    <span className="text-tx3">Zasób: </span>
                    <strong className="text-tx">{resourceLabel}</strong>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-tx3 mb-1">Nazwa partnera</label>
                      <Input
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        placeholder="np. AntyBugs Sp. z o.o."
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-tx3 mb-1">Email partnera</label>
                      <Input
                        type="email"
                        value={partnerEmail}
                        onChange={(e) => setPartnerEmail(e.target.value)}
                        placeholder="kontakt@partner.pl"
                        maxLength={255}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-tx3 mb-1">Notatka (opcjonalna)</label>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="np. Klient Janowski — naprawa drukarki"
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-tx3 mb-1">Ważność linku</label>
                    <select
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-[var(--r-s)] border text-[13px]"
                      style={{ borderColor: 'var(--bd)', background: 'var(--bg)', color: 'var(--tx)' }}
                    >
                      {HOUR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className="rounded-[var(--r-s)] border p-3 mt-4 flex items-start gap-2 text-[11px]"
                  style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
                >
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-tx3" />
                  <div className="text-tx2">
                    Każdy dostęp do linku jest <strong>logowany</strong> (data, IP). Zobaczysz to w sekcji „Udostępnienia partnerom" w panelu.
                    {resourceType === 'CREDENTIAL' && ' Hasło można odsłonić tylko raz.'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  className="rounded-[var(--r-s)] border p-3 mb-4 flex items-start gap-2"
                  style={{ borderColor: 'var(--ok)', background: 'var(--ok-l)' }}
                >
                  <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} />
                  <div className="flex-1 text-[12px] text-tx2">
                    Link wygenerowany. Wygasa <strong>{new Date(created.expiresAt).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>.
                  </div>
                </div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-tx3 mb-1">Link do skopiowania</label>
                <div className="flex gap-2 mb-4">
                  <Input
                    value={created.shareUrl}
                    readOnly
                    className="font-mono text-[11px]"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button onClick={copyLink} variant={copied ? 'outline' : 'primary'}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'OK' : 'Kopiuj'}
                  </Button>
                </div>
                {partnerEmail && (
                  <Button onClick={emailLink} variant="outline" className="w-full mb-3">
                    <Mail className="h-4 w-4" /> Wyślij na {partnerEmail}
                  </Button>
                )}
                <a
                  href={created.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-pri hover:underline press"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Otwórz aby sprawdzić jak widzi to partner
                </a>
              </>
            )}
          </div>

          <div className="px-5 py-3 border-t border-bd flex items-center justify-end gap-2 bg-sf-h shrink-0">
            {!created ? (
              <>
                <Button variant="ghost" onClick={handleClose}>Anuluj</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  Wygeneruj link
                </Button>
              </>
            ) : (
              <Button onClick={handleClose}>Zamknij</Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

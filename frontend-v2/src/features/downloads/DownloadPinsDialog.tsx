import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  X, KeyRound, Plus, Copy, Check, Loader2, Trash2, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

type PinStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

interface OneTimePin {
  id: string;
  pin: string;
  resource: string;
  note: string | null;
  expiresAt: string;
  usedAt: string | null;
  usedFromIp: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: PinStatus;
}

const STATUS_META: Record<PinStatus, { label: string; variant: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  ACTIVE:  { label: 'Aktywny',     variant: 'success' },
  USED:    { label: 'Wykorzystany', variant: 'neutral' },
  EXPIRED: { label: 'Wygasł',       variant: 'warning' },
  REVOKED: { label: 'Odwołany',     variant: 'danger' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function CopyButton({ value, label = 'Kopiuj' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success('Skopiowane do schowka');
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error('Nie udało się skopiować'));
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-[var(--r-xs)] hover:bg-sf-h press"
      style={{ color: copied ? 'var(--ok)' : 'var(--tx3)' }}
      title={label}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Skopiowane' : label}
    </button>
  );
}

export function DownloadPinsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  // ──────────────────────────────────────────────
  // Personal PIN (per-user, reusable)
  // ──────────────────────────────────────────────
  const personalQ = useQuery<{ pin: string | null }>({
    queryKey: ['download-pins', 'me'],
    queryFn: async () => (await api.get('/download-pins/me')).data,
    enabled: open,
  });

  const [personalDraft, setPersonalDraft] = useState<string>('');
  const [personalEditing, setPersonalEditing] = useState(false);

  const personalMut = useMutation({
    mutationFn: async (pin: string | null) => (await api.put('/download-pins/me', { pin })).data,
    onSuccess: () => {
      toast.success('PIN zapisany');
      qc.invalidateQueries({ queryKey: ['download-pins', 'me'] });
      setPersonalEditing(false);
      setPersonalDraft('');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Nie udało się zapisać');
    },
  });

  function startEditPersonal() {
    setPersonalDraft(personalQ.data?.pin ?? '');
    setPersonalEditing(true);
  }

  function savePersonal() {
    const v = personalDraft.trim().toUpperCase();
    if (!v) { personalMut.mutate(null); return; }
    if (v.length < 4) { toast.error('Minimum 4 znaki'); return; }
    if (!/^[A-Z0-9]+$/.test(v)) { toast.error('Tylko litery i cyfry'); return; }
    personalMut.mutate(v);
  }

  async function clearPersonal() {
    const ok = await confirmDialog({
      title: 'Usunąć PIN serwisanta?',
      message: 'Twój osobisty PIN zostanie skasowany. Możesz go w każdej chwili wygenerować ponownie.',
      confirmLabel: 'Usuń PIN',
      danger: true,
    });
    if (!ok) return;
    personalMut.mutate(null);
  }

  // ──────────────────────────────────────────────
  // One-time PINs (workspace-scoped)
  // ──────────────────────────────────────────────
  const listQ = useQuery<{ pins: OneTimePin[] }>({
    queryKey: ['download-pins', 'list'],
    queryFn: async () => (await api.get('/download-pins')).data,
    enabled: open,
  });

  const [noteDraft, setNoteDraft] = useState('');
  const [hours, setHours] = useState(24);

  const generateMut = useMutation({
    mutationFn: async () =>
      (await api.post('/download-pins', {
        resource: 'rustdesk',
        note: noteDraft.trim() || null,
        expiresInHours: hours,
      })).data,
    onSuccess: () => {
      toast.success('PIN wygenerowany');
      qc.invalidateQueries({ queryKey: ['download-pins', 'list'] });
      setNoteDraft('');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Nie udało się wygenerować');
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/download-pins/${id}`)).data,
    onSuccess: () => {
      toast.success('PIN odwołany');
      qc.invalidateQueries({ queryKey: ['download-pins', 'list'] });
    },
    onError: () => toast.error('Nie udało się odwołać'),
  });

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-[2vh] z-50 w-full max-w-2xl -translate-x-1/2 rounded-[var(--r-xl)] anim-scale max-h-[96vh] overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd shrink-0">
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-pri" />
              PIN-y do RustDesk
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-6">
            {/* Personal PIN section */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-ok" />
                <h3 className="text-[14px] font-bold text-tx">Twój osobisty PIN serwisanta</h3>
              </div>
              <p className="text-[12px] text-tx3 mb-3 leading-relaxed">
                PIN wielokrotnego użytku. Możesz go podać klientowi przez telefon żeby pobrał RustDesk.
                Min. 4 znaki, tylko litery i cyfry. Globalnie unikalny.
              </p>

              {personalQ.isLoading ? (
                <div className="text-[12px] text-tx3"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1" /> Ładowanie…</div>
              ) : personalEditing ? (
                <div className="flex items-stretch gap-2 flex-wrap">
                  <Input
                    autoFocus
                    value={personalDraft}
                    onChange={(e) => setPersonalDraft(e.target.value.toUpperCase())}
                    placeholder="np. ANNA42"
                    maxLength={32}
                    className="font-mono uppercase max-w-[240px]"
                  />
                  <Button onClick={savePersonal} disabled={personalMut.isPending}>
                    {personalMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zapisz'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setPersonalEditing(false); setPersonalDraft(''); }}>
                    Anuluj
                  </Button>
                </div>
              ) : personalQ.data?.pin ? (
                <div
                  className="rounded-[var(--r-s)] border p-3 flex items-center gap-3 flex-wrap"
                  style={{ borderColor: 'var(--ok)', background: 'var(--ok-l)' }}
                >
                  <code className="text-[18px] font-bold tracking-[0.2em] tabular-nums" style={{ color: 'var(--ok)' }}>
                    {personalQ.data.pin}
                  </code>
                  <CopyButton value={personalQ.data.pin} />
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={startEditPersonal}>
                      <RefreshCw className="h-3.5 w-3.5" /> Zmień
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearPersonal} title="Usuń PIN">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={startEditPersonal}>
                  <Plus className="h-4 w-4" /> Ustaw PIN
                </Button>
              )}
            </section>

            <div className="border-t" style={{ borderColor: 'var(--bd)' }} />

            {/* One-time PINs section */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="h-4 w-4 text-pri" />
                <h3 className="text-[14px] font-bold text-tx">Jednorazowe PIN-y</h3>
              </div>
              <p className="text-[12px] text-tx3 mb-3 leading-relaxed">
                Generowane na zawołanie, znikają po pierwszym użyciu albo po wygaśnięciu (domyślnie 24h).
                Każdy zawsze inny.
              </p>

              <div
                className="rounded-[var(--r-s)] border p-3 mb-4 flex items-end gap-2 flex-wrap"
                style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
              >
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[10px] font-semibold text-tx3 uppercase tracking-wider mb-1">
                    Notatka (opcjonalnie)
                  </label>
                  <Input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="np. Klient Janowski"
                    maxLength={120}
                  />
                </div>
                <div className="w-[120px]">
                  <label className="block text-[10px] font-semibold text-tx3 uppercase tracking-wider mb-1">
                    Ważność
                  </label>
                  <select
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-[var(--r-s)] border text-[13px]"
                    style={{ borderColor: 'var(--bd)', background: 'var(--bg)', color: 'var(--tx)' }}
                  >
                    <option value={1}>1 godzina</option>
                    <option value={6}>6 godzin</option>
                    <option value={24}>24 godziny</option>
                    <option value={72}>3 dni</option>
                    <option value={168}>7 dni</option>
                  </select>
                </div>
                <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
                  {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Wygeneruj
                </Button>
              </div>

              {listQ.isLoading ? (
                <div className="text-[12px] text-tx3"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1" /> Ładowanie…</div>
              ) : !listQ.data || listQ.data.pins.length === 0 ? (
                <div
                  className="rounded-[var(--r-s)] border p-4 text-center text-[12px] text-tx3"
                  style={{ borderColor: 'var(--bd)' }}
                >
                  Brak PIN-ów. Wygeneruj pierwszy.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {listQ.data.pins.map((p) => {
                    const meta = STATUS_META[p.status];
                    const active = p.status === 'ACTIVE';
                    return (
                      <li
                        key={p.id}
                        className="rounded-[var(--r-s)] border px-3 py-2 flex items-center gap-3 flex-wrap"
                        style={{
                          borderColor: 'var(--bd)',
                          background: active ? 'var(--sf-h)' : 'transparent',
                          opacity: active ? 1 : 0.65,
                        }}
                      >
                        <code
                          className="text-[15px] font-bold tracking-[0.15em] tabular-nums"
                          style={{ color: active ? 'var(--pri)' : 'var(--tx3)' }}
                        >
                          {p.pin}
                        </code>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {p.note && (
                          <span className="text-[11px] text-tx2 truncate max-w-[160px]" title={p.note}>
                            {p.note}
                          </span>
                        )}
                        <span className="text-[10px] text-tx3 ml-auto">
                          {p.usedAt
                            ? `Użyty ${formatDateTime(p.usedAt)}${p.usedFromIp ? ` · ${p.usedFromIp}` : ''}`
                            : `Ważny do ${formatDateTime(p.expiresAt)}`}
                        </span>
                        {active && <CopyButton value={p.pin} />}
                        {active && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirmDialog({
                                title: 'Odwołać ten PIN?',
                                message: 'PIN przestanie działać natychmiast. Tej akcji nie można cofnąć.',
                                confirmLabel: 'Odwołaj PIN',
                                danger: true,
                              });
                              if (ok) revokeMut.mutate(p.id);
                            }}
                            className="text-tx3 hover:text-er press"
                            title="Odwołaj"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div
            className="px-6 py-3 border-t text-[11px] text-tx3 shrink-0"
            style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
          >
            Klient wpisuje PIN na <a href="/pobieranie" className="text-pri hover:underline">infradesk.pl/pobieranie</a> i pobiera RustDesk.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

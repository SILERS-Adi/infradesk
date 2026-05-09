import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Share2, Trash2, Copy, Check, AlertTriangle, Clock, Eye, ExternalLink, Loader2,
  HardDrive, MonitorPlay, KeyRound, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

type Status = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
type ResourceType = 'DEVICE' | 'CREDENTIAL' | 'RUSTDESK_LAUNCH';

interface ShareRow {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  partnerEmail: string | null;
  partnerName: string | null;
  note: string | null;
  expiresAt: string;
  usedAt: string | null;
  usedFromIp: string | null;
  accessCount: number;
  revokedAt: string | null;
  createdAt: string;
  status: Status;
  shareUrl: string | null;
}

const STATUS_META: Record<Status, { label: string; variant: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  ACTIVE:  { label: 'Aktywny',     variant: 'success' },
  USED:    { label: 'Wykorzystany', variant: 'neutral' },
  EXPIRED: { label: 'Wygasł',       variant: 'warning' },
  REVOKED: { label: 'Odwołany',     variant: 'danger' },
};

const TYPE_META: Record<ResourceType, { label: string; icon: typeof HardDrive; color: string }> = {
  DEVICE:          { label: 'Urządzenie',   icon: HardDrive,   color: 'var(--pri)' },
  RUSTDESK_LAUNCH: { label: 'RustDesk only', icon: MonitorPlay, color: 'var(--pri)' },
  CREDENTIAL:      { label: 'Hasło',        icon: KeyRound,    color: 'var(--wn)' },
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PartnerSharesPage() {
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ shares: ShareRow[] }>({
    queryKey: ['partner-shares'],
    queryFn: async () => (await api.get('/partner-shares')).data,
    refetchInterval: 60_000,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/partner-shares/${id}`)).data,
    onSuccess: () => {
      toast.success('Share odwołany');
      qc.invalidateQueries({ queryKey: ['partner-shares'] });
    },
    onError: () => toast.error('Nie udało się odwołać'),
  });

  const shares = data?.shares ?? [];
  const active = shares.filter((s) => s.status === 'ACTIVE').length;
  const used = shares.filter((s) => s.status === 'USED').length;

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx flex items-center gap-2">
            <Share2 className="h-5 w-5 text-pri" />
            Udostępnienia partnerom
          </h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            Czasowe linki dla zewnętrznych firm — urządzenia, sesje RustDesk, hasła.
            Każdy z TTL i pełnym audit logiem.
          </p>
        </div>
        <Link
          to="/devices"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--r-s)] text-[13px] font-semibold press"
          style={{ background: 'var(--pri)', color: 'white' }}
        >
          <Share2 className="h-3.5 w-3.5" />
          Nowy share
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* How-to banner zawsze widoczny — explicit instrukcja */}
      <Card className="p-4" style={{ background: 'var(--pri-l)', borderColor: 'var(--pri)' }}>
        <p className="text-[13px] font-semibold text-tx mb-2 flex items-center gap-1.5">
          <Share2 className="h-4 w-4 text-pri" />
          Jak utworzyć share dla partnera?
        </p>
        <ol className="text-[12px] text-tx2 leading-relaxed space-y-0.5 ml-1">
          <li><strong>1.</strong> Wejdź w <Link to="/devices" className="text-pri font-semibold hover:underline">Urządzenia</Link></li>
          <li><strong>2.</strong> Znajdź urządzenie i kliknij ikonę <Share2 className="inline h-3 w-3" /> obok kafelka (albo w kolumnie „Akcje" w widoku tabeli)</li>
          <li><strong>3.</strong> Wybierz typ udostępnienia (urządzenie / tylko RustDesk), TTL i wpisz dane partnera (opcjonalnie)</li>
          <li><strong>4.</strong> Skopiuj link albo wyślij mailem. Wszystkie wystawione linki widzisz tu poniżej.</li>
        </ol>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-tx3 font-bold mb-1">Aktywne</div>
          <div className="text-[22px] font-bold" style={{ color: 'var(--ok)' }}>{active}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-tx3 font-bold mb-1">Wykorzystane</div>
          <div className="text-[22px] font-bold text-tx">{used}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-tx3 font-bold mb-1">Wygasłe</div>
          <div className="text-[22px] font-bold text-tx2">{shares.filter((s) => s.status === 'EXPIRED').length}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-tx3 font-bold mb-1">Łącznie</div>
          <div className="text-[22px] font-bold text-tx">{shares.length}</div>
        </Card>
      </div>

      {isLoading ? (
        <Card className="p-6 text-center text-[12px] text-tx3">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Ładowanie…
        </Card>
      ) : shares.length === 0 ? (
        <Card className="p-10 text-center">
          <Share2 className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak udostępnień</p>
          <p className="text-[13px] text-tx3 max-w-[420px] mx-auto">
            Wejdź w listę urządzeń i kliknij <strong>Udostępnij partnerowi</strong> przy konkretnej maszynie,
            żeby wygenerować link z TTL dla zewnętrznej firmy.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-sf-h border-b border-bd text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Typ</th>
                  <th className="px-3 py-2.5 font-bold">Partner</th>
                  <th className="px-3 py-2.5 font-bold">Notatka</th>
                  <th className="px-3 py-2.5 font-bold">Wygasa</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Użycia</th>
                  <th className="px-3 py-2.5 font-bold text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {shares.map((s) => {
                  const tm = TYPE_META[s.resourceType];
                  const sm = STATUS_META[s.status];
                  return (
                    <tr key={s.id} className="hover:bg-sf-h">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <tm.icon className="h-4 w-4 shrink-0" style={{ color: tm.color }} />
                          <span className="text-[11px] text-tx2">{tm.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[12px]">
                          {s.partnerName && <div className="font-semibold text-tx">{s.partnerName}</div>}
                          {s.partnerEmail && <div className="text-tx3 text-[11px] truncate max-w-[180px]">{s.partnerEmail}</div>}
                          {!s.partnerName && !s.partnerEmail && <span className="text-tx3">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-tx2 max-w-[200px]">
                        <div className="truncate" title={s.note ?? ''}>{s.note ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-tx3">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmt(s.expiresAt)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={sm.variant}>{sm.label}</Badge>
                      </td>
                      <td className="px-3 py-3 text-[11px]">
                        {s.accessCount > 0 ? (
                          <div className="flex items-start gap-1">
                            <Eye className="h-3 w-3 mt-0.5 text-tx3" />
                            <div>
                              <div className="font-semibold">{s.accessCount}×</div>
                              {s.usedFromIp && <div className="text-tx3 font-mono">{s.usedFromIp}</div>}
                              {s.usedAt && <div className="text-tx3">{fmt(s.usedAt)}</div>}
                            </div>
                          </div>
                        ) : <span className="text-tx3">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {s.shareUrl && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(s.shareUrl!).then(() => {
                                    setCopiedId(s.id);
                                    toast.success('Link skopiowany');
                                    setTimeout(() => setCopiedId(null), 1500);
                                  });
                                }}
                                className="p-1.5 rounded-[var(--r-xs)] hover:bg-sf-h press"
                                style={{ color: copiedId === s.id ? 'var(--ok)' : 'var(--tx3)' }}
                                title="Kopiuj link"
                              >
                                {copiedId === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                              <a
                                href={s.shareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-[var(--r-xs)] hover:bg-sf-h press text-tx3 hover:text-tx"
                                title="Otwórz w nowej karcie"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </>
                          )}
                          {s.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: 'Odwołać ten share?',
                                  message: 'Partner straci dostęp natychmiast. Akcja nieodwracalna.',
                                  confirmLabel: 'Odwołaj',
                                  danger: true,
                                });
                                if (ok) revokeMut.mutate(s.id);
                              }}
                              className="p-1.5 rounded-[var(--r-xs)] hover:bg-sf-h press text-tx3 hover:text-er"
                              title="Odwołaj"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div
        className="rounded-[var(--r-s)] border p-3 flex items-start gap-2 text-[11px]"
        style={{ borderColor: 'var(--bd)', background: 'var(--sf-h)' }}
      >
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-tx3" />
        <div className="text-tx2">
          Token w linku jest pokazywany tylko <strong>raz, w momencie tworzenia</strong>.
          Po zamknięciu modala można go już tylko skopiować z tej tabeli (jeśli nie wygasł / nie został odwołany).
          Po revoke link przestaje działać natychmiast.
        </div>
      </div>
    </div>
  );
}

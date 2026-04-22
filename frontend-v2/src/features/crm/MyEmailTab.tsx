import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Mail, Plus, X, Inbox, Send, Trash2, ExternalLink, Loader2,
  CheckCircle2, Circle, User as UserIcon, Shield, Building2, RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

type AccountType = 'PERSONAL' | 'SHARED' | 'MSP_MAIN';
interface MailAccount {
  id: string;
  email: string;
  displayName: string | null;
  type: AccountType;
  provider: string;
  imapHost: string | null;
  hasImapPassword: boolean;
  lastSyncAt: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
  _count: { messages: number };
}

interface EmailMessage {
  id: string;
  accountId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  folder: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  linkedTicketId: string | null;
  account: { id: string; email: string; type: AccountType };
  linkedTicket: { id: string; ticketNumber: string; title: string; status: string } | null;
}

const TYPE_META: Record<AccountType, { label: string; icon: typeof UserIcon; color: string }> = {
  PERSONAL: { label: 'Osobista', icon: UserIcon, color: 'var(--pri)' },
  SHARED: { label: 'Współdzielona', icon: Shield, color: 'var(--in)' },
  MSP_MAIN: { label: 'Główna MSP', icon: Building2, color: 'var(--wn)' },
};

export function MyEmailTab() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [viewMessage, setViewMessage] = useState<EmailMessage | null>(null);

  const accountsQ = useQuery<{ accounts: MailAccount[] }>({
    queryKey: ['crm', 'mailboxes'],
    queryFn: async () => (await api.get('/crm/mailboxes')).data,
    staleTime: 30_000,
  });

  const accounts = accountsQ.data?.accounts ?? [];
  const active = selectedAccountId || accounts[0]?.id || null;

  const messagesQ = useQuery<{ messages: EmailMessage[] }>({
    queryKey: ['crm', 'messages', active],
    queryFn: async () => {
      if (!active) return { messages: [] };
      return (await api.get(`/crm/messages`, { params: { accountId: active, limit: 100 } })).data;
    },
    enabled: !!active,
  });

  const messages = messagesQ.data?.messages ?? [];
  const unreadCount = messages.filter((m) => !m.isRead).length;

  const qc = useQueryClient();
  const syncMut = useMutation({
    mutationFn: async (accountId: string) => (await api.post(`/crm/mailboxes/${accountId}/sync-now`)).data,
    onSuccess: (d: { result: { email: string; newMessages: number; error?: string } }) => {
      if (d.result.error) {
        toast.error(`Sync błąd: ${d.result.error}`);
      } else {
        toast.success(`Zsynchronizowano: ${d.result.newMessages} nowych wiadomości`);
        qc.invalidateQueries({ queryKey: ['crm', 'messages'] });
        qc.invalidateQueries({ queryKey: ['crm', 'mailboxes'] });
      }
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd sync'),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-[500px]">
      {/* SIDEBAR: mailboxes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3">Skrzynki</h3>
          <Button size="sm" variant="ghost" onClick={() => setShowAddAccount(true)} className="gap-1 text-[11px]">
            <Plus className="h-3 w-3" /> Dodaj
          </Button>
        </div>
        {accountsQ.isLoading ? (
          <SkeletonCard />
        ) : accounts.length === 0 ? (
          <Card className="p-4 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-tx3" />
            <p className="text-[12px] text-tx2 mb-2">Brak skrzynek</p>
            <Button size="sm" onClick={() => setShowAddAccount(true)} className="gap-1">
              <Plus className="h-3 w-3" /> Dodaj pierwszą
            </Button>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {accounts.map((a) => {
              const meta = TYPE_META[a.type];
              const Icon = meta.icon;
              const selected = active === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccountId(a.id)}
                  className="w-full flex items-start gap-2 p-2.5 rounded-[var(--r-s)] border transition-colors text-left"
                  style={{
                    borderColor: selected ? 'var(--pri)' : 'var(--bd)',
                    background: selected ? 'var(--pri-l)' : 'transparent',
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-tx truncate">
                      {a.displayName || a.email}
                    </div>
                    <div className="text-[10px] text-tx3 truncate">{a.email}</div>
                    <div className="flex items-center gap-1 mt-1 text-[9px] text-tx3">
                      <Badge variant="neutral">{meta.label}</Badge>
                      <span>·</span>
                      <span>{a._count.messages} wiad.</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MAIN: message list */}
      <Card className="overflow-hidden flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-center p-10">
            <div>
              <Mail className="h-10 w-10 mx-auto mb-3 text-tx3 opacity-40" />
              <p className="text-tx font-medium mb-1">Wybierz skrzynkę</p>
              <p className="text-[13px] text-tx3">albo dodaj pierwszą po lewej.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-bd">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-tx3" />
                <span className="text-[13px] font-medium">
                  Inbox ({messages.length})
                </span>
                {unreadCount > 0 && <Badge variant="accent">{unreadCount} nieprzecz.</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => active && syncMut.mutate(active)}
                  disabled={syncMut.isPending} className="gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                  Sync teraz
                </Button>
                <Button size="sm" onClick={() => setShowAddMessage(true)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Dodaj
                </Button>
              </div>
            </div>
            {messagesQ.isLoading ? (
              <div className="p-4"><SkeletonCard /></div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-10 text-center">
                <div>
                  <Inbox className="h-10 w-10 mx-auto mb-3 text-tx3 opacity-40" />
                  <p className="text-tx font-medium mb-1">Pusto</p>
                  <p className="text-[13px] text-tx3 mb-3">
                    Phase 1: dodaj wiadomość ręcznie.
                    <br />Phase 2 (planowane): auto-sync IMAP co 2 min.
                  </p>
                  <Button size="sm" onClick={() => setShowAddMessage(true)} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Dodaj pierwszą
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-bd overflow-y-auto">
                {messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setViewMessage(m)}
                    className="w-full flex items-start gap-3 p-3 hover:bg-sf-h text-left transition-colors"
                  >
                    {m.isRead
                      ? <Circle className="h-3 w-3 mt-1.5 shrink-0 text-tx3" />
                      : <CheckCircle2 className="h-3 w-3 mt-1.5 shrink-0 text-pri fill-pri" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[13px] truncate ${m.isRead ? 'text-tx2' : 'font-semibold text-tx'}`}>
                          {m.fromName || m.fromAddress}
                        </span>
                        {m.direction === 'OUTBOUND' && <Badge variant="info">↑ Wysłana</Badge>}
                        {m.linkedTicket && (
                          <Badge variant="accent">
                            <ExternalLink className="h-2.5 w-2.5" /> {m.linkedTicket.ticketNumber}
                          </Badge>
                        )}
                      </div>
                      <div className={`text-[12px] truncate mt-0.5 ${m.isRead ? 'text-tx3' : 'text-tx2 font-medium'}`}>
                        {m.subject || '(bez tematu)'}
                      </div>
                      {m.bodyText && (
                        <div className="text-[11px] text-tx3 truncate mt-0.5">{m.bodyText.slice(0, 120)}</div>
                      )}
                    </div>
                    <span className="text-[10px] text-tx3 shrink-0">{formatRelativePl(m.receivedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {showAddAccount && <AddMailAccountModal onClose={() => setShowAddAccount(false)} />}
      {showAddMessage && active && (
        <AddMessageModal accountId={active} onClose={() => setShowAddMessage(false)} />
      )}
      {viewMessage && <ViewMessageModal msg={viewMessage} onClose={() => setViewMessage(null)} />}
    </div>
  );
}

const MODAL_SHELL: React.CSSProperties = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  zIndex: 50, width: 'min(92vw, 32rem)', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
  background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh4)', overflow: 'hidden',
};

function AddMailAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [type, setType] = useState<AccountType>('PERSONAL');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUsername, setImapUsername] = useState('');
  const [imapPassword, setImapPassword] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { email, type, provider: 'IMAP' };
      if (displayName) payload.displayName = displayName;
      if (imapHost) payload.imapHost = imapHost;
      if (imapPort) payload.imapPort = Number(imapPort);
      if (imapUsername) payload.imapUsername = imapUsername;
      if (imapPassword) payload.imapPassword = imapPassword;
      return (await api.post('/crm/mailboxes', payload)).data;
    },
    onSuccess: () => {
      toast.success('Dodano skrzynkę');
      qc.invalidateQueries({ queryKey: ['crm', 'mailboxes'] });
      onClose();
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd');
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content style={MODAL_SHELL}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Dodaj skrzynkę e-mail</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px' }} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Adres email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="technik@firma.pl" autoFocus />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwa wyświetlana</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="np. Mariusz – serwis" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Typ skrzynki</label>
              <div className="grid grid-cols-3 gap-2">
                {(['PERSONAL', 'SHARED', 'MSP_MAIN'] as AccountType[]).map((t) => {
                  const meta = TYPE_META[t];
                  const Icon = meta.icon;
                  const active = type === t;
                  return (
                    <button key={t} type="button" onClick={() => setType(t)}
                      className="p-2 rounded-[var(--r-s)] border text-[11px] text-center"
                      style={{
                        borderColor: active ? meta.color : 'var(--bd)',
                        background: active ? `color-mix(in srgb, ${meta.color} 12%, transparent)` : 'transparent',
                        color: active ? meta.color : 'var(--tx2)',
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 mx-auto mb-1" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pt-2 border-t border-bd">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">IMAP (opcjonalne — sync Phase 2)</div>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.firma.pl" />
                <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="993" />
              </div>
              <Input value={imapUsername} onChange={(e) => setImapUsername(e.target.value)}
                placeholder="login (zazwyczaj = email)" className="mt-2" />
              <Input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)}
                placeholder="hasło (szyfrowane AES-256)" className="mt-2" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !email}>
              {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Dodawanie…</> : 'Dodaj skrzynkę'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddMessageModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [toAddresses, setToAddresses] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [linkedTicketId, setLinkedTicketId] = useState('');

  const ticketsQ = useQuery<{ items: { id: string; ticketNumber: string; title: string }[] }>({
    queryKey: ['tickets', 'list'],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 200 } })).data,
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const toList = toAddresses.split(',').map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0) throw new Error('Podaj przynajmniej jednego odbiorcę');
      return (await api.post('/crm/messages', {
        accountId,
        direction,
        folder: direction === 'OUTBOUND' ? 'SENT' : 'INBOX',
        fromAddress,
        fromName: fromName || undefined,
        toAddresses: toList,
        subject: subject || undefined,
        bodyText: bodyText || undefined,
        linkedTicketId: linkedTicketId || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success('Dodano wiadomość');
      qc.invalidateQueries({ queryKey: ['crm', 'messages'] });
      qc.invalidateQueries({ queryKey: ['crm', 'mailboxes'] });
      onClose();
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      const msg = err instanceof Error ? err.message : 'Błąd';
      toast.error(ax.response?.data?.message ?? msg);
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content style={{ ...MODAL_SHELL, width: 'min(92vw, 38rem)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx">Dodaj wiadomość ręcznie</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px' }} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['INBOUND', 'OUTBOUND'] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDirection(d)}
                  className="p-2 rounded-[var(--r-s)] border text-[12px] text-center"
                  style={{
                    borderColor: direction === d ? 'var(--pri)' : 'var(--bd)',
                    background: direction === d ? 'var(--pri-l)' : 'transparent',
                  }}
                >
                  {d === 'INBOUND' ? <><Inbox className="h-3 w-3 inline mr-1" /> Przychodząca</> : <><Send className="h-3 w-3 inline mr-1" /> Wychodząca</>}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Od (adres) *</label>
                <Input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="klient@firma.pl" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-tx3 block mb-1">Nazwa nadawcy</label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Jan Kowalski" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Do * (po przecinku)</label>
              <Input value={toAddresses} onChange={(e) => setToAddresses(e.target.value)} placeholder="anna@silers.pl, biuro@silers.pl" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Temat</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Treść</label>
              <textarea rows={6} value={bodyText} onChange={(e) => setBodyText(e.target.value)}
                className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px]"
                placeholder="Treść wiadomości (wklejona albo opisana w skrócie)" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Powiąż z ticketem (opcjonalne)</label>
              <select value={linkedTicketId} onChange={(e) => setLinkedTicketId(e.target.value)}
                className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px]">
                <option value="">— brak —</option>
                {(ticketsQ.data?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.ticketNumber} · {t.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !fromAddress || !toAddresses}>
              {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Dodawanie…</> : 'Dodaj wiadomość'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ViewMessageModal({ msg, onClose }: { msg: EmailMessage; onClose: () => void }) {
  const qc = useQueryClient();
  const toggleRead = useMutation({
    mutationFn: async () => (await api.post(`/crm/messages/${msg.id}/toggle-read`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'messages'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: async () => (await api.delete(`/crm/messages/${msg.id}`)).data,
    onSuccess: () => {
      toast.success('Usunięto');
      qc.invalidateQueries({ queryKey: ['crm', 'messages'] });
      onClose();
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content style={{ ...MODAL_SHELL, width: 'min(92vw, 42rem)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-bd">
            <Dialog.Title className="text-[14px] font-bold text-tx truncate flex-1 mr-2">
              {msg.subject || '(bez tematu)'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-sf-h text-tx3"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px' }} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <Badge variant={msg.direction === 'INBOUND' ? 'info' : 'accent'}>
                {msg.direction === 'INBOUND' ? '↓ Przychodząca' : '↑ Wychodząca'}
              </Badge>
              <Badge variant="neutral">{msg.folder}</Badge>
              {msg.linkedTicket && (
                <Link to={`/tickets/${msg.linkedTicket.id}`} onClick={onClose}>
                  <Badge variant="accent">
                    <ExternalLink className="h-2.5 w-2.5" /> {msg.linkedTicket.ticketNumber} · {msg.linkedTicket.title}
                  </Badge>
                </Link>
              )}
            </div>
            <div className="text-[12px] space-y-1">
              <div><span className="text-tx3">Od:</span> <strong>{msg.fromName || msg.fromAddress}</strong> <span className="text-tx3">{msg.fromName ? `<${msg.fromAddress}>` : ''}</span></div>
              <div><span className="text-tx3">Do:</span> {msg.toAddresses.join(', ')}</div>
              <div><span className="text-tx3">Data:</span> {new Date(msg.receivedAt).toLocaleString('pl-PL')}</div>
              <div><span className="text-tx3">Skrzynka:</span> {msg.account.email}</div>
            </div>
            {msg.bodyText && (
              <div className="pt-3 border-t border-bd">
                <pre className="whitespace-pre-wrap text-[12px] text-tx2 font-sans">{msg.bodyText}</pre>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-bd bg-sf-h">
            <Button variant="ghost" onClick={() => toggleRead.mutate()} className="gap-1">
              {msg.isRead ? <><Circle className="h-3.5 w-3.5" /> Oznacz nieprzecz.</> : <><CheckCircle2 className="h-3.5 w-3.5" /> Oznacz przecz.</>}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => { if (confirm('Usunąć wiadomość?')) deleteMut.mutate(); }}
                className="gap-1 text-er">
                <Trash2 className="h-3.5 w-3.5" /> Usuń
              </Button>
              <Button onClick={onClose}>Zamknij</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


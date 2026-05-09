import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Key, Plus, Eye, EyeOff, Copy, Edit2, Trash2, X, Search, Shield,
  Monitor, Globe, Mail, Router, Database, Server, Lock, Users as UsersIcon,
  Lock as LockIcon, History, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

type Category = 'WINDOWS' | 'VPN' | 'EMAIL' | 'APPLICATION' | 'DATABASE' | 'ROUTER' | 'WIFI' | 'SSH' | 'API_KEY' | 'CERTIFICATE' | 'OTHER';
type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

interface Credential {
  id: string;
  name: string;
  category: Category;
  username: string | null;
  urlOrHost: string | null;
  tags: string[];
  deviceId: string | null;
  visibleToRoles: Role[];
  expiresAt: string | null;
  lastRotatedAt: string | null;
  rotationPolicyDays: number | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_META: Record<Category, { label: string; icon: typeof Key; color: string }> = {
  WINDOWS:     { label: 'Windows',     icon: Monitor,  color: 'var(--in)' },
  VPN:         { label: 'VPN',         icon: Shield,   color: 'var(--pri)' },
  EMAIL:       { label: 'Email',       icon: Mail,     color: 'var(--pri)' },
  APPLICATION: { label: 'Aplikacja',   icon: Globe,    color: 'var(--in)' },
  DATABASE:    { label: 'Baza danych', icon: Database, color: 'var(--wn)' },
  ROUTER:      { label: 'Router',      icon: Router,   color: 'var(--in)' },
  WIFI:        { label: 'WiFi',        icon: Router,   color: 'var(--in)' },
  SSH:         { label: 'SSH',         icon: Server,   color: 'var(--tx2)' },
  API_KEY:     { label: 'API Key',     icon: Key,      color: 'var(--wn)' },
  CERTIFICATE: { label: 'Certyfikat',  icon: Lock,     color: 'var(--ok)' },
  OTHER:       { label: 'Inne',        icon: Key,      color: 'var(--tx3)' },
};

export function VaultPage() {
  const params = useParams<{ scope?: string }>();
  const scope: 'all' | 'mine' | 'shared' = (params.scope as 'mine' | 'shared') ?? 'all';
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [revealTarget, setRevealTarget] = useState<Credential | null>(null);
  const [auditTarget, setAuditTarget] = useState<Credential | null>(null);

  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ['vault', { category, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      return (await api.get<{ credentials: Credential[] }>(`/vault?${params.toString()}`)).data;
    },
  });

  const filtered = useMemo(() => {
    const all = listQ.data?.credentials ?? [];
    if (scope === 'mine') return all.filter((c) => c.createdByUserId === me?.id);
    if (scope === 'shared') return all.filter((c) => c.visibleToRoles.length >= 2);
    return all;
  }, [listQ.data, scope, me]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/vault/${id}`),
    onSuccess: () => {
      toast.success('Usunięto hasło');
      qc.invalidateQueries({ queryKey: ['vault'] });
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd usuwania'),
  });

  const title =
    scope === 'mine' ? 'Moje hasła' : scope === 'shared' ? 'Współdzielone hasła' : 'Wszystkie hasła';

  return (
    <div className="space-y-[var(--sp-4)]">
      <div className="flex items-center justify-between gap-[var(--sp-3)] flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <LockIcon size={18} className="text-[var(--pri)]" />
            <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
          </div>
          <p className="text-[13px] text-[var(--tx3)] mt-0.5">
            AES-256-GCM · każdy dostęp jest audytowany. {filtered.length} {filtered.length === 1 ? 'rekord' : 'rekordów'}.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus size={14} /> Dodaj hasło
        </Button>
      </div>

      <Card className="p-[var(--sp-3)]">
        <div className="flex items-center gap-[var(--sp-3)] flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-[2vh] text-[var(--tx3)]" />
            <Input
              placeholder="Szukaj po nazwie, loginie, URL…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-[180px]">
            <option value="">Wszystkie kategorie</option>
            {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </Select>
        </div>
      </Card>

      {listQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-3)]">
          {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-[var(--sp-6)] text-center text-[var(--tx3)]">
          <LockIcon size={32} className="mx-auto mb-3 opacity-40" />
          <div className="text-[14px]">
            {scope === 'mine' ? 'Jeszcze nie dodałeś żadnego hasła.' : 'Brak haseł w tym widoku.'}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-3)]">
          {filtered.map((c) => (
            <CredentialCard
              key={c.id}
              c={c}
              onReveal={() => setRevealTarget(c)}
              onEdit={() => setEditing(c)}
              onAudit={() => setAuditTarget(c)}
              onDelete={() => {
                if (confirm(`Usunąć hasło "${c.name}"? Tej operacji nie da się cofnąć.`)) {
                  deleteMut.mutate(c.id);
                }
              }}
            />
          ))}
        </div>
      )}

      <CredentialFormModal
        open={createOpen || !!editing}
        existing={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
      />
      <RevealModal credential={revealTarget} onClose={() => setRevealTarget(null)} />
      <AuditModal credential={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  );
}

function CredentialCard({
  c, onReveal, onEdit, onAudit, onDelete,
}: {
  c: Credential;
  onReveal: () => void;
  onEdit: () => void;
  onAudit: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[c.category];
  const Icon = meta.icon;
  const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
  const needsRotation =
    c.rotationPolicyDays && c.lastRotatedAt
      ? (Date.now() - new Date(c.lastRotatedAt).getTime()) / 86_400_000 > c.rotationPolicyDays
      : false;

  return (
    <Card className="p-[var(--sp-4)] hover:border-[var(--bd-f)] transition-colors">
      <div className="flex items-start justify-between mb-[var(--sp-3)]">
        <div className="flex items-start gap-[var(--sp-2)] min-w-0">
          <div
            className="w-9 h-9 shrink-0 rounded-[var(--r-s)] flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
          >
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{c.name}</div>
            {c.username && (
              <div className="text-[11px] text-[var(--tx3)] mt-0.5 truncate font-mono">{c.username}</div>
            )}
          </div>
        </div>
        <Badge variant="neutral">{meta.label}</Badge>
      </div>

      {c.urlOrHost && (
        <div className="text-[11px] text-[var(--tx3)] mb-2 truncate">
          <Globe size={10} className="inline mr-1" />
          {c.urlOrHost}
        </div>
      )}

      {(expired || needsRotation) && (
        <div className="flex items-center gap-1.5 text-[11px] mb-2" style={{ color: expired ? 'var(--er)' : 'var(--wn)' }}>
          <AlertTriangle size={11} />
          {expired ? 'Hasło wygasło' : 'Wymaga rotacji'}
        </div>
      )}

      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {c.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--sf-h)] text-[var(--tx3)]">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--bd)] pt-3 mt-2">
        <div className="flex items-center gap-1 text-[10px] text-[var(--tx3)]">
          <UsersIcon size={10} />
          {c.visibleToRoles.join(', ')}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onReveal} className="gap-1 px-2 py-1 text-[11px]">
            <Eye size={12} /> Odsłoń
          </Button>
          <button
            type="button"
            onClick={onAudit}
            className="p-1.5 rounded hover:bg-[var(--sf-h)] text-[var(--tx3)]"
            title="Historia dostępów"
          >
            <History size={12} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-[var(--sf-h)] text-[var(--tx3)]"
            title="Edytuj"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-[var(--er-l)] text-[var(--tx3)] hover:text-[var(--er)]"
            title="Usuń"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function RevealModal({
  credential, onClose,
}: { credential: Credential | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] = useState<{ username: string | null; password: string } | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (!credential) {
      setRevealed(null);
      setReason('');
      setShowPwd(false);
    }
  }, [credential]);

  const revealMut = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ username: string | null; password: string }>(
        `/vault/${credential!.id}/reveal`,
        { reason: reason || undefined },
      );
      return res.data;
    },
    onSuccess: (d) => setRevealed(d),
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd'),
  });

  async function copy(text: string, what: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for HTTP / iframe contexts where Clipboard API is blocked.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast.success(`${what} skopiowane`);
    } catch {
      toast.error('Nie udało się skopiować — skopiuj ręcznie');
    }
  }

  return (
    <Dialog.Root open={!!credential} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[480px] max-h-[92vh] rounded-[var(--r-xl)] anim-scale overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between p-[var(--sp-4)] border-b border-[var(--bd)] shrink-0">
            <Dialog.Title className="text-[15px] font-semibold flex items-center gap-2">
              <Eye size={15} />
              Odsłoń hasło
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-[var(--sf-h)]"><X size={14} /></button>
            </Dialog.Close>
          </div>
          <div className="p-[var(--sp-4)] space-y-[var(--sp-3)]">
            <div>
              <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider">Nazwa</div>
              <div className="text-[14px] font-medium">{credential?.name}</div>
            </div>

            {!revealed ? (
              <>
                <div>
                  <label className="text-[12px] text-[var(--tx2)] block mb-1">
                    Powód odsłonięcia <span className="text-[var(--tx3)]">(opcjonalne, idzie do audytu)</span>
                  </label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="np. Logowanie do serwera klienta"
                  />
                </div>
                <div className="text-[11px] text-[var(--tx3)] bg-[var(--wn-l)] border border-[var(--wn-b)] rounded-[var(--r-s)] p-3">
                  <AlertTriangle size={12} className="inline mr-1 text-[var(--wn)]" />
                  Każde odsłonięcie jest rejestrowane z Twoim IP i user-agentem.
                </div>
              </>
            ) : (
              <>
                {revealed.username && (
                  <div>
                    <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider mb-1">Login</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1.5 rounded bg-[var(--sf-h)] border border-[var(--bd)] text-[13px] font-mono break-all">
                        {revealed.username}
                      </code>
                      <Button variant="ghost" size="sm" onClick={() => copy(revealed.username!, 'Login')}>
                        <Copy size={12} />
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider mb-1">Hasło</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2 py-1.5 rounded bg-[var(--sf-h)] border border-[var(--bd)] text-[13px] font-mono break-all">
                      {showPwd ? revealed.password : '•'.repeat(Math.min(revealed.password.length, 20))}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => setShowPwd((v) => !v)}>
                      {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copy(revealed.password, 'Hasło')}>
                      <Copy size={12} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 p-[var(--sp-3)] border-t border-[var(--bd)] bg-[var(--sf-h)]">
            <Button variant="ghost" onClick={onClose}>Zamknij</Button>
            {!revealed && (
              <Button onClick={() => revealMut.mutate()} disabled={revealMut.isPending}>
                {revealMut.isPending ? 'Odsłanianie…' : 'Odsłoń'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AuditModal({ credential, onClose }: { credential: Credential | null; onClose: () => void }) {
  const logsQ = useQuery({
    queryKey: ['vault', 'audit', credential?.id],
    queryFn: async () => (await api.get<{ logs: {
      id: string;
      viewedAt: string;
      ipAddress: string | null;
      userAgent: string | null;
      reason: string | null;
      user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
    }[] }>(`/vault/${credential!.id}/audit`)).data,
    enabled: !!credential,
  });
  const logs = logsQ.data?.logs ?? [];

  return (
    <Dialog.Root open={!!credential} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[560px] max-h-[92vh] rounded-[var(--r-xl)] anim-scale overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between p-[var(--sp-4)] border-b border-[var(--bd)] shrink-0">
            <Dialog.Title className="text-[15px] font-semibold flex items-center gap-2">
              <History size={15} />
              Historia dostępów — {credential?.name}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-[var(--sf-h)]"><X size={14} /></button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto p-[var(--sp-3)]">
            {logsQ.isLoading ? (
              <SkeletonCard />
            ) : logs.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">
                Nikt jeszcze nie odsłonił tego hasła.
              </div>
            ) : (
              <div className="divide-y divide-[var(--bd)]">
                {logs.map((l) => {
                  const name = l.user
                    ? [l.user.firstName, l.user.lastName].filter(Boolean).join(' ') || l.user.email
                    : 'Usunięty użytkownik';
                  return (
                    <div key={l.id} className="py-[var(--sp-3)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium">{name}</div>
                          {l.reason && <div className="text-[12px] text-[var(--tx2)] mt-0.5">„{l.reason}"</div>}
                        </div>
                        <div className="text-[11px] text-[var(--tx3)] shrink-0">{formatRelativePl(l.viewedAt)}</div>
                      </div>
                      {l.ipAddress && (
                        <div className="text-[10px] text-[var(--tx3)] mt-1 font-mono">
                          IP: {l.ipAddress}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const CATEGORIES = ['WINDOWS','VPN','EMAIL','APPLICATION','DATABASE','ROUTER','WIFI','SSH','API_KEY','CERTIFICATE','OTHER'] as const;
const ROLES = ['OWNER','ADMIN','MEMBER'] as const;

const formSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES),
  username: z.string().max(200).optional(),
  password: z.string().optional(),
  urlOrHost: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.string().optional(),
  visibleOwner: z.boolean().default(true),
  visibleAdmin: z.boolean().default(true),
  visibleMember: z.boolean().default(false),
  rotationPolicyDays: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

function CredentialFormModal({
  open, existing, onClose,
}: { open: boolean; existing: Credential | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', category: 'APPLICATION', username: '', password: '', urlOrHost: '',
      notes: '', tags: '',
      visibleOwner: true, visibleAdmin: true, visibleMember: false,
      rotationPolicyDays: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (existing) {
      reset({
        name: existing.name,
        category: existing.category,
        username: existing.username ?? '',
        password: '',
        urlOrHost: existing.urlOrHost ?? '',
        notes: '',
        tags: existing.tags.join(', '),
        visibleOwner: existing.visibleToRoles.includes('OWNER'),
        visibleAdmin: existing.visibleToRoles.includes('ADMIN'),
        visibleMember: existing.visibleToRoles.includes('MEMBER'),
        rotationPolicyDays: existing.rotationPolicyDays ? String(existing.rotationPolicyDays) : '',
      });
    } else {
      reset({
        name: '', category: 'APPLICATION', username: '', password: '', urlOrHost: '',
        notes: '', tags: '',
        visibleOwner: true, visibleAdmin: true, visibleMember: false,
        rotationPolicyDays: '',
      });
    }
  }, [open, existing, reset]);

  const saveMut = useMutation({
    mutationFn: async (values: FormData) => {
      const roles: Role[] = [];
      if (values.visibleOwner) roles.push('OWNER');
      if (values.visibleAdmin) roles.push('ADMIN');
      if (values.visibleMember) roles.push('MEMBER');
      if (roles.length === 0) throw new Error('Wybierz przynajmniej jedną rolę z dostępem');
      const payload: Record<string, unknown> = {
        name: values.name,
        category: values.category,
        username: values.username || undefined,
        urlOrHost: values.urlOrHost || undefined,
        notes: values.notes || undefined,
        tags: values.tags ? values.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        visibleToRoles: roles,
        rotationPolicyDays: values.rotationPolicyDays ? Number(values.rotationPolicyDays) : undefined,
      };
      if (values.password) payload.password = values.password;
      if (isEdit) {
        return api.patch(`/vault/${existing!.id}`, payload);
      } else {
        if (!values.password) throw new Error('Hasło jest wymagane przy tworzeniu');
        return api.post('/vault', payload);
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Zaktualizowano hasło' : 'Dodano hasło');
      qc.invalidateQueries({ queryKey: ['vault'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (e as Error).message ??
        'Błąd zapisu';
      toast.error(msg);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[560px] max-h-[92vh] rounded-[var(--r-xl)] anim-scale overflow-hidden flex flex-col"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between p-[var(--sp-4)] border-b border-[var(--bd)]">
              <Dialog.Title className="text-[15px] font-semibold flex items-center gap-2">
                <Key size={15} />
                {isEdit ? 'Edytuj hasło' : 'Dodaj hasło'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="p-1 rounded hover:bg-[var(--sf-h)]"><X size={14} /></button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-auto p-[var(--sp-4)] space-y-[var(--sp-3)]">
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-1">Nazwa *</label>
                <Input {...register('name')} placeholder="np. Serwer klienta — admin" />
                {errors.name && <div className="text-[11px] text-[var(--er)] mt-1">{errors.name.message}</div>}
              </div>
              <div className="grid grid-cols-2 gap-[var(--sp-3)]">
                <div>
                  <label className="text-[12px] text-[var(--tx2)] block mb-1">Kategoria</label>
                  <Select {...register('category')}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-[12px] text-[var(--tx2)] block mb-1">Rotacja (dni)</label>
                  <Input type="number" min={1} max={730} {...register('rotationPolicyDays')} placeholder="90" />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-1">Login / użytkownik</label>
                <Input {...register('username')} placeholder="admin" />
              </div>
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-1">
                  Hasło {isEdit ? <span className="text-[var(--tx3)]">(zostaw puste aby nie zmieniać)</span> : '*'}
                </label>
                <Input
                  type="password"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  {...register('password')}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-1">URL / host</label>
                <Input {...register('urlOrHost')} placeholder="https://panel.example.com" />
              </div>
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-1">Tagi (po przecinku)</label>
                <Input {...register('tags')} placeholder="produkcja, klient-abc, vpn" />
              </div>
              <div>
                <label className="text-[12px] text-[var(--tx2)] block mb-2">Widoczne dla ról</label>
                <div className="space-y-1.5">
                  {(ROLES).map((role) => (
                    <label key={role} className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        {...register(
                          role === 'OWNER' ? 'visibleOwner'
                          : role === 'ADMIN' ? 'visibleAdmin'
                          : 'visibleMember',
                        )}
                      />
                      <span>{role}</span>
                      {role === 'MEMBER' && (
                        <span className="text-[11px] text-[var(--wn)] ml-auto">⚠ wszyscy członkowie zobaczą</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-[var(--sp-3)] border-t border-[var(--bd)] bg-[var(--sf-h)]">
              <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
              <Button type="submit" disabled={isSubmitting || saveMut.isPending}>
                {saveMut.isPending ? 'Zapisywanie…' : isEdit ? 'Zapisz' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  UserPlus, Users, ShieldCheck, Shield, User as UserIcon, X, Check, Ban, Mail, KeyRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
type Scope = 'FULL' | 'SCOPED';
type Status = 'ACTIVE' | 'INVITED' | 'REVOKED';

interface Membership {
  id: string;
  role: Role;
  scope: Scope;
  status: Status;
  isDefault: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
  };
}

const ROLE_META: Record<Role, { label: string; icon: typeof Shield; color: string }> = {
  OWNER: { label: 'Właściciel', icon: ShieldCheck, color: 'var(--pri)' },
  ADMIN: { label: 'Admin', icon: Shield, color: 'var(--in)' },
  MEMBER: { label: 'Członek', icon: UserIcon, color: 'var(--tx2)' },
};

export function UsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ['memberships'],
    queryFn: async () => (await api.get<{ memberships: Membership[] }>('/memberships')).data,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ role: Role; scope: Scope; status: Status }> }) =>
      api.patch(`/memberships/${id}`, data),
    onSuccess: () => {
      toast.success('Zaktualizowano');
      qc.invalidateQueries({ queryKey: ['memberships'] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd'),
  });

  const memberships = listQ.data?.memberships ?? [];
  const active = memberships.filter((m) => m.status === 'ACTIVE');
  const invited = memberships.filter((m) => m.status === 'INVITED');
  const revoked = memberships.filter((m) => m.status === 'REVOKED');

  return (
    <div className="space-y-[var(--sp-4)]">
      <div className="flex items-center justify-between gap-[var(--sp-3)]">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
            <Users size={18} className="text-[var(--pri)]" /> Użytkownicy
          </h1>
          <p className="text-[13px] text-[var(--tx3)] mt-0.5">
            {active.length} aktywnych · {invited.length} zaproszonych · {revoked.length} wyłączonych
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
          <UserPlus size={14} /> Zaproś
        </Button>
      </div>

      {listQ.isLoading ? (
        <SkeletonCard />
      ) : (
        <>
          {invited.length > 0 && (
            <Section title="Zaproszeni" count={invited.length}>
              {invited.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} />
              ))}
            </Section>
          )}

          <Section title="Aktywni członkowie" count={active.length}>
            {active.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">Brak aktywnych członków.</div>
            ) : (
              active.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} />
              ))
            )}
          </Section>

          {revoked.length > 0 && (
            <Section title="Wyłączeni" count={revoked.length}>
              {revoked.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} />
              ))}
            </Section>
          )}
        </>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] flex items-center justify-between">
        <span className="text-[13px] font-medium">{title}</span>
        <Badge variant="neutral">{count}</Badge>
      </div>
      <div className="divide-y divide-[var(--bd)]">{children}</div>
    </Card>
  );
}

function MemberRow({
  m, onUpdate,
}: { m: Membership; onUpdate: (data: Partial<{ role: Role; scope: Scope; status: Status }>) => void }) {
  const meta = ROLE_META[m.role];
  const RoleIcon = meta.icon;
  const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;

  return (
    <div className="flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold"
        style={{ background: 'var(--sf-h)', color: 'var(--tx2)' }}
      >
        {m.user.avatarUrl ? (
          <img src={m.user.avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
        ) : (
          (m.user.firstName?.[0] ?? m.user.email[0] ?? '?').toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{name}</div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] mt-0.5">
          <Mail size={10} /> <span className="truncate">{m.user.email}</span>
          {m.user.twoFactorEnabled && (
            <span className="inline-flex items-center gap-1 text-[var(--ok)]">
              <KeyRound size={10} /> 2FA
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-[var(--sp-2)]">
        <Select
          value={m.role}
          onChange={(e) => onUpdate({ role: e.target.value as Role })}
          disabled={m.status !== 'ACTIVE'}
          className="w-[130px]"
        >
          <option value="OWNER">Właściciel</option>
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Członek</option>
        </Select>

        <Badge variant={m.scope === 'FULL' ? 'accent' : 'neutral'}>
          {m.scope === 'FULL' ? 'Pełny' : 'Zawężony'}
        </Badge>

        <div
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: meta.color }}
        >
          <RoleIcon size={11} />
        </div>

        {m.user.lastLoginAt && (
          <span className="text-[11px] text-[var(--tx3)] hidden md:inline">
            {formatRelativePl(m.user.lastLoginAt)}
          </span>
        )}

        {m.status === 'ACTIVE' ? (
          <button
            type="button"
            onClick={() => onUpdate({ status: 'REVOKED' })}
            className="p-1.5 rounded hover:bg-[var(--er-l)] text-[var(--tx3)] hover:text-[var(--er)]"
            title="Wyłącz dostęp"
          >
            <Ban size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUpdate({ status: 'ACTIVE' })}
            className="p-1.5 rounded hover:bg-[var(--ok-l)] text-[var(--tx3)] hover:text-[var(--ok)]"
            title="Aktywuj"
          >
            <Check size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
  scope: z.enum(['FULL', 'SCOPED']).default('FULL'),
});

type InviteData = z.infer<typeof inviteSchema>;

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'MEMBER', scope: 'FULL' },
  });

  const inviteMut = useMutation({
    mutationFn: (data: InviteData) => api.post('/memberships/invite', data),
    onSuccess: () => {
      toast.success('Zaproszenie wysłane');
      qc.invalidateQueries({ queryKey: ['memberships'] });
      reset();
      onClose();
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd'),
  });

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[440px] bg-[var(--sf)] border border-[var(--bd)] rounded-[var(--r-m)] shadow-xl">
          <form onSubmit={handleSubmit((v) => inviteMut.mutate(v))}>
            <div className="flex items-center justify-between p-[var(--sp-4)] border-b border-[var(--bd)]">
              <Dialog.Title className="text-[15px] font-semibold flex items-center gap-2">
                <UserPlus size={15} /> Zaproś użytkownika
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="p-1 rounded hover:bg-[var(--sf-h)]"><X size={14} /></button>
              </Dialog.Close>
            </div>
            <div className="p-[var(--sp-4)] space-y-[var(--sp-3)]">
              <Field label="Email"><Input type="email" {...register('email')} />{errors.email && <div className="text-[11px] text-[var(--er)] mt-1">{errors.email.message}</div>}</Field>
              <div className="grid grid-cols-2 gap-[var(--sp-3)]">
                <Field label="Imię"><Input {...register('firstName')} /></Field>
                <Field label="Nazwisko"><Input {...register('lastName')} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-[var(--sp-3)]">
                <Field label="Rola">
                  <Select {...register('role')}>
                    <option value="MEMBER">Członek</option>
                    <option value="ADMIN">Admin</option>
                    <option value="OWNER">Właściciel</option>
                  </Select>
                </Field>
                <Field label="Zakres">
                  <Select {...register('scope')}>
                    <option value="FULL">Pełny</option>
                    <option value="SCOPED">Zawężony</option>
                  </Select>
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-[var(--sp-3)] border-t border-[var(--bd)] bg-[var(--sf-h)]">
              <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
              <Button type="submit" disabled={isSubmitting || inviteMut.isPending}>
                {inviteMut.isPending ? 'Zapraszanie…' : 'Zaproś'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}


import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UserPlus, Users, ShieldCheck, Shield, User as UserIcon, Check, Ban, Mail, KeyRound, Pencil,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { formatRelativePl } from '@/lib/utils';
import { MemberForm } from './MemberForm';

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
  const nav = useNavigate();
  const [view, setView] = useViewPreference('users', 'visual');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const qc = useQueryClient();

  function handleInvite() {
    if (view === 'visual') setInviteOpen(true);
    else nav('/users/new');
  }

  function handleEdit(membershipId: string) {
    if (view === 'visual') setEditMemberId(membershipId);
    else nav(`/users/${membershipId}/edit`);
  }

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
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button onClick={handleInvite} className="gap-1.5">
            <UserPlus size={14} /> Zaproś
          </Button>
        </div>
      </div>

      {listQ.isLoading ? (
        <SkeletonCard />
      ) : (
        <>
          {invited.length > 0 && (
            <Section title="Zaproszeni" count={invited.length}>
              {invited.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} onEdit={() => handleEdit(m.id)} />
              ))}
            </Section>
          )}

          <Section title="Aktywni członkowie" count={active.length}>
            {active.length === 0 ? (
              <div className="p-[var(--sp-4)] text-center text-[var(--tx3)] text-[13px]">Brak aktywnych członków.</div>
            ) : (
              active.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} onEdit={() => handleEdit(m.id)} />
              ))
            )}
          </Section>

          {revoked.length > 0 && (
            <Section title="Wyłączeni" count={revoked.length}>
              {revoked.map((m) => (
                <MemberRow key={m.id} m={m} onUpdate={(data) => updateMut.mutate({ id: m.id, data })} onEdit={() => handleEdit(m.id)} />
              ))}
            </Section>
          )}
        </>
      )}

      {inviteOpen && <MemberForm onClose={() => setInviteOpen(false)} />}
      {editMemberId && <MemberForm membershipId={editMemberId} onClose={() => setEditMemberId(null)} />}
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

// Stabilny kolor per user z hash email
function avatarColor(email: string): string {
  const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length]!;
}

function getInitials(m: Membership): string {
  const f = m.user.firstName?.trim()?.[0] ?? '';
  const l = m.user.lastName?.trim()?.[0] ?? '';
  const combined = (f + l).toUpperCase();
  if (combined) return combined;
  return (m.user.email[0] ?? '?').toUpperCase();
}

function MemberRow({
  m, onUpdate, onEdit,
}: {
  m: Membership;
  onUpdate: (data: Partial<{ role: Role; scope: Scope; status: Status }>) => void;
  onEdit: () => void;
}) {
  const meta = ROLE_META[m.role];
  const RoleIcon = meta.icon;
  const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;
  const initials = getInitials(m);
  const color = avatarColor(m.user.email);
  const hasRealAvatar = !!m.user.avatarUrl && m.user.avatarUrl.length > 0;

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-sf-h transition-colors">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold overflow-hidden text-white"
        style={{ background: color }}
      >
        {hasRealAvatar ? (
          <img src={m.user.avatarUrl!} alt="" className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          initials
        )}
      </div>

      {/* Name + email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-tx truncate">{name}</span>
          <div className="inline-flex items-center gap-1" style={{ color: meta.color }}>
            <RoleIcon size={11} />
            <span className="text-[10px] font-medium hidden sm:inline">{meta.label}</span>
          </div>
          {m.user.twoFactorEnabled && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-ok" title="2FA włączone">
              <KeyRound size={9} /> 2FA
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-tx3 mt-0.5 min-w-0">
          <Mail size={10} className="shrink-0" />
          <span className="truncate">{m.user.email}</span>
        </div>
      </div>

      {/* Scope badge + last login */}
      <div className="hidden md:flex flex-col items-end text-right shrink-0 mr-2">
        <Badge variant={m.scope === 'FULL' ? 'accent' : 'warning'}>
          {m.scope === 'FULL' ? 'Pełny dostęp' : 'Spersonalizowany'}
        </Badge>
        {m.user.lastLoginAt && (
          <span className="text-[10px] text-tx3 mt-0.5">
            Aktywny {formatRelativePl(m.user.lastLoginAt)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-pri-l text-tx3 hover:text-pri opacity-60 group-hover:opacity-100 transition-opacity"
          title="Edytuj"
        >
          <Pencil size={13} />
        </button>
        {m.status === 'ACTIVE' ? (
          <button
            type="button"
            onClick={() => { if (confirm(`Wyłączyć dostęp użytkownika ${name}?`)) onUpdate({ status: 'REVOKED' }); }}
            className="p-1.5 rounded hover:bg-er-l text-tx3 hover:text-er opacity-60 group-hover:opacity-100 transition-opacity"
            title="Wyłącz dostęp"
          >
            <Ban size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUpdate({ status: 'ACTIVE' })}
            className="p-1.5 rounded hover:bg-ok-l text-tx3 hover:text-ok opacity-60 group-hover:opacity-100 transition-opacity"
            title="Aktywuj"
          >
            <Check size={13} />
          </button>
        )}
      </div>
    </div>
  );
}



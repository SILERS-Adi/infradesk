import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2, Shield, KeyRound, Search, UserPlus, Edit2, Trash2, Plus, X,
  Building2, ChevronDown,
} from 'lucide-react';
import { superadminApi } from '../../api/superadmin';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getInitials } from '../../utils/helpers';

/* ── Types ────────────────────────────────────────────────────────── */

interface Membership {
  id: string;
  role: string;
  scopeType: string;
  source: string;
  workspaceId: string;
  workspace: { id: string; name: string; type: string };
}

interface SAUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  workspaceMemberships: Membership[];
}

interface WsOption {
  id: string;
  name: string;
  type: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const ROLES = ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER', 'VIEWER'] as const;
const ROLE_COLORS: Record<string, string> = {
  OWNER: '#F59E0B', ADMIN: '#8B5CF6', TECHNICIAN: '#3B82F6', MEMBER: '#10B981', VIEWER: '#6B7280',
};
const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', TECHNICIAN: 'Technik', MEMBER: 'Użytkownik', VIEWER: 'Podgląd',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 13px', borderRadius: 10, fontSize: 13,
  background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--tm)', marginBottom: 4, display: 'block' };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' as const };

/* ── Main page ────────────────────────────────────────────────────── */

export default function SAUsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery<SAUser[]>({ queryKey: ['sa-users'], queryFn: superadminApi.getUsers });
  const { data: workspaces = [] } = useQuery<WsOption[]>({ queryKey: ['sa-workspaces-list'], queryFn: superadminApi.getWorkspacesList });

  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<SAUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwModal, setPwModal] = useState<SAUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SAUser | null>(null);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.workspaceMemberships.some(m => m.workspace.name.toLowerCase().includes(q))
    );
  }, [users, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['sa-users'] });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>;

  return (
    <div className="space-y-0 max-w-6xl">
      <PageHeader
        title="Użytkownicy platformy"
        subtitle={`${users.length} kont`}
        actions={
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Nowy użytkownik
          </Button>
        }
      />

      {/* Search */}
      <div className="page-card" style={{ padding: 16, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginTop: 16 }}>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj (imię, email, telefon, workspace)..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="page-card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', padding: 0 }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Użytkownik', 'Telefon', 'Workspace\'y', 'SA', 'Status', 'Ostatnie logowanie', 'Akcje'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="group" style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {/* User */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: u.isSuperAdmin ? 'linear-gradient(135deg, #F59E0B, #EF4444)' : 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                      fontSize: 10, fontWeight: 700, color: '#fff',
                    }}>
                      {getInitials(u.firstName, u.lastName)}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t)' }}>{u.firstName} {u.lastName}</div>
                      <div style={{ fontSize: 10, color: 'var(--td)' }}>{u.email}</div>
                    </div>
                  </div>
                </td>

                {/* Phone */}
                <td className="px-4 py-3" style={{ fontSize: 11, color: 'var(--tm)' }}>{u.phone || '—'}</td>

                {/* Workspaces */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.workspaceMemberships.length === 0 && <span style={{ fontSize: 10, color: 'var(--td)' }}>Brak</span>}
                    {u.workspaceMemberships.map(m => (
                      <span key={m.id} style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                        background: `${ROLE_COLORS[m.role] || '#6B7280'}15`,
                        color: ROLE_COLORS[m.role] || '#6B7280',
                        display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: 180,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        <Building2 style={{ width: 8, height: 8, flexShrink: 0 }} />
                        {m.workspace.name} · {ROLE_LABELS[m.role] || m.role}
                      </span>
                    ))}
                  </div>
                </td>

                {/* SuperAdmin toggle */}
                <td className="px-4 py-3">
                  <button onClick={async () => {
                    await superadminApi.updateUser(u.id, { isSuperAdmin: !u.isSuperAdmin });
                    refresh();
                    toast.success(u.isSuperAdmin ? 'SA cofnięty' : 'SA nadany');
                  }} title={u.isSuperAdmin ? 'Cofnij SuperAdmin' : 'Nadaj SuperAdmin'}>
                    <Shield className={`h-4 w-4 transition-colors ${u.isSuperAdmin ? 'text-red-400' : 'text-[var(--td)] hover:text-[var(--tm)]'}`} />
                  </button>
                </td>

                {/* Status toggle */}
                <td className="px-4 py-3">
                  <button onClick={async () => {
                    await superadminApi.updateUser(u.id, { isActive: !u.isActive });
                    refresh();
                    toast.success(u.isActive ? 'Zablokowany' : 'Odblokowany');
                  }}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${u.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {u.isActive ? 'Aktywny' : 'Zablokowany'}
                  </button>
                </td>

                {/* Last login */}
                <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--tm)' }}>
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pl-PL') : '—'}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditUser(u)} title="Edytuj"
                      style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }}>
                      <Edit2 style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={() => setPwModal(u)} title="Zmień hasło"
                      style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }}>
                      <KeyRound style={{ width: 13, height: 13 }} />
                    </button>
                    <button onClick={() => setDeleteTarget(u)} title="Dezaktywuj"
                      style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editUser && <EditUserModal user={editUser} workspaces={workspaces} onClose={() => setEditUser(null)} onSaved={refresh} />}

      {/* Create modal */}
      {createOpen && <CreateUserModal workspaces={workspaces} onClose={() => setCreateOpen(false)} onCreated={refresh} />}

      {/* Password modal */}
      {pwModal && <PasswordModal user={pwModal} onClose={() => setPwModal(null)} />}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="Dezaktywuj użytkownika"
          message={`Czy na pewno chcesz dezaktywować ${deleteTarget.firstName} ${deleteTarget.lastName} (${deleteTarget.email})?`}
          confirmLabel="Dezaktywuj"
          onConfirm={async () => {
            await superadminApi.updateUser(deleteTarget.id, { isActive: false });
            refresh();
            toast.success('Użytkownik dezaktywowany');
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ── Edit User Modal ──────────────────────────────────────────────── */

function EditUserModal({ user, workspaces, onClose, onSaved }: {
  user: SAUser; workspaces: WsOption[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    firstName: user.firstName, lastName: user.lastName,
    email: user.email, phone: user.phone || '',
  });
  const [memberships, setMemberships] = useState<Membership[]>([...user.workspaceMemberships]);
  const [saving, setSaving] = useState(false);
  const [addWsId, setAddWsId] = useState('');
  const [addWsRole, setAddWsRole] = useState('MEMBER');

  const availableWs = workspaces.filter(w => !memberships.some(m => m.workspaceId === w.id));

  const handleSave = async () => {
    setSaving(true);
    try {
      await superadminApi.updateUser(user.id, {
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone || null,
      });
      toast.success('Dane zapisane');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd zapisu');
    } finally { setSaving(false); }
  };

  const handleAddMembership = async () => {
    if (!addWsId) return;
    try {
      const m = await superadminApi.addMembership(user.id, { workspaceId: addWsId, role: addWsRole });
      setMemberships(prev => [...prev, m]);
      setAddWsId('');
      setAddWsRole('MEMBER');
      onSaved();
      toast.success('Dodano do workspace');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd');
    }
  };

  const handleChangeRole = async (m: Membership, newRole: string) => {
    try {
      await superadminApi.updateMembership(user.id, m.id, { role: newRole });
      setMemberships(prev => prev.map(x => x.id === m.id ? { ...x, role: newRole } : x));
      onSaved();
      toast.success('Rola zmieniona');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd');
    }
  };

  const handleRemoveMembership = async (m: Membership) => {
    try {
      await superadminApi.removeMembership(user.id, m.id);
      setMemberships(prev => prev.filter(x => x.id !== m.id));
      onSaved();
      toast.success('Usunięto z workspace');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edytuj — ${user.firstName} ${user.lastName}`} size="lg">
      <div className="space-y-4">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Imię</label>
            <input style={inputStyle} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Nazwisko</label>
            <input style={inputStyle} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Telefon</label>
            <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>

        <Button onClick={handleSave} loading={saving} style={{ width: '100%' }}>Zapisz dane</Button>

        {/* Workspaces section */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 style={{ width: 14, height: 14 }} /> Workspace'y
          </div>

          {memberships.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--td)', marginBottom: 10 }}>Użytkownik nie należy do żadnego workspace</div>
          )}

          {memberships.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
              background: 'var(--hover-bg)', marginBottom: 6,
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t)', flex: 1 }}>
                {m.workspace.name}
                <span style={{ fontSize: 9, color: 'var(--td)', marginLeft: 6 }}>{m.workspace.type}</span>
              </span>
              <select
                value={m.role}
                onChange={e => handleChangeRole(m, e.target.value)}
                style={{ ...selectStyle, width: 120, padding: '4px 8px', fontSize: 11 }}
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button onClick={() => handleRemoveMembership(m)} title="Usuń z workspace"
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}>
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}

          {/* Add to workspace */}
          {availableWs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <select
                value={addWsId} onChange={e => setAddWsId(e.target.value)}
                style={{ ...selectStyle, flex: 1, padding: '6px 10px', fontSize: 11 }}
              >
                <option value="">Wybierz workspace...</option>
                {availableWs.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
              </select>
              <select
                value={addWsRole} onChange={e => setAddWsRole(e.target.value)}
                style={{ ...selectStyle, width: 110, padding: '6px 8px', fontSize: 11 }}
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <Button size="sm" onClick={handleAddMembership} disabled={!addWsId}
                icon={<Plus style={{ width: 12, height: 12 }} />}>
                Dodaj
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Create User Modal ────────────────────────────────────────────── */

function CreateUserModal({ workspaces, onClose, onCreated }: {
  workspaces: WsOption[]; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '',
    workspaceId: '', role: 'MEMBER',
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      toast.error('Wypełnij wymagane pola'); return;
    }
    if (form.password.length < 6) { toast.error('Hasło min. 6 znaków'); return; }
    setSaving(true);
    try {
      await superadminApi.createUser({
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, password: form.password,
        phone: form.phone || undefined,
        workspaceId: form.workspaceId || undefined,
        role: form.workspaceId ? form.role : undefined,
      });
      toast.success('Użytkownik utworzony');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd tworzenia');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Nowy użytkownik" size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Imię *</label>
            <input style={inputStyle} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Nazwisko *</label>
            <input style={inputStyle} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Hasło *</label>
          <input style={inputStyle} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 znaków" />
        </div>
        <div>
          <label style={labelStyle}>Telefon</label>
          <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
          <label style={labelStyle}>Przypisz do workspace (opcjonalnie)</label>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.workspaceId} onChange={e => setForm(f => ({ ...f, workspaceId: e.target.value }))} style={selectStyle}>
              <option value="">— Bez workspace —</option>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
            </select>
            {form.workspaceId && (
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={selectStyle}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            )}
          </div>
        </div>

        <Button onClick={handleCreate} loading={saving} style={{ width: '100%', marginTop: 8 }}>
          Utwórz użytkownika
        </Button>
      </div>
    </Modal>
  );
}

/* ── Password Modal ───────────────────────────────────────────────── */

function PasswordModal({ user, onClose }: { user: SAUser; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReset = async () => {
    if (newPassword.length < 6) { toast.error('Hasło min. 6 znaków'); return; }
    setSaving(true);
    try {
      await superadminApi.resetPassword(user.id, newPassword);
      toast.success(`Hasło zmienione dla ${user.firstName} ${user.lastName}`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Zmień hasło" size="sm">
      <div className="space-y-3">
        <div style={{ fontSize: 12, color: 'var(--tm)' }}>{user.firstName} {user.lastName} ({user.email})</div>
        <input
          type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
          placeholder="Nowe hasło (min. 6 znaków)" autoFocus style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && handleReset()}
        />
        <Button onClick={handleReset} loading={saving} disabled={newPassword.length < 6} style={{ width: '100%' }}>
          Zmień hasło
        </Button>
      </div>
    </Modal>
  );
}

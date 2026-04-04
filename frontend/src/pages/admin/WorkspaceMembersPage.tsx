import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Edit2, Shield, Eye, UserPlus, MapPin, Monitor, ChevronDown, ChevronRight, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { workspacesApi, type WsMember } from '../../api/workspaces';
import { apiClient } from '../../api/client';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { useWorkspace } from '../../store/workspaceStore';
import { PermissionTreeEditor } from '../../components/permissions/PermissionTreeEditor';
import { PermissionSchemas } from '../../components/permissions/PermissionSchemas';
import { getInitials, formatDate } from '../../utils/helpers';
import type { MemberRole, ScopeType } from '../../types';

/* ── Account type config (UI: polskie nazwy) ───────────────────── */

function getAccountLabel(m: WsMember): { label: string; color: string; desc: string } {
  const at = (m as any).accountType ?? (m.role === 'OWNER' || m.role === 'ADMIN' ? 'ADMIN' : 'USER');
  const as_ = (m as any).accessScope ?? (m.role === 'MEMBER' || m.role === 'VIEWER' ? 'RESTRICTED' : 'FULL');
  if (at === 'ADMIN') return { label: 'Administrator', color: '#8B5CF6', desc: 'Pełny dostęp do firmy' };
  if (as_ === 'FULL') return { label: 'Użytkownik', color: '#3B82F6', desc: 'Pełny dostęp' };
  return { label: 'Użytkownik', color: '#F59E0B', desc: 'Spersonalizowany dostęp' };
}

function AccountBadge({ member }: { member: WsMember }) {
  const c = getAccountLabel(member);
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      background: `${c.color}18`, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

function AccessScopeBadge({ member }: { member: WsMember }) {
  const at = (member as any).accountType ?? 'USER';
  const as_ = (member as any).accessScope ?? 'FULL';
  if (at === 'ADMIN') return <span style={{ fontSize: 10, color: 'var(--tm)' }}>Pełny</span>;
  if (as_ === 'FULL') return <span style={{ fontSize: 10, color: 'var(--tm)' }}>Pełny dostęp</span>;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      background: 'rgba(251,191,36,0.1)', color: '#FBBF24',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <Eye style={{ width: 9, height: 9 }} /> Spersonalizowany
    </span>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export function WorkspaceMembersPage() {
  const qc = useQueryClient();
  const { canManageUsers, workspace } = useWorkspaceContext();
  const { startPreview } = useWorkspace();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<WsMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WsMember | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: workspacesApi.getMembers,
    enabled: !!workspace,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => workspacesApi.removeMember(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace-members'] }); toast.success('Użytkownik usunięty'); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Blad'),
  });

  const filtered = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.user.email.toLowerCase().includes(q) ||
      `${m.user.firstName} ${m.user.lastName}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Użytkownicy"
        subtitle={`${members.length} użytkowników · ${workspace?.name ?? ''}`}
        actions={canManageUsers ? (
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setShowAdd(true)}>
            Dodaj uzytkownika
          </Button>
        ) : undefined}
      />

      {/* Search */}
      <div className="page-card" style={{ padding: 16, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj (imie, email)..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="page-card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', padding: 0 }}>
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Shield className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--tm)' }}>Brak uzytkownikow</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Użytkownik</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Typ konta</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Zakres dostępu</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Źródło</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Zasoby</th>
                {canManageUsers && <th className="w-24" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const ac = getAccountLabel(m);
                return (
                  <tr key={m.id} className="group" style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `linear-gradient(135deg, ${ac.color}, ${ac.color}88)`, fontSize: 10, fontWeight: 700, color: '#fff',
                        }}>
                          {getInitials(m.user.firstName, m.user.lastName)}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t)' }}>{m.user.firstName} {m.user.lastName}</div>
                          <div style={{ fontSize: 10, color: 'var(--td)' }}>{m.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><AccountBadge member={m} /></td>
                    <td className="px-4 py-3">
                      <AccessScopeBadge member={m} />
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: 10, color: 'var(--td)' }}>
                        {m.source === 'DIRECT' ? 'Bezposredni' : m.source === 'MSP_ASSIGNED' ? 'MSP' : 'Zaproszenie'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.accessGrants.length > 0 ? (
                        <span style={{ fontSize: 10, color: 'var(--tm)' }}>
                          {m.accessGrants.filter(g => g.resourceType === 'DEVICE').length} urz, {m.accessGrants.filter(g => g.resourceType === 'LOCATION').length} lok
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--td)' }}>—</span>
                      )}
                    </td>
                    {canManageUsers && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startPreview({
                            userName: `${m.user.firstName} ${m.user.lastName}`,
                            role: m.role,
                            scopeType: m.scopeType,
                            grants: m.accessGrants.map(g => ({ resourceType: g.resourceType, resourceId: g.resourceId })),
                          })} title="Podglad jako ten uzytkownik"
                            style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#FBBF24' }}>
                            <Eye style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={() => setEditTarget(m)} title="Edytuj"
                            style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }}>
                            <Edit2 style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={() => setDeleteTarget(m)} title="Usun"
                            style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}>
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Dodaj użytkownika" size="full">
        <MemberForm onSuccess={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['workspace-members'] }); }} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={editTarget ? `Edytuj: ${editTarget.user.firstName} ${editTarget.user.lastName}` : ''} size="full">
        {editTarget && <MemberForm member={editTarget} onSuccess={() => { setEditTarget(null); qc.invalidateQueries({ queryKey: ['workspace-members'] }); }} />}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Usuń użytkownika"
        message={deleteTarget ? `Czy na pewno chcesz usunąć ${deleteTarget.user.firstName} ${deleteTarget.user.lastName} (${deleteTarget.user.email})?` : ''}
        confirmLabel="Usun"
        onConfirm={() => { if (deleteTarget) removeMutation.mutate(deleteTarget.id); }}
        loading={removeMutation.isPending}
      />
    </div>
  );
}

/* ── Member form (add + edit) ────────────────────────────────────── */

function MemberForm({ member, onSuccess }: { member?: WsMember; onSuccess: () => void }) {
  const isEdit = !!member;
  const { isOwner } = useWorkspaceContext();
  const [email, setEmail] = useState(member?.user.email ?? '');

  // New permission model
  const memberAccountType = (member as any)?.accountType ?? (member?.role === 'OWNER' || member?.role === 'ADMIN' ? 'ADMIN' : 'USER');
  const memberAccessScope = (member as any)?.accessScope ?? (member?.role === 'MEMBER' || member?.role === 'VIEWER' ? 'RESTRICTED' : 'FULL');
  const [accountType, setAccountType] = useState<string>(memberAccountType);
  const [accessScope, setAccessScope] = useState<string>(memberAccessScope);
  const [permOverrides, setPermOverrides] = useState<{ nodeId: string; level: string; canDelete?: boolean }[]>([]);

  // Load existing overrides when editing
  useEffect(() => {
    if (!isEdit || !member) return;
    apiClient.get(`/permissions/${member.id}`)
      .then(r => {
        if (r.data.permissionOverrides) setPermOverrides(r.data.permissionOverrides);
        if (r.data.accountType) setAccountType(r.data.accountType);
        if (r.data.accessScope) setAccessScope(r.data.accessScope);
      })
      .catch(() => {}); // silently fail if endpoint not available yet
  }, [isEdit, member]);

  // Legacy compat
  const role = accountType === 'ADMIN' ? (member?.role === 'OWNER' ? 'OWNER' : 'ADMIN')
    : accessScope === 'FULL' ? 'TECHNICIAN' : 'MEMBER';
  const scopeType = member?.scopeType ?? 'FULL';
  const [grantSearch, setGrantSearch] = useState('');
  const [expandedLocs, setExpandedLocs] = useState<Set<string>>(new Set());
  const [selectedDevices, setSelectedDevices] = useState<string[]>(
    member?.accessGrants.filter(g => g.resourceType === 'DEVICE').map(g => g.resourceId) ?? []
  );
  const [selectedLocations, setSelectedLocations] = useState<string[]>(
    member?.accessGrants.filter(g => g.resourceType === 'LOCATION').map(g => g.resourceId) ?? []
  );

  // ── Email validation (live lookup) ──────────────────────────────
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');
  const [foundUser, setFoundUser] = useState<{ firstName: string; lastName: string } | null>(null);

  useEffect(() => {
    if (isEdit || !email || !email.includes('@')) { setEmailStatus('idle'); setFoundUser(null); return; }
    const timer = setTimeout(async () => {
      setEmailStatus('checking');
      try {
        const users = await usersApi.getAll();
        const match = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (match) { setEmailStatus('found'); setFoundUser({ firstName: match.firstName, lastName: match.lastName }); }
        else { setEmailStatus('not_found'); setFoundUser(null); }
      } catch { setEmailStatus('idle'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [email, isEdit]);

  // ── Fetch data ──────────────────────────────────────────────────
  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
    enabled: scopeType === 'SCOPED',
  });
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.getAll(),
    enabled: scopeType === 'SCOPED',
  });

  const locations: any[] = (locationsData as any)?.data ?? locationsData ?? [];
  const devices: any[] = (devicesData as any)?.data ?? devicesData ?? [];

  // Group devices by locationId
  const devicesByLocation = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const dev of devices) {
      const locId = dev.locationId ?? '__none__';
      if (!map.has(locId)) map.set(locId, []);
      map.get(locId)!.push(dev);
    }
    return map;
  }, [devices]);

  // Filter by search
  const q = grantSearch.toLowerCase();
  const filteredLocations = q
    ? locations.filter(l => l.name?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q))
    : locations;
  const filteredDeviceIds = q
    ? new Set(devices.filter(d => d.name?.toLowerCase().includes(q) || d.hostname?.toLowerCase().includes(q)).map((d: any) => d.id))
    : null;

  // ── Preview mode ────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);

  // ── Location helpers ────────────────────────────────────────────
  const toggleLocation = (locId: string) => {
    if (selectedLocations.includes(locId)) {
      setSelectedLocations(s => s.filter(id => id !== locId));
    } else {
      // Add location grant + remove redundant device grants in this location
      setSelectedLocations(s => [...s, locId]);
      const devIdsInLoc = new Set((devicesByLocation.get(locId) ?? []).map((d: any) => d.id));
      if (devIdsInLoc.size > 0) {
        setSelectedDevices(s => s.filter(id => !devIdsInLoc.has(id)));
      }
    }
  };

  const selectAllDevicesInLocation = (locId: string) => {
    const devIds = (devicesByLocation.get(locId) ?? []).map((d: any) => d.id);
    setSelectedDevices(s => [...new Set([...s, ...devIds])]);
  };

  const deselectAllDevicesInLocation = (locId: string) => {
    const devIds = new Set((devicesByLocation.get(locId) ?? []).map((d: any) => d.id));
    setSelectedDevices(s => s.filter(id => !devIds.has(id)));
  };

  const selectAllLocations = () => {
    setSelectedLocations(locations.map((l: any) => l.id));
    setSelectedDevices([]); // All devices are implicit via locations
  };

  const clearAllGrants = () => { setSelectedLocations([]); setSelectedDevices([]); };

  // ── Computed: what user DOESN'T see ────────────────────────────
  const unseenLocations = useMemo(() => {
    if (scopeType !== 'SCOPED') return [];
    return locations.filter((l: any) => !selectedLocations.includes(l.id));
  }, [locations, selectedLocations, scopeType]);

  const unseenDevices = useMemo(() => {
    if (scopeType !== 'SCOPED') return [];
    const grantedLocSet = new Set(selectedLocations);
    const grantedDevSet = new Set(selectedDevices);
    return devices.filter((d: any) => !grantedDevSet.has(d.id) && !grantedLocSet.has(d.locationId));
  }, [devices, selectedDevices, selectedLocations, scopeType]);

  const toggleExpand = (locId: string) => {
    setExpandedLocs(s => { const n = new Set(s); if (n.has(locId)) n.delete(locId); else n.add(locId); return n; });
  };

  // ── Mutations ───────────────────────────────────────────────────
  const buildGrants = () => scopeType === 'SCOPED' ? [
    ...selectedDevices.map(id => ({ resourceType: 'DEVICE', resourceId: id })),
    ...selectedLocations.map(id => ({ resourceType: 'LOCATION', resourceId: id })),
  ] : [];

  const addMutation = useMutation({
    mutationFn: () => workspacesApi.addMember({ email, role, scopeType, grants: scopeType === 'SCOPED' ? buildGrants() : undefined }),
    onSuccess: () => { toast.success('Użytkownik dodany'); onSuccess(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Blad'),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      // Update legacy role + scope via existing endpoint
      await workspacesApi.updateMember(member!.id, { role, scopeType, grants: buildGrants() });
      // Update new permission model
      await apiClient.put(`/permissions/${member!.id}`, {
        accountType,
        accessScope,
        overrides: accessScope === 'RESTRICTED' ? permOverrides : [],
      });
    },
    onSuccess: () => { toast.success('Zapisano zmiany'); onSuccess(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Błąd'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && emailStatus !== 'found') { toast.error('Uzytkownik o tym emailu nie istnieje'); return; }
    if (isEdit) editMutation.mutate(); else addMutation.mutate();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)',
  };

  const ac = getAccountLabel({ ...member, accountType, accessScope } as any);
  const totalGrants = selectedLocations.length + selectedDevices.length;

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Left: form fields */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Email with live validation */}
          {!isEdit && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)', marginBottom: 4, display: 'block' }}>Email uzytkownika</label>
              <div style={{ position: 'relative' }}>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="jan@firma.pl" style={inputStyle} />
                {emailStatus === 'checking' && (
                  <Loader2 className="animate-spin" style={{ position: 'absolute', right: 12, top: 12, width: 14, height: 14, color: 'var(--td)' }} />
                )}
                {emailStatus === 'found' && (
                  <CheckCircle style={{ position: 'absolute', right: 12, top: 12, width: 14, height: 14, color: '#4ADE80' }} />
                )}
                {emailStatus === 'not_found' && (
                  <AlertCircle style={{ position: 'absolute', right: 12, top: 12, width: 14, height: 14, color: '#F87171' }} />
                )}
              </div>
              {emailStatus === 'found' && foundUser && (
                <p style={{ fontSize: 10, color: '#4ADE80', marginTop: 4 }}>Znaleziono: {foundUser.firstName} {foundUser.lastName}</p>
              )}
              {emailStatus === 'not_found' && (
                <p style={{ fontSize: 10, color: '#F87171', marginTop: 4 }}>Uzytkownik nie istnieje w InfraDesk</p>
              )}
            </div>
          )}

          {/* Typ konta */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)', marginBottom: 4, display: 'block' }}>Typ konta</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setAccountType('ADMIN'); setAccessScope('FULL'); }} style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: accountType === 'ADMIN' ? 'rgba(139,92,246,0.08)' : 'transparent',
                border: `1px solid ${accountType === 'ADMIN' ? '#8B5CF6' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: accountType === 'ADMIN' ? '#8B5CF6' : 'var(--t)' }}>Administrator</div>
                <div style={{ fontSize: 10, color: 'var(--td)' }}>Pełny dostęp do firmy, zarządzanie użytkownikami i ustawieniami</div>
              </button>
              <button type="button" onClick={() => setAccountType('USER')} style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: accountType === 'USER' ? 'rgba(59,130,246,0.08)' : 'transparent',
                border: `1px solid ${accountType === 'USER' ? '#3B82F6' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: accountType === 'USER' ? '#3B82F6' : 'var(--t)' }}>Użytkownik</div>
                <div style={{ fontSize: 10, color: 'var(--td)' }}>Dostęp do wybranych modułów wg zakresu</div>
              </button>
            </div>
          </div>

          {/* Zakres dostępu — tylko dla Użytkownika */}
          {accountType === 'USER' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)', marginBottom: 4, display: 'block' }}>Zakres dostępu</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setAccessScope('FULL')} style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  background: accessScope === 'FULL' ? 'var(--accent-g)' : 'transparent',
                  border: `1px solid ${accessScope === 'FULL' ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: accessScope === 'FULL' ? 'var(--accent)' : 'var(--t)' }}>Pełny dostęp</div>
                  <div style={{ fontSize: 10, color: 'var(--td)' }}>Użytkownik ma dostęp do wszystkich funkcji w firmie</div>
                </button>
                <button type="button" onClick={() => setAccessScope('RESTRICTED')} style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  background: accessScope === 'RESTRICTED' ? 'rgba(251,191,36,0.08)' : 'transparent',
                  border: `1px solid ${accessScope === 'RESTRICTED' ? '#FBBF24' : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: accessScope === 'RESTRICTED' ? '#FBBF24' : 'var(--t)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Eye style={{ width: 12, height: 12 }} /> Spersonalizowany dostęp
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--td)' }}>Dostęp ustawiany indywidualnie dla modułów i sekcji</div>
                </button>
              </div>
            </div>
          )}

          {/* Komunikat dla Administratora */}
          {accountType === 'ADMIN' && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, background: 'rgba(139,92,246,0.06)',
              border: '1px solid rgba(139,92,246,0.12)', fontSize: 11, color: 'var(--ts)',
            }}>
              <strong style={{ color: '#8B5CF6' }}>Administrator</strong> ma pełny dostęp do wszystkich modułów, użytkowników, ustawień i danych firmy.
            </div>
          )}

          {/* Drzewo uprawnień — tylko dla Użytkownika ze Spersonalizowanym dostępem */}
          {accountType === 'USER' && accessScope === 'RESTRICTED' && (
            <div>
              <PermissionSchemas
                currentOverrides={permOverrides}
                onApply={(overrides) => setPermOverrides(overrides)}
                onSave={() => {}}
              />
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)', marginBottom: 6, display: 'block' }}>Drzewo uprawnień</label>
              <PermissionTreeEditor
                overrides={permOverrides}
                onChange={setPermOverrides}
              />
            </div>
          )}

          {/* Grant selection tree (SCOPED only) */}
          {scopeType === 'SCOPED' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ts)' }}>
                  Dostep: {selectedLocations.length} lok · {selectedDevices.length} urz
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedLocations.length < locations.length && (
                    <button type="button" onClick={selectAllLocations}
                      style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Wszystkie lok.
                    </button>
                  )}
                  {totalGrants > 0 && (
                    <button type="button" onClick={clearAllGrants}
                      style={{ fontSize: 10, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <X style={{ width: 10, height: 10 }} /> Wyczysc
                    </button>
                  )}
                </div>
              </div>

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ width: 13, height: 13, color: 'var(--td)' }} />
                <input value={grantSearch} onChange={e => setGrantSearch(e.target.value)}
                  placeholder="Filtruj lokalizacje i urzadzenia..."
                  style={{ ...inputStyle, paddingLeft: 32, padding: '7px 12px 7px 32px', fontSize: 11 }} />
              </div>

              {/* Tree: locations → devices */}
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
                {filteredLocations.map(loc => {
                  const locDevices = devicesByLocation.get(loc.id) ?? [];
                  const visibleDevices = filteredDeviceIds
                    ? locDevices.filter((d: any) => filteredDeviceIds.has(d.id))
                    : locDevices;
                  const isExpanded = expandedLocs.has(loc.id);
                  const isLocSelected = selectedLocations.includes(loc.id);
                  const selectedInLoc = locDevices.filter((d: any) => selectedDevices.includes(d.id)).length;

                  return (
                    <div key={loc.id}>
                      {/* Location row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8,
                        background: isLocSelected ? 'var(--accent-g)' : 'transparent',
                      }}>
                        <button type="button" onClick={() => toggleExpand(loc.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 0, display: 'flex' }}>
                          {isExpanded
                            ? <ChevronDown style={{ width: 12, height: 12 }} />
                            : <ChevronRight style={{ width: 12, height: 12 }} />}
                        </button>
                        <input type="checkbox" checked={isLocSelected} onChange={() => toggleLocation(loc.id)}
                          style={{ accentColor: 'var(--accent)' }} />
                        <MapPin style={{ width: 11, height: 11, color: isLocSelected ? 'var(--accent)' : 'var(--tm)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: isLocSelected ? 'var(--accent)' : 'var(--t)', flex: 1 }}>
                          {loc.name}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--td)' }}>{loc.city ?? ''}</span>
                        {locDevices.length > 0 && (
                          <span style={{ fontSize: 9, color: 'var(--td)' }}>
                            {selectedInLoc}/{locDevices.length}
                          </span>
                        )}

                        {/* Select/deselect all devices */}
                        {locDevices.length > 0 && !isLocSelected && (
                          <button type="button" onClick={() => selectAllDevicesInLocation(loc.id)} title="Zaznacz wszystkie"
                            style={{ fontSize: 9, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            +all
                          </button>
                        )}
                        {selectedInLoc > 0 && !isLocSelected && (
                          <button type="button" onClick={() => deselectAllDevicesInLocation(loc.id)} title="Odznacz wszystkie"
                            style={{ fontSize: 9, color: '#F87171', background: 'none', border: 'none', cursor: 'pointer' }}>
                            -all
                          </button>
                        )}
                      </div>

                      {/* Devices under location */}
                      {isExpanded && visibleDevices.map((dev: any) => {
                        const isDevSelected = selectedDevices.includes(dev.id);
                        const implicitViaLoc = isLocSelected;
                        return (
                          <label key={dev.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 36px', borderRadius: 6, cursor: 'pointer',
                            background: isDevSelected ? 'rgba(99,102,241,0.06)' : implicitViaLoc ? 'rgba(99,102,241,0.03)' : 'transparent',
                          }}>
                            <input type="checkbox" checked={isDevSelected || implicitViaLoc} disabled={implicitViaLoc}
                              onChange={e => {
                                if (implicitViaLoc) return;
                                if (e.target.checked) setSelectedDevices(s => [...s, dev.id]);
                                else setSelectedDevices(s => s.filter(id => id !== dev.id));
                              }}
                              style={{ accentColor: 'var(--accent)' }} />
                            <Monitor style={{ width: 10, height: 10, color: 'var(--tm)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: isDevSelected || implicitViaLoc ? 'var(--t)' : 'var(--ts)' }}>
                              {dev.name}
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--td)' }}>{dev.hostname ?? ''}</span>
                            {implicitViaLoc && !isDevSelected && (
                              <span style={{ fontSize: 8, color: 'var(--accent)', marginLeft: 'auto' }}>via lokalizacja</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
                {filteredLocations.length === 0 && (
                  <p style={{ fontSize: 11, color: 'var(--td)', padding: 12, textAlign: 'center' }}>Brak lokalizacji</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: summary panel */}
        <div style={{
          width: 200, flexShrink: 0, padding: 14, borderRadius: 12,
          background: 'var(--hover-bg)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start', position: 'sticky', top: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Podsumowanie</div>

          {/* User */}
          {isEdit && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--td)' }}>Uzytkownik</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t)' }}>{member?.user.firstName} {member?.user.lastName}</div>
            </div>
          )}
          {!isEdit && emailStatus === 'found' && foundUser && (
            <div>
              <div style={{ fontSize: 9, color: 'var(--td)' }}>Uzytkownik</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#4ADE80' }}>{foundUser.firstName} {foundUser.lastName}</div>
            </div>
          )}

          {/* Typ konta */}
          <div>
            <div style={{ fontSize: 9, color: 'var(--td)' }}>Typ konta</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: ac.color }}>{ac.label}</span>
          </div>

          {/* Zakres */}
          <div>
            <div style={{ fontSize: 9, color: 'var(--td)' }}>Zakres</div>
            {accountType === 'ADMIN' || accessScope === 'FULL' ? (
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>Pełny dostęp</span>
            ) : (
              <div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#FBBF24' }}>Spersonalizowany</span>
                <div style={{ fontSize: 10, color: 'var(--ts)', marginTop: 4 }}>
                  {selectedLocations.length > 0 && <div>{selectedLocations.length} lokalizacji</div>}
                  {selectedDevices.length > 0 && <div>{selectedDevices.length} urzadzen</div>}
                  {totalGrants === 0 && <div style={{ color: '#F87171' }}>Brak grantow!</div>}
                </div>
              </div>
            )}
          </div>

          {/* Widzi */}
          {scopeType === 'SCOPED' && totalGrants > 0 && (
            <div>
              <div style={{ fontSize: 9, color: '#4ADE80', fontWeight: 600 }}>Widzi</div>
              <div style={{ fontSize: 10, color: 'var(--ts)' }}>
                {selectedLocations.length > 0 && (
                  <div>{selectedLocations.length} lok. + ich urzadzenia</div>
                )}
                {selectedDevices.length > 0 && (
                  <div>{selectedDevices.length} pojedynczych urzadzen</div>
                )}
                <div style={{ color: 'var(--td)', fontSize: 9, marginTop: 2 }}>+ powiazane tickety, sesje, credentials</div>
              </div>
            </div>
          )}

          {/* Nie widzi */}
          {scopeType === 'SCOPED' && (unseenLocations.length > 0 || unseenDevices.length > 0) && (
            <div>
              <div style={{ fontSize: 9, color: '#F87171', fontWeight: 600 }}>Nie widzi</div>
              <div style={{ fontSize: 10, color: 'var(--td)' }}>
                {unseenLocations.length > 0 && (
                  <div>{unseenLocations.length} lokalizacji</div>
                )}
                {unseenDevices.length > 0 && (
                  <div>{unseenDevices.length} urzadzen</div>
                )}
              </div>
              {/* Collapsed list of unseen */}
              {showPreview && (
                <div style={{ marginTop: 4, fontSize: 9, color: 'var(--td)', maxHeight: 120, overflowY: 'auto' }}>
                  {unseenLocations.map((l: any) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 0' }}>
                      <MapPin style={{ width: 8, height: 8, flexShrink: 0 }} />
                      <span style={{ textDecoration: 'line-through' }}>{l.name}</span>
                    </div>
                  ))}
                  {unseenDevices.slice(0, 10).map((d: any) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 0' }}>
                      <Monitor style={{ width: 8, height: 8, flexShrink: 0 }} />
                      <span style={{ textDecoration: 'line-through' }}>{d.name}</span>
                    </div>
                  ))}
                  {unseenDevices.length > 10 && (
                    <div style={{ color: 'var(--td)' }}>...i {unseenDevices.length - 10} wiecej</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview toggle */}
          {scopeType === 'SCOPED' && totalGrants > 0 && (
            <button type="button" onClick={() => setShowPreview(p => !p)}
              style={{
                fontSize: 10, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                background: showPreview ? 'rgba(251,191,36,0.1)' : 'transparent',
                border: `1px solid ${showPreview ? '#FBBF24' : 'var(--border)'}`,
                color: showPreview ? '#FBBF24' : 'var(--ts)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <Eye style={{ width: 11, height: 11 }} />
              {showPreview ? 'Ukryj podglad' : 'Podglad dostepu'}
            </button>
          )}
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 14 }}>
        <Button type="submit" loading={addMutation.isPending || editMutation.isPending}
          disabled={!isEdit && emailStatus !== 'found'}>
          {isEdit ? 'Zapisz zmiany' : 'Dodaj uzytkownika'}
        </Button>
      </div>
    </form>
  );
}

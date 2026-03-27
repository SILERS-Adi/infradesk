import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Monitor, Phone, Mail, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '../../../api/users';
import { agentsApi, AgentRegistration } from '../../../api/agents';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { UserForm } from '../../../components/forms/UserForm';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import type { User as UserType } from '../../../types';

const ROLE_COLORS: Record<string, 'red' | 'blue' | 'green'> = { ADMIN: 'red', TECHNICIAN: 'blue', CLIENT: 'green' };
const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrator', TECHNICIAN: 'Technik', CLIENT: 'Klient' };

export function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserType | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.getAll(),
    staleTime: 30_000,
  });

  // Map agents by email for matching
  const agentByEmail = useMemo(() => {
    const map = new Map<string, AgentRegistration>();
    for (const a of agents) {
      if (a.contactEmail) map.set(a.contactEmail.toLowerCase(), a);
    }
    return map;
  }, [agents]);

  // Map agents by clientId — multiple agents per client
  const agentsByClient = useMemo(() => {
    const map = new Map<string, AgentRegistration[]>();
    for (const a of agents) {
      if (a.clientId) {
        const arr = map.get(a.clientId) ?? [];
        arr.push(a);
        map.set(a.clientId, arr);
      }
    }
    return map;
  }, [agents]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => { toast.success('Użytkownik usunięty'); qc.invalidateQueries({ queryKey: ['users'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${u.firstName} ${u.lastName}`.toLowerCase();
        const email = u.email.toLowerCase();
        const client = u.client?.name?.toLowerCase() ?? '';
        // Also search by agent hostname
        const agent = agentByEmail.get(email);
        const hostname = agent?.hostname?.toLowerCase() ?? '';
        if (!name.includes(q) && !email.includes(q) && !client.includes(q) && !hostname.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, agentByEmail]);

  return (
    <div>
      <PageHeader
        title="Użytkownicy"
        subtitle={`${users.length} użytkowników`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowy użytkownik
          </Button>
        }
      />

      {/* Filters */}
      <div className="rounded-t-[18px] p-4 flex flex-wrap gap-3 items-center"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj (imię, email, firma, komputer)..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="text-sm rounded-xl px-3 py-2.5 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}>
          <option value="">Wszystkie role</option>
          <option value="ADMIN">Administratorzy</option>
          <option value="TECHNICIAN">Technicy</option>
          <option value="CLIENT">Klienci</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-b-[18px] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <User className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak użytkowników</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Użytkownik</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Rola</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Firma</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Komputer</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Kontakt</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  // Find agent for this user
                  const agent = agentByEmail.get(u.email.toLowerCase());
                  // If no direct match, find agent in same client
                  const clientAgents = u.clientId ? (agentsByClient.get(u.clientId) ?? []) : [];
                  const matchedAgent = agent ?? clientAgents.find(a =>
                    a.contactFirstName?.toLowerCase() === u.firstName.toLowerCase()
                  );
                  const hostname = matchedAgent?.hostname;
                  const isOnline = matchedAgent?.lastSeen
                    ? Date.now() - new Date(matchedAgent.lastSeen).getTime() < 2 * 60 * 1000
                    : false;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      className="transition-colors hover:bg-white/[0.02]">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: u.role === 'CLIENT' ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.12)' }}>
                              <span className="text-xs font-bold" style={{ color: u.role === 'CLIENT' ? '#4ADE80' : '#A78BFA' }}>
                                {u.firstName[0]}{u.lastName[0]}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-white/85 truncate">{u.firstName} {u.lastName}</p>
                            <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3">
                        <Badge color={ROLE_COLORS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                      </td>
                      {/* Client/Company */}
                      <td className="px-4 py-3">
                        {u.client?.name ? (
                          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{u.client.name}</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                        )}
                      </td>
                      {/* Computer */}
                      <td className="px-4 py-3">
                        {hostname ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-500' : ''}`}
                              style={!isOnline ? { background: 'rgba(255,255,255,0.15)' } : {}} />
                            <Monitor className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                            <span className="text-[12px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{hostname}</span>
                          </div>
                        ) : (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                        )}
                      </td>
                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.phone && (
                            <a href={`tel:${u.phone}`} className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline">
                              <Phone className="h-3 w-3" /> {u.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Aktywny' : 'Nieaktywny'}</Badge>
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditTarget(u)}
                            className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors hover:bg-white/[0.06]"
                            style={{ color: 'rgba(255,255,255,0.4)' }}>
                            Edytuj
                          </button>
                          <button onClick={() => setDeleteTarget(u)}
                            className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors hover:bg-red-500/10"
                            style={{ color: 'rgba(255,255,255,0.25)' }}>
                            Usuń
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="lg" noPadding>
        <UserForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['users'] }); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {editTarget && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="lg" noPadding>
          <UserForm
            user={editTarget}
            onSuccess={() => { setEditTarget(null); qc.invalidateQueries({ queryKey: ['users'] }); }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń użytkownika"
        message={`Czy usunąć "${deleteTarget?.firstName} ${deleteTarget?.lastName}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

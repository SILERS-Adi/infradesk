import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Users, Shield, Wrench } from 'lucide-react';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { UserForm } from '../../../components/forms/UserForm';
import { getErrorMessage } from '../../../utils/helpers';
import type { User } from '../../../types';

const ROLE_COLORS = { ADMIN: 'red', TECHNICIAN: 'blue' } as const;
const ROLE_LABELS = { ADMIN: 'Administrator', TECHNICIAN: 'Technik' };
const ROLE_ICONS = {
  ADMIN: <Shield className="h-3.5 w-3.5" />,
  TECHNICIAN: <Wrench className="h-3.5 w-3.5" />,
};

export function EmployeesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  });

  // Only show ADMIN and TECHNICIAN — CLIENT users belong to clients
  const employees = allUsers.filter(u => u.role === 'ADMIN' || u.role === 'TECHNICIAN');

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      usersApi.update(id, { role: role as User['role'] }),
    onSuccess: () => {
      toast.success('Rola zmieniona');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Pracownicy"
        subtitle={`${employees.length} pracowników`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Dodaj pracownika
          </Button>
        }
      />

      {isLoading && <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Ładowanie...</p>}

      {!isLoading && employees.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Users className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak pracowników</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Dodaj pierwszego pracownika klikając przycisk powyżej.</p>
        </div>
      )}

      {!isLoading && employees.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Pracownik</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Rola</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map(user => (
                <tr key={user.id} className="hover:bg-white/[0.03] transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl font-bold text-sm flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium text-white/85">{user.firstName} {user.lastName}</div>
                        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Badge color={ROLE_COLORS[user.role as keyof typeof ROLE_COLORS] ?? 'gray'}>
                        <span className="flex items-center gap-1">
                          {ROLE_ICONS[user.role as keyof typeof ROLE_ICONS]}
                          {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                        </span>
                      </Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge color={user.isActive ? 'green' : 'gray'}>
                      {user.isActive ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <select
                        value={user.role}
                        onChange={(e) => changeRoleMutation.mutate({ id: user.id, role: e.target.value })}
                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
                        disabled={changeRoleMutation.isPending}
                      >
                        <option value="ADMIN">Administrator</option>
                        <option value="TECHNICIAN">Technik</option>
                      </select>
                      <Button size="sm" variant="secondary" onClick={() => setEditTarget(user)}>
                        Edytuj
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="lg" noPadding>
        <UserForm
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {editTarget && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="lg" noPadding>
          <UserForm
            user={editTarget}
            onSuccess={() => {
              setEditTarget(null);
              qc.invalidateQueries({ queryKey: ['users'] });
            }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}
    </div>
  );
}

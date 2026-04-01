import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Shield } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

export default function SAUsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['sa-users'], queryFn: superadminApi.getUsers });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;

  const ROLE_C: Record<string, { bg: string; color: string }> = {
    ADMIN: { bg: 'rgba(239,68,68,0.1)', color: '#F87171' },
    TECHNICIAN: { bg: 'rgba(59,130,246,0.1)', color: '#60A5FA' },
    CLIENT: { bg: 'rgba(16,185,129,0.1)', color: '#34D399' },
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Użytkownicy platformy</h1>
        <p className="text-sm" style={{ color: 'var(--ts)' }}>{users.length} kont</p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              {['Użytkownik', 'Tenant', 'Rola', 'SA', 'Ostatnie logowanie', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => {
              const rc = ROLE_C[u.role] || ROLE_C.CLIENT;
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--hover-bg)]">
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--t)' }}>{u.firstName} {u.lastName}</div>
                    <div className="text-[10px]" style={{ color: 'var(--tm)' }}>{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--ts)' }}>{u.tenant?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: rc.bg, color: rc.color }}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={async () => {
                      await superadminApi.updateUser(u.id, { isSuperAdmin: !u.isSuperAdmin });
                      qc.invalidateQueries({ queryKey: ['sa-users'] });
                      toast.success(u.isSuperAdmin ? 'SA cofnięty' : 'SA nadany');
                    }} className="group" title={u.isSuperAdmin ? 'Cofnij SuperAdmin' : 'Nadaj SuperAdmin'}>
                      <Shield className={`h-4 w-4 transition-colors ${u.isSuperAdmin ? 'text-red-400' : 'text-[var(--td)] group-hover:text-[var(--tm)]'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--tm)' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pl-PL') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={async () => {
                      await superadminApi.updateUser(u.id, { isActive: !u.isActive });
                      qc.invalidateQueries({ queryKey: ['sa-users'] });
                      toast.success(u.isActive ? 'Zablokowany' : 'Odblokowany');
                    }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${u.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {u.isActive ? 'Aktywny' : 'Zablokowany'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

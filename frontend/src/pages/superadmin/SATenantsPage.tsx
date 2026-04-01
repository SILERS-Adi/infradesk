import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, ChevronDown, Loader2, Search } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

const TYPE_COLORS: Record<string, { label: string; color: string }> = {
  MSP: { label: 'MSP', color: '#8B5CF6' },
  BUSINESS: { label: 'Business', color: '#3B82F6' },
  PERSONAL: { label: 'Personal', color: '#10B981' },
};
const PLANS = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const TYPES = ['MSP', 'BUSINESS', 'PERSONAL'];

export default function SATenantsPage() {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['sa-tenants'], queryFn: superadminApi.getTenants });
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = tenants.filter((t: any) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const act = async (id: string, data: any, msg: string) => {
    try { await superadminApi.updateTenant(id, data); qc.invalidateQueries({ queryKey: ['sa-tenants'] }); toast.success(msg); }
    catch { toast.error('Błąd'); }
    setActionId(null);
  };

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Tenanci</h1>
          <p className="text-sm" style={{ color: 'var(--ts)' }}>{tenants.length} zarejestrowanych</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--tm)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              {['Nazwa', 'Typ', 'Plan', 'Parent', 'Users', 'Agents', 'Klienci', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t: any) => {
              const tp = TYPE_COLORS[t.tenantType] || TYPE_COLORS.BUSINESS;
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--hover-bg)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--t)' }}>{t.name}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--tm)' }}>{t.slug}.infradesk.pl</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${tp.color}12`, color: tp.color }}>{tp.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--ts)' }}>{t.plan}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--tm)' }}>{t.parentTenant?.name || '—'}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--ts)' }}>{t._count?.users}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--ts)' }}>{t._count?.agents}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--ts)' }}>{t._count?.childTenants || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {t.isActive ? 'Aktywny' : 'Wyłączony'}
                    </span>
                  </td>
                  <td className="px-4 py-3 relative">
                    <button onClick={() => setActionId(actionId === t.id ? null : t.id)} className="p-1 rounded hover:bg-[var(--hover-bg)]" style={{ color: 'var(--tm)' }}>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {actionId === t.id && (
                      <div className="absolute right-4 top-10 z-20 w-52 rounded-xl p-1.5 shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <p className="text-[9px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--td)' }}>Plan</p>
                        {PLANS.map(p => (
                          <button key={p} onClick={() => act(t.id, { plan: p }, `Plan → ${p}`)}
                            className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-[var(--hover-bg)]" style={{ color: t.plan === p ? '#F87171' : 'var(--ts)' }}>{p}</button>
                        ))}
                        <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
                        <p className="text-[9px] font-bold uppercase tracking-wider px-2 py-1" style={{ color: 'var(--td)' }}>Typ</p>
                        {TYPES.map(tp => (
                          <button key={tp} onClick={() => act(t.id, { tenantType: tp }, `Typ → ${tp}`)}
                            className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-[var(--hover-bg)]" style={{ color: t.tenantType === tp ? '#F87171' : 'var(--ts)' }}>{tp}</button>
                        ))}
                        <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
                        <button onClick={() => act(t.id, { isActive: !t.isActive }, t.isActive ? 'Dezaktywowany' : 'Aktywowany')}
                          className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-[var(--hover-bg)] text-amber-400">
                          {t.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                      </div>
                    )}
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

import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, Users, Monitor, Ticket, Server, Loader2 } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';

export default function SADashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['sa-stats'], queryFn: superadminApi.getStats });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;

  const cards = [
    { label: 'Tenanci', value: stats?.tenants, icon: Building2, color: '#F87171' },
    { label: 'Użytkownicy', value: stats?.users, icon: Users, color: '#60A5FA' },
    { label: 'Agenci online', value: stats?.agents, icon: Monitor, color: '#4ADE80' },
    { label: 'Urządzenia', value: stats?.devices, icon: Server, color: '#A78BFA' },
    { label: 'Zgłoszenia', value: stats?.tickets, icon: Ticket, color: '#FBBF24' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Dashboard platformy</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--tm)' }}>Przegląd całego systemu InfraDesk</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2 mb-2">
              <c.icon className="h-4 w-4" style={{ color: c.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>{c.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/50">MSP</p>
          <p className="text-3xl font-bold text-violet-400 mt-1">{stats?.byType?.msp ?? 0}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>Firmy IT zarządzające klientami</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400/50">Business</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{stats?.byType?.business ?? 0}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>Firmy zarządzające własną infra</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/50">Personal</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{stats?.byType?.personal ?? 0}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>Użytkownicy domowi</p>
        </div>
      </div>
    </div>
  );
}

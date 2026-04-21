import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Server, Users, Key, MapPin,
  ShoppingCart, Activity, Brain, Settings, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { Button } from '../ui/Button';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Kokpit', module: 'dashboard' },
  { to: '/tickets', icon: Ticket, label: 'Zgłoszenia', module: 'tickets' },
  { to: '/devices', icon: Server, label: 'Urządzenia', module: 'devices' },
  { to: '/locations', icon: MapPin, label: 'Lokalizacje', module: 'locations' },
  { to: '/clients', icon: Users, label: 'Klienci (CRM)', module: 'clients' },
  { to: '/orders', icon: ShoppingCart, label: 'Zakupy', module: 'orders' },
  { to: '/vault', icon: Key, label: 'Sejf haseł', module: 'vault' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring', module: 'monitoring' },
  { to: '/ai', icon: Brain, label: 'AI (Iris)', module: 'ai.copilot' },
  { to: '/settings', icon: Settings, label: 'Ustawienia', module: 'workspace.settings' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  return (
    <aside className="w-64 shrink-0 bg-sf2/50 backdrop-blur border-r border-bd flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-bd">
        <div className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-tx">InfraDesk</span>
            <span className="text-[10px] text-tx3 uppercase tracking-wider">v2 · alpha</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-[var(--rs)] px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-[var(--pri-l)] text-pri' : 'text-tx2 hover:bg-sf2 hover:text-tx',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-bd p-3 space-y-2">
        {user && (
          <div className="flex items-center gap-2 px-2">
            <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--pri-l)] flex items-center justify-center text-xs font-semibold text-pri">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-tx truncate">{user.firstName} {user.lastName}</div>
              <div className="text-[10px] text-tx3 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" /> Wyloguj
        </Button>
      </div>
    </aside>
  );
}

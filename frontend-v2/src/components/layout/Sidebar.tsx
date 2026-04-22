import { useState, type ReactNode, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Ticket, CheckSquare, Calendar, Timer, Receipt, Bell, ShoppingCart, Car, Globe2,
  Building2, Users, MapPin, Handshake,
  Server, Zap, Activity, HardDriveDownload, Scroll,
  Key, Brain, Radar, Lightbulb, Clock, DollarSign,
  Building, UserCog, Package2, Cog,
  ChevronDown, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

type WorkspaceType = 'MSP' | 'CLIENT' | 'INTERNAL_IT';

interface NavItem {
  to: string;
  icon: typeof Ticket;
  label: string;
  badge?: number;
  comingSoon?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Groups visible for each workspace type. CLIENT portal is drastically trimmed:
// only their own tickets/devices/vault + AI chat + own settings. No MSP-only admin views.
const CLIENT_VISIBLE_PATHS = new Set<string>([
  '/', '/tickets', '/calendar',
  '/devices', '/activity-logs',
  '/vault', '/vault/mine', '/vault/shared',
  '/ai',
  '/my-company', '/users', '/settings',
]);

// Group IDs hidden entirely in CLIENT portal.
const CLIENT_HIDDEN_GROUPS = new Set<string>(['clients']);

const GROUPS: NavGroup[] = [
  {
    id: 'operations',
    label: 'Operacje',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Kokpit' },
      { to: '/tickets', icon: Ticket, label: 'Zgłoszenia' },
      { to: '/tasks', icon: CheckSquare, label: 'Zadania' },
      { to: '/calendar', icon: Calendar, label: 'Kalendarz' },
      { to: '/sessions', icon: Timer, label: 'Sesje pracy' },
      { to: '/billing', icon: Receipt, label: 'Rozliczenia' },
      { to: '/alerts', icon: Bell, label: 'Alerty' },
      { to: '/orders', icon: ShoppingCart, label: 'Zamówienia' },
      { to: '/delegations', icon: Car, label: 'Delegacje' },
      { to: '/portal-settings', icon: Globe2, label: 'Portal i obsługa' },
    ],
  },
  {
    id: 'clients',
    label: 'Klienci',
    items: [
      { to: '/clients', icon: Building2, label: 'Firmy klientów' },
      { to: '/contacts', icon: Users, label: 'Kontakty' },
      { to: '/locations', icon: MapPin, label: 'Lokalizacje' },
      { to: '/partners', icon: Handshake, label: 'Partnerzy IT', comingSoon: true },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastruktura IT',
    items: [
      { to: '/devices', icon: Server, label: 'Urządzenia' },
      { to: '/agents', icon: Zap, label: 'Asystenci' },
      { to: '/monitoring', icon: Activity, label: 'Audyt i sieć' },
      { to: '/backups', icon: HardDriveDownload, label: 'Kopie zapasowe' },
      { to: '/activity-logs', icon: Scroll, label: 'Logi aktywności' },
    ],
  },
  {
    id: 'vault',
    label: 'Sejf haseł',
    items: [
      { to: '/vault', icon: Key, label: 'Wszystkie' },
      { to: '/vault/mine', icon: Key, label: 'Moje' },
      { to: '/vault/shared', icon: Key, label: 'Współdzielone' },
    ],
  },
  {
    id: 'ai',
    label: 'Asystent AI',
    items: [
      { to: '/ai', icon: Brain, label: 'Czat i komendy' },
      { to: '/ai/shadow', icon: Radar, label: 'Shadow Mode' },
      { to: '/ai/insights', icon: Lightbulb, label: 'Insights' },
      { to: '/ai/time', icon: Clock, label: 'Invisible Time', comingSoon: true },
      { to: '/ai/usage', icon: DollarSign, label: 'Koszty AI' },
    ],
  },
  {
    id: 'company',
    label: 'Moja firma',
    items: [
      { to: '/my-company', icon: Building, label: 'Moje dane' },
      { to: '/users', icon: UserCog, label: 'Użytkownicy' },
      { to: '/plan-and-modules', icon: Package2, label: 'Plan i moduły' },
      { to: '/settings', icon: Cog, label: 'Ustawienia' },
    ],
  },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const wsQ = useQuery<{ workspace: { id: string; name: string; slug: string; type: WorkspaceType } }>({
    queryKey: ['workspace', 'current'],
    queryFn: async () => (await api.get<{ workspace: { id: string; name: string; slug: string; type: WorkspaceType } }>('/workspaces/current')).data,
    staleTime: 5 * 60_000,
  });
  const workspace = wsQ.data?.workspace;
  const isClient = workspace?.type === 'CLIENT';

  const visibleGroups = useMemo(() => {
    if (!isClient) return GROUPS;
    return GROUPS
      .filter((g) => !CLIENT_HIDDEN_GROUPS.has(g.id))
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => CLIENT_VISIBLE_PATHS.has(it.to)),
      }))
      .filter((g) => g.items.length > 0);
  }, [isClient]);

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  };

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col h-screen fixed left-0 top-0 z-40"
      style={{ background: 'var(--side-bg)', borderRight: '1px solid var(--side-bd)' }}
    >
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <img src="/logo-icon.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
        <div className="leading-tight">
          <p className="text-[14px] font-bold text-tx truncate">
            {isClient && workspace ? workspace.name : <>Infra<span style={{ color: 'var(--pri)' }}>Desk</span></>}
          </p>
          <p className="text-[9px] font-semibold tracking-[0.2em] uppercase text-tx3">
            {isClient ? 'Portal klienta' : 'v2 · Operacje'}
          </p>
        </div>
      </div>

      <div className="mx-4 h-px" style={{ background: 'var(--side-bd)' }} />

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {visibleGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            collapsed={collapsed.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 pt-1 pb-3" style={{ borderTop: '1px solid var(--side-bd)' }}>
        {user && (
          <div className="flex items-center gap-2 px-2 py-2">
            <div
              className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
            >
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-tx truncate">{user.firstName} {user.lastName}</p>
              <p className="text-[10px] text-tx3 truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-[6px] text-tx3 press transition-colors"
              style={{ transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--er-l)'; e.currentTarget.style.color = 'var(--er)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--tx3)'; }}
              title="Wyloguj"
            >
              <LogOut style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarGroup({ group, collapsed, onToggle }: { group: NavGroup; collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-tx3 hover:text-tx2"
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', collapsed && '-rotate-90')}
          aria-hidden
        />
      </button>
      {!collapsed && (
        <div className="space-y-[1px]">
          {group.items.map((item) => (
            <SidebarItem key={item.to} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarItem({ item }: { item: NavItem }): ReactNode {
  const loc = useLocation();
  const active = item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to) && item.to !== '/vault' || loc.pathname === item.to;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-[9px] rounded-[var(--r-s)] text-[13px] font-medium transition-all',
          isActive || active ? '' : 'text-tx2 hover:text-tx',
        )
      }
      style={({ isActive }) => {
        const isOn = isActive || (item.to !== '/vault' && item.to !== '/' && loc.pathname.startsWith(item.to));
        return isOn
          ? { background: 'var(--side-act)', color: 'var(--side-act-tx)', fontWeight: 600 }
          : {};
      }}
    >
      <item.icon style={{ width: 16, height: 16, strokeWidth: 1.7 }} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.comingSoon && (
        <span className="text-[8px] font-bold uppercase tracking-wider text-tx3 bg-sf-h px-1.5 py-0.5 rounded">
          soon
        </span>
      )}
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
          style={{ background: 'var(--pri)' }}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </NavLink>
  );
}

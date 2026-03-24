import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Monitor,
  Ticket, ChevronLeft, ChevronRight, X, MessageSquare, Bot, Briefcase, ClipboardList,
  ShoppingCart, HelpCircle, Download
} from 'lucide-react';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  label: string;
  accent?: 'blue' | 'orange';
  items: NavItem[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobile, onClose }: SidebarProps) {
  const { data: queueTickets = [] } = useQuery({
    queryKey: ['tickets-queue'],
    queryFn: () => ticketsApi.getAll({ status: 'PENDING' }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const queueCount = queueTickets.length;

  const { data: myTasks = [] } = useQuery({
    queryKey: ['tasks', { all: false }],
    queryFn: () => tasksApi.getAll({ all: false }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const myActiveTasksCount = myTasks.filter(t => t.status !== 'DONE').length;

  const navGroups: NavGroup[] = [
    {
      label: 'PANEL',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
      ],
    },
    {
      label: 'KLIENCI',
      items: [
        { to: '/clients', label: 'Klienci', icon: <Building2 className="h-5 w-5" /> },
      ],
    },
    {
      label: 'URZĄDZENIA',
      items: [
        { to: '/devices', label: 'Urządzenia', icon: <Monitor className="h-5 w-5" /> },
        { to: '/agents',  label: 'Agenci',     icon: <Bot className="h-5 w-5" /> },
      ],
    },
    {
      label: 'SERWIS',
      accent: 'blue',
      items: [
        { to: '/tickets', label: 'Zgłoszenia',  icon: <Ticket className="h-5 w-5" />, badge: queueCount > 0 ? queueCount : undefined },
        { to: '/tasks',   label: 'Zadania',     icon: <ClipboardList className="h-5 w-5" />, badge: myActiveTasksCount > 0 ? myActiveTasksCount : undefined },
        { to: '/orders',  label: 'Zamówienia',  icon: <ShoppingCart className="h-5 w-5" /> },
        { to: '/crm',     label: 'Sesje pracy', icon: <MessageSquare className="h-5 w-5" /> },
      ],
    },
    {
      label: 'SYSTEM',
      accent: 'orange',
      items: [
        { to: '/downloads', label: 'Pobieranie', icon: <Download className="h-5 w-5" /> },
      ],
    },
    {
      label: 'MOJA FIRMA',
      items: [
        { to: '/my-company',           label: 'Dane firmy', icon: <Building2 className="h-5 w-5" /> },
        { to: '/my-company/employees', label: 'Pracownicy', icon: <Briefcase className="h-5 w-5" /> },
      ],
    },
  ];

  return (
    <aside
      className={clsx(
        'flex flex-col h-full transition-all duration-300 ease-in-out',
        'bg-sidebar-bg',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div
        className="flex-shrink-0 border-b border-sidebar-border relative"
        style={{ background: '#08101e' }}
      >
        {mobile && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-sidebar-text hover:text-white p-1 rounded z-10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {collapsed ? (
          <div className="flex items-center justify-center h-16">
            <img src="/logo-mono.png" alt="InfraDesk" className="w-9 h-9 object-contain" />
          </div>
        ) : (
          <div className="flex items-center justify-center px-4 py-2">
            <img src="/logo.png" alt="InfraDesk" className="w-full object-contain" />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-3 mb-1.5">
                {group.accent === 'blue' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                )}
                {group.accent === 'orange' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
                )}
                <p className="text-xs font-semibold text-sidebar-text uppercase tracking-wider">
                  {group.label}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/tickets'}
                  onClick={mobile ? onClose : undefined}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-xl text-sm font-medium transition-all duration-150',
                      collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5',
                      isActive
                        ? 'bg-sidebar-active text-brand-300 shadow-sm'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-textActive'
                    )
                  }
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge != null && (
                        <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge != null && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* FAQ — na samym dole */}
      <div className="px-2 pb-1 border-t border-sidebar-border pt-3">
        <NavLink
          to="/faq"
          onClick={mobile ? onClose : undefined}
          title={collapsed ? 'FAQ' : undefined}
          className={({ isActive }) =>
            clsx(
              'flex items-center rounded-xl text-sm font-medium transition-all duration-150',
              collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-sidebar-active text-brand-300 shadow-sm'
                : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-textActive'
            )
          }
        >
          <HelpCircle className="h-5 w-5" />
          {!collapsed && <span className="flex-1">FAQ</span>}
        </NavLink>
      </div>

      {/* Toggle (tylko desktop) */}
      {!mobile && (
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={onToggle}
            className={clsx(
              'flex items-center justify-center rounded-xl text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors',
              collapsed ? 'w-10 h-10 mx-auto' : 'w-full h-9 gap-2 text-xs px-3'
            )}
          >
            {collapsed
              ? <ChevronRight className="h-4 w-4" />
              : <><ChevronLeft className="h-4 w-4" /><span>Zwiń</span></>
            }
          </button>
        </div>
      )}
    </aside>
  );
}

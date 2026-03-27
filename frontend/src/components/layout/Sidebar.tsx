import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Monitor,
  Ticket, ChevronLeft, ChevronRight, X, MessageSquare, Bot, Briefcase, ClipboardList,
  ShoppingCart, HelpCircle, Download, Settings, HardDrive, KeyRound, Timer,
  Receipt, Plane, Users, CalendarDays,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';

interface NavItem { to: string; label: string; icon: React.ReactNode; badge?: number; }
interface NavGroup { label: string; items: NavItem[]; }

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
    refetchInterval: 30_000, staleTime: 15_000,
  });
  const { data: myTasks = [] } = useQuery({
    queryKey: ['tasks', { all: false }],
    queryFn: () => tasksApi.getAll({ all: false }),
    refetchInterval: 30_000, staleTime: 15_000,
  });
  const queueCount = queueTickets.length;
  const myActiveTasksCount = myTasks.filter(t => t.status !== 'DONE').length;

  const navGroups: NavGroup[] = [
    { label: 'PANEL', items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'KLIENCI', items: [
      { to: '/clients',     label: 'Klienci',      icon: <Building2 className="h-[18px] w-[18px]" /> },
      { to: '/users',       label: 'Użytkownicy',  icon: <Users className="h-[18px] w-[18px]" /> },
      { to: '/credentials', label: 'Dostępy',      icon: <KeyRound className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'URZĄDZENIA', items: [
      { to: '/devices', label: 'Urządzenia', icon: <Monitor className="h-[18px] w-[18px]" /> },
      { to: '/agents',  label: 'Agenci',     icon: <Bot className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'SERWIS', items: [
      { to: '/tickets', label: 'Zgłoszenia',  icon: <Ticket className="h-[18px] w-[18px]" />, badge: queueCount > 0 ? queueCount : undefined },
      { to: '/tasks',     label: 'Zadania',     icon: <ClipboardList className="h-[18px] w-[18px]" />, badge: myActiveTasksCount > 0 ? myActiveTasksCount : undefined },
      { to: '/calendar',  label: 'Kalendarz',   icon: <CalendarDays className="h-[18px] w-[18px]" /> },
      { to: '/orders',  label: 'Zamówienia',  icon: <ShoppingCart className="h-[18px] w-[18px]" /> },
      { to: '/delegations', label: 'Delegacje', icon: <Plane className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'CRM', items: [
      { to: '/crm',      label: 'Aktywności', icon: <MessageSquare className="h-[18px] w-[18px]" /> },
      { to: '/sessions', label: 'Sesje pracy', icon: <Timer className="h-[18px] w-[18px]" /> },
      { to: '/billing',  label: 'Rozliczenia', icon: <Receipt className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'SYSTEM', items: [
      { to: '/backups',    label: 'Kopie zapasowe', icon: <HardDrive className="h-[18px] w-[18px]" /> },
      { to: '/downloads',  label: 'Pobieranie',     icon: <Download className="h-[18px] w-[18px]" /> },
      { to: '/settings',   label: 'Ustawienia',     icon: <Settings className="h-[18px] w-[18px]" /> },
    ]},
    { label: 'FIRMA', items: [
      { to: '/my-company',           label: 'Dane firmy',  icon: <Building2 className="h-[18px] w-[18px]" /> },
      { to: '/my-company/employees', label: 'Pracownicy',  icon: <Users className="h-[18px] w-[18px]" /> },
    ]},
  ];

  return (
    <aside className={clsx('flex flex-col h-full transition-all duration-300 ease-in-out relative z-[2]', collapsed ? 'w-16' : 'w-[220px]')}
      style={{
        background: 'rgba(8, 14, 28, 0.92)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '8px 0 30px rgba(0,0,0,0.25)',
      }}>

      {/* Logo */}
      <div className="flex-shrink-0 relative" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        {mobile && (
          <button onClick={onClose} className="absolute top-2 right-2 text-white/40 hover:text-white/70 p-1 rounded z-10">
            <X className="h-4 w-4" />
          </button>
        )}
        {collapsed ? (
          <div className="flex items-center justify-center h-14">
            <img src="/logo-mono.png" alt="" className="w-8 h-8 object-contain opacity-85" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-5 h-14">
            <img src="/logo-mono.png" alt="" className="w-7 h-7 object-contain opacity-90" />
            <span className="text-[14px] font-semibold text-white">InfraDesk</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6">
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] px-3 mb-2" style={{ color: 'rgba(255,255,255,0.34)' }}>
                {group.label}
              </p>
            )}
            <div className="space-y-[3px]">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/tickets'}
                  onClick={mobile ? onClose : undefined}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-xl text-[13px] font-medium transition-all duration-150 relative',
                      collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-[9px]',
                      isActive
                        ? 'text-white'
                        : 'text-white/55 hover:text-white/85 hover:bg-white/[0.05]'
                    )
                  }
                  style={({ isActive }) => isActive ? {
                    background: 'linear-gradient(90deg, rgba(124,58,237,0.18), rgba(37,99,235,0.08))',
                    border: '1px solid rgba(124,58,237,0.25)',
                    boxShadow: '0 0 16px rgba(124,58,237,0.08)',
                  } : {}}
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {item.badge != null && (
                        <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full min-w-[18px] text-center"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge != null && (
                    <span className="absolute -top-0.5 -right-0.5 w-[14px] h-[14px] text-[8px] font-bold rounded-full flex items-center justify-center"
                      style={{ background: '#EF4444', color: '#fff' }}>
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* FAQ */}
      <div className="px-2.5 pb-1 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <NavLink to="/faq" onClick={mobile ? onClose : undefined} title={collapsed ? 'FAQ' : undefined}
          className={({ isActive }) => clsx(
            'flex items-center rounded-xl text-[13px] font-medium transition-all duration-150',
            collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-[9px]',
            isActive ? 'text-white bg-white/[0.06]' : 'text-white/45 hover:text-white/70 hover:bg-white/[0.04]'
          )}>
          <HelpCircle className="h-[18px] w-[18px]" />
          {!collapsed && <span className="flex-1">FAQ</span>}
        </NavLink>
      </div>

      {/* Toggle */}
      {!mobile && (
        <div className="p-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onToggle}
            className={clsx(
              'flex items-center justify-center rounded-xl text-white/40 hover:text-white/65 hover:bg-white/[0.05] transition-colors',
              collapsed ? 'w-10 h-10 mx-auto' : 'w-full h-9 gap-2 text-xs px-3'
            )}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Zwiń</span></>}
          </button>
        </div>
      )}
    </aside>
  );
}

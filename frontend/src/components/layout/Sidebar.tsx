import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Monitor, MapPin,
  Ticket, ChevronLeft, ChevronRight, X, MessageSquare, Bot, ClipboardList,
  ShoppingCart, Download, Settings, HardDrive, KeyRound, Timer,
  Receipt, Plane, Users, CalendarDays, Sun, Moon, SunMoon, LinkIcon, ExternalLink,
  Shield, Activity, Sparkles, Share2,
  FileText, Package, Warehouse, CreditCard, BarChart3, Upload, Car, ClipboardCheck,
  Truck, Layers, Waves,
} from 'lucide-react';
import { useTheme } from '../../store/themeStore';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  feature?: string;
  role?: 'ADMIN' | 'SUPERADMIN';
}

interface NavGroup {
  label: string;
  items: NavItem[];
  role?: 'ADMIN' | 'SUPERADMIN';
  module?: string; // if set, group only visible when module enabled for workspace
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobile, onClose }: SidebarProps) {
  const { user } = useAuth();
  const { isAdmin, hasModule } = useWorkspaceContext();
  const { resolved: themeResolved } = useTheme();
  const isSuperAdmin = !!user?.isSuperAdmin;

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
  const hasFeature = (_f?: string) => true; // All features available in workspace
  const queueCount = queueTickets.length;
  const myActiveTasksCount = myTasks.filter(t => t.status !== 'DONE').length;

  const navGroups: NavGroup[] = [
    // ── GŁÓWNE ──
    {
      label: '',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="nav-icon" /> },
      ],
    },

    // ── INFRASTRUKTURA ──
    {
      label: 'INFRASTRUKTURA',
      items: [
        { to: '/locations', label: 'Lokalizacje', icon: <MapPin className="nav-icon" /> },
        { to: '/devices', label: 'Urządzenia', icon: <Monitor className="nav-icon" /> },
        { to: '/credentials', label: 'Dostępy', icon: <KeyRound className="nav-icon" /> },
      ],
    },

    // ── SERWIS ──
    {
      label: 'SERWIS',
      items: [
        { to: '/tickets', label: 'Zgłoszenia', icon: <Ticket className="nav-icon" />, badge: queueCount > 0 ? queueCount : undefined },
        { to: '/tickets/reports', label: 'Raporty', icon: <BarChart3 className="nav-icon" /> },
        { to: '/tasks', label: 'Zadania', icon: <ClipboardList className="nav-icon" />, badge: myActiveTasksCount > 0 ? myActiveTasksCount : undefined },
        { to: '/calendar', label: 'Kalendarz', icon: <CalendarDays className="nav-icon" /> },
        { to: '/orders', label: 'Zamówienia', icon: <ShoppingCart className="nav-icon" />, feature: 'orders' },
        { to: '/delegations', label: 'Delegacje', icon: <Plane className="nav-icon" />, feature: 'delegations' },
        { to: '/sharing', label: 'Udostępnianie', icon: <Share2 className="nav-icon" /> },
      ],
    },

    // ── MONITORING ──
    {
      label: 'MONITORING',
      items: [
        { to: '/agents', label: 'Agenty', icon: <Bot className="nav-icon" /> },
        { to: '/monitoring', label: 'Audyt & Sieć', icon: <Shield className="nav-icon" />, feature: 'security_audit' },
        { to: '/backups', label: 'Kopie zapasowe', icon: <HardDrive className="nav-icon" />, feature: 'backup' },
        { to: '/activity-logs', label: 'Logi aktywności', icon: <Activity className="nav-icon" />, role: 'ADMIN' },
      ],
    },

    // ── BIZNES ──
    {
      label: 'BIZNES',
      items: [
        { to: '/crm', label: 'CRM', icon: <MessageSquare className="nav-icon" />, feature: 'crm' },
        { to: '/sessions', label: 'Sesje pracy', icon: <Timer className="nav-icon" />, feature: 'sessions' },
        { to: '/billing', label: 'Rozliczenia', icon: <Receipt className="nav-icon" />, feature: 'billing' },
        { to: '/ai', label: 'Asystent AI', icon: <Sparkles className="nav-icon" />, feature: 'ai' },
      ],
    },

    // ── FAKTURY ──
    {
      label: 'FAKTURY',
      module: 'invoicing',
      items: [
        { to: '/invoicing', label: 'Dashboard', icon: <LayoutDashboard className="nav-icon" /> },
        { to: '/invoicing/documents', label: 'Dokumenty', icon: <FileText className="nav-icon" /> },
        { to: '/invoicing/contractors', label: 'Kontrahenci', icon: <Users className="nav-icon" /> },
        { to: '/invoicing/products', label: 'Produkty', icon: <Package className="nav-icon" /> },
        { to: '/invoicing/warehouses', label: 'Magazyn', icon: <Warehouse className="nav-icon" /> },
        { to: '/invoicing/payments', label: 'Płatności', icon: <CreditCard className="nav-icon" /> },
        { to: '/invoicing/reports', label: 'Raporty', icon: <BarChart3 className="nav-icon" /> },
        { to: '/invoicing/import', label: 'Import', icon: <Upload className="nav-icon" /> },
      ],
    },

    // ── PAKOWANIE ──
    {
      label: 'PAKOWANIE',
      module: 'packaging',
      items: [
        { to: '/packaging', label: 'Dashboard', icon: <LayoutDashboard className="nav-icon" /> },
        { to: '/packaging/shipments', label: 'Zamówienia', icon: <ShoppingCart className="nav-icon" /> },
        { to: '/packaging/picking', label: 'Zbieranie', icon: <ClipboardList className="nav-icon" /> },
        { to: '/packaging/packing', label: 'Pakowanie', icon: <Package className="nav-icon" /> },
        { to: '/packaging/board', label: 'Batche', icon: <Layers className="nav-icon" /> },
        { to: '/packaging/waves', label: 'Fale wysyłkowe', icon: <Waves className="nav-icon" /> },
        { to: '/packaging/carriers', label: 'Kurierzy', icon: <Truck className="nav-icon" /> },
        { to: '/packaging/customers', label: 'Klienci', icon: <Users className="nav-icon" /> },
        { to: '/packaging/reports', label: 'Raporty', icon: <BarChart3 className="nav-icon" /> },
      ],
    },

    // ── SERWIS SKP ──
    {
      label: 'SERWIS SKP',
      module: 'service',
      items: [
        { to: '/service', label: 'Dashboard', icon: <LayoutDashboard className="nav-icon" /> },
        { to: '/service/inspections', label: 'Przeglądy', icon: <ClipboardCheck className="nav-icon" /> },
        { to: '/service/vehicles', label: 'Pojazdy', icon: <Car className="nav-icon" /> },
      ],
    },

    // ── ADMINISTRACJA (ADMIN only) ──
    {
      label: 'ADMINISTRACJA',
      role: 'ADMIN',
      items: [
        { to: '/workspace-members', label: 'Członkowie', icon: <Users className="nav-icon" /> },
        { to: '/settings', label: 'Ustawienia', icon: <Settings className="nav-icon" /> },
        { to: '/my-company', label: 'Workspace', icon: <Building2 className="nav-icon" /> },
        { to: '/downloads', label: 'Pobieranie', icon: <Download className="nav-icon" /> },
      ],
    },

    // ── PLATFORMA (SuperAdmin only) ──
    {
      label: 'PLATFORMA',
      role: 'SUPERADMIN',
      items: [
        { to: '/superadmin', label: 'Dashboard SA', icon: <Activity className="nav-icon" /> },
        { to: '/superadmin/tenants', label: 'Workspace\'y', icon: <Building2 className="nav-icon" /> },
        { to: '/superadmin/users', label: 'Użytkownicy SA', icon: <Users className="nav-icon" /> },
        { to: '/superadmin/email', label: 'Email', icon: <Settings className="nav-icon" /> },
      ],
    },
  ];

  const canSeeGroup = (group: NavGroup) => {
    if (group.module && !hasModule(group.module)) return false;
    if (!group.role) return true;
    if (group.role === 'ADMIN') return isAdmin;
    if (group.role === 'SUPERADMIN') return isSuperAdmin;
    return false;
  };

  const canSeeItem = (item: NavItem) => {
    if (!hasFeature(item.feature)) return false;
    if (!item.role) return true;
    if (item.role === 'ADMIN') return isAdmin;
    if (item.role === 'SUPERADMIN') return isSuperAdmin;
    return false;
  };

  return (
    <aside className={clsx('sidebar', collapsed && 'collapsed')}
      style={collapsed ? { width: 64 } : undefined}>

      {/* Logo */}
      <div className="sidebar-header">
        {mobile && (
          <button onClick={onClose} className="absolute top-2 right-2 p-1 rounded z-10"
            style={{ color: 'var(--tm)' }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="sidebar-logo">
          <img src={collapsed ? "/logo-icon.png" : themeResolved === 'light' ? "/logo-dark.png" : "/logo.png"} alt="InfraDesk"
            style={collapsed ? { height: 40, width: 40, objectFit: 'contain' } : { height: 90, objectFit: 'contain' }} />
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navGroups.map(group => {
          if (!canSeeGroup(group)) return null;
          const visibleItems = group.items.filter(canSeeItem);
          if (visibleItems.length === 0) return null;

          const isPlatform = group.role === 'SUPERADMIN';

          return (
            <div key={group.label || 'top'}>
              {!collapsed && group.label && (
                <p style={{
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isPlatform ? 'rgba(248,113,113,0.5)' : 'var(--td)',
                  padding: '8px 10px 2px',
                  ...(isPlatform ? { borderTop: '1px solid rgba(248,113,113,0.1)', marginTop: 4, paddingTop: 10 } : {}),
                }}>
                  {group.label}
                </p>
              )}
              {visibleItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/tickets' || item.to === '/superadmin'}
                  onClick={mobile ? onClose : undefined}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => clsx('nav-item', isActive && 'active')}
                  style={({ isActive }) => ({
                    ...(collapsed ? { justifyContent: 'center', padding: '9px' } : {}),
                    ...(isPlatform && isActive ? { color: '#F87171' } : {}),
                    ...(isPlatform && !isActive ? { color: 'rgba(248,113,113,0.4)' } : {}),
                  })}
                >
                  {item.icon}
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && item.badge != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                      background: 'rgba(239,68,68,0.15)', color: '#F87171',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Theme switcher */}
      <ThemeSwitcher collapsed={collapsed} />

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && (
          <div className="mode-switch" onClick={onToggle}>
            <span className="mode-label">Zwiń panel</span>
            <ChevronLeft style={{ width: 12, height: 12, color: 'var(--tm)' }} />
          </div>
        )}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 8 }}>
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
        <div className="sidebar-version">InfraDesk v5.0.0 · © SILERS</div>
      </div>
    </aside>
  );
}

function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { mode, setMode } = useTheme();

  if (collapsed) {
    return (
      <div style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark')}
          className="theme-toggle" style={{ margin: '0 auto', display: 'flex' }}>
          {mode === 'light' ? <Sun style={{ width: 14, height: 14 }} /> : <Moon style={{ width: 14, height: 14 }} />}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', borderRadius: 8, background: 'var(--glass-bg, rgba(255,255,255,0.04))', border: '1px solid var(--border)', padding: 2 }}>
        {(['light', 'auto', 'dark'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 500, border: 'none', cursor: 'pointer',
              color: mode === m ? 'var(--accent, #4F8CFF)' : 'var(--td)',
              background: mode === m ? 'var(--accent-g, rgba(79,140,255,0.12))' : 'transparent',
              transition: 'all .2s',
            }}>
            {m === 'light' && <Sun style={{ width: 12, height: 12 }} />}
            {m === 'auto' && <SunMoon style={{ width: 12, height: 12 }} />}
            {m === 'dark' && <Moon style={{ width: 12, height: 12 }} />}
            {m === 'light' ? 'Jasny' : m === 'auto' ? 'Auto' : 'Ciemny'}
          </button>
        ))}
      </div>
    </div>
  );
}

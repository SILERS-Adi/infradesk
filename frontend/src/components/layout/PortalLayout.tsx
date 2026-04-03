import { type ReactNode, useState } from 'react';
import { Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import {
  LayoutDashboard, MapPin, Monitor, Ticket, Plus, LogOut, ShoppingCart, Menu, X, Receipt, KeyRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import { getInitials } from '../../utils/helpers';

const navItems = [
  { to: '/portal', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/portal/tickets', label: 'Zgłoszenia', icon: Ticket },
  { to: '/portal/devices', label: 'Urządzenia', icon: Monitor },
  { to: '/portal/locations', label: 'Lokalizacje', icon: MapPin },
  { to: '/portal/vault', label: 'Sejf haseł', icon: KeyRound },
  { to: '/portal/orders', label: 'Zamówienia', icon: ShoppingCart },
  { to: '/portal/billing', label: 'Rozliczenia', icon: Receipt },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { workspace } = useWorkspaceContext();
  const navigate = useNavigate();
  const [mobileNav, setMobileNav] = useState(false);

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#040a16' }}>
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const initials = user ? getInitials(user.firstName, user.lastName) : '?';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#040a16' }}>

      {/* Background — tlo.png */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: 'url(/tlo.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          opacity: 0.18,
        }} />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, rgba(8,13,25,0.7) 0%, rgba(8,13,25,0.88) 40%, rgba(8,13,25,0.96) 100%)',
        }} />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 flex-shrink-0" style={{
        background: 'rgba(10,15,28,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-[56px] flex items-center justify-between">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6 md:gap-8">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="InfraDesk" className="h-16" />
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  )}
                  style={({ isActive }) => isActive ? {
                    background: 'rgba(251,146,60,0.12)',
                    boxShadow: '0 0 12px rgba(251,146,60,0.08)',
                  } : {}}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right: Actions + User */}
          <div className="flex items-center gap-2 md:gap-3">
            <NavLink to="/portal/new-request"
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)', boxShadow: '0 2px 10px rgba(234,88,12,0.2)' }}>
              <Plus className="h-3.5 w-3.5" />
              Nowe zgłoszenie
            </NavLink>

            <div className="hidden md:flex items-center gap-2.5 ml-2">
              <div className="text-right">
                <div className="text-[12px] font-medium text-white/70 leading-tight">{user?.firstName} {user?.lastName}</div>
                <div className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>{workspace?.name}</div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)' }}>
                {initials}
              </div>
              <button onClick={logout} title="Wyloguj"
                className="p-2 rounded-lg text-white/25 hover:text-red-400/70 hover:bg-white/[0.04] transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button onClick={() => setMobileNav(!mobileNav)}
              className="md:hidden p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-colors">
              {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileNav && (
          <div className="md:hidden border-t border-white/[0.06] px-4 py-3 space-y-1"
            style={{ background: 'rgba(10,15,28,0.95)', backdropFilter: 'blur(20px)' }}>
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end}
                onClick={() => setMobileNav(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-all',
                  isActive ? 'text-white bg-white/[0.06]' : 'text-white/50'
                )}>
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/portal/new-request" onClick={() => setMobileNav(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-semibold text-white"
              style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)' }}>
              <Plus className="h-5 w-5" /> Nowe zgłoszenie
            </NavLink>
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)' }}>
                  {initials}
                </div>
                <div>
                  <div className="text-[13px] font-medium text-white/80">{user?.firstName} {user?.lastName}</div>
                  <div className="text-[11px] text-white/30">{workspace?.name}</div>
                </div>
              </div>
              <button onClick={logout} className="p-2 rounded-lg text-white/30 hover:text-red-400/70 transition-colors">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 md:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

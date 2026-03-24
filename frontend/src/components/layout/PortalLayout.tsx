import { type ReactNode } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import {
  LayoutDashboard, MapPin, Monitor, Ticket, Plus, User, LogOut, Shield
} from 'lucide-react';
import { clsx } from 'clsx';
import { getInitials } from '../../utils/helpers';

const navItems = [
  { to: '/portal', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
  { to: '/portal/locations', label: 'Moje lokalizacje', icon: <MapPin className="h-4 w-4" /> },
  { to: '/portal/devices', label: 'Moje urządzenia', icon: <Monitor className="h-4 w-4" /> },
  { to: '/portal/tickets', label: 'Moje zgłoszenia', icon: <Ticket className="h-4 w-4" /> },
  { to: '/portal/new-request', label: 'Nowe zgłoszenie', icon: <Plus className="h-4 w-4" /> },
  { to: '/portal/account', label: 'Moje konto', icon: <User className="h-4 w-4" /> },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  if (isLoading) return <LoadingSpinner className="h-screen" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'CLIENT') return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 bg-indigo-600 rounded-lg">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 leading-tight">InfraDesk</div>
              <div className="text-xs text-gray-400 leading-tight">Portal klienta</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
              {user && getInitials(user.firstName, user.lastName)}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 leading-tight">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-gray-500">{user?.client?.name}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Wyloguj
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

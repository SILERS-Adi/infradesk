import { NavLink } from 'react-router-dom';
import {
  MapPin, Monitor, Users, Activity, Settings, X
} from 'lucide-react';
import { clsx } from 'clsx';

const extraItems = [
  { to: '/locations',     label: 'Lokalizacje',    icon: MapPin },
  { to: '/devices',       label: 'Urządzenia',     icon: Monitor },
  { to: '/users',         label: 'Użytkownicy',    icon: Users },
  { to: '/activity-logs', label: 'Logi aktywności',icon: Activity },
  { to: '/settings',      label: 'Ustawienia',     icon: Settings },
];

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl shadow-xl pb-safe">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">Menu</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3">
          {extraItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-gray-700 hover:bg-gray-50'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('h-5 w-5', isActive ? 'text-brand-600' : 'text-gray-400')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

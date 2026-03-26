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
      <div
        className="relative rounded-t-2xl shadow-xl pb-safe"
        style={{
          background: 'rgba(14,20,38,0.97)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <span className="text-base font-semibold text-white/85">Menu</span>
          <button
            onClick={onClose}
            className="p-1 transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
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
                  isActive && 'text-violet-400'
                )
              }
              style={({ isActive }) => ({
                background: isActive
                  ? 'rgba(139,92,246,0.12)'
                  : undefined,
                color: isActive ? undefined : 'rgba(255,255,255,0.7)',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="h-5 w-5"
                    style={{
                      color: isActive ? undefined : 'rgba(255,255,255,0.35)',
                    }}
                  />
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

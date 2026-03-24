import { useAuth } from '../../store/authStore';
import { LogOut, Menu } from 'lucide-react';
import { getInitials } from '../../utils/helpers';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  TECHNICIAN: 'Technik',
  CLIENT: 'Klient',
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Mobile: hamburger + logo */}
      <div className="md:hidden flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Otwórz menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <img src="/logo-mono.png" alt="InfraDesk" className="h-6 w-6 object-contain" />
          <span className="text-sm font-bold">
            <span className="text-gray-900">Infra</span>
            <span className="text-accent-500">Desk</span>
          </span>
        </div>
      </div>

      {/* Desktop: spacer */}
      <div className="hidden md:block flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Avatar + info */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex-shrink-0">
            {getInitials(user.firstName, user.lastName)}
          </div>
          <div className="hidden md:block text-right">
            <div className="text-sm font-medium text-gray-900 leading-tight">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-gray-500 leading-tight">
              {ROLE_LABELS[user.role] ?? user.role}
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"
          title="Wyloguj"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline text-sm">Wyloguj</span>
        </button>
      </div>
    </header>
  );
}

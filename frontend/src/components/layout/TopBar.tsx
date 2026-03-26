import { useAuth } from '../../store/authStore';
import { LogOut, Menu, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="h-[52px] flex items-center justify-between px-5 flex-shrink-0"
      style={{ background: '#0C1220', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>

      {/* Mobile: hamburger + logo */}
      <div className="md:hidden flex items-center gap-3">
        <button onClick={onMenuClick}
          className="p-2 -ml-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <img src="/logo-mono.png" alt="" className="h-6 w-6 object-contain opacity-70" />
          <span className="text-[13px] font-semibold text-white/65">InfraDesk</span>
        </div>
      </div>

      {/* Desktop: spacer */}
      <div className="hidden md:block flex-1" />

      {/* Right */}
      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => navigate('/m')} title="Wersja mobilna"
          className="p-2 rounded-xl text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors">
          <Smartphone className="h-[18px] w-[18px]" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[10px] font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)' }}>
            {getInitials(user.firstName, user.lastName)}
          </div>
          <div className="hidden md:block text-right">
            <div className="text-[13px] font-medium text-white/80 leading-tight">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {ROLE_LABELS[user.role] ?? user.role}
            </div>
          </div>
        </div>

        <button onClick={logout} title="Wyloguj"
          className="flex items-center gap-1.5 text-white/25 hover:text-red-400/70 transition-colors p-2 rounded-lg hover:bg-red-400/[0.06]">
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline text-[12px]">Wyloguj</span>
        </button>
      </div>
    </header>
  );
}

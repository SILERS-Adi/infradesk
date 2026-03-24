import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Ticket, Building2, KeyRound, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { MobileMenu } from './MobileMenu';

const mainItems = [
  { to: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/tickets',     label: 'Zgłoszenia', icon: Ticket },
  { to: '/clients',     label: 'Klienci',    icon: Building2 },
  { to: '/credentials', label: 'Dostępy',    icon: KeyRound },
];

export function BottomNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-pb">
        <div className="flex items-stretch h-16">
          {mainItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-brand-600'
                    : 'text-gray-400 hover:text-gray-700'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('h-5 w-5', isActive && 'stroke-[2.5px]')} />
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Więcej */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="leading-none">Więcej</span>
          </button>
        </div>
      </nav>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

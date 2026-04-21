/**
 * PanelLayout — using foundation UI primitives.
 * Source of truth: ../../styles/panel/system.css + ../../ui/primitives.tsx
 */

import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useTheme } from '../../store/themeStore';
import { useRole, type Capability } from './RoleGate';
import { SearchInput } from '../../ui/primitives';
import { Home, ShieldCheck, MonitorUp, Ticket, KeyRound, Zap, Activity, Receipt, Phone, Mail, Search, Bell, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import '../../styles/panel/system.css';
import '../../styles/panel/index.css';                                /* legacy pages still use these classes — keep until all migrated */

type NavItem = { to: string; label: string; icon: React.ComponentType<any>; capability?: Capability };

const NAV: NavItem[] = [
  { to: '/panel',          label: 'Panel główny',   icon: Home,        capability: 'view_today' },
  { to: '/panel/devices',  label: 'Urządzenia',     icon: MonitorUp,   capability: 'view_devices' },
  { to: '/panel/tickets',  label: 'Zgłoszenia',     icon: Ticket,      capability: 'view_tickets' },
  { to: '/panel/ido',      label: 'IDO asystent',   icon: Zap,         capability: 'use_ido_chat' },
  { to: '/panel/activity', label: 'Aktywność',      icon: Activity,    capability: 'view_today' },
  { to: '/panel/security', label: 'Bezpieczeństwo', icon: ShieldCheck, capability: 'view_security' },
  { to: '/panel/vault',    label: 'Hasła',          icon: KeyRound,    capability: 'view_vault' },
  { to: '/panel/billing',  label: 'Rozliczenia',    icon: Receipt,     capability: 'view_billing' },
];

export function PanelLayout() {
  const { user } = useAuth();
  if (user?.isSuperAdmin) return <Navigate to="/" replace />;

  const currentWsForGuard = useWorkspace(s => s.current);
  const wsOrgType: string | undefined = (currentWsForGuard as any)?.orgType;
  const isMspOrInternal = wsOrgType === 'MSP' || wsOrgType === 'IT_OPERATOR' || wsOrgType === 'INTERNAL_IT';
  const userRoleForGuard = (currentWsForGuard as any)?.role;
  const isOperationalRole = ['OWNER','ADMIN','TECHNICIAN'].includes(userRoleForGuard);
  if (isMspOrInternal && isOperationalRole) return <Navigate to="/dashboard" replace />;

  const currentWs = useWorkspace(s => s.current);
  const { resolved, mode, setMode } = useTheme();
  const { role, can } = useRole();

  const initials = ((user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')).toUpperCase() || '?';
  const roleLabel = role === 'OWNER' ? 'Właściciel' : role === 'ADMIN' ? 'Administrator' : role === 'TECHNICIAN' ? 'Technik' : 'Użytkownik';

  const hello = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Dobry wieczór';
    if (h < 12) return 'Witaj rano';
    if (h < 18) return 'Witaj';
    return 'Dobry wieczór';
  }, []);

  return (
    <div className="id-panel" data-theme={resolved}>
      <div className="ui-shell">
        {/* SIDEBAR */}
        <aside className="ui-sidebar">
          <div className="ui-sidebar__brand" title="InfraDesk by SILERS">
            <img src="/logo.png"      alt="InfraDesk by SILERS" className="ui-sidebar__brand-img ui-sidebar__brand-img--dark" />
            <img src="/logo-dark.png" alt="InfraDesk by SILERS" className="ui-sidebar__brand-img ui-sidebar__brand-img--light" />
          </div>

          <div className="ui-sidebar__section-label">Nawigacja</div>
          <nav className="ui-nav">
            {NAV.filter(n => !n.capability || can(n.capability)).map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/panel'}
                  className={({ isActive }) => `ui-nav-link${isActive ? ' ui-nav-link--active' : ''}`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ui-sidebar__contact">
            <div className="ui-sidebar__contact-label">Kontakt z IT</div>
            <div className="ui-sidebar__contact-name">SILERS — Opieka IT</div>
            <div className="ui-sidebar__contact-line"><Phone size={12} strokeWidth={2} /> +48 604 292 831</div>
            <div className="ui-sidebar__contact-line"><Mail size={12} strokeWidth={2} /> biuro@silers.pl</div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <header className="ui-topbar">
            <div className="ui-topbar__greet">
              <div className="ui-topbar__hello">{hello}, {user?.firstName || ''}</div>
              <div className="ui-topbar__sub">
                Przeglądasz: <strong style={{ color: 'var(--ip-text-2)', fontWeight: 600 }}>{currentWs?.name ?? '—'}</strong>
              </div>
            </div>

            <div className="ui-topbar__actions">
              <SearchInput placeholder="Szukaj…" kbd="⌘K" icon={<Search size={14} strokeWidth={2} />} />
              <div className="ui-theme-toggle" role="group" aria-label="Motyw">
                <button aria-pressed={mode === 'light'} onClick={() => setMode('light')} title="Jasny"><Sun size={13} /></button>
                <button aria-pressed={mode === 'auto'}  onClick={() => setMode('auto')}  title="Auto"><Monitor size={13} /></button>
                <button aria-pressed={mode === 'dark'}  onClick={() => setMode('dark')}  title="Ciemny"><Moon size={13} /></button>
              </div>
              <button className="ui-iconbtn" aria-label="Powiadomienia">
                <Bell size={15} strokeWidth={2} />
                <span className="ui-iconbtn__badge" />
              </button>
              <UserAvatarMenu user={user} roleLabel={roleLabel} initials={initials} />
            </div>
          </header>

          <main className="ui-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function UserAvatarMenu({ user, roleLabel, initials }: { user: any; roleLabel: string; initials: string }) {
  const [open, setOpen] = React.useState(false);
  const { logout } = useAuth();
  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="ui-avatar"
        title={`${user?.firstName||''} ${user?.lastName||''} · ${roleLabel}`}
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
      >
        {initials}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div style={{
            position: 'absolute', right: 0, top: '110%', zIndex: 101,
            minWidth: 220, padding: 6, borderRadius: 10,
            background: 'var(--ip-bg-elev)', border: 'var(--ip-border-hi)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: 'var(--ip-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ip-text)' }}>
                {user?.firstName || ''} {user?.lastName || ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ip-text-3)' }}>{user?.email} · {roleLabel}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 12px', marginTop: 4,
                background: 'transparent', border: 'none',
                color: '#EF4444', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                borderRadius: 6, textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
            >
              <LogOut size={14} /> Wyloguj
            </button>
          </div>
        </>
      )}
    </div>
  );
}

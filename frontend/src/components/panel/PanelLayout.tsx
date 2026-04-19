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
import { Home, ShieldCheck, MonitorUp, Ticket, KeyRound, Zap, Activity, Receipt, Phone, Mail, Search, Bell, Sun, Moon, Monitor } from 'lucide-react';
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
              <div className="ui-avatar" title={`${user?.firstName} ${user?.lastName} · ${roleLabel}`}>{initials}</div>
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

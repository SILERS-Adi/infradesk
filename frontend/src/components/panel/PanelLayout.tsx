/**
 * PanelLayout v4 — sidebar + topbar (wzór: nowypanel.png).
 * Linear/Stripe clean. MSP zablokowany, tylko klienci końcowi.
 */

import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useTheme } from '../../store/themeStore';
import { useRole, type Capability } from './RoleGate';
import { Home, ShieldCheck, MonitorUp, Ticket, KeyRound, Zap, Activity, Receipt, Settings, Phone, Mail, Search, Bell, Sun, Moon, Monitor } from 'lucide-react';
import '../../styles/panel/index.css';

type NavItem = { to: string; label: string; icon: React.ComponentType<any>; capability?: Capability };

const NAV_MAIN: NavItem[] = [
  { to: '/panel',          label: 'Panel główny',    icon: Home,        capability: 'view_today' },
  { to: '/panel/devices',  label: 'Urządzenia',      icon: MonitorUp,   capability: 'view_devices' },
  { to: '/panel/tickets',  label: 'Zgłoszenia',      icon: Ticket,      capability: 'view_tickets' },
  { to: '/panel/ido',      label: 'IDO asystent',    icon: Zap,         capability: 'use_ido_chat' },
  { to: '/panel/activity', label: 'Aktywność',       icon: Activity,    capability: 'view_today' },
  { to: '/panel/security', label: 'Bezpieczeństwo',  icon: ShieldCheck, capability: 'view_security' },
  { to: '/panel/vault',    label: 'Hasła',           icon: KeyRound,    capability: 'view_vault' },
  { to: '/panel/billing',  label: 'Rozliczenia',     icon: Receipt,     capability: 'view_billing' },
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
      <div className="ip-shell">
        {/* ─── Sidebar ─── */}
        <aside className="ip-sidebar">
          <div className="ip-sidebar__logo" title="InfraDesk by SILERS">
            <span className="ip-sidebar__logo-mark">ID</span>
            <div className="ip-sidebar__brand-wrap">
              <span className="ip-sidebar__brand-main">INFRA DESK</span>
              <span className="ip-sidebar__brand-sub">by SILERS</span>
            </div>
          </div>

          <div className="ip-sidebar__section-label">Nawigacja</div>
          <nav className="ip-sidebar__nav">
            {NAV_MAIN.filter(n => !n.capability || can(n.capability)).map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/panel'}
                  className={({ isActive }) => `ip-nav-link${isActive ? ' ip-nav-link--active' : ''}`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ip-sidebar__contact">
            <div className="ip-sidebar__contact-label">Kontakt z IT</div>
            <div className="ip-sidebar__contact-name">SILERS — Opieka IT</div>
            <div className="ip-sidebar__contact-line">
              <Phone size={12} strokeWidth={2} />
              +48 604 292 831
            </div>
            <div className="ip-sidebar__contact-line">
              <Mail size={12} strokeWidth={2} />
              biuro@silers.pl
            </div>
          </div>
        </aside>

        {/* ─── Main column ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <header className="ip-topbar">
            <div className="ip-topbar__greet">
              <div className="ip-topbar__hello">{hello}, {user?.firstName || ''}</div>
              <div className="ip-topbar__sub">
                Przeglądasz: <strong style={{ color: 'var(--ip-text-2)', fontWeight: 600 }}>{currentWs?.name ?? '—'}</strong>
              </div>
            </div>

            <div className="ip-topbar__actions">
              <div className="ip-search">
                <Search size={14} strokeWidth={2} />
                <input placeholder="Szukaj…" />
                <span className="ip-search__kbd">⌘K</span>
              </div>
              <div className="ip-theme-mini">
                <button aria-pressed={mode === 'light'} onClick={() => setMode('light')} title="Jasny"><Sun size={13} /></button>
                <button aria-pressed={mode === 'auto'}  onClick={() => setMode('auto')}  title="Auto"><Monitor size={13} /></button>
                <button aria-pressed={mode === 'dark'}  onClick={() => setMode('dark')}  title="Ciemny"><Moon size={13} /></button>
              </div>
              <button className="ip-iconbtn" aria-label="Powiadomienia" title="Powiadomienia">
                <Bell size={15} strokeWidth={2} />
                <span className="ip-iconbtn__badge" />
              </button>
              <div className="ip-avatar" title={`${user?.firstName} ${user?.lastName} · ${roleLabel}`}>{initials}</div>
            </div>
          </header>

          <main className="ip-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

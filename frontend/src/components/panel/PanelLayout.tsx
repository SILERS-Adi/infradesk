/**
 * PanelLayout — shell for the new ID Panel (post-preview realization).
 *
 * Structure:
 *   ┌─────────────────────────────────────────┐
 *   │  Topbar: logo · workspace · role · user │
 *   ├──────────┬──────────────────────────────┤
 *   │ Sidebar  │  <Outlet />                  │
 *   │  (rails) │                              │
 *   └──────────┴──────────────────────────────┘
 *
 * Notes:
 *  - Lives under /panel/* — does NOT replace /portal (old UX untouched).
 *  - Uses .panel-scope wrapper so `panel/index.css` tokens & primitives apply.
 *  - Sidebar items are filtered by useRole().can(capability).
 *  - Kept self-contained (no external component deps) so Phase 1 ships clean.
 */

import React from 'react';
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useTheme } from '../../store/themeStore';
import { useRole, type Capability } from './RoleGate';
import '../../styles/panel/index.css';

type NavItem = {
  to: string;
  label: string;
  icon: string; // emoji placeholder — swap to lucide later
  capability?: Capability;
};

const NAV: NavItem[] = [
  { to: '/panel',            label: 'Dziś',          icon: '⦿', capability: 'view_today' },
  { to: '/panel/security',   label: 'Bezpieczeństwo', icon: '⛨', capability: 'view_security' },
  { to: '/panel/devices',    label: 'Urządzenia',    icon: '▣', capability: 'view_devices' },
  { to: '/panel/tickets',    label: 'Zgłoszenia',    icon: '✎', capability: 'view_tickets' },
  { to: '/panel/vault',      label: 'Sejf',          icon: '⚿', capability: 'view_vault' },
  { to: '/panel/activity',   label: 'Aktywność',    icon: '⌘', capability: 'view_today' },
  { to: '/panel/billing',    label: 'Rozliczenia',   icon: '§', capability: 'view_billing' },
];

export function PanelLayout() {
  const { user } = useAuth();
  // ID PANEL jest wyłącznie dla klientów końcowych — MSP/operator używa /admin
  if (user?.isSuperAdmin) return <Navigate to="/" replace />;
  const resolved = useTheme(st => st.resolved);
  const currentWs = useWorkspace(s => s.current);
  const { role, can, isPreview } = useRole();
  const location = useLocation();

  const [collapsed, setCollapsed] = React.useState<boolean>(
    () => localStorage.getItem('panel_sidebar_collapsed') === '1',
  );
  React.useEffect(() => {
    localStorage.setItem('panel_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <div className="panel-scope" data-theme={resolved}>
      <style>{`
        .panel-shell { display: grid; grid-template-columns: auto 1fr; grid-template-rows: 56px 1fr; min-height: 100vh; }
        .panel-topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; padding: 0 20px; border-bottom: 1px solid var(--glass-border); background: var(--bg-overlay); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 20; }
        .panel-brand { font-weight: 800; font-size: 14px; letter-spacing: 0.14em; background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .panel-brand-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--brand-gradient-vivid); box-shadow: 0 0 12px rgba(34,211,238,0.6); margin-right: 8px; vertical-align: middle; }
        .panel-ws-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); font-size: 12px; color: var(--text-secondary); }
        .panel-ws-pill b { color: var(--text-primary); font-weight: 600; }
        .panel-user { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-secondary); }
        .panel-user b { color: var(--text-primary); font-weight: 600; }

        .panel-sidebar { padding: 16px 10px; border-right: 1px solid var(--glass-border); background: linear-gradient(180deg, hsla(222,35%,9%,0.4), transparent); width: ${collapsed ? '64px' : '220px'}; transition: width 180ms ease; }
        .panel-nav { display: flex; flex-direction: column; gap: 4px; }
        .panel-nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 500; text-decoration: none; border: 1px solid transparent; transition: all 140ms ease; }
        .panel-nav-item:hover { background: var(--glass-bg); color: var(--text-primary); border-color: var(--glass-border); }
        .panel-nav-item.active { background: var(--brand-gradient-soft); color: var(--text-primary); border-color: var(--glass-border-hi); box-shadow: var(--glass-inset-hl); }
        .panel-nav-icon { width: 20px; text-align: center; font-size: 14px; }
        .panel-nav-label { ${collapsed ? 'display:none;' : ''} }
        .panel-collapse { margin-top: auto; font-size: 11px; color: var(--text-tertiary); cursor: pointer; padding: 8px 12px; }

        .panel-main { padding: 20px 24px; max-width: 1400px; width: 100%; }
        .panel-preview-banner { background: var(--status-warn-soft); border: 1px solid var(--status-warn-edge); color: var(--status-warn); padding: 8px 14px; border-radius: 10px; font-size: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
      `}</style>

      <div className="panel-shell">
        {/* Topbar */}
        <div className="panel-topbar">
          <span className="panel-brand"><span className="panel-brand-dot" />ID·PANEL</span>
          {currentWs && (
            <span className="panel-ws-pill">
              <b>{currentWs.name ?? 'Workspace'}</b>
              <span style={{ opacity: 0.6 }}>·</span>
              <span>{role}</span>
            </span>
          )}
          <div className="panel-user">
            {isPreview && <span className="panel-chip panel-chip--warn">PODGLĄD</span>}
            <span>
              <b>{user?.firstName} {user?.lastName}</b>
            </span>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="panel-sidebar">
          <nav className="panel-nav">
            {NAV.filter(n => !n.capability || can(n.capability)).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/panel'}
                className={({ isActive }) => `panel-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="panel-nav-icon">{item.icon}</span>
                <span className="panel-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div
            className="panel-collapse"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Rozwiń' : 'Zwiń'}
          >
            {collapsed ? '→' : '← Zwiń'}
          </div>
        </aside>

        {/* Main */}
        <main className="panel-main" key={location.pathname}>
          {isPreview && (
            <div className="panel-preview-banner">
              Widzisz panel oczami innego użytkownika (podgląd operatora).
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

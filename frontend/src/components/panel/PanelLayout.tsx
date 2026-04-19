/**
 * PanelLayout v3 — COCKPIT REBUILD.
 *
 * Structure:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ [ID·PANEL] [nav nav nav nav]     [theme] [user] │ 56px │
 *   ├────────────────────────────────────────────────────────┤
 *   │ <Outlet/> — max-width 1600px, cockpit content          │
 *   └────────────────────────────────────────────────────────┘
 *
 * No sidebar (topbar nav like Linear). No gradients. Grid-dense.
 * Blocks superadmin (MSP uses /admin), clients only.
 */

import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useTheme } from '../../store/themeStore';
import { useRole, type Capability } from './RoleGate';
import { Home, ShieldCheck, MonitorUp, Ticket, KeyRound, Zap, Activity, Receipt, Sun, Moon, Monitor } from 'lucide-react';
import '../../styles/panel/index.css';

type NavItem = { to: string; label: string; icon: React.ComponentType<any>; capability?: Capability };

const NAV: NavItem[] = [
  { to: '/panel',          label: 'Dziś',           icon: Home,         capability: 'view_today' },
  { to: '/panel/security', label: 'Bezpieczeństwo', icon: ShieldCheck,  capability: 'view_security' },
  { to: '/panel/devices',  label: 'Urządzenia',     icon: MonitorUp,    capability: 'view_devices' },
  { to: '/panel/tickets',  label: 'Zgłoszenia',     icon: Ticket,       capability: 'view_tickets' },
  { to: '/panel/vault',    label: 'Hasła',          icon: KeyRound,     capability: 'view_vault' },
  { to: '/panel/ido',      label: 'IDO',            icon: Zap,          capability: 'use_ido_chat' },
  { to: '/panel/activity', label: 'Aktywność',      icon: Activity,     capability: 'view_today' },
  { to: '/panel/billing',  label: 'Rozliczenia',    icon: Receipt,      capability: 'view_billing' },
];

export function PanelLayout() {
  const { user } = useAuth();
  if (user?.isSuperAdmin) return <Navigate to="/" replace />;

  const currentWs = useWorkspace(s => s.current);
  const { resolved, mode, setMode } = useTheme();
  const { role, can, isPreview } = useRole();

  const initials = (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '');
  const roleLabel = role === 'OWNER' ? 'Właściciel' : role === 'ADMIN' ? 'Administrator' : role === 'TECHNICIAN' ? 'Technik' : role === 'MEMBER' ? 'Użytkownik' : role === 'VIEWER' ? 'Viewer' : role;

  return (
    <div className="id-panel" data-theme={resolved}>
      <header className="ip-topbar">
        <div className="ip-topbar__brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--ip-blue-hi)' }} />
            <circle cx="12" cy="12" r="4" fill="currentColor" style={{ color: 'var(--ip-blue)' }} />
          </svg>
          ID·PANEL
          <span style={{ color: 'var(--ip-text-3)', fontWeight: 400 }}>/ {currentWs?.name ?? '—'}</span>
        </div>

        <nav className="ip-topbar__nav">
          {NAV.filter(n => !n.capability || can(n.capability)).map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/panel'}
                className={({ isActive }) => `ip-topbar__link${isActive ? ' ip-topbar__link--active' : ''}`}
              >
                <Icon size={14} strokeWidth={2} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="ip-topbar__actions">
          {isPreview && (
            <span className="ip-chip ip-chip--warn">Podgląd</span>
          )}
          <div className="ip-theme-toggle" role="group" aria-label="Motyw">
            <button aria-pressed={mode === 'light'} onClick={() => setMode('light')} title="Jasny"><Sun size={13} strokeWidth={2} /></button>
            <button aria-pressed={mode === 'auto'}  onClick={() => setMode('auto')}  title="Auto"><Monitor size={13} strokeWidth={2} /></button>
            <button aria-pressed={mode === 'dark'}  onClick={() => setMode('dark')}  title="Ciemny"><Moon size={13} strokeWidth={2} /></button>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 10px 3px 3px', background: 'var(--ip-bg-3)', border: '1px solid var(--ip-border)', borderRadius: 'var(--ip-r-full)' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--ip-blue)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--ip-font-mono)',
              boxShadow: '0 2px 6px rgba(59,130,246,0.35)',
            }}>{initials.toUpperCase() || '—'}</div>
            <span style={{ fontSize: 12, color: 'var(--ip-text-2)' }}>
              <span style={{ color: 'var(--ip-text)', fontWeight: 600 }}>{user?.firstName || '—'}</span>
              <span style={{ color: 'var(--ip-text-3)', marginLeft: 6 }}>· {roleLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="ip-main">
        <Outlet />
      </main>
    </div>
  );
}

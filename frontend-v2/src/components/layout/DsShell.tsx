/**
 * DsShell — Silers Design System wariant globalnego layoutu InfraDesk.
 *
 * Aktywowany przez feature flag `?ui=new` (patrz @/lib/uiFlag).
 * Renderowany przez AppShell zamiast legacy markup.
 *
 * Co dziedziczy z legacy AppShell/Sidebar/Topbar:
 *  - Auth/permission queries (useQuery ['workspaces','current'], ['permissions','me'], ['auth','me'])
 *  - Strukturę nawigacji z @/components/layout/_nav (single source of truth)
 *  - Logikę isClient/isSuperAdmin filtrowania
 *
 * Co dodaje:
 *  - DS AppShell jako grid layout (topbar 56px + sidebar 240px + content)
 *  - DS Sidebar + Topbar primitives (token-only)
 *  - DS IrisCoreButton w topbar (kanoniczny SVG, nie canvas)
 *  - DS Avatar w user footer
 *  - Toggle UI flag z powrotem do legacy
 */
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, MonitorCog } from 'lucide-react';

import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Sidebar,
  SidebarItem,
  SidebarSection,
  Topbar,
  TopbarBurger,
  TopbarTitle,
} from '@silers/design-system/primitives';
import { IrisCoreButton } from '@silers/design-system/visuals';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useThemeStore, type Theme } from '@/store/theme';
import { setUiFlag } from '@/lib/uiFlag';
import {
  filterVisibleGroups,
  isItemActive,
  type PermissionPayload,
  type WorkspaceType,
} from './_nav';

import './DsShell.css';

interface NotifSummary { unread?: number }

export function DsShell() {
  const { user, logout } = useAuthStore();
  const themeMode = useThemeStore((s) => s.theme);
  const setThemeMode = useThemeStore((s) => s.setTheme);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Reuse dokładnie tych samych queryKey co Sidebar legacy — cache jest dzielony.
  const wsQ = useQuery<{ workspace: { id: string; name: string; slug: string; type: WorkspaceType } }>({
    queryKey: ['workspaces', 'current'],
    queryFn: async () => (await api.get('/workspaces/current')).data,
    staleTime: 5 * 60_000,
  });
  const workspace = wsQ.data?.workspace;
  const isClient = workspace?.type === 'CLIENT';

  const permQ = useQuery<PermissionPayload>({
    queryKey: ['permissions', 'me'],
    queryFn: async () => (await api.get('/permissions/me')).data,
    staleTime: 60_000,
  });

  const meQ = useQuery<{ auth: { sub: string; email: string; isSuperAdmin?: boolean } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    staleTime: 5 * 60_000,
  });
  const isSuperAdmin = meQ.data?.auth?.isSuperAdmin === true;

  const notifQ = useQuery<NotifSummary>({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications/unread')).data,
    staleTime: 30_000,
    retry: false,
  });
  const unread = notifQ.data?.unread ?? 0;

  const visibleGroups = useMemo(
    () => filterVisibleGroups(isClient, permQ.data, isSuperAdmin),
    [isClient, permQ.data, isSuperAdmin],
  );

  function cycleTheme() {
    const next: Theme = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
    setThemeMode(next);
  }

  function rollbackToLegacy() {
    setUiFlag('legacy');
  }

  function onItemClick(to: string) {
    navigate(to);
    setSidebarOpen(false);
  }

  const sidebar = (
    <Sidebar
      header={
        <div className="ds-shell__brand">
          <img src="/logo-icon.png" alt="" className="ds-shell__brand-logo" />
          <div className="ds-shell__brand-text">
            <div className="ds-shell__brand-name">
              {isClient && workspace ? workspace.name : 'InfraDesk'}
            </div>
            <div className="ds-shell__brand-sub">
              {isClient ? 'Portal klienta' : 'v2 · Operacje'}
            </div>
          </div>
        </div>
      }
      footer={
        user ? (
          <div className="ds-shell__user">
            <Avatar
              name={`${user.firstName} ${user.lastName}`}
              size="sm"
              status="online"
              statusLabel="Online"
            />
            <div className="ds-shell__user-info">
              <div className="ds-shell__user-name">{user.firstName} {user.lastName}</div>
              <div className="ds-shell__user-email">{user.email}</div>
            </div>
            <Button variant="ghost" iconOnly aria-label="Wyloguj" size="sm" onClick={logout}>
              <LogOut size={16} />
            </Button>
          </div>
        ) : null
      }
    >
      {visibleGroups.map((group) => (
        <SidebarSection key={group.id} label={group.label}>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(location.pathname, item.to);
            return (
              <SidebarItem
                key={item.to}
                icon={<Icon size={18} strokeWidth={1.7} />}
                label={item.label}
                active={active}
                onClick={() => onItemClick(item.to)}
                badge={
                  item.comingSoon
                    ? <Badge variant="neutral" tone="soft" size="sm">soon</Badge>
                    : item.badge && item.badge > 0
                      ? <Badge variant="primary" tone="solid" size="sm">{item.badge > 99 ? '99+' : item.badge}</Badge>
                      : undefined
                }
              />
            );
          })}
        </SidebarSection>
      ))}
    </Sidebar>
  );

  const topbar = (
    <Topbar
      left={
        <>
          <TopbarBurger onClick={() => setSidebarOpen((v) => !v)} label="Menu" />
          <TopbarTitle>InfraDesk</TopbarTitle>
        </>
      }
      right={
        <>
          <IrisCoreButton
            size="sm"
            status="idle"
            aria-label="Otwórz asystenta Iris"
            onClick={() => navigate('/ai')}
          />
          <Button
            variant="ghost"
            iconOnly
            aria-label={`Motyw: ${themeMode}`}
            title={`Motyw: ${themeMode}`}
            onClick={cycleTheme}
          >
            <span className="ds-shell__theme-glyph" aria-hidden="true">
              {themeMode === 'light' ? '☀' : themeMode === 'dark' ? '☾' : 'A'}
            </span>
          </Button>
          <Button
            variant="ghost"
            iconOnly
            aria-label={unread > 0 ? `Powiadomienia (${unread} nieprzeczytane)` : 'Powiadomienia'}
          >
            <span className="ds-shell__bell">
              <Bell size={16} />
              {unread > 0 && <span className="ds-shell__bell-dot" aria-hidden="true" />}
            </span>
          </Button>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Wróć do klasycznego UI"
            title="Wróć do klasycznego UI"
            onClick={rollbackToLegacy}
          >
            <MonitorCog size={16} />
          </Button>
        </>
      }
    />
  );

  return (
    <AppShell
      topbar={topbar}
      sidebar={sidebar}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
    >
      <Outlet />
    </AppShell>
  );
}

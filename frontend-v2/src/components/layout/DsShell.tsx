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
import { Bell, LogOut, MonitorCog, Moon, Monitor, Sun } from 'lucide-react';

import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Sidebar,
  SidebarItem,
  SidebarSection,
  Tooltip,
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

/**
 * Mapuje pathname na widoczny tytuł w topbar. Owner brief Faza 2D QA Round 2:
 * brand "InfraDesk" zostaje TYLKO w sidebar header; topbar pokazuje page title.
 * Najdłuższy prefix wygrywa (np. /tickets/123 → "Zgłoszenia").
 */
const ROUTE_TITLES: Array<[string, string]> = [
  ['/dashboard',        'Kokpit'],
  ['/tickets',          'Zgłoszenia'],
  ['/tasks',            'Zadania'],
  ['/calendar',         'Kalendarz'],
  ['/sessions',         'Sesje pracy'],
  ['/billing',          'Rozliczenia'],
  ['/alerts',           'Alerty'],
  ['/orders',           'Zamówienia'],
  ['/delegations',      'Delegacje'],
  ['/portal-settings',  'Portal i obsługa'],
  ['/portal',           'Portal klienta'],
  ['/clients',          'Firmy klientów'],
  ['/crm',              'CRM'],
  ['/locations',        'Lokalizacje'],
  ['/partners',         'Partnerzy IT'],
  ['/devices',          'Urządzenia'],
  ['/agents',           'Asystenci'],
  ['/monitoring',       'Audyt i sieć'],
  ['/backups',          'Kopie zapasowe'],
  ['/activity-logs',    'Logi aktywności'],
  ['/downloads',        'Dysk'],
  ['/storage',          'Pamięć'],
  ['/vault',            'Sejf haseł'],
  ['/ai',               'Asystent AI'],
  ['/my-company',       'Moja firma'],
  ['/users',            'Użytkownicy'],
  ['/plan-and-modules', 'Plan i moduły'],
  ['/settings',         'Ustawienia'],
  ['/design',           'Design system'],
];

function pageTitleFor(pathname: string): string {
  const match = ROUTE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  return match ? match[1] : 'InfraDesk';
}

/**
 * Trasy które są już w pełni zmigrowane na DS — nie pokazuj banneru migracji.
 * Wszystko inne (legacy content w DS shell) → soft banner "ta sekcja w migracji".
 */
const MIGRATED_PATHS = new Set<string>(['/dashboard']);

function isFullyMigrated(pathname: string): boolean {
  if (MIGRATED_PATHS.has(pathname)) return true;
  return Array.from(MIGRATED_PATHS).some(p => pathname.startsWith(p + '/'));
}

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

  const pageTitle = pageTitleFor(location.pathname);
  const fullyMigrated = isFullyMigrated(location.pathname);

  const ThemeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? Moon : Monitor;
  const themeNextLabel = themeMode === 'light' ? 'Przełącz na ciemny' : themeMode === 'dark' ? 'Przełącz na auto' : 'Przełącz na jasny';

  const topbar = (
    <Topbar
      left={
        <>
          {/* Burger tylko na mobile (M3): CSS w DsShell.css ukrywa >= md */}
          <span className="ds-shell__burger-wrap">
            <TopbarBurger onClick={() => setSidebarOpen((v) => !v)} label="Menu" />
          </span>
          <TopbarTitle>{pageTitle}</TopbarTitle>
        </>
      }
      right={
        <>
          <Tooltip content="Asystent Iris" placement="bottom">
            <IrisCoreButton
              size="2xs"
              status="idle"
              aria-label="Otwórz asystenta Iris"
              onClick={() => navigate('/ai')}
            />
          </Tooltip>
          <Tooltip content={themeNextLabel} placement="bottom">
            <Button
              variant="ghost"
              iconOnly
              aria-label={`Motyw: ${themeMode}. ${themeNextLabel}`}
              onClick={cycleTheme}
            >
              <ThemeIcon size={16} />
            </Button>
          </Tooltip>
          <Tooltip content={unread > 0 ? `Powiadomienia (${unread} nieprzeczytane)` : 'Powiadomienia'} placement="bottom">
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
          </Tooltip>
          <Tooltip content="Wróć do klasycznego UI" placement="bottom">
            <Button
              variant="ghost"
              iconOnly
              aria-label="Wróć do klasycznego UI"
              onClick={rollbackToLegacy}
            >
              <MonitorCog size={16} />
            </Button>
          </Tooltip>
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
      // fluid=true: legacy pages (tickets/devices/billing/…) zachowują pełną szerokość.
      // /dashboard ma własny .dashboard-new wrapper. Po pełnej migracji można usunąć fluid
      // żeby max-width 1440px działał globalnie.
      fluid
    >
      {!fullyMigrated && <MigrationBanner />}
      <Outlet />
    </AppShell>
  );
}

/**
 * Subtelny non-blocking banner pokazywany na trasach jeszcze nie zmigrowanych do DS.
 * Owner brief Faza 2D QA Round 2 (C3): bez hard blocka, bez redirect — tylko info.
 * Dismiss persistent w localStorage (per-session).
 */
function MigrationBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('ds-migration-banner-dismissed') === '1'; }
    catch { return false; }
  });
  if (dismissed) return null;
  const onDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('ds-migration-banner-dismissed', '1'); } catch { /* ignore */ }
  };
  return (
    <div className="ds-shell__migration-banner" role="status" aria-live="polite">
      <span className="ds-shell__migration-banner-dot" aria-hidden="true" />
      <span className="ds-shell__migration-banner-text">
        Ta sekcja jest jeszcze w migracji do nowego interfejsu.
      </span>
      <button
        type="button"
        className="ds-shell__migration-banner-close"
        onClick={onDismiss}
        aria-label="Zamknij komunikat"
      >
        ✕
      </button>
    </div>
  );
}

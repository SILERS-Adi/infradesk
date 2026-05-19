/**
 * Wspólna struktura nawigacji InfraDesk — używana przez legacy Sidebar
 * i przez DS shell (Faza 2D).
 *
 * Każda zmiana w GROUPS, CLIENT_VISIBLE_PATHS, CLIENT_HIDDEN_GROUPS dotyka
 * obu sheli jednocześnie. NIE duplikuj struktury w innych miejscach.
 */
import {
  LayoutDashboard, Ticket, CheckSquare, Calendar, Timer, Receipt, Bell, ShoppingCart, Car, Globe2,
  Building2, Users, MapPin, Handshake,
  Server, Zap, Activity, HardDriveDownload, Scroll, HardDrive, Database,
  Key, Brain, Radar, Lightbulb, Clock, DollarSign,
  Building, UserCog, Package2, Cog,
  Palette,
  type LucideIcon,
} from 'lucide-react';

export type WorkspaceType = 'MSP' | 'CLIENT' | 'INTERNAL_IT';

export type AccessLevel = 'NONE' | 'VIEW' | 'EDIT' | 'DELETE';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  comingSoon?: boolean;
  /** Permission module key — if set, item hides when user's effective level is NONE. */
  moduleKey?: string;
  superAdminOnly?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface PermissionPayload {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  effective: Record<string, AccessLevel>;
  overrides: Array<{ moduleKey: string; level: AccessLevel }>;
}

// Groups visible for each workspace type. CLIENT portal is drastically trimmed.
export const CLIENT_VISIBLE_PATHS = new Set<string>([
  '/', '/tickets', '/calendar',
  '/devices', '/activity-logs', '/downloads',
  '/vault', '/vault/mine', '/vault/shared',
  '/ai',
  '/my-company', '/users', '/settings',
]);

export const CLIENT_HIDDEN_GROUPS = new Set<string>(['clients']);

export const GROUPS: NavGroup[] = [
  {
    id: 'operations',
    label: 'Operacje',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Kokpit', moduleKey: 'dashboard' },
      { to: '/tickets', icon: Ticket, label: 'Zgłoszenia', moduleKey: 'tickets' },
      { to: '/tasks', icon: CheckSquare, label: 'Zadania', moduleKey: 'tasks' },
      { to: '/calendar', icon: Calendar, label: 'Kalendarz' },
      { to: '/sessions', icon: Timer, label: 'Sesje pracy', moduleKey: 'sessions' },
      { to: '/billing', icon: Receipt, label: 'Rozliczenia', moduleKey: 'billing' },
      { to: '/alerts', icon: Bell, label: 'Alerty', moduleKey: 'alerts' },
      { to: '/orders', icon: ShoppingCart, label: 'Zamówienia', moduleKey: 'orders' },
      { to: '/delegations', icon: Car, label: 'Delegacje', moduleKey: 'delegations' },
      { to: '/portal-settings', icon: Globe2, label: 'Portal i obsługa', moduleKey: 'workspace.settings' },
    ],
  },
  {
    id: 'clients',
    label: 'Klienci',
    items: [
      { to: '/clients', icon: Building2, label: 'Firmy klientów', moduleKey: 'clients' },
      { to: '/crm', icon: Users, label: 'CRM', moduleKey: 'crm' },
      { to: '/locations', icon: MapPin, label: 'Lokalizacje', moduleKey: 'locations' },
      { to: '/partners', icon: Handshake, label: 'Partnerzy IT' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastruktura IT',
    items: [
      { to: '/devices', icon: Server, label: 'Urządzenia', moduleKey: 'devices' },
      { to: '/agents', icon: Zap, label: 'Asystenci', moduleKey: 'agents' },
      { to: '/monitoring', icon: Activity, label: 'Audyt i sieć', moduleKey: 'monitoring' },
      { to: '/backups', icon: HardDriveDownload, label: 'Kopie zapasowe', moduleKey: 'backups' },
      { to: '/activity-logs', icon: Scroll, label: 'Logi aktywności', moduleKey: 'activity-logs' },
      { to: '/downloads', icon: HardDrive, label: 'Dysk', moduleKey: 'downloads' },
      { to: '/storage', icon: Database, label: 'Pamięć', superAdminOnly: true },
    ],
  },
  {
    id: 'vault',
    label: 'Sejf haseł',
    items: [
      { to: '/vault', icon: Key, label: 'Wszystkie', moduleKey: 'vault' },
      { to: '/vault/mine', icon: Key, label: 'Moje', moduleKey: 'vault' },
      { to: '/vault/shared', icon: Key, label: 'Współdzielone', moduleKey: 'vault' },
    ],
  },
  {
    id: 'ai',
    label: 'Asystent AI',
    items: [
      { to: '/ai', icon: Brain, label: 'Czat i komendy', moduleKey: 'ai.copilot' },
      { to: '/ai/shadow', icon: Radar, label: 'Shadow Mode', moduleKey: 'ai.copilot' },
      { to: '/ai/insights', icon: Lightbulb, label: 'Insights', moduleKey: 'ai.copilot' },
      { to: '/ai/time', icon: Clock, label: 'Invisible Time', comingSoon: true },
      { to: '/ai/usage', icon: DollarSign, label: 'Koszty AI', moduleKey: 'ai.copilot' },
    ],
  },
  {
    id: 'company',
    label: 'Moja firma',
    items: [
      { to: '/my-company', icon: Building, label: 'Moje dane', moduleKey: 'workspace.settings' },
      { to: '/users', icon: UserCog, label: 'Użytkownicy', moduleKey: 'members' },
      { to: '/plan-and-modules', icon: Package2, label: 'Plan i moduły', moduleKey: 'billing' },
      { to: '/settings', icon: Cog, label: 'Ustawienia', moduleKey: 'workspace.settings' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/design', icon: Palette, label: 'Design' },
    ],
  },
];

/** Decides if a nav item should be visible for a given user/workspace context. */
export function canSee(item: NavItem, perm: PermissionPayload | undefined, isSuperAdmin: boolean): boolean {
  if (item.superAdminOnly && !isSuperAdmin) return false;
  if (!item.moduleKey) return true;
  if (!perm) return true; // optimistic while loading — backend still enforces
  if (perm.role === 'OWNER') return true;
  const override = perm.overrides.find((o) => o.moduleKey === item.moduleKey);
  const level: AccessLevel = override?.level ?? perm.effective[item.moduleKey] ?? 'VIEW';
  return level !== 'NONE';
}

export function filterVisibleGroups(
  isClient: boolean,
  perm: PermissionPayload | undefined,
  isSuperAdmin: boolean,
): NavGroup[] {
  const base = isClient
    ? GROUPS
        .filter((g) => !CLIENT_HIDDEN_GROUPS.has(g.id))
        .map((g) => ({ ...g, items: g.items.filter((it) => CLIENT_VISIBLE_PATHS.has(it.to)) }))
    : GROUPS;
  return base
    .map((g) => ({ ...g, items: g.items.filter((it) => canSee(it, perm, isSuperAdmin)) }))
    .filter((g) => g.items.length > 0);
}

/** Returns true when current pathname matches the nav item's `to` target. */
export function isItemActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  if (to === '/vault') return pathname === '/vault';
  return pathname === to || pathname.startsWith(to + '/');
}

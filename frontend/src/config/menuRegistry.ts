/**
 * System Menu Registry — source of truth for all sidebar navigation items.
 * IDs are stable and persisted in user preferences — NEVER rename them.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Monitor, MapPin,
  Ticket, MessageSquare, Bot, ClipboardList,
  ShoppingCart, Download, Settings, HardDrive, KeyRound, Timer,
  Receipt, Plane, Users, CalendarDays, Share2,
  Shield, Activity, Sparkles,
  FileText, Package, Warehouse, CreditCard, BarChart3, Upload, Car, ClipboardCheck,
  Truck, Layers, Waves,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

export interface SystemMenuItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  groupId: string;
  defaultOrder: number;
  feature?: string;
  module?: string;
  role?: 'ADMIN' | 'SUPERADMIN';
  badgeKey?: 'ticketQueue' | 'activeTasks';
  /** NavLink `end` prop — exact match only */
  end?: boolean;
}

export interface SystemMenuGroup {
  id: string;
  label: string;
  defaultOrder: number;
  role?: 'ADMIN' | 'SUPERADMIN';
  module?: string;
}

// ── Groups ─────────────────────────────────────────────────────

export const SYSTEM_GROUPS: SystemMenuGroup[] = [
  { id: 'favorites',       label: 'ULUBIONE',       defaultOrder: -1 },
  { id: 'main',            label: '',               defaultOrder: 0 },
  { id: 'infrastructure',  label: 'INFRASTRUKTURA', defaultOrder: 1 },
  { id: 'service',         label: 'SERWIS',         defaultOrder: 2 },
  { id: 'monitoring',      label: 'MONITORING',     defaultOrder: 3 },
  { id: 'business',        label: 'BIZNES',         defaultOrder: 4 },
  { id: 'invoicing',       label: 'FAKTURY',        defaultOrder: 5, module: 'invoicing' },
  { id: 'packaging',       label: 'PAKOWANIE',      defaultOrder: 6, module: 'packaging' },
  { id: 'vehicle-service', label: 'SERWIS SKP',     defaultOrder: 7, module: 'service' },
  { id: 'admin',           label: 'ADMINISTRACJA',  defaultOrder: 8, role: 'ADMIN' },
  { id: 'platform',        label: 'PLATFORMA',      defaultOrder: 9, role: 'SUPERADMIN' },
];

// ── Items ──────────────────────────────────────────────────────

export const SYSTEM_ITEMS: SystemMenuItem[] = [
  // ── GŁÓWNE ──
  { id: 'dashboard',          to: '/dashboard',            label: 'Dashboard',       icon: LayoutDashboard, groupId: 'main',           defaultOrder: 0 },

  // ── INFRASTRUKTURA ──
  { id: 'locations',          to: '/locations',            label: 'Lokalizacje',     icon: MapPin,          groupId: 'infrastructure', defaultOrder: 0 },
  { id: 'devices',            to: '/devices',              label: 'Urządzenia',      icon: Monitor,         groupId: 'infrastructure', defaultOrder: 1 },
  { id: 'credentials',        to: '/credentials',          label: 'Dostępy',         icon: KeyRound,        groupId: 'infrastructure', defaultOrder: 2 },

  // ── SERWIS ──
  { id: 'tickets',            to: '/tickets',              label: 'Zgłoszenia',      icon: Ticket,          groupId: 'service',        defaultOrder: 0, badgeKey: 'ticketQueue', end: true },
  { id: 'ticket-reports',     to: '/tickets/reports',      label: 'Raporty',         icon: BarChart3,       groupId: 'service',        defaultOrder: 1 },
  { id: 'tasks',              to: '/tasks',                label: 'Zadania',         icon: ClipboardList,   groupId: 'service',        defaultOrder: 2, badgeKey: 'activeTasks' },
  { id: 'calendar',           to: '/calendar',             label: 'Kalendarz',       icon: CalendarDays,    groupId: 'service',        defaultOrder: 3 },
  { id: 'orders',             to: '/orders',               label: 'Zamówienia',      icon: ShoppingCart,    groupId: 'service',        defaultOrder: 4, feature: 'orders' },
  { id: 'delegations',        to: '/delegations',          label: 'Delegacje',       icon: Plane,           groupId: 'service',        defaultOrder: 5, feature: 'delegations' },
  { id: 'sharing',            to: '/sharing',              label: 'Udostępnianie',   icon: Share2,          groupId: 'service',        defaultOrder: 6 },

  // ── MONITORING ──
  { id: 'agents',             to: '/agents',               label: 'Asystenci',       icon: Bot,             groupId: 'monitoring',     defaultOrder: 0 },
  { id: 'audit-network',      to: '/monitoring',           label: 'Audyt & Sieć',   icon: Shield,          groupId: 'monitoring',     defaultOrder: 1, feature: 'security_audit' },
  { id: 'backups',            to: '/backups',              label: 'Kopie zapasowe',  icon: HardDrive,       groupId: 'monitoring',     defaultOrder: 2, feature: 'backup' },
  { id: 'activity-logs',      to: '/activity-logs',        label: 'Logi aktywności', icon: Activity,        groupId: 'monitoring',     defaultOrder: 3, role: 'ADMIN' },

  // ── BIZNES ──
  { id: 'crm',                to: '/crm',                  label: 'CRM',             icon: MessageSquare,   groupId: 'business',       defaultOrder: 0, feature: 'crm' },
  { id: 'sessions',           to: '/sessions',             label: 'Sesje pracy',     icon: Timer,           groupId: 'business',       defaultOrder: 1, feature: 'sessions' },
  { id: 'billing',            to: '/billing',              label: 'Rozliczenia',     icon: Receipt,         groupId: 'business',       defaultOrder: 2, feature: 'billing' },
  { id: 'ai',                 to: '/ai',                   label: 'Asystent AI',     icon: Sparkles,        groupId: 'business',       defaultOrder: 3, feature: 'ai' },

  // ── FAKTURY ──
  { id: 'inv-dashboard',      to: '/invoicing',            label: 'Dashboard',       icon: LayoutDashboard, groupId: 'invoicing',      defaultOrder: 0, module: 'invoicing' },
  { id: 'inv-documents',      to: '/invoicing/documents',  label: 'Dokumenty',       icon: FileText,        groupId: 'invoicing',      defaultOrder: 1, module: 'invoicing' },
  { id: 'inv-contractors',    to: '/invoicing/contractors', label: 'Kontrahenci',    icon: Users,           groupId: 'invoicing',      defaultOrder: 2, module: 'invoicing' },
  { id: 'inv-products',       to: '/invoicing/products',   label: 'Produkty',        icon: Package,         groupId: 'invoicing',      defaultOrder: 3, module: 'invoicing' },
  { id: 'inv-warehouses',     to: '/invoicing/warehouses', label: 'Magazyn',         icon: Warehouse,       groupId: 'invoicing',      defaultOrder: 4, module: 'invoicing' },
  { id: 'inv-payments',       to: '/invoicing/payments',   label: 'Płatności',       icon: CreditCard,      groupId: 'invoicing',      defaultOrder: 5, module: 'invoicing' },
  { id: 'inv-reports',        to: '/invoicing/reports',    label: 'Raporty',         icon: BarChart3,       groupId: 'invoicing',      defaultOrder: 6, module: 'invoicing' },
  { id: 'inv-import',         to: '/invoicing/import',     label: 'Import',          icon: Upload,          groupId: 'invoicing',      defaultOrder: 7, module: 'invoicing' },

  // ── PAKOWANIE ──
  { id: 'pkg-dashboard',      to: '/packaging',            label: 'Dashboard',       icon: LayoutDashboard, groupId: 'packaging',      defaultOrder: 0, module: 'packaging' },
  { id: 'pkg-shipments',      to: '/packaging/shipments',  label: 'Zamówienia',      icon: ShoppingCart,    groupId: 'packaging',      defaultOrder: 1, module: 'packaging' },
  { id: 'pkg-picking',        to: '/packaging/picking',    label: 'Zbieranie',       icon: ClipboardList,   groupId: 'packaging',      defaultOrder: 2, module: 'packaging' },
  { id: 'pkg-packing',        to: '/packaging/packing',    label: 'Pakowanie',       icon: Package,         groupId: 'packaging',      defaultOrder: 3, module: 'packaging' },
  { id: 'pkg-board',          to: '/packaging/board',      label: 'Batche',          icon: Layers,          groupId: 'packaging',      defaultOrder: 4, module: 'packaging' },
  { id: 'pkg-waves',          to: '/packaging/waves',      label: 'Fale wysyłkowe',  icon: Waves,           groupId: 'packaging',      defaultOrder: 5, module: 'packaging' },
  { id: 'pkg-carriers',       to: '/packaging/carriers',   label: 'Kurierzy',        icon: Truck,           groupId: 'packaging',      defaultOrder: 6, module: 'packaging' },
  { id: 'pkg-customers',      to: '/packaging/customers',  label: 'Klienci',         icon: Users,           groupId: 'packaging',      defaultOrder: 7, module: 'packaging' },
  { id: 'pkg-reports',        to: '/packaging/reports',    label: 'Raporty',         icon: BarChart3,       groupId: 'packaging',      defaultOrder: 8, module: 'packaging' },

  // ── SERWIS SKP ──
  { id: 'svc-dashboard',      to: '/service',              label: 'Dashboard',       icon: LayoutDashboard, groupId: 'vehicle-service', defaultOrder: 0, module: 'service' },
  { id: 'svc-inspections',    to: '/service/inspections',  label: 'Przeglądy',       icon: ClipboardCheck,  groupId: 'vehicle-service', defaultOrder: 1, module: 'service' },
  { id: 'svc-vehicles',       to: '/service/vehicles',     label: 'Pojazdy',         icon: Car,             groupId: 'vehicle-service', defaultOrder: 2, module: 'service' },

  // ── ADMINISTRACJA ──
  { id: 'admin-members',      to: '/workspace-members',    label: 'Członkowie',      icon: Users,           groupId: 'admin',          defaultOrder: 0, role: 'ADMIN' },
  { id: 'admin-settings',     to: '/settings',             label: 'Ustawienia',      icon: Settings,        groupId: 'admin',          defaultOrder: 1, role: 'ADMIN' },
  { id: 'admin-workspace',    to: '/my-company',           label: 'Workspace',       icon: Building2,       groupId: 'admin',          defaultOrder: 2, role: 'ADMIN' },
  { id: 'admin-downloads',    to: '/downloads',            label: 'Pobieranie',      icon: Download,        groupId: 'admin',          defaultOrder: 3, role: 'ADMIN' },

  // ── PLATFORMA ──
  { id: 'sa-dashboard',       to: '/superadmin',           label: 'Dashboard SA',    icon: Activity,        groupId: 'platform',       defaultOrder: 0, role: 'SUPERADMIN', end: true },
  { id: 'sa-tenants',         to: '/superadmin/tenants',   label: "Workspace'y",     icon: Building2,       groupId: 'platform',       defaultOrder: 1, role: 'SUPERADMIN' },
  { id: 'sa-users',           to: '/superadmin/users',     label: 'Użytkownicy SA',  icon: Users,           groupId: 'platform',       defaultOrder: 2, role: 'SUPERADMIN' },
  { id: 'sa-email',           to: '/superadmin/email',     label: 'Email',           icon: Settings,        groupId: 'platform',       defaultOrder: 3, role: 'SUPERADMIN' },
];

// ── Lookup Maps ────────────────────────────────────────────────

export const ITEMS_BY_ID = new Map(SYSTEM_ITEMS.map(i => [i.id, i]));
export const GROUPS_BY_ID = new Map(SYSTEM_GROUPS.map(g => [g.id, g]));

// ── Menu Layout Types (persisted in DB) ────────────────────────

export interface MenuGroupConfig {
  id: string;
  label?: string | null;
  color?: string | null;
  items: string[];
  isCustom?: boolean;
  isSeparator?: boolean;
}

export interface MenuLayout {
  version: 1;
  groups: MenuGroupConfig[];
  hiddenItems: string[];
  collapsedGroups: string[];
  favoriteItems: string[];
}

// ── Default Layout Generator ───────────────────────────────────

export function buildDefaultLayout(): MenuLayout {
  const groups: MenuGroupConfig[] = SYSTEM_GROUPS.map(g => ({
    id: g.id,
    items: SYSTEM_ITEMS
      .filter(i => i.groupId === g.id)
      .sort((a, b) => a.defaultOrder - b.defaultOrder)
      .map(i => i.id),
  }));

  return {
    version: 1,
    groups,
    hiddenItems: [],
    collapsedGroups: [],
    favoriteItems: [],
  };
}

// ── Section Color Palette ──────────────────────────────────────

export const SECTION_COLORS = [
  { id: 'neutral', label: 'Neutralny', value: null },
  { id: 'blue',    label: 'Niebieski', value: '#3B82F6' },
  { id: 'violet',  label: 'Fioletowy', value: '#8B5CF6' },
  { id: 'indigo',  label: 'Indygo',    value: '#6366F1' },
  { id: 'green',   label: 'Zielony',   value: '#22C55E' },
  { id: 'amber',   label: 'Bursztyn',  value: '#F59E0B' },
  { id: 'rose',    label: 'Róż',       value: '#F43F5E' },
  { id: 'cyan',    label: 'Cyjan',     value: '#06B6D4' },
];

/**
 * System Menu Registry v2 — modular SaaS architecture.
 * IDs are stable and persisted in user preferences — NEVER rename them.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Monitor, MapPin,
  Ticket, MessageSquare, Bot, ClipboardList,
  ShoppingCart, Download, Settings, HardDrive, KeyRound, Timer,
  Receipt, Plane, Users, CalendarDays, Share2,
  Shield, Activity, Sparkles, Lock,
  FileText, Package, Warehouse, CreditCard, BarChart3, Upload, Car, ClipboardCheck,
  Truck, Layers, Waves, Star,
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
  adminOnly?: boolean;
  badgeKey?: 'ticketQueue' | 'activeTasks';
  end?: boolean;
}

export interface SystemMenuGroup {
  id: string;
  label: string;
  defaultOrder: number;
  module?: string;
  permanent?: boolean;       // always visible regardless of modules
  adminOnly?: boolean;       // entire group only for Administrators
  superadminOnly?: boolean;  // only for platform superadmin
}

// ── Groups ─────────────────────────────────────────────────────

export const SYSTEM_GROUPS: SystemMenuGroup[] = [
  // Dashboard (always first)
  { id: 'main',            label: '',                   defaultOrder: 0,  permanent: true },

  // Modules (activated per workspace)
  { id: 'infrastructure',  label: 'INFRASTRUKTURA IT',  defaultOrder: 1,  module: 'infrastructure' },
  { id: 'service-desk',    label: 'SERWIS I OBSŁUGA IT', defaultOrder: 2,  module: 'service-desk' },
  { id: 'invoicing',       label: 'FINANSE',            defaultOrder: 3,  module: 'invoicing' },
  { id: 'packaging',       label: 'PAKOWANIE',          defaultOrder: 4,  module: 'packaging' },
  { id: 'skp',             label: 'SKP',                defaultOrder: 5,  module: 'skp' },

  // Permanent sections (always visible)
  { id: 'vault',           label: 'SEJF HASEŁ',         defaultOrder: 6,  permanent: true },
  { id: 'ai',              label: 'ASYSTENT AI',         defaultOrder: 7,  permanent: true },

  // My company (always last before platform)
  { id: 'company',         label: 'MOJA FIRMA',          defaultOrder: 8,  permanent: true },

  // Favorites (user-managed, shown only if has items)
  { id: 'favorites',       label: 'ULUBIONE',            defaultOrder: -1, permanent: true },

  // Platform (superadmin only)
  { id: 'platform',        label: 'PLATFORMA',           defaultOrder: 99, superadminOnly: true },
];

// ── Items ──────────────────────────────────────────────────────

export const SYSTEM_ITEMS: SystemMenuItem[] = [
  // ── DASHBOARD (main) ──
  { id: 'dashboard',          to: '/dashboard',            label: 'Dashboard',         icon: LayoutDashboard, groupId: 'main',           defaultOrder: 0 },

  // ── INFRASTRUKTURA IT ──
  { id: 'devices',            to: '/devices',              label: 'Urządzenia',        icon: Monitor,         groupId: 'infrastructure', defaultOrder: 0, module: 'infrastructure' },
  { id: 'agents',             to: '/agents',               label: 'Agenty',            icon: Bot,             groupId: 'infrastructure', defaultOrder: 1, module: 'infrastructure' },
  { id: 'audit-network',      to: '/monitoring',           label: 'Audyt i sieć',      icon: Shield,          groupId: 'infrastructure', defaultOrder: 2, module: 'infrastructure' },
  { id: 'backups',            to: '/backups',              label: 'Kopie zapasowe',     icon: HardDrive,       groupId: 'infrastructure', defaultOrder: 3, module: 'infrastructure' },
  { id: 'activity-logs',      to: '/activity-logs',        label: 'Logi aktywności',    icon: Activity,        groupId: 'infrastructure', defaultOrder: 4, module: 'infrastructure' },

  // ── SERWIS I OBSŁUGA IT ──
  { id: 'tickets',            to: '/tickets',              label: 'Zgłoszenia',         icon: Ticket,          groupId: 'service-desk',   defaultOrder: 0, module: 'service-desk', badgeKey: 'ticketQueue', end: true },
  { id: 'tasks',              to: '/tasks',                label: 'Zadania',            icon: ClipboardList,   groupId: 'service-desk',   defaultOrder: 1, module: 'service-desk', badgeKey: 'activeTasks' },
  { id: 'calendar',           to: '/calendar',             label: 'Kalendarz',          icon: CalendarDays,    groupId: 'service-desk',   defaultOrder: 2, module: 'service-desk' },
  { id: 'orders',             to: '/orders',               label: 'Zamówienia',         icon: ShoppingCart,    groupId: 'service-desk',   defaultOrder: 3, module: 'service-desk' },
  { id: 'delegations',        to: '/delegations',          label: 'Delegacje',          icon: Plane,           groupId: 'service-desk',   defaultOrder: 4, module: 'service-desk' },
  { id: 'crm',                to: '/crm',                  label: 'CRM',                icon: MessageSquare,   groupId: 'service-desk',   defaultOrder: 5, module: 'service-desk' },
  { id: 'sessions',           to: '/sessions',             label: 'Sesje pracy',        icon: Timer,           groupId: 'service-desk',   defaultOrder: 6, module: 'service-desk' },
  { id: 'billing',            to: '/billing',              label: 'Rozliczenia',        icon: Receipt,         groupId: 'service-desk',   defaultOrder: 7, module: 'service-desk' },

  // ── FINANSE ──
  { id: 'inv-dashboard',      to: '/invoicing',            label: 'Dashboard',          icon: LayoutDashboard, groupId: 'invoicing',      defaultOrder: 0, module: 'invoicing' },
  { id: 'inv-documents',      to: '/invoicing/documents',  label: 'Dokumenty',          icon: FileText,        groupId: 'invoicing',      defaultOrder: 1, module: 'invoicing' },
  { id: 'inv-contractors',    to: '/invoicing/contractors', label: 'Kontrahenci',        icon: Users,           groupId: 'invoicing',      defaultOrder: 2, module: 'invoicing' },
  { id: 'inv-products',       to: '/invoicing/products',   label: 'Produkty',           icon: Package,         groupId: 'invoicing',      defaultOrder: 3, module: 'invoicing' },
  { id: 'inv-warehouses',     to: '/invoicing/warehouses', label: 'Magazyn',            icon: Warehouse,       groupId: 'invoicing',      defaultOrder: 4, module: 'invoicing' },
  { id: 'inv-payments',       to: '/invoicing/payments',   label: 'Płatności',          icon: CreditCard,      groupId: 'invoicing',      defaultOrder: 5, module: 'invoicing' },
  { id: 'inv-reports',        to: '/invoicing/reports',    label: 'Raporty',            icon: BarChart3,       groupId: 'invoicing',      defaultOrder: 6, module: 'invoicing' },
  { id: 'inv-import',         to: '/invoicing/import',     label: 'Import',             icon: Upload,          groupId: 'invoicing',      defaultOrder: 7, module: 'invoicing' },

  // ── PAKOWANIE ──
  { id: 'pkg-dashboard',      to: '/packaging',            label: 'Dashboard',          icon: LayoutDashboard, groupId: 'packaging',      defaultOrder: 0, module: 'packaging' },
  { id: 'pkg-shipments',      to: '/packaging/shipments',  label: 'Zamówienia',         icon: ShoppingCart,    groupId: 'packaging',      defaultOrder: 1, module: 'packaging' },
  { id: 'pkg-picking',        to: '/packaging/picking',    label: 'Kompletacja',        icon: ClipboardList,   groupId: 'packaging',      defaultOrder: 2, module: 'packaging' },
  { id: 'pkg-packing',        to: '/packaging/packing',    label: 'Pakowanie',          icon: Package,         groupId: 'packaging',      defaultOrder: 3, module: 'packaging' },
  { id: 'pkg-board',          to: '/packaging/board',      label: 'Batche',             icon: Layers,          groupId: 'packaging',      defaultOrder: 4, module: 'packaging' },
  { id: 'pkg-waves',          to: '/packaging/waves',      label: 'Fale wysyłkowe',     icon: Waves,           groupId: 'packaging',      defaultOrder: 5, module: 'packaging' },
  { id: 'pkg-carriers',       to: '/packaging/carriers',   label: 'Kurierzy',           icon: Truck,           groupId: 'packaging',      defaultOrder: 6, module: 'packaging' },
  { id: 'pkg-customers',      to: '/packaging/customers',  label: 'Klienci',            icon: Users,           groupId: 'packaging',      defaultOrder: 7, module: 'packaging' },
  { id: 'pkg-reports',        to: '/packaging/reports',    label: 'Raporty',            icon: BarChart3,       groupId: 'packaging',      defaultOrder: 8, module: 'packaging' },

  // ── SKP ──
  { id: 'skp-dashboard',      to: '/skp',                  label: 'Dashboard',          icon: LayoutDashboard, groupId: 'skp',            defaultOrder: 0, module: 'skp' },
  { id: 'skp-inspections',    to: '/skp/inspections',      label: 'Przeglądy',          icon: ClipboardCheck,  groupId: 'skp',            defaultOrder: 1, module: 'skp' },
  { id: 'skp-vehicles',       to: '/skp/vehicles',         label: 'Pojazdy',            icon: Car,             groupId: 'skp',            defaultOrder: 2, module: 'skp' },

  // ── SEJF HASEŁ (permanent) ──
  { id: 'vault',              to: '/vault',                label: 'Wszystkie wpisy',    icon: Lock,            groupId: 'vault',          defaultOrder: 0 },
  { id: 'vault-mine',         to: '/vault/mine',           label: 'Moje wpisy',         icon: KeyRound,        groupId: 'vault',          defaultOrder: 1 },
  { id: 'vault-shared',       to: '/vault/shared',         label: 'Współdzielone',      icon: Share2,          groupId: 'vault',          defaultOrder: 2 },

  // ── ASYSTENT AI (permanent) ──
  { id: 'ai',                 to: '/ai',                   label: 'Czat i komendy',     icon: Sparkles,        groupId: 'ai',             defaultOrder: 0 },

  // ── MOJA FIRMA (permanent) ──
  { id: 'company-data',       to: '/my-company',           label: 'Moje dane',          icon: Building2,       groupId: 'company',        defaultOrder: 0 },
  { id: 'locations',          to: '/locations',            label: 'Lokalizacje',        icon: MapPin,          groupId: 'company',        defaultOrder: 1 },
  { id: 'company-users',      to: '/users',               label: 'Użytkownicy',        icon: Users,           groupId: 'company',        defaultOrder: 2, adminOnly: true },
  { id: 'company-settings',   to: '/settings',            label: 'Ustawienia',         icon: Settings,        groupId: 'company',        defaultOrder: 3, adminOnly: true },
  { id: 'company-sharing',    to: '/sharing',             label: 'Udostępnianie',      icon: Share2,          groupId: 'company',        defaultOrder: 4, adminOnly: true },

  // ── PLATFORMA (superadmin) ──
  { id: 'sa-dashboard',       to: '/superadmin',           label: 'Dashboard SA',       icon: Activity,        groupId: 'platform',       defaultOrder: 0, end: true },
  { id: 'sa-tenants',         to: '/superadmin/tenants',   label: "Workspace'y",        icon: Building2,       groupId: 'platform',       defaultOrder: 1 },
  { id: 'sa-users',           to: '/superadmin/users',     label: 'Użytkownicy SA',     icon: Users,           groupId: 'platform',       defaultOrder: 2 },
  { id: 'sa-email',           to: '/superadmin/email',     label: 'Email',              icon: Settings,        groupId: 'platform',       defaultOrder: 3 },
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
  const groups: MenuGroupConfig[] = SYSTEM_GROUPS
    .filter(g => g.id !== 'favorites') // favorites starts empty
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map(g => ({
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

// ── Module key migration helper ────────────────────────────────

/** Maps old module keys to new ones for backward compatibility */
export const MODULE_MIGRATION: Record<string, string[]> = {
  'helpdesk': ['infrastructure', 'service-desk'],
  'service': ['skp'],
};

/** Check if a module is enabled, handling old keys */
export function isModuleEnabled(enabledModules: string[], moduleKey: string): boolean {
  if (enabledModules.includes(moduleKey)) return true;
  // Check if any old key maps to this module
  for (const [oldKey, newKeys] of Object.entries(MODULE_MIGRATION)) {
    if (newKeys.includes(moduleKey) && enabledModules.includes(oldKey)) return true;
  }
  return false;
}

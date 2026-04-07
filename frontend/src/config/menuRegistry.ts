/**
 * Menu Registry v3 — workspace type architecture.
 *
 * 3 workspace types: msp | internal_it | client
 * Feature flags drive visibility. Zero duplicates.
 * IDs are stable — persisted in user preferences.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Monitor, MapPin,
  Ticket, MessageSquare, Bot, ClipboardList,
  ShoppingCart, Settings, HardDrive, KeyRound, Timer,
  Receipt, Plane, Users, CalendarDays, Share2,
  Shield, Activity, Sparkles, Lock,
  FileText, Package, Warehouse, CreditCard, BarChart3, Upload, Car, ClipboardCheck,
  Truck, Layers, Waves, Contact, Link2, Headphones, Bell, Plus,
} from 'lucide-react';

// ── Workspace Types ───────────────────────────────────────────

export type WorkspaceType = 'msp' | 'internal_it' | 'client';
export type WorkspacePlan = 'basic' | 'pro' | 'enterprise';

// Backward compat mapping
export function normalizeOrgType(raw: string | undefined): WorkspaceType {
  switch (raw) {
    case 'msp': case 'it_operator': return 'msp';
    case 'client': case 'client_external_it': return 'client';
    default: return 'internal_it';
  }
}

export function normalizePlan(raw: string | undefined): WorkspacePlan {
  switch (raw?.toUpperCase()) {
    case 'ENTERPRISE': return 'enterprise';
    case 'PROFESSIONAL': case 'PRO': return 'pro';
    default: return 'basic'; // FREE, STARTER → basic
  }
}

// ── Feature Flags ─────────────────────────────────────────────

export interface FeatureFlags {
  CRM: boolean;
  INFRA: boolean;
  SALES_ORDERS: boolean;
  INTERNAL_PURCHASES: boolean;
  CLIENT_PORTAL: boolean;
  PARTNERS: boolean;
  PARTNERS_LOCKED: boolean; // show with lock icon (upsell)
  DELEGATIONS: boolean;
  SESSIONS: boolean;
  BILLING: boolean;
  ALERTS: boolean;
}

export function getFeatureFlags(type: WorkspaceType, plan: WorkspacePlan): FeatureFlags {
  return {
    CRM:                type === 'msp',
    INFRA:              type !== 'client',
    SALES_ORDERS:       type === 'msp',
    INTERNAL_PURCHASES: type === 'internal_it',
    CLIENT_PORTAL:      type === 'client',
    PARTNERS:           type === 'msp' && plan === 'enterprise',
    PARTNERS_LOCKED:    type === 'msp' && plan !== 'enterprise',
    DELEGATIONS:        type === 'msp',
    SESSIONS:           type === 'msp',
    BILLING:            type === 'msp',
    ALERTS:             type !== 'client',
  };
}

// ── Menu Types ────────────────────────────────────────────────

export interface SystemMenuItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  groupId: string;
  defaultOrder: number;
  feature?: string;      // visible only if feature flag is truthy
  module?: string;       // visible only if workspace module enabled
  adminOnly?: boolean;
  badgeKey?: 'ticketQueue' | 'activeTasks';
  end?: boolean;
  wsTypes?: WorkspaceType[];  // if set, only visible for these types
  locked?: boolean;           // show with lock icon (set at runtime)
}

export interface SystemMenuGroup {
  id: string;
  label: string;
  defaultOrder: number;
  module?: string;
  permanent?: boolean;
  adminOnly?: boolean;
  superadminOnly?: boolean;
  wsTypes?: WorkspaceType[];
}

// ── Groups ────────────────────────────────────────────────────

export const SYSTEM_GROUPS: SystemMenuGroup[] = [
  // Dashboard
  { id: 'main',            label: '',                   defaultOrder: 0,  permanent: true },

  // MSP: OPERACJE
  { id: 'operations',      label: 'OPERACJE',           defaultOrder: 1,  wsTypes: ['msp'] },
  // internal_it: HELPDESK
  { id: 'helpdesk',        label: 'HELPDESK',           defaultOrder: 1,  wsTypes: ['internal_it'] },
  // client: ZGŁOSZENIA
  { id: 'client-tickets',  label: 'ZGŁOSZENIA',         defaultOrder: 1,  wsTypes: ['client'] },

  // MSP: KLIENCI
  { id: 'clients',         label: 'KLIENCI',            defaultOrder: 2,  wsTypes: ['msp'] },

  // internal_it: ZAKUPY
  { id: 'purchases',       label: 'ZAKUPY',             defaultOrder: 2,  wsTypes: ['internal_it'] },

  // client: ZAMÓWIENIA
  { id: 'client-orders',   label: 'ZAMÓWIENIA',         defaultOrder: 2,  wsTypes: ['client'] },

  // INFRASTRUKTURA IT (msp + internal_it)
  { id: 'infrastructure',  label: 'INFRASTRUKTURA IT',  defaultOrder: 3,  wsTypes: ['msp', 'internal_it'] },

  // Additional modules
  { id: 'invoicing',       label: 'FINANSE',            defaultOrder: 4,  module: 'invoicing', wsTypes: ['msp', 'internal_it'] },
  { id: 'packaging',       label: 'PAKOWANIE',          defaultOrder: 5,  module: 'packaging', wsTypes: ['msp', 'internal_it'] },
  { id: 'skp',             label: 'SKP',                defaultOrder: 6,  module: 'skp', wsTypes: ['msp', 'internal_it'] },

  // Permanent
  { id: 'vault',           label: 'SEJF HASEŁ',         defaultOrder: 7,  permanent: true },
  { id: 'ai',              label: 'ASYSTENT AI',         defaultOrder: 8,  permanent: true },
  { id: 'company',         label: 'MOJA FIRMA',          defaultOrder: 9,  permanent: true },
  { id: 'favorites',       label: 'ULUBIONE',            defaultOrder: -1, permanent: true },
  { id: 'platform',        label: 'PLATFORMA',           defaultOrder: 99, superadminOnly: true },
];

// ── Items ─────────────────────────────────────────────────────

export const SYSTEM_ITEMS: SystemMenuItem[] = [
  // ── DASHBOARD ──
  { id: 'dashboard',       to: '/dashboard',            label: 'Dashboard',            icon: LayoutDashboard, groupId: 'main',         defaultOrder: 0 },

  // ── MSP: OPERACJE ──
  { id: 'tickets',         to: '/tickets',              label: 'Zgłoszenia',           icon: Ticket,          groupId: 'operations',   defaultOrder: 0,  badgeKey: 'ticketQueue', end: true },
  { id: 'tasks',           to: '/tasks',                label: 'Zadania',              icon: ClipboardList,   groupId: 'operations',   defaultOrder: 1,  badgeKey: 'activeTasks' },
  { id: 'calendar',        to: '/calendar',             label: 'Kalendarz',            icon: CalendarDays,    groupId: 'operations',   defaultOrder: 2 },
  { id: 'sessions',        to: '/sessions',             label: 'Sesje pracy',          icon: Timer,           groupId: 'operations',   defaultOrder: 3 },
  { id: 'billing',         to: '/billing',              label: 'Rozliczenia',          icon: Receipt,         groupId: 'operations',   defaultOrder: 4 },
  { id: 'alerts',          to: '/operator/alerts',      label: 'Alerty i asystenci',   icon: Bell,            groupId: 'operations',   defaultOrder: 5 },
  { id: 'msp-orders',      to: '/orders',               label: 'Zamówienia klientów',  icon: ShoppingCart,    groupId: 'operations',   defaultOrder: 6 },
  { id: 'delegations',     to: '/delegations',          label: 'Delegacje',            icon: Plane,           groupId: 'operations',   defaultOrder: 7 },
  { id: 'portal-settings', to: '/portal-settings',      label: 'Portal i obsługa',     icon: Settings,        groupId: 'operations',   defaultOrder: 8, adminOnly: true },

  // ── INTERNAL_IT: HELPDESK ──
  { id: 'int-tickets',     to: '/tickets',              label: 'Zgłoszenia',           icon: Ticket,          groupId: 'helpdesk',     defaultOrder: 0,  badgeKey: 'ticketQueue', end: true },
  { id: 'int-tasks',       to: '/tasks',                label: 'Zadania',              icon: ClipboardList,   groupId: 'helpdesk',     defaultOrder: 1,  badgeKey: 'activeTasks' },
  { id: 'int-calendar',    to: '/calendar',             label: 'Kalendarz',            icon: CalendarDays,    groupId: 'helpdesk',     defaultOrder: 2 },
  { id: 'int-alerts',      to: '/operator/alerts',      label: 'Alerty i asystenci',   icon: Bell,            groupId: 'helpdesk',     defaultOrder: 3 },
  { id: 'int-portal',      to: '/portal-settings',      label: 'Portal i obsługa',     icon: Settings,        groupId: 'helpdesk',     defaultOrder: 4, adminOnly: true },

  // ── CLIENT: ZGŁOSZENIA ──
  { id: 'cli-tickets',     to: '/tickets',              label: 'Moje zgłoszenia',      icon: Ticket,          groupId: 'client-tickets', defaultOrder: 0, badgeKey: 'ticketQueue', end: true },
  { id: 'cli-new-ticket',  to: '/tickets/new',          label: 'Nowe zgłoszenie',      icon: Plus,            groupId: 'client-tickets', defaultOrder: 1 },

  // ── MSP: KLIENCI ──
  { id: 'cm-companies',    to: '/operator/clients',     label: 'Firmy klientów',       icon: Building2,       groupId: 'clients',      defaultOrder: 0 },
  { id: 'cm-contacts',     to: '/operator/contacts',    label: 'Kontakty',             icon: Contact,         groupId: 'clients',      defaultOrder: 1 },
  { id: 'cm-locations',    to: '/operator/locations',   label: 'Lokalizacje',          icon: MapPin,          groupId: 'clients',      defaultOrder: 2 },
  { id: 'cm-partners',     to: '/operator/partners',    label: 'Partnerzy IT',         icon: Link2,           groupId: 'clients',      defaultOrder: 3, feature: 'PARTNERS' },
  { id: 'cm-partners-up',  to: '/operator/partners',    label: 'Partnerzy IT',         icon: Link2,           groupId: 'clients',      defaultOrder: 3, feature: 'PARTNERS_LOCKED', locked: true },

  // ── INTERNAL_IT: ZAKUPY ──
  { id: 'int-orders',      to: '/orders',               label: 'Zakupy',               icon: ShoppingCart,    groupId: 'purchases',    defaultOrder: 0 },

  // ── CLIENT: ZAMÓWIENIA ──
  { id: 'cli-orders',      to: '/orders',               label: 'Moje zamówienia',      icon: ShoppingCart,    groupId: 'client-orders', defaultOrder: 0 },

  // ── CLIENT: PORTAL I OBSŁUGA ──
  { id: 'cli-portal',      to: '/portal-settings',      label: 'Portal i obsługa',     icon: Settings,        groupId: 'client-orders', defaultOrder: 1, adminOnly: true },

  // ── INFRASTRUKTURA IT ──
  { id: 'devices',         to: '/devices',              label: 'Urządzenia',           icon: Monitor,         groupId: 'infrastructure', defaultOrder: 0 },
  { id: 'agents',          to: '/agents',               label: 'Asystenci',            icon: Bot,             groupId: 'infrastructure', defaultOrder: 1 },
  { id: 'audit-network',   to: '/monitoring',           label: 'Audyt i sieć',         icon: Shield,          groupId: 'infrastructure', defaultOrder: 2 },
  { id: 'backups',         to: '/backups',              label: 'Kopie zapasowe',       icon: HardDrive,       groupId: 'infrastructure', defaultOrder: 3 },
  { id: 'activity-logs',   to: '/activity-logs',        label: 'Logi aktywności',      icon: Activity,        groupId: 'infrastructure', defaultOrder: 4 },

  // ── FINANSE ──
  { id: 'inv-dashboard',   to: '/invoicing',            label: 'Dashboard',            icon: LayoutDashboard, groupId: 'invoicing',    defaultOrder: 0, module: 'invoicing' },
  { id: 'inv-documents',   to: '/invoicing/documents',  label: 'Dokumenty',            icon: FileText,        groupId: 'invoicing',    defaultOrder: 1, module: 'invoicing' },
  { id: 'inv-contractors', to: '/invoicing/contractors', label: 'Kontrahenci',          icon: Users,           groupId: 'invoicing',    defaultOrder: 2, module: 'invoicing' },
  { id: 'inv-products',    to: '/invoicing/products',   label: 'Produkty',             icon: Package,         groupId: 'invoicing',    defaultOrder: 3, module: 'invoicing' },
  { id: 'inv-warehouses',  to: '/invoicing/warehouses', label: 'Magazyn',              icon: Warehouse,       groupId: 'invoicing',    defaultOrder: 4, module: 'invoicing' },
  { id: 'inv-payments',    to: '/invoicing/payments',   label: 'Płatności',            icon: CreditCard,      groupId: 'invoicing',    defaultOrder: 5, module: 'invoicing' },
  { id: 'inv-reports',     to: '/invoicing/reports',    label: 'Raporty',              icon: BarChart3,       groupId: 'invoicing',    defaultOrder: 6, module: 'invoicing' },
  { id: 'inv-import',      to: '/invoicing/import',     label: 'Import',               icon: Upload,          groupId: 'invoicing',    defaultOrder: 7, module: 'invoicing' },

  // ── PAKOWANIE ──
  { id: 'pkg-dashboard',   to: '/packaging',            label: 'Dashboard',            icon: LayoutDashboard, groupId: 'packaging',    defaultOrder: 0, module: 'packaging' },
  { id: 'pkg-shipments',   to: '/packaging/shipments',  label: 'Zamówienia',           icon: ShoppingCart,    groupId: 'packaging',    defaultOrder: 1, module: 'packaging' },
  { id: 'pkg-picking',     to: '/packaging/picking',    label: 'Kompletacja',          icon: ClipboardList,   groupId: 'packaging',    defaultOrder: 2, module: 'packaging' },
  { id: 'pkg-packing',     to: '/packaging/packing',    label: 'Pakowanie',            icon: Package,         groupId: 'packaging',    defaultOrder: 3, module: 'packaging' },
  { id: 'pkg-board',       to: '/packaging/board',      label: 'Batche',               icon: Layers,          groupId: 'packaging',    defaultOrder: 4, module: 'packaging' },
  { id: 'pkg-waves',       to: '/packaging/waves',      label: 'Fale wysyłkowe',       icon: Waves,           groupId: 'packaging',    defaultOrder: 5, module: 'packaging' },
  { id: 'pkg-carriers',    to: '/packaging/carriers',   label: 'Kurierzy',             icon: Truck,           groupId: 'packaging',    defaultOrder: 6, module: 'packaging' },
  { id: 'pkg-customers',   to: '/packaging/customers',  label: 'Klienci',              icon: Users,           groupId: 'packaging',    defaultOrder: 7, module: 'packaging' },
  { id: 'pkg-reports',     to: '/packaging/reports',    label: 'Raporty',              icon: BarChart3,       groupId: 'packaging',    defaultOrder: 8, module: 'packaging' },

  // ── SKP ──
  { id: 'skp-dashboard',   to: '/skp',                  label: 'Dashboard',            icon: LayoutDashboard, groupId: 'skp',          defaultOrder: 0, module: 'skp' },
  { id: 'skp-inspections', to: '/skp/inspections',      label: 'Przeglądy',            icon: ClipboardCheck,  groupId: 'skp',          defaultOrder: 1, module: 'skp' },
  { id: 'skp-vehicles',    to: '/skp/vehicles',         label: 'Pojazdy',              icon: Car,             groupId: 'skp',          defaultOrder: 2, module: 'skp' },

  // ── SEJF HASEŁ ──
  { id: 'vault',           to: '/vault',                label: 'Wszystkie wpisy',      icon: Lock,            groupId: 'vault',        defaultOrder: 0 },
  { id: 'vault-mine',      to: '/vault/mine',           label: 'Moje wpisy',           icon: KeyRound,        groupId: 'vault',        defaultOrder: 1 },
  { id: 'vault-shared',    to: '/vault/shared',         label: 'Współdzielone',        icon: Share2,          groupId: 'vault',        defaultOrder: 2 },

  // ── ASYSTENT AI ──
  { id: 'ai',              to: '/ai',                   label: 'Czat i komendy',       icon: Sparkles,        groupId: 'ai',           defaultOrder: 0 },

  // ── MOJA FIRMA ──
  { id: 'company-data',    to: '/my-company',           label: 'Moje dane',            icon: Building2,       groupId: 'company',      defaultOrder: 0 },
  { id: 'plan-modules',    to: '/plan-and-modules',     label: 'Plan i moduły',  icon: Layers,          groupId: 'company',      defaultOrder: 1, adminOnly: true },
  { id: 'locations',       to: '/locations',            label: 'Lokalizacje',          icon: MapPin,          groupId: 'company',      defaultOrder: 2 },
  { id: 'company-users',   to: '/users',               label: 'Użytkownicy',          icon: Users,           groupId: 'company',      defaultOrder: 3, adminOnly: true },
  { id: 'company-settings',to: '/settings',             label: 'Ustawienia',           icon: Settings,        groupId: 'company',      defaultOrder: 4, adminOnly: true },

  // ── PLATFORMA (superadmin) ──
  { id: 'sa-dashboard',    to: '/superadmin',           label: 'Dashboard SA',         icon: Activity,        groupId: 'platform',     defaultOrder: 0, end: true },
  { id: 'sa-tenants',      to: '/superadmin/tenants',   label: "Workspace'y",          icon: Building2,       groupId: 'platform',     defaultOrder: 1 },
  { id: 'sa-users',        to: '/superadmin/users',     label: 'Użytkownicy SA',       icon: Users,           groupId: 'platform',     defaultOrder: 2 },
  { id: 'sa-email',        to: '/superadmin/email',     label: 'Email',                icon: Settings,        groupId: 'platform',     defaultOrder: 3 },
];

// ── Lookup Maps ───────────────────────────────────────────────

export const ITEMS_BY_ID = new Map(SYSTEM_ITEMS.map(i => [i.id, i]));
export const GROUPS_BY_ID = new Map(SYSTEM_GROUPS.map(g => [g.id, g]));

// ── Menu Layout Types (persisted in DB) ───────────────────────

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

// ── Default Layout Generator ──────────────────────────────────

export function buildDefaultLayout(): MenuLayout {
  const groups: MenuGroupConfig[] = SYSTEM_GROUPS
    .filter(g => g.id !== 'favorites')
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map(g => ({
      id: g.id,
      items: SYSTEM_ITEMS
        .filter(i => i.groupId === g.id)
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .map(i => i.id),
    }));

  return { version: 1, groups, hiddenItems: [], collapsedGroups: [], favoriteItems: [] };
}

// ── Section Color Palette ─────────────────────────────────────

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

// ── Module key migration ──────────────────────────────────────

export const MODULE_MIGRATION: Record<string, string[]> = {
  'helpdesk': ['infrastructure', 'service-desk'],
  'service': ['skp'],
};

export function isModuleEnabled(enabledModules: string[], moduleKey: string): boolean {
  if (enabledModules.includes(moduleKey)) return true;
  for (const [oldKey, newKeys] of Object.entries(MODULE_MIGRATION)) {
    if (newKeys.includes(moduleKey) && enabledModules.includes(oldKey)) return true;
  }
  return false;
}

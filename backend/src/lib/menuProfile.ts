/**
 * getMenuProfile() — canonical, centralized menu visibility logic.
 *
 * This is the SINGLE SOURCE OF TRUTH for what menu items/groups are visible
 * for a given workspace configuration. Both backend (preview/apply) and
 * frontend (menu rendering) must use this same logic.
 *
 * The frontend has a copy at: frontend/src/lib/menuProfile.ts
 * BOTH MUST STAY IN SYNC — identical results for identical inputs.
 */

// ── Types ─────────────────────────────────────────────────────────

export type OrgType = 'CLIENT' | 'INTERNAL_IT' | 'MSP';
type RoutingMode = 'internal_only' | 'send_to_default_provider' | 'ask_each_time';
type ModuleState = 'ACTIVE' | 'TRIAL' | 'INACTIVE' | 'LIMITED' | 'READONLY' | 'MANAGED_BY_PROVIDER' | 'EXPIRED';
type Role = 'OWNER' | 'ADMIN' | 'TECHNICIAN' | 'MEMBER' | 'VIEWER';
type Plan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface MenuProfileInput {
  orgType: OrgType;
  ticketRoutingMode: RoutingMode;
  modules: { moduleKey: string; state: ModuleState }[];
  plan: Plan | string;
  role: Role | string;
  isSuperAdmin: boolean;
}

export interface MenuProfileOutput {
  visibleGroups: string[];
  visibleItems: string[];
  readonlySections: string[];
  hiddenSections: string[];
}

// ── ModuleKey mapping (canonical enum → legacy string for menu matching) ──

const MODULE_KEY_TO_LEGACY: Record<string, string> = {
  INFRASTRUCTURE: 'infrastructure',
  SERVICE_DESK: 'service-desk',
  INVOICING: 'invoicing',
  PACKAGING: 'packaging',
  SKP: 'skp',
  AI: 'ai',
};

// ── Feature flags (derived from orgType + plan) ───────────────────

interface FeatureFlags {
  CRM: boolean;
  INFRA: boolean;
  SALES_ORDERS: boolean;
  INTERNAL_PURCHASES: boolean;
  CLIENT_PORTAL: boolean;
  PARTNERS: boolean;
  PARTNERS_LOCKED: boolean;
  DELEGATIONS: boolean;
  SESSIONS: boolean;
  BILLING: boolean;
  ALERTS: boolean;
}

function computeFeatureFlags(orgType: OrgType, plan: string): FeatureFlags {
  const isEnterprise = plan === 'ENTERPRISE';
  return {
    CRM:                orgType === 'MSP',
    INFRA:              orgType !== 'CLIENT',
    SALES_ORDERS:       orgType === 'MSP',
    INTERNAL_PURCHASES: orgType === 'INTERNAL_IT',
    CLIENT_PORTAL:      orgType === 'CLIENT',
    PARTNERS:           orgType === 'MSP' && isEnterprise,
    PARTNERS_LOCKED:    orgType === 'MSP' && !isEnterprise,
    DELEGATIONS:        orgType === 'MSP',
    SESSIONS:           orgType === 'MSP',
    BILLING:            orgType === 'MSP',
    ALERTS:             orgType !== 'CLIENT',
  };
}

// ── Active module states ─────────────────────────────────────────

const VISIBLE_STATES = new Set<string>(['ACTIVE', 'TRIAL', 'LIMITED', 'READONLY', 'MANAGED_BY_PROVIDER']);
const READONLY_STATES = new Set<string>(['READONLY']);

// ── Menu structure definition (must match frontend menuRegistry.ts) ──
// Replicated here to avoid runtime dependency on frontend code.

interface GroupDef {
  id: string;
  label: string;
  permanent?: boolean;
  superadminOnly?: boolean;
  adminOnly?: boolean;
  module?: string;          // legacy module string key (e.g. 'invoicing')
  wsTypes?: OrgType[];      // visible only for these orgTypes (mapped from lowercase)
}

interface ItemDef {
  id: string;
  groupId: string;
  label: string;
  feature?: string;
  module?: string;
  adminOnly?: boolean;
  wsTypes?: OrgType[];
}

// Map lowercase wsType from menuRegistry → canonical OrgType
function mapWsType(t: string): OrgType {
  switch (t) {
    case 'msp': return 'MSP';
    case 'internal_it': return 'INTERNAL_IT';
    case 'client': return 'CLIENT';
    default: return 'INTERNAL_IT';
  }
}

const GROUPS: GroupDef[] = [
  { id: 'main',           label: '',                   permanent: true },
  { id: 'operations',     label: 'OPERACJE',           wsTypes: ['MSP'] },
  { id: 'helpdesk',       label: 'HELPDESK',           wsTypes: ['INTERNAL_IT'] },
  { id: 'client-tickets', label: 'ZGŁOSZENIA',         wsTypes: ['CLIENT'] },
  { id: 'clients',        label: 'KLIENCI',            wsTypes: ['MSP'] },
  { id: 'purchases',      label: 'ZAKUPY',             wsTypes: ['INTERNAL_IT'] },
  { id: 'client-orders',  label: 'ZAMÓWIENIA',         wsTypes: ['CLIENT'] },
  { id: 'infrastructure', label: 'INFRASTRUKTURA IT',  wsTypes: ['MSP', 'INTERNAL_IT'] },
  { id: 'invoicing',      label: 'FINANSE',            module: 'invoicing', wsTypes: ['MSP', 'INTERNAL_IT'] },
  { id: 'packaging',      label: 'PAKOWANIE',          module: 'packaging', wsTypes: ['MSP', 'INTERNAL_IT'] },
  { id: 'skp',            label: 'SKP',                module: 'skp',      wsTypes: ['MSP', 'INTERNAL_IT'] },
  { id: 'vault',          label: 'SEJF HASEŁ',         permanent: true },
  { id: 'ai',             label: 'ASYSTENT AI',        permanent: true },
  { id: 'company',        label: 'MOJA FIRMA',         permanent: true },
  { id: 'platform',       label: 'PLATFORMA',          superadminOnly: true },
];

const ITEMS: ItemDef[] = [
  // Dashboard
  { id: 'dashboard',       groupId: 'main',            label: 'Dashboard' },

  // MSP: OPERACJE
  { id: 'tickets',         groupId: 'operations',      label: 'Zgłoszenia' },
  { id: 'tasks',           groupId: 'operations',      label: 'Zadania' },
  { id: 'calendar',        groupId: 'operations',      label: 'Kalendarz' },
  { id: 'sessions',        groupId: 'operations',      label: 'Sesje pracy',         feature: 'SESSIONS' },
  { id: 'billing',         groupId: 'operations',      label: 'Rozliczenia',         feature: 'BILLING' },
  { id: 'alerts',          groupId: 'operations',      label: 'Alerty i asystenci',  feature: 'ALERTS' },
  { id: 'msp-orders',      groupId: 'operations',      label: 'Zamówienia klientów', feature: 'SALES_ORDERS' },
  { id: 'delegations',     groupId: 'operations',      label: 'Delegacje',           feature: 'DELEGATIONS' },
  { id: 'portal-settings', groupId: 'operations',      label: 'Portal i obsługa',    adminOnly: true },

  // INTERNAL_IT: HELPDESK
  { id: 'int-tickets',     groupId: 'helpdesk',        label: 'Zgłoszenia' },
  { id: 'int-tasks',       groupId: 'helpdesk',        label: 'Zadania' },
  { id: 'int-calendar',    groupId: 'helpdesk',        label: 'Kalendarz' },
  { id: 'int-alerts',      groupId: 'helpdesk',        label: 'Alerty i asystenci',  feature: 'ALERTS' },
  { id: 'int-portal',      groupId: 'helpdesk',        label: 'Portal i obsługa',    adminOnly: true },

  // CLIENT: ZGŁOSZENIA
  { id: 'cli-tickets',     groupId: 'client-tickets',  label: 'Moje zgłoszenia' },
  { id: 'cli-new-ticket',  groupId: 'client-tickets',  label: 'Nowe zgłoszenie' },

  // MSP: KLIENCI
  { id: 'cm-companies',    groupId: 'clients',         label: 'Firmy klientów' },
  { id: 'cm-contacts',     groupId: 'clients',         label: 'Kontakty' },
  { id: 'cm-locations',    groupId: 'clients',         label: 'Lokalizacje' },
  { id: 'cm-partners',     groupId: 'clients',         label: 'Partnerzy IT',        feature: 'PARTNERS' },
  { id: 'cm-partners-up',  groupId: 'clients',         label: 'Partnerzy IT',        feature: 'PARTNERS_LOCKED' },

  // INTERNAL_IT: ZAKUPY
  { id: 'int-orders',      groupId: 'purchases',       label: 'Zakupy',              feature: 'INTERNAL_PURCHASES' },

  // CLIENT: ZAMÓWIENIA
  { id: 'cli-orders',      groupId: 'client-orders',   label: 'Moje zamówienia' },
  { id: 'cli-portal',      groupId: 'client-orders',   label: 'Portal i obsługa',    adminOnly: true },

  // INFRASTRUKTURA IT
  { id: 'devices',         groupId: 'infrastructure',  label: 'Urządzenia' },
  { id: 'agents',          groupId: 'infrastructure',  label: 'Asystenci' },
  { id: 'audit-network',   groupId: 'infrastructure',  label: 'Audyt i sieć' },
  { id: 'backups',         groupId: 'infrastructure',  label: 'Kopie zapasowe' },
  { id: 'activity-logs',   groupId: 'infrastructure',  label: 'Logi aktywności' },

  // FINANSE (invoicing)
  { id: 'inv-dashboard',   groupId: 'invoicing',       label: 'Dashboard',   module: 'invoicing' },
  { id: 'inv-documents',   groupId: 'invoicing',       label: 'Dokumenty',   module: 'invoicing' },
  { id: 'inv-contractors', groupId: 'invoicing',       label: 'Kontrahenci', module: 'invoicing' },
  { id: 'inv-products',    groupId: 'invoicing',       label: 'Produkty',    module: 'invoicing' },
  { id: 'inv-warehouses',  groupId: 'invoicing',       label: 'Magazyn',     module: 'invoicing' },
  { id: 'inv-payments',    groupId: 'invoicing',       label: 'Płatności',   module: 'invoicing' },
  { id: 'inv-reports',     groupId: 'invoicing',       label: 'Raporty',     module: 'invoicing' },
  { id: 'inv-import',      groupId: 'invoicing',       label: 'Import',      module: 'invoicing' },

  // PAKOWANIE (packaging)
  { id: 'pkg-dashboard',   groupId: 'packaging',       label: 'Dashboard',       module: 'packaging' },
  { id: 'pkg-shipments',   groupId: 'packaging',       label: 'Zamówienia',      module: 'packaging' },
  { id: 'pkg-picking',     groupId: 'packaging',       label: 'Kompletacja',     module: 'packaging' },
  { id: 'pkg-packing',     groupId: 'packaging',       label: 'Pakowanie',       module: 'packaging' },
  { id: 'pkg-board',       groupId: 'packaging',       label: 'Batche',          module: 'packaging' },
  { id: 'pkg-waves',       groupId: 'packaging',       label: 'Fale wysyłkowe',  module: 'packaging' },
  { id: 'pkg-carriers',    groupId: 'packaging',       label: 'Kurierzy',        module: 'packaging' },
  { id: 'pkg-customers',   groupId: 'packaging',       label: 'Klienci',         module: 'packaging' },
  { id: 'pkg-reports',     groupId: 'packaging',       label: 'Raporty',         module: 'packaging' },

  // SKP
  { id: 'skp-dashboard',   groupId: 'skp',             label: 'Dashboard',   module: 'skp' },
  { id: 'skp-inspections', groupId: 'skp',             label: 'Przeglądy',   module: 'skp' },
  { id: 'skp-vehicles',    groupId: 'skp',             label: 'Pojazdy',     module: 'skp' },

  // SEJF HASEŁ
  { id: 'vault',           groupId: 'vault',           label: 'Wszystkie wpisy' },
  { id: 'vault-mine',      groupId: 'vault',           label: 'Moje wpisy' },
  { id: 'vault-shared',    groupId: 'vault',           label: 'Współdzielone' },

  // ASYSTENT AI
  { id: 'ai',              groupId: 'ai',              label: 'Czat i komendy' },

  // MOJA FIRMA
  { id: 'company-data',    groupId: 'company',         label: 'Moje dane' },
  { id: 'plan-modules',    groupId: 'company',         label: 'Plan i moduły', adminOnly: true },
  { id: 'locations',       groupId: 'company',         label: 'Lokalizacje' },
  { id: 'company-users',   groupId: 'company',         label: 'Użytkownicy', adminOnly: true },
  { id: 'company-settings',groupId: 'company',         label: 'Ustawienia',  adminOnly: true },

  // PLATFORMA
  { id: 'sa-dashboard',    groupId: 'platform',        label: 'Dashboard SA' },
  { id: 'sa-tenants',      groupId: 'platform',        label: "Workspace'y" },
  { id: 'sa-users',        groupId: 'platform',        label: 'Użytkownicy SA' },
  { id: 'sa-email',        groupId: 'platform',        label: 'Email' },
];

// ── Lookup maps ──────────────────────────────────────────────────

const GROUPS_BY_ID = new Map(GROUPS.map(g => [g.id, g]));
const ITEMS_BY_GROUP = new Map<string, ItemDef[]>();
for (const item of ITEMS) {
  const list = ITEMS_BY_GROUP.get(item.groupId) ?? [];
  list.push(item);
  ITEMS_BY_GROUP.set(item.groupId, list);
}

// ── Main function ────────────────────────────────────────────────

export function getMenuProfile(input: MenuProfileInput): MenuProfileOutput {
  const { orgType, modules, plan, role, isSuperAdmin } = input;

  const isAdmin = isSuperAdmin || role === 'OWNER' || role === 'ADMIN';
  const features = computeFeatureFlags(orgType, plan.toUpperCase());

  // Build module state lookup: legacy string key → state
  const moduleStateMap = new Map<string, ModuleState>();
  for (const m of modules) {
    const legacyKey = MODULE_KEY_TO_LEGACY[m.moduleKey] ?? m.moduleKey.toLowerCase().replace('_', '-');
    moduleStateMap.set(legacyKey, m.state);
  }

  const hasModuleVisible = (legacyKey: string): boolean => {
    const state = moduleStateMap.get(legacyKey);
    return state ? VISIBLE_STATES.has(state) : false;
  };

  const isModuleReadonly = (legacyKey: string): boolean => {
    const state = moduleStateMap.get(legacyKey);
    return state ? READONLY_STATES.has(state) : false;
  };

  const visibleGroups: string[] = [];
  const visibleItems: string[] = [];
  const readonlySections: string[] = [];
  const hiddenSections: string[] = [];

  for (const group of GROUPS) {
    // Superadmin check
    if (group.superadminOnly && !isSuperAdmin) {
      hiddenSections.push(group.id);
      continue;
    }

    // OrgType check
    if (group.wsTypes && !group.wsTypes.includes(orgType)) {
      hiddenSections.push(group.id);
      continue;
    }

    // Module check
    if (group.module && !hasModuleVisible(group.module)) {
      hiddenSections.push(group.id);
      continue;
    }

    // Admin check
    if (group.adminOnly && !isAdmin) {
      hiddenSections.push(group.id);
      continue;
    }

    // Group is visible — check if readonly
    if (group.module && isModuleReadonly(group.module)) {
      readonlySections.push(group.id);
    }

    // Check items in this group
    const groupItems = ITEMS_BY_GROUP.get(group.id) ?? [];
    let hasVisibleItem = false;

    for (const item of groupItems) {
      // OrgType filter on item level
      if (item.wsTypes && !item.wsTypes.includes(orgType)) continue;

      // Feature flag check
      if (item.feature && !(features as unknown as Record<string, boolean>)[item.feature]) continue;

      // Module check on item level
      if (item.module && !hasModuleVisible(item.module)) continue;

      // Admin check
      if (item.adminOnly && !isAdmin) continue;

      visibleItems.push(item.id);
      hasVisibleItem = true;

      // Item-level readonly
      if (item.module && isModuleReadonly(item.module)) {
        if (!readonlySections.includes(item.id)) readonlySections.push(item.id);
      }
    }

    if (hasVisibleItem || group.permanent) {
      visibleGroups.push(group.id);
    } else if (!group.permanent) {
      hiddenSections.push(group.id);
    }
  }

  return { visibleGroups, visibleItems, readonlySections, hiddenSections };
}

// ── Label lookup (used by preview to generate human-readable summaries) ──

export function getGroupLabel(groupId: string): string {
  return GROUPS_BY_ID.get(groupId)?.label || groupId;
}

export function getItemLabel(itemId: string): string {
  const item = ITEMS.find(i => i.id === itemId);
  return item?.label || itemId;
}

// ── Exported constants for consumers ──

export { MODULE_KEY_TO_LEGACY, GROUPS, ITEMS };

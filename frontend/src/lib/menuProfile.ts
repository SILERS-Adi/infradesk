/**
 * getMenuProfile() — canonical, centralized menu visibility logic.
 *
 * Frontend copy of backend/src/lib/menuProfile.ts.
 * BOTH MUST STAY IN SYNC — identical results for identical inputs.
 *
 * This function is the SINGLE SOURCE OF TRUTH for what menu items/groups
 * are visible for a given workspace configuration.
 */

import {
  SYSTEM_GROUPS, SYSTEM_ITEMS,
  type SystemMenuGroup, type SystemMenuItem,
  type WorkspaceType,
} from '../config/menuRegistry';

// ── Types ─────────────────────────────────────────────────────────

export type OrgType = 'CLIENT' | 'INTERNAL_IT' | 'MSP';
type ModuleState = 'ACTIVE' | 'TRIAL' | 'INACTIVE' | 'LIMITED' | 'READONLY' | 'MANAGED_BY_PROVIDER' | 'EXPIRED';

export interface MenuProfileInput {
  orgType: OrgType;
  ticketRoutingMode: string;
  modules: { moduleKey: string; state: string }[];
  plan: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface MenuProfileOutput {
  visibleGroups: string[];
  visibleItems: string[];
  readonlySections: string[];
  hiddenSections: string[];
}

// ── ModuleKey → legacy string mapping ─────────────────────────────

const MODULE_KEY_TO_LEGACY: Record<string, string> = {
  INFRASTRUCTURE: 'infrastructure',
  SERVICE_DESK: 'service-desk',
  INVOICING: 'invoicing',
  PACKAGING: 'packaging',
  SKP: 'skp',
  AI: 'ai',
};

// ── Feature flags (same logic as menuRegistry.getFeatureFlags) ────

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
  const normOrg = orgType.toLowerCase() as WorkspaceType;
  const isEnterprise = plan.toUpperCase() === 'ENTERPRISE';
  return {
    CRM:                normOrg === 'msp',
    INFRA:              normOrg !== 'client',
    SALES_ORDERS:       normOrg === 'msp',
    INTERNAL_PURCHASES: normOrg === 'internal_it',
    CLIENT_PORTAL:      normOrg === 'client',
    PARTNERS:           normOrg === 'msp' && isEnterprise,
    PARTNERS_LOCKED:    normOrg === 'msp' && !isEnterprise,
    DELEGATIONS:        normOrg === 'msp',
    SESSIONS:           normOrg === 'msp',
    BILLING:            normOrg === 'msp',
    ALERTS:             normOrg !== 'client',
  };
}

// ── Module state helpers ─────────────────────────────────────────

const VISIBLE_STATES = new Set<string>(['ACTIVE', 'TRIAL', 'LIMITED', 'READONLY', 'MANAGED_BY_PROVIDER']);
const READONLY_STATES = new Set<string>(['READONLY']);

// ── OrgType → wsType mapping for matching menu registry ──────────

function orgToWsType(orgType: OrgType): WorkspaceType {
  switch (orgType) {
    case 'MSP': return 'msp';
    case 'CLIENT': return 'client';
    default: return 'internal_it';
  }
}

// ── Main function ────────────────────────────────────────────────

export function getMenuProfile(input: MenuProfileInput): MenuProfileOutput {
  const { orgType, modules, plan, role, isSuperAdmin } = input;
  const wsType = orgToWsType(orgType);

  const isAdmin = isSuperAdmin || role === 'OWNER' || role === 'ADMIN';
  const features = computeFeatureFlags(orgType, plan);

  // Build module state lookup: legacy string key → state
  const moduleStateMap = new Map<string, ModuleState>();
  for (const m of modules) {
    const legacyKey = MODULE_KEY_TO_LEGACY[m.moduleKey] ?? m.moduleKey.toLowerCase().replace('_', '-');
    moduleStateMap.set(legacyKey, m.state as ModuleState);
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

  for (const group of SYSTEM_GROUPS) {
    // Superadmin check
    if (group.superadminOnly && !isSuperAdmin) {
      hiddenSections.push(group.id);
      continue;
    }

    // OrgType check (compare with frontend's lowercase wsTypes)
    if (group.wsTypes && !group.wsTypes.includes(wsType)) {
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
    const groupItems = SYSTEM_ITEMS.filter(i => i.groupId === group.id);
    let hasVisibleItem = false;

    for (const item of groupItems) {
      // wsTypes filter on item level
      if (item.wsTypes && !item.wsTypes.includes(wsType)) continue;

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

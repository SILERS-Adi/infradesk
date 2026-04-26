// ═══════════════════════════════════════════════════════════════════════════════
// canAccess — JEDNO źródło prawdy uprawnień (shared backend + frontend).
// ═══════════════════════════════════════════════════════════════════════════════
// This file is the ONLY authoritative implementation. Frontend imports the same
// file via a bundler alias — no re-implementation, no drift.
//
// Model:
//   Role (OWNER | ADMIN | MEMBER)
//     + Scope (FULL | SCOPED)
//     + PermissionOverride[]  — per moduł
//     + AccessGrant[]         — per zasób (opcjonalnie)
//
// Reguły:
//   1. OWNER zawsze ma pełny dostęp, koniec.
//   2. ADMIN z Scope=FULL ma dostęp do wszystkiego poza wyraźnym NONE w overrides.
//   3. MEMBER startuje z VIEW-only w modułach DEFAULT_MEMBER_LEVELS.
//   4. PermissionOverride.level ZAWSZE wygrywa nad defaultem roli.
//   5. AccessGrant zawęża dostęp do konkretnych zasobów (tylko gdy Scope=SCOPED).
// ═══════════════════════════════════════════════════════════════════════════════

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
export type Scope = 'FULL' | 'SCOPED';
export type AccessLevel = 'NONE' | 'VIEW' | 'EDIT' | 'DELETE';
export type ModuleAction = 'view' | 'edit' | 'delete';

export interface PermissionOverrideLike {
  moduleKey: string;
  level: AccessLevel;
}

export interface AccessGrantLike {
  resourceType: 'DEVICE' | 'LOCATION' | 'CLIENT_WORKSPACE';
  resourceId: string;
  level: AccessLevel;
}

export interface MembershipContext {
  role: Role;
  scope: Scope;
  overrides: PermissionOverrideLike[];
  grants?: AccessGrantLike[];
  isSuperAdmin?: boolean;
}

// Moduły systemu — kanoniczne klucze (musi zgadzać się z frontend menuRegistry).
export const MODULES = {
  DASHBOARD: 'dashboard',
  TICKETS: 'tickets',
  DEVICES: 'devices',
  SESSIONS: 'sessions',
  MONITORING: 'monitoring',
  VAULT: 'vault',
  CLIENTS: 'clients',            // CRM Contacts
  ORDERS: 'orders',              // Zakupy
  LOCATIONS: 'locations',
  MAIL: 'mail',
  KB: 'kb',
  REPORTS: 'reports',
  AI_COPILOT: 'ai.copilot',
  BILLING: 'billing',            // subscription management (workspace-owner only)
  MEMBERS: 'members',
  WORKSPACE_SETTINGS: 'workspace.settings',
  AUDIT_LOG: 'audit.log',
  GPS: 'gps',
  BACKUPS: 'backups',
  INVOICES: 'invoices',          // post-MVP module
  DOWNLOADS: 'downloads',        // plik do pobrania: installers, manuals, tools
} as const;

export type ModuleKey = typeof MODULES[keyof typeof MODULES];

// Domyślny poziom MEMBER-a per moduł.
// UWAGA: dla modułów wrażliwych (vault, audit.log, billing) default = NONE.
const DEFAULT_MEMBER_LEVELS: Record<string, AccessLevel> = {
  [MODULES.DASHBOARD]: 'VIEW',
  [MODULES.TICKETS]: 'EDIT',
  [MODULES.DEVICES]: 'VIEW',
  [MODULES.SESSIONS]: 'EDIT',
  [MODULES.MONITORING]: 'VIEW',
  [MODULES.VAULT]: 'NONE',
  [MODULES.CLIENTS]: 'VIEW',
  [MODULES.ORDERS]: 'NONE',
  [MODULES.LOCATIONS]: 'VIEW',
  [MODULES.MAIL]: 'VIEW',
  [MODULES.KB]: 'VIEW',
  [MODULES.REPORTS]: 'NONE',
  [MODULES.AI_COPILOT]: 'EDIT',
  [MODULES.BILLING]: 'NONE',
  [MODULES.MEMBERS]: 'NONE',
  [MODULES.WORKSPACE_SETTINGS]: 'NONE',
  [MODULES.AUDIT_LOG]: 'NONE',
  [MODULES.GPS]: 'VIEW',
  [MODULES.BACKUPS]: 'NONE',
  [MODULES.INVOICES]: 'NONE',
  [MODULES.DOWNLOADS]: 'VIEW',
};

const ADMIN_DEFAULT_LEVEL: AccessLevel = 'DELETE';
const OWNER_DEFAULT_LEVEL: AccessLevel = 'DELETE';

const LEVEL_ORDER: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2, DELETE: 3 };

function satisfies(have: AccessLevel, need: ModuleAction): boolean {
  const map: Record<ModuleAction, AccessLevel> = { view: 'VIEW', edit: 'EDIT', delete: 'DELETE' };
  return LEVEL_ORDER[have] >= LEVEL_ORDER[map[need]];
}

export function effectiveLevel(ctx: MembershipContext, moduleKey: string): AccessLevel {
  if (ctx.isSuperAdmin) return 'DELETE';
  const override = ctx.overrides.find((o) => o.moduleKey === moduleKey);
  if (override) return override.level;

  if (ctx.role === 'OWNER') return OWNER_DEFAULT_LEVEL;
  if (ctx.role === 'ADMIN') return ADMIN_DEFAULT_LEVEL;
  // MEMBER
  return DEFAULT_MEMBER_LEVELS[moduleKey] ?? 'VIEW';
}

export function canAccess(
  ctx: MembershipContext,
  moduleKey: string,
  action: ModuleAction = 'view',
): boolean {
  const level = effectiveLevel(ctx, moduleKey);
  return satisfies(level, action);
}

export function canAccessResource(
  ctx: MembershipContext,
  moduleKey: string,
  action: ModuleAction,
  resource: { type: AccessGrantLike['resourceType']; id: string },
): boolean {
  if (!canAccess(ctx, moduleKey, action)) return false;
  if (ctx.scope === 'FULL') return true;
  if (ctx.isSuperAdmin) return true;
  const grants = ctx.grants ?? [];
  const grant = grants.find((g) => g.resourceType === resource.type && g.resourceId === resource.id);
  if (!grant) return false;
  return satisfies(grant.level, action);
}

export function visibleModules(ctx: MembershipContext): string[] {
  return Object.values(MODULES).filter((m) => canAccess(ctx, m, 'view'));
}

// Eksport dla testów / UI.
export const __internal = { DEFAULT_MEMBER_LEVELS, LEVEL_ORDER };

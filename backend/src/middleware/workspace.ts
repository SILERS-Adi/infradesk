/**
 * Workspace middleware — Multi-tenant security layer
 *
 * resolveWorkspace():     Establishes req.workspaceId from subdomain or header (non-blocking).
 * resolveMembership():    Loads WorkspaceMembership for the authenticated user.
 * requireWorkspace():     BLOCKING — requires valid workspace + active membership.
 *                         Logs security violations on unauthorized access attempts.
 * authorizeWorkspace():   Role-based gatekeeper.
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

// ── Types ───────────────────────────────────────────────────────────

export type MemberRole = 'OWNER' | 'ADMIN' | 'TECHNICIAN' | 'MEMBER' | 'VIEWER';
export type ScopeType = 'FULL' | 'SCOPED';

export interface WorkspaceContext {
  id: string;
  slug: string;
  type: string;
  source: 'subdomain' | 'header';
}

export interface MembershipContext {
  id: string;
  role: MemberRole;
  scopeType: ScopeType;
  source: string;           // DIRECT | MSP_ASSIGNED | INVITATION
  allowedModules: string[] | null;
  grants: { resourceType: string; resourceId: string }[];
  accountType: string;      // ADMIN | USER
  accessScope: string;      // FULL | RESTRICTED
  permissionOverrides?: { nodeId: string; level: string; canDelete: boolean }[];
}

// ── Extend Express Request ──────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string | null;
      workspace?: WorkspaceContext | null;
      membership?: MembershipContext | null;
    }
  }
}

// ── Config ──────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV !== 'production';

function logDebug(msg: string) {
  if (IS_DEV) console.log(`[WS] ${msg}`);
}

function logWarn(msg: string) {
  console.warn(`[WS] ${msg}`);
}

// ── Slug → Workspace cache (in-memory, short TTL) ──────────────────
// Avoids hitting DB on every request for the same subdomain.

interface CacheEntry {
  id: string;
  slug: string;
  type: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
const slugCache = new Map<string, CacheEntry>();

async function findWorkspaceBySlug(slug: string): Promise<{ id: string; slug: string; type: string } | null> {
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return { id: cached.id, slug: cached.slug, type: cached.type };
  }

  const ws = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true, slug: true, type: true, isActive: true },
  });

  if (!ws || !ws.isActive) return null;

  slugCache.set(slug, {
    id: ws.id,
    slug: ws.slug,
    type: ws.type,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return ws;
}

// ══════════════════════════════════════════════════════════════════════
//  resolveWorkspace — establishes req.workspace from request context
// ══════════════════════════════════════════════════════════════════════

export async function resolveWorkspace(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let workspace: WorkspaceContext | null = null;

    // Source 1: Explicit header (dev/testing, or future workspace switcher)
    const headerWsId = req.headers['x-workspace-id'] as string | undefined;
    if (headerWsId) {
      const ws = await prisma.workspace.findUnique({
        where: { id: headerWsId },
        select: { id: true, slug: true, type: true, isActive: true },
      });
      if (ws && ws.isActive) {
        workspace = { id: ws.id, slug: ws.slug, type: ws.type, source: 'header' };
        logDebug(`workspace from header: ${ws.slug} (${ws.type})`);
      }
    }

    // Source 2: Subdomain (same logic as resolveTenant, but for Workspace)
    if (!workspace) {
      const host = req.hostname?.toLowerCase() ?? '';
      const baseDomain = (process.env.BASE_DOMAIN || 'infradesk.pl').toLowerCase();
      let slug: string | null = null;

      if (host.endsWith(`.${baseDomain}`)) {
        slug = host.replace(`.${baseDomain}`, '');
        if (['www', 'api', 'app'].includes(slug)) slug = null;
      }

      // Also check X-Tenant-Slug header (already used by old tenant middleware)
      if (!slug && req.headers['x-tenant-slug']) {
        slug = (req.headers['x-tenant-slug'] as string).toLowerCase();
      }

      if (slug) {
        const ws = await findWorkspaceBySlug(slug);
        if (ws) {
          workspace = { id: ws.id, slug: ws.slug, type: ws.type, source: 'subdomain' };
          logDebug(`workspace from subdomain: ${ws.slug} (${ws.type})`);
        }
      }
    }

    req.workspace = workspace;

    // Also set req.workspaceId for convenience (used by services)
    if (workspace) {
      req.workspaceId = workspace.id;
    }

    next();
  } catch (err) {
    // Non-blocking: if workspace resolution fails, continue without it
    logWarn(`resolveWorkspace error: ${(err as Error).message}`);
    req.workspace = null;
    next();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  resolveMembership — loads membership for authenticated user
//
//  MUST run AFTER authenticate() — needs req.user.userId
//  MUST run AFTER resolveWorkspace() — needs req.workspace
// ══════════════════════════════════════════════════════════════════════

export async function resolveMembership(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    // No user or no workspace → nothing to resolve
    if (!req.user?.userId || !req.workspace) {
      req.membership = null;
      next();
      return;
    }

    const membership = await prisma.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.userId,
          workspaceId: req.workspace.id,
        },
      },
      select: {
        id: true,
        role: true,
        scopeType: true,
        source: true,
        allowedModules: true,
        status: true,
        accountType: true,
        accessScope: true,
        accessGrants: {
          select: {
            resourceType: true,
            resourceId: true,
          },
        },
        permissionOverrides: {
          select: {
            nodeId: true,
            level: true,
            canDelete: true,
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      // Membership not found or revoked — log but don't block
      logDebug(
        `no active membership: user=${req.user.email} workspace=${req.workspace.slug} ` +
        `(status=${membership?.status ?? 'NOT_FOUND'})`
      );
      req.membership = null;
      next();
      return;
    }

    req.membership = {
      id: membership.id,
      role: membership.role as MemberRole,
      scopeType: membership.scopeType as ScopeType,
      source: membership.source,
      allowedModules: membership.allowedModules as string[] | null,
      grants: membership.accessGrants.map(g => ({
        resourceType: g.resourceType,
        resourceId: g.resourceId,
      })),
      accountType: membership.accountType ?? 'USER',
      accessScope: membership.accessScope ?? 'FULL',
      permissionOverrides: membership.permissionOverrides ?? [],
    };

    logDebug(
      `membership resolved: user=${req.user.email} → workspace=${req.workspace.slug} ` +
      `role=${membership.role} scope=${membership.scopeType} ` +
      `grants=${membership.accessGrants.length}`
    );

    next();
  } catch (err) {
    // Non-blocking: if membership resolution fails, continue without it
    logWarn(`resolveMembership error: ${(err as Error).message}`);
    req.membership = null;
    next();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Combined middleware — convenience wrapper for route-level use
//
//  Usage in routes:
//    router.use(authenticate, withWorkspaceMembership);
// ══════════════════════════════════════════════════════════════════════

export function withWorkspaceMembership(req: Request, res: Response, next: NextFunction): void {
  resolveMembership(req, res, next);
}

// ══════════════════════════════════════════════════════════════════════
//  Etap 1B — authorizeWorkspace
//
//  New authorization based on WorkspaceMembership.role.
//  Falls back to legacy User.role when membership is not available.
//
//  Usage:
//    router.get('/', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER','ADMIN','TECHNICIAN'), handler)
// ══════════════════════════════════════════════════════════════════════

export function authorizeWorkspace(...allowedRoles: MemberRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // SuperAdmin bypass — always allowed
    if (req.user?.isSuperAdmin) {
      next();
      return;
    }

    // Membership-based authorization
    if (req.membership) {
      if (allowedRoles.includes(req.membership.role)) {
        next();
        return;
      }
      res.status(403).json({
        error: 'Insufficient workspace permissions',
        requiredRoles: allowedRoles,
        yourRole: req.membership.role,
      });
      return;
    }

    res.status(403).json({ error: 'No workspace membership' });
  };
}


// ══════════════════════════════════════════════════════════════════════
//  requireWorkspace — BLOCKING tenant isolation guard
//
//  Ensures:
//  1. req.workspaceId is set
//  2. Authenticated user has ACTIVE membership in that workspace
//
//  MUST run AFTER authenticate() + resolveWorkspace()
//  Replaces the non-blocking pattern for all tenant-scoped routes.
// ══════════════════════════════════════════════════════════════════════

export async function requireWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  // SuperAdmin bypass — has access to all workspaces
  if (req.user?.isSuperAdmin) {
    if (!req.workspaceId) {
      res.status(400).json({ error: 'Workspace context required (X-Workspace-Id header)' });
      return;
    }
    next();
    return;
  }

  if (!req.workspaceId) {
    res.status(400).json({ error: 'Workspace context required' });
    return;
  }

  if (!req.user?.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Verify active membership in the requested workspace
  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.user.userId,
        workspaceId: req.workspaceId,
      },
    },
    select: { status: true },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    // ⚠️ SECURITY: Log unauthorized workspace access attempt
    logSecurityViolation(req, 'WORKSPACE_ACCESS_DENIED', {
      attemptedWorkspaceId: req.workspaceId,
    });
    res.status(403).json({ error: 'No access to this workspace' });
    return;
  }

  next();
}

// ══════════════════════════════════════════════════════════════════════
//  assertWorkspaceOwnership — verify a record belongs to req.workspaceId
//
//  Usage in services:
//    assertWorkspaceOwnership(record.workspaceId, req.workspaceId, req)
// ══════════════════════════════════════════════════════════════════════

export function assertWorkspaceOwnership(
  recordWorkspaceId: string | null | undefined,
  requestWorkspaceId: string | null | undefined,
  req?: Request,
): void {
  if (!requestWorkspaceId) {
    throw new TenantIsolationError('Workspace context required');
  }
  if (recordWorkspaceId !== requestWorkspaceId) {
    if (req) {
      logSecurityViolation(req, 'CROSS_TENANT_ACCESS', {
        recordWorkspaceId,
        requestWorkspaceId,
      });
    }
    throw new TenantIsolationError('Access denied — resource belongs to another workspace');
  }
}

/**
 * Custom error class for tenant isolation violations.
 * Returns 403 status code.
 */
export class TenantIsolationError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Security violation logging
// ══════════════════════════════════════════════════════════════════════

function logSecurityViolation(
  req: Request,
  type: string,
  details: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    userId: req.user?.userId ?? 'anonymous',
    email: req.user?.email ?? 'unknown',
    ip: req.ip || req.socket?.remoteAddress,
    method: req.method,
    path: req.originalUrl,
    workspaceId: req.workspaceId,
    ...details,
  };
  console.warn('[SECURITY]', JSON.stringify(entry));

  // Async: persist to DB (fire-and-forget)
  prisma.activityLog.create({
    data: {
      entityType: 'Security',
      entityId: entry.userId,
      actionType: 'SECURITY_VIOLATION',
      description: `${type}: ${req.method} ${req.path}`,
      performedByUserId: req.user?.userId,
      workspaceId: req.workspaceId ?? undefined,
      metadata: details as any,
    },
  }).catch(() => { /* silent — logging must never break the request */ });
}


// ══════════════════════════════════════════════════════════════════════
//  Permission tree helpers
//
//  checkNodePermission(): resolves effective permission level for a node
//  using inheritance (child inherits from parent if no override).
//  requirePermission(): middleware that blocks if user lacks access.
// ══════════════════════════════════════════════════════════════════════

/** Non-delegable admin-only nodes — cannot be granted via permission tree */
const ADMIN_ONLY_NODES = new Set([
  'company.users',          // Zarządzanie użytkownikami
  'company.settings',       // Ustawienia globalne workspace
  'company.sharing',        // Udostępnianie
  'company.smtp',           // Konfiguracja SMTP
  'company.billing',        // Billing / subskrypcja
  'company.api-keys',       // Klucze API
  'company.integrations',   // Krytyczne integracje
  'module-settings',        // Ustawienia modułów (przyszłościowe)
]);

/**
 * Resolve effective permission level for a nodeId.
 * Returns 'FULL' | 'VIEW' | 'NONE'.
 *
 * Logic:
 * - SuperAdmin / accountType=ADMIN → always FULL
 * - accessScope=FULL → always FULL
 * - accessScope=RESTRICTED → check overrides with inheritance
 */
export function resolvePermission(
  membership: MembershipContext | null,
  nodeId: string,
  isSuperAdmin?: boolean
): { level: 'FULL' | 'VIEW' | 'NONE'; canDelete: boolean } {
  // SuperAdmin bypass
  if (isSuperAdmin) return { level: 'FULL', canDelete: true };
  // No membership
  if (!membership) return { level: 'NONE', canDelete: false };
  // Admin account → full access everywhere
  if (membership.accountType === 'ADMIN') return { level: 'FULL', canDelete: true };
  // Admin-only nodes → block non-admin
  if (ADMIN_ONLY_NODES.has(nodeId)) return { level: 'NONE', canDelete: false };
  // Full access scope → full everywhere (but no delete unless admin)
  if (membership.accessScope === 'FULL') return { level: 'FULL', canDelete: false };

  // Restricted → check overrides with parent inheritance
  const overrides = membership.permissionOverrides ?? [];
  const overrideMap = new Map(overrides.map(o => [o.nodeId, o]));

  // Check exact match first
  const exact = overrideMap.get(nodeId);
  if (exact) return { level: exact.level as any, canDelete: exact.canDelete };

  // Check parent (e.g. "infrastructure.devices" → "infrastructure")
  const dotIdx = nodeId.indexOf('.');
  if (dotIdx > 0) {
    const parentId = nodeId.substring(0, dotIdx);
    const parent = overrideMap.get(parentId);
    if (parent) return { level: parent.level as any, canDelete: parent.canDelete };
  }

  // No override → default NONE for restricted users
  return { level: 'NONE', canDelete: false };
}

/**
 * Middleware: require specific permission level on a node.
 * Usage: requirePermission('infrastructure.devices', 'VIEW')  → at least VIEW
 *        requirePermission('invoicing.documents', 'FULL')     → need FULL (create/edit)
 *        requirePermission('invoicing.documents', 'DELETE')   → need canDelete
 */
export function requirePermission(nodeId: string, minLevel: 'VIEW' | 'FULL' | 'DELETE') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.isSuperAdmin) { next(); return; }

    const perm = resolvePermission(req.membership ?? null, nodeId, req.user?.isSuperAdmin);

    if (minLevel === 'DELETE') {
      if (!perm.canDelete && req.membership?.accountType !== 'ADMIN') {
        res.status(403).json({ error: 'Brak uprawnień do usuwania', node: nodeId });
        return;
      }
      next(); return;
    }

    const levelRank = { 'NONE': 0, 'VIEW': 1, 'FULL': 2 };
    if (levelRank[perm.level] < levelRank[minLevel]) {
      res.status(403).json({ error: 'Niewystarczające uprawnienia', node: nodeId, required: minLevel, current: perm.level });
      return;
    }

    next();
  };
}


// ══════════════════════════════════════════════════════════════════════
//  Module access guard
//
//  Checks that the active workspace has the required module enabled.
//  Handles backward-compatible module key migration.
//
//  Usage:
//    router.get('/', authenticate, withWorkspaceMembership, requireModule('invoicing'), handler)
// ══════════════════════════════════════════════════════════════════════

/** Maps old module keys to new ones (legacy compat) */
const MODULE_MIGRATION: Record<string, string[]> = {
  'helpdesk': ['infrastructure', 'service-desk'],
  'service': ['skp'],
};

/** Maps legacy enabledModules string → canonical ModuleKey enum */
const STRING_TO_MODULE_KEY: Record<string, string> = {
  'infrastructure': 'INFRASTRUCTURE',
  'service-desk': 'SERVICE_DESK',
  'invoicing': 'INVOICING',
  'packaging': 'PACKAGING',
  'skp': 'SKP',
  'ai': 'AI',
};

function isModuleEnabled(enabledModules: string[], moduleKey: string): boolean {
  if (enabledModules.includes(moduleKey)) return true;
  for (const [oldKey, newKeys] of Object.entries(MODULE_MIGRATION)) {
    if (newKeys.includes(moduleKey) && enabledModules.includes(oldKey)) return true;
  }
  return false;
}

/**
 * Middleware: check if workspace has a module enabled.
 *
 * Checks canonical WorkspaceModule table first, falls back to legacy
 * enabledModules[] array for backward compatibility.
 *
 * Module states:
 * - ACTIVE, TRIAL → full access
 * - READONLY → GET only (blocks POST/PUT/PATCH/DELETE)
 * - MANAGED_BY_PROVIDER → requires provider membership
 * - LIMITED → passes through (restrictions at feature level, not route)
 * - INACTIVE, EXPIRED → blocked (403)
 */
export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // SuperAdmin bypass
    if (req.user?.isSuperAdmin) { next(); return; }

    const wsId = req.workspaceId;
    if (!wsId) {
      res.status(400).json({ error: 'Workspace context required' });
      return;
    }

    // Resolve canonical ModuleKey from legacy string
    const canonicalKey = STRING_TO_MODULE_KEY[moduleKey];

    // Try canonical WorkspaceModule table first
    if (canonicalKey) {
      const mod = await prisma.workspaceModule.findUnique({
        where: { workspaceId_moduleKey: { workspaceId: wsId, moduleKey: canonicalKey as any } },
      });

      if (mod) {
        switch (mod.state) {
          case 'ACTIVE':
          case 'TRIAL':
            next();
            return;

          case 'LIMITED':
            next();
            return;

          case 'READONLY':
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
              next();
              return;
            }
            res.status(403).json({
              error: 'Moduł jest w trybie tylko do odczytu',
              module: moduleKey,
              code: 'MODULE_READONLY',
            });
            return;

          case 'MANAGED_BY_PROVIDER':
            // Allow if user has provider membership (source = MSP_ASSIGNED)
            if (req.membership?.source === 'MSP_ASSIGNED') {
              next();
              return;
            }
            res.status(403).json({
              error: 'Moduł jest zarządzany przez firmę IT',
              module: moduleKey,
              code: 'MODULE_MANAGED_BY_PROVIDER',
            });
            return;

          default: // INACTIVE, EXPIRED
            res.status(403).json({
              error: 'Module not enabled for this workspace',
              module: moduleKey,
              code: 'MODULE_DISABLED',
            });
            return;
        }
      }
    }

    // Fallback: legacy enabledModules[] array (backward compat)
    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: { enabledModules: true },
    });

    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    if (!isModuleEnabled(ws.enabledModules, moduleKey)) {
      res.status(403).json({
        error: 'Module not enabled for this workspace',
        module: moduleKey,
        code: 'MODULE_DISABLED',
      });
      return;
    }

    next();
  };
}


// ══════════════════════════════════════════════════════════════════════
//  Etap 1C — Scope filters for Prisma queries
//
//  These helpers generate Prisma `where` clauses that enforce
//  AccessGrant scoping for SCOPED memberships. For FULL memberships
//  (or when no membership exists), they return empty objects so
//  existing filters remain unchanged.
//
//  Usage in services:
//    const scopeFilter = deviceScopeFilter(req.membership);
//    const where = { ...otherFilters, ...scopeFilter };
// ══════════════════════════════════════════════════════════════════════

/**
 * Returns a Prisma `where` fragment for Device queries.
 *
 * FULL scope → {} (no filtering)
 * SCOPED → { OR: [
 *   { id: { in: [directly granted deviceIds] } },
 *   { locationId: { in: [granted locationIds] } },
 * ]}
 * No grants → { id: '__none__' } (matches nothing)
 */
export function deviceScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  // No grants at all → match nothing
  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];
  if (deviceIds.length > 0) conditions.push({ id: { in: deviceIds } });
  if (locationIds.length > 0) conditions.push({ locationId: { in: locationIds } });

  return { OR: conditions };
}

/**
 * Returns a Prisma `where` fragment for Location queries.
 *
 * FULL scope → {} (no filtering)
 * SCOPED → { id: { in: [granted locationIds] } }
 * No location grants → { id: '__none__' } (matches nothing)
 */
export function locationScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  return { id: { in: locationIds } };
}

/**
 * Checks if a specific device ID is accessible under the current scope.
 * Returns true if FULL scope, or if the device/its location is granted.
 */
export function isDeviceAccessible(
  membership: MembershipContext | null | undefined,
  deviceId: string,
  locationId?: string | null,
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;

  // Direct device grant
  if (membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === deviceId)) {
    return true;
  }

  // Location grant (device belongs to a granted location)
  if (locationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === locationId)) {
    return true;
  }

  return false;
}

/**
 * Checks if a specific location ID is accessible under the current scope.
 */
export function isLocationAccessible(
  membership: MembershipContext | null | undefined,
  locationId: string,
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;
  return membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === locationId);
}

/**
 * Returns a Prisma `where` fragment for Ticket queries.
 *
 * A ticket is visible if:
 *   - ticket.deviceId is in AccessGrant(DEVICE)
 *   - OR ticket.locationId is in AccessGrant(LOCATION)
 *   - OR ticket.device.locationId is in AccessGrant(LOCATION)
 *
 * Tickets without deviceId AND without locationId are NOT visible in SCOPED mode.
 *
 * FULL scope → {} (no filtering)
 * SCOPED → { OR: [...conditions] }
 * No grants → { id: '__none__' }
 */
export function ticketScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];

  // Ticket directly linked to a granted device
  if (deviceIds.length > 0) {
    conditions.push({ deviceId: { in: deviceIds } });
  }

  // Ticket in a granted location (direct locationId on ticket)
  if (locationIds.length > 0) {
    conditions.push({ locationId: { in: locationIds } });
  }

  // Ticket's device belongs to a granted location (nested relation)
  if (locationIds.length > 0) {
    conditions.push({ device: { locationId: { in: locationIds } } });
  }

  return { OR: conditions };
}

/**
 * Checks if a specific ticket is accessible under the current scope.
 */
/**
 * Returns a Prisma `where` fragment for WorkSession queries.
 *
 * A session is visible if:
 *   - session.deviceId is in AccessGrant(DEVICE)
 *   - OR session.locationId is in AccessGrant(LOCATION)
 *   - OR session.device.locationId is in AccessGrant(LOCATION)
 *   - OR session.ticketId links to an accessible ticket (device/location match)
 */
export function sessionScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];

  if (deviceIds.length > 0) {
    conditions.push({ deviceId: { in: deviceIds } });
  }

  if (locationIds.length > 0) {
    conditions.push({ locationId: { in: locationIds } });
    conditions.push({ device: { locationId: { in: locationIds } } });
  }

  // Session linked to a ticket on a granted device/location
  const ticketConditions: Record<string, unknown>[] = [];
  if (deviceIds.length > 0) ticketConditions.push({ ticket: { deviceId: { in: deviceIds } } });
  if (locationIds.length > 0) {
    ticketConditions.push({ ticket: { locationId: { in: locationIds } } });
    ticketConditions.push({ ticket: { device: { locationId: { in: locationIds } } } });
  }
  conditions.push(...ticketConditions);

  return { OR: conditions };
}

/**
 * Checks if a specific work session is accessible under the current scope.
 */
export function isSessionAccessible(
  membership: MembershipContext | null | undefined,
  session: {
    deviceId?: string | null;
    locationId?: string | null;
    deviceLocationId?: string | null;
    ticketDeviceId?: string | null;
    ticketLocationId?: string | null;
    ticketDeviceLocationId?: string | null;
  },
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;

  const { deviceId, locationId, deviceLocationId } = session;

  // Direct device/location on session
  if (deviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === deviceId)) return true;
  if (locationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === locationId)) return true;
  if (deviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === deviceLocationId)) return true;

  // Via ticket
  if (session.ticketDeviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === session.ticketDeviceId)) return true;
  if (session.ticketLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === session.ticketLocationId)) return true;
  if (session.ticketDeviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === session.ticketDeviceLocationId)) return true;

  return false;
}

/**
 * Returns a Prisma `where` fragment for Credential queries.
 * Same logic as ticketScopeFilter: visible if deviceId, locationId,
 * or device.locationId matches a grant.
 */
export function credentialScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];
  if (deviceIds.length > 0) conditions.push({ deviceId: { in: deviceIds } });
  if (locationIds.length > 0) {
    conditions.push({ locationId: { in: locationIds } });
    conditions.push({ device: { locationId: { in: locationIds } } });
  }

  return { OR: conditions };
}

/**
 * Checks if a specific credential is accessible under the current scope.
 */
export function isCredentialAccessible(
  membership: MembershipContext | null | undefined,
  credential: { deviceId?: string | null; locationId?: string | null; deviceLocationId?: string | null },
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;

  const { deviceId, locationId, deviceLocationId } = credential;
  if (deviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === deviceId)) return true;
  if (locationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === locationId)) return true;
  if (deviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === deviceLocationId)) return true;

  return false;
}

/**
 * Returns a Prisma `where` fragment for AgentRegistration queries.
 * Visible if agent.deviceId is granted or agent.device.locationId is granted.
 */
export function agentScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];
  if (deviceIds.length > 0) conditions.push({ deviceId: { in: deviceIds } });
  if (locationIds.length > 0) conditions.push({ device: { locationId: { in: locationIds } } });

  return { OR: conditions };
}

export function isAgentAccessible(
  membership: MembershipContext | null | undefined,
  agent: { deviceId?: string | null; deviceLocationId?: string | null },
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;
  if (agent.deviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === agent.deviceId)) return true;
  if (agent.deviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === agent.deviceLocationId)) return true;
  return false;
}

/**
 * Returns a Prisma `where` fragment for BackupConfig queries.
 * Visible if the backup's agent's device or device's location is granted.
 * BackupConfig → AgentRegistration → Device → Location
 */
export function backupScopeFilter(membership: MembershipContext | null | undefined): Record<string, unknown> {
  if (!membership || membership.scopeType === 'FULL') return {};

  const deviceIds = membership.grants
    .filter(g => g.resourceType === 'DEVICE')
    .map(g => g.resourceId);

  const locationIds = membership.grants
    .filter(g => g.resourceType === 'LOCATION')
    .map(g => g.resourceId);

  if (deviceIds.length === 0 && locationIds.length === 0) {
    return { id: '__no_access__' };
  }

  const conditions: Record<string, unknown>[] = [];
  if (deviceIds.length > 0) conditions.push({ agent: { deviceId: { in: deviceIds } } });
  if (locationIds.length > 0) conditions.push({ agent: { device: { locationId: { in: locationIds } } } });

  return { OR: conditions };
}

export function isBackupAccessible(
  membership: MembershipContext | null | undefined,
  backup: { agentDeviceId?: string | null; agentDeviceLocationId?: string | null },
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;
  if (backup.agentDeviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === backup.agentDeviceId)) return true;
  if (backup.agentDeviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === backup.agentDeviceLocationId)) return true;
  return false;
}

export function isTicketAccessible(
  membership: MembershipContext | null | undefined,
  ticket: { deviceId?: string | null; locationId?: string | null; deviceLocationId?: string | null },
): boolean {
  if (!membership || membership.scopeType === 'FULL') return true;

  const { deviceId, locationId, deviceLocationId } = ticket;

  // Direct device grant
  if (deviceId && membership.grants.some(g => g.resourceType === 'DEVICE' && g.resourceId === deviceId)) {
    return true;
  }

  // Direct location grant (ticket.locationId)
  if (locationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === locationId)) {
    return true;
  }

  // Device's location grant (ticket.device.locationId)
  if (deviceLocationId && membership.grants.some(g => g.resourceType === 'LOCATION' && g.resourceId === deviceLocationId)) {
    return true;
  }

  return false;
}

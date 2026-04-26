#!/usr/bin/env node
/**
 * v1 → v2 data migration.
 *
 * Usage:
 *   V1_DATABASE_URL=postgres://… V2_DATABASE_URL=postgres://… \
 *     npx tsx scripts/migrate-v1-to-v2.ts [--dry-run] [--only=users,workspaces,…]
 *
 * Defaults:
 *   V1_DATABASE_URL → `postgresql://infradesk:…@localhost:5432/infradesk`
 *   V2_DATABASE_URL → DATABASE_URL from .env (current env)
 *
 * Migrated (in order):
 *   users → workspaces → memberships (role remap) → locations →
 *   devices → agents → tickets → ticket-comments → credentials → orders
 *
 * Skipped:
 *   - Users with email ending @infradesk.pl AND no activity
 *   - CANCELLED tickets (low historical value)
 *   - deprecated v1 tables (PlatformConfig, WorkspaceManagement, deprecated aliases)
 *
 * Idempotent: safe to re-run. Uses deterministic upserts keyed by email/slug/qrCode/etc.
 */

import { Client as PgClient } from 'pg';
import { PrismaClient, type Role as V2Role, type Scope as V2Scope, type TicketStatus, type TicketPriority, type TicketType, type TicketSource, type DeviceCategory, type Criticality, type LocationType, type CredentialCategory } from '@prisma/client';
import crypto from 'crypto';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ONLY = (() => {
  const flag = argv.find((a) => a.startsWith('--only='));
  if (!flag) return null;
  return new Set(flag.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
})();

const V1_URL = process.env.V1_DATABASE_URL ?? 'postgresql://infradesk:infradesk@localhost:5432/infradesk';
const V2_URL = process.env.V2_DATABASE_URL ?? process.env.DATABASE_URL!;

function enabled(step: string): boolean { return !ONLY || ONLY.has(step); }

function log(msg: string): void { console.log(`[migrate] ${msg}`); }
function die(msg: string): never { console.error(`[migrate] FATAL: ${msg}`); process.exit(1); }

const stats: Record<string, { read: number; migrated: number; skipped: number }> = {};
function tally(kind: string, read: number, migrated: number, skipped: number): void {
  stats[kind] = { read, migrated, skipped };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log(`V1 = ${V1_URL.replace(/:[^:@]+@/, ':***@')}`);
  log(`V2 = ${V2_URL.replace(/:[^:@]+@/, ':***@')}`);
  log(`mode = ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  if (ONLY) log(`only = ${Array.from(ONLY).join(',')}`);

  const v1 = new PgClient({ connectionString: V1_URL });
  await v1.connect();
  const v2 = new PrismaClient({ datasources: { db: { url: V2_URL } } });

  try {
    if (enabled('users')) await migrateUsers(v1, v2);
    if (enabled('workspaces')) await migrateWorkspaces(v1, v2);
    if (enabled('memberships')) await migrateMemberships(v1, v2);
    if (enabled('locations')) await migrateLocations(v1, v2);
    if (enabled('devices')) await migrateDevices(v1, v2);
    if (enabled('agents')) await migrateAgents(v1, v2);
    if (enabled('tickets')) await migrateTickets(v1, v2);
    if (enabled('comments')) await migrateComments(v1, v2);
    if (enabled('credentials')) await migrateCredentials(v1, v2);
    if (enabled('orders')) await migrateOrders(v1, v2);

    log('\n=== SUMMARY ===');
    for (const [kind, s] of Object.entries(stats)) {
      log(`  ${kind.padEnd(14)}: read=${s.read}, migrated=${s.migrated}, skipped=${s.skipped}`);
    }
  } finally {
    await v1.end();
    await v2.$disconnect();
  }
}

// Users --------------------------------------------------------------------

async function hasColumn(v1: PgClient, table: string, column: string): Promise<boolean> {
  const r = await v1.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS exists`,
    [table, column],
  );
  return r.rows[0]!.exists;
}

/** Build a SELECT list that uses the column if present, else NULL alias. */
async function tolerant(v1: PgClient, table: string, spec: Array<[string, string]>): Promise<string> {
  const parts: string[] = [];
  for (const [col, fallback] of spec) {
    if (await hasColumn(v1, table, col)) parts.push(`"${col}"`);
    else parts.push(`${fallback} AS "${col}"`);
  }
  return parts.join(', ');
}

async function migrateUsers(v1: PgClient, v2: PrismaClient): Promise<void> {
  // V1 prod DB may be behind on migrations — select defensively.
  const hasEmailVerified = await hasColumn(v1, 'User', 'emailVerified');
  const hasTokenVersion = await hasColumn(v1, 'User', 'tokenVersion');
  const hasLoginAttempts = await hasColumn(v1, 'User', 'loginAttempts');
  const hasLockedUntil = await hasColumn(v1, 'User', 'lockedUntil');
  const hasAvatarUrl = await hasColumn(v1, 'User', 'avatarUrl');

  const cols = [
    'id', '"firstName"', '"lastName"', 'email', 'phone', '"passwordHash"', '"isActive"', '"isSuperAdmin"',
    '"lastLoginAt"', '"createdAt"',
    hasEmailVerified ? '"emailVerified"' : 'false AS "emailVerified"',
    hasTokenVersion ? '"tokenVersion"' : '0 AS "tokenVersion"',
    hasLoginAttempts ? '"loginAttempts"' : '0 AS "loginAttempts"',
    hasLockedUntil ? '"lockedUntil"' : 'NULL::timestamp AS "lockedUntil"',
    hasAvatarUrl ? '"avatarUrl"' : 'NULL::text AS "avatarUrl"',
  ].join(', ');

  const rows = (await v1.query<{
    id: string; firstName: string; lastName: string; email: string; phone: string | null;
    passwordHash: string; isActive: boolean; isSuperAdmin: boolean; emailVerified: boolean;
    lastLoginAt: Date | null; createdAt: Date; tokenVersion: number; loginAttempts: number;
    lockedUntil: Date | null; avatarUrl: string | null;
  }>(`SELECT ${cols} FROM "User"`)).rows;

  let migrated = 0, skipped = 0;
  for (const u of rows) {
    // Skip seed @infradesk.pl users without activity.
    if (u.email.endsWith('@infradesk.pl') && !u.lastLoginAt) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.user.upsert({
      where: { email: u.email },
      update: { /* idempotent: don't clobber v2 state on re-run */ },
      create: {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        passwordHash: u.passwordHash,   // keep legacy bcrypt; login rehashes to argon2id
        isActive: u.isActive,
        isSuperAdmin: u.isSuperAdmin,
        emailVerified: u.emailVerified,
        lastLoginAt: u.lastLoginAt,
        tokenVersion: u.tokenVersion,
        loginAttempts: u.loginAttempts,
        lockedUntil: u.lockedUntil,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
      },
    });
    migrated++;
  }
  tally('users', rows.length, migrated, skipped);
  log(`users: ${migrated}/${rows.length} migrated (${skipped} skipped)`);
}

// Workspaces ---------------------------------------------------------------

async function migrateWorkspaces(v1: PgClient, v2: PrismaClient): Promise<void> {
  const opt = async (col: string): Promise<string> =>
    (await hasColumn(v1, 'Workspace', col)) ? `"${col}"` : `NULL::text AS "${col}"`;
  const cols = [
    'id', 'slug', 'name',
    await opt('taxId'),
    await opt('regon'),
    await opt('logoUrl'),
    (await hasColumn(v1, 'Workspace', 'primaryColor')) ? '"primaryColor"' : `'#3B82F6' AS "primaryColor"`,
    await opt('addressLine1'),
    await opt('addressLine2'),
    await opt('postalCode'),
    await opt('city'),
    await opt('email'),
    await opt('phone'),
    await opt('website'),
    '"isActive"', '"createdAt"',
    (await hasColumn(v1, 'Workspace', 'orgType'))
      ? `COALESCE(NULLIF("orgType"::text, ''), 'MSP') AS "orgType"`
      : `'MSP' AS "orgType"`,
  ].join(', ');

  const rows = (await v1.query<{
    id: string; slug: string; name: string; taxId: string | null; regon: string | null;
    logoUrl: string | null; primaryColor: string | null;
    addressLine1: string | null; addressLine2: string | null; postalCode: string | null; city: string | null;
    email: string | null; phone: string | null; website: string | null;
    isActive: boolean; createdAt: Date; orgType: string | null;
  }>(`SELECT ${cols} FROM "Workspace"`)).rows;

  const typeRemap: Record<string, 'MSP' | 'CLIENT' | 'INTERNAL_IT'> = {
    MSP: 'MSP', CLIENT: 'CLIENT', INTERNAL_IT: 'INTERNAL_IT',
    SERVICE_PROVIDER: 'MSP', INTERNAL: 'INTERNAL_IT',
  };

  let migrated = 0;
  for (const w of rows) {
    if (DRY_RUN) { migrated++; continue; }
    await v2.workspace.upsert({
      where: { slug: w.slug },
      update: {},
      create: {
        id: w.id,
        slug: w.slug,
        name: w.name,
        type: typeRemap[w.orgType ?? 'MSP'] ?? 'MSP',
        plan: 'STARTER',
        taxId: w.taxId,
        regon: w.regon,
        logoUrl: w.logoUrl,
        primaryColor: w.primaryColor ?? '#3B82F6',
        addressLine1: w.addressLine1,
        addressLine2: w.addressLine2,
        postalCode: w.postalCode,
        city: w.city,
        email: w.email,
        phone: w.phone,
        website: w.website,
        isActive: w.isActive,
        createdAt: w.createdAt,
      },
    });
    migrated++;
  }
  tally('workspaces', rows.length, migrated, 0);
  log(`workspaces: ${migrated}/${rows.length} migrated`);
}

// Memberships + Role remap -------------------------------------------------

async function migrateMemberships(v1: PgClient, v2: PrismaClient): Promise<void> {
  type V1Row = {
    id: string; userId: string; workspaceId: string;
    role: 'OWNER' | 'ADMIN' | 'TECHNICIAN' | 'MEMBER' | 'VIEWER';
    scopeType: 'FULL' | 'SCOPED';
    isDefault: boolean; status: 'ACTIVE' | 'INVITED' | 'REVOKED';
    createdAt: Date;
  };
  const rows = (await v1.query<V1Row>(`SELECT id, "userId", "workspaceId", role, "scopeType", "isDefault", status, "createdAt" FROM "WorkspaceMembership"`)).rows;

  const { VIEWER_OVERRIDES, TECHNICIAN_OVERRIDES, NO_OVERRIDES } = buildRolePresets();

  let migrated = 0, skipped = 0;
  for (const m of rows) {
    // Guard: ensure user + workspace exist in v2 (we may have skipped seed user).
    const [user, workspace] = await Promise.all([
      v2.user.findUnique({ where: { id: m.userId }, select: { id: true } }),
      v2.workspace.findUnique({ where: { id: m.workspaceId }, select: { id: true } }),
    ]);
    if (!user || !workspace) { skipped++; continue; }

    // Role remap: v1 TECHNICIAN/VIEWER → v2 MEMBER + targeted overrides.
    let v2Role: V2Role;
    let overrides: Array<{ moduleKey: string; level: 'NONE' | 'VIEW' | 'EDIT' | 'DELETE' }> = [];
    if (m.role === 'OWNER') { v2Role = 'OWNER'; overrides = NO_OVERRIDES; }
    else if (m.role === 'ADMIN') { v2Role = 'ADMIN'; overrides = NO_OVERRIDES; }
    else if (m.role === 'TECHNICIAN') { v2Role = 'MEMBER'; overrides = TECHNICIAN_OVERRIDES; }
    else if (m.role === 'VIEWER') { v2Role = 'MEMBER'; overrides = VIEWER_OVERRIDES; }
    else { v2Role = 'MEMBER'; overrides = NO_OVERRIDES; }

    if (DRY_RUN) { migrated++; continue; }

    const v2Scope: V2Scope = m.scopeType === 'SCOPED' ? 'SCOPED' : 'FULL';
    const created = await v2.membership.upsert({
      where: { userId_workspaceId: { userId: m.userId, workspaceId: m.workspaceId } },
      update: { role: v2Role, scope: v2Scope, isDefault: m.isDefault, status: m.status },
      create: {
        id: m.id,
        userId: m.userId,
        workspaceId: m.workspaceId,
        role: v2Role,
        scope: v2Scope,
        isDefault: m.isDefault,
        status: m.status,
        createdAt: m.createdAt,
      },
    });
    if (overrides.length) {
      // Replace overrides (idempotent).
      await v2.permissionOverride.deleteMany({ where: { membershipId: created.id } });
      await v2.permissionOverride.createMany({
        data: overrides.map((o) => ({ membershipId: created.id, moduleKey: o.moduleKey, level: o.level })),
      });
    }
    migrated++;
  }
  tally('memberships', rows.length, migrated, skipped);
  log(`memberships: ${migrated}/${rows.length} migrated (${skipped} skipped)`);
}

function buildRolePresets(): {
  VIEWER_OVERRIDES: Array<{ moduleKey: string; level: 'NONE' | 'VIEW' | 'EDIT' | 'DELETE' }>;
  TECHNICIAN_OVERRIDES: Array<{ moduleKey: string; level: 'NONE' | 'VIEW' | 'EDIT' | 'DELETE' }>;
  NO_OVERRIDES: Array<{ moduleKey: string; level: 'NONE' | 'VIEW' | 'EDIT' | 'DELETE' }>;
} {
  const MODULES = [
    'dashboard', 'tickets', 'devices', 'sessions', 'monitoring', 'vault',
    'clients', 'orders', 'locations', 'mail', 'kb', 'reports',
    'ai.copilot', 'billing', 'members', 'workspace.settings', 'audit.log', 'gps', 'invoices',
  ];
  const VIEWER_OVERRIDES = MODULES.map((m) => ({ moduleKey: m, level: 'VIEW' as const }));
  // VIEWERS should not see sensitive modules at all.
  for (const hidden of ['vault', 'billing', 'workspace.settings', 'audit.log', 'invoices']) {
    const idx = VIEWER_OVERRIDES.findIndex((o) => o.moduleKey === hidden);
    if (idx >= 0) VIEWER_OVERRIDES[idx]!.level = 'NONE';
  }
  // TECHNICIAN = field ops: full on tickets/devices/sessions/locations/mail/gps,
  // view on clients/kb/monitoring/dashboard, none on vault/billing/members/settings/audit/invoices.
  const TECHNICIAN_OVERRIDES = [
    { moduleKey: 'dashboard', level: 'VIEW' as const },
    { moduleKey: 'tickets', level: 'DELETE' as const },
    { moduleKey: 'devices', level: 'EDIT' as const },
    { moduleKey: 'sessions', level: 'DELETE' as const },
    { moduleKey: 'monitoring', level: 'VIEW' as const },
    { moduleKey: 'vault', level: 'NONE' as const },
    { moduleKey: 'clients', level: 'VIEW' as const },
    { moduleKey: 'orders', level: 'NONE' as const },
    { moduleKey: 'locations', level: 'VIEW' as const },
    { moduleKey: 'mail', level: 'VIEW' as const },
    { moduleKey: 'kb', level: 'VIEW' as const },
    { moduleKey: 'reports', level: 'NONE' as const },
    { moduleKey: 'ai.copilot', level: 'EDIT' as const },
    { moduleKey: 'billing', level: 'NONE' as const },
    { moduleKey: 'members', level: 'NONE' as const },
    { moduleKey: 'workspace.settings', level: 'NONE' as const },
    { moduleKey: 'audit.log', level: 'NONE' as const },
    { moduleKey: 'gps', level: 'EDIT' as const },
    { moduleKey: 'invoices', level: 'NONE' as const },
  ];
  return { VIEWER_OVERRIDES, TECHNICIAN_OVERRIDES, NO_OVERRIDES: [] };
}

// Locations ----------------------------------------------------------------

async function migrateLocations(v1: PgClient, v2: PrismaClient): Promise<void> {
  const cols = await tolerant(v1, 'Location', [
    ['id', `'' `], ['workspaceId', `''`], ['name', `'nieznana'`],
    ['type', `'OFFICE'`],
    ['addressLine1', `'nieznany'`], ['addressLine2', `NULL::text`],
    ['postalCode', `'00-000'`], ['city', `'nieznane'`], ['country', `'PL'`],
    ['contactName', `NULL::text`], ['contactPhone', `NULL::text`], ['contactEmail', `NULL::text`],
    ['notes', `NULL::text`], ['gpsLat', `NULL::float8`], ['gpsLon', `NULL::float8`],
    ['createdAt', `CURRENT_TIMESTAMP`],
  ]);
  const rows = (await v1.query<{
    id: string; workspaceId: string; name: string; type: string | null;
    addressLine1: string | null; addressLine2: string | null; postalCode: string | null;
    city: string | null; country: string | null; contactName: string | null;
    contactPhone: string | null; contactEmail: string | null; notes: string | null;
    gpsLat: number | null; gpsLon: number | null; createdAt: Date;
  }>(`SELECT ${cols} FROM "Location"`)).rows;

  let migrated = 0, skipped = 0;
  for (const l of rows) {
    const ws = await v2.workspace.findUnique({ where: { id: l.workspaceId }, select: { id: true } });
    if (!ws) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.location.upsert({
      where: { id: l.id },
      update: {},
      create: {
        id: l.id,
        workspaceId: l.workspaceId,
        name: l.name,
        type: (['OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER'].includes(l.type ?? '') ? l.type : 'OFFICE') as LocationType,
        addressLine1: l.addressLine1 ?? 'nieznany',
        addressLine2: l.addressLine2,
        postalCode: l.postalCode ?? '00-000',
        city: l.city ?? 'nieznane',
        country: l.country ?? 'PL',
        contactName: l.contactName,
        contactPhone: l.contactPhone,
        contactEmail: l.contactEmail,
        notes: l.notes,
        gpsLat: l.gpsLat,
        gpsLon: l.gpsLon,
        createdAt: l.createdAt,
      },
    });
    migrated++;
  }
  tally('locations', rows.length, migrated, skipped);
  log(`locations: ${migrated}/${rows.length} migrated`);
}

// Devices ------------------------------------------------------------------

async function migrateDevices(v1: PgClient, v2: PrismaClient): Promise<void> {
  const cols = await tolerant(v1, 'Device', [
    ['id', `''`], ['workspaceId', `''`], ['locationId', `''`], ['name', `'noname'`],
    ['hostname', `NULL::text`], ['category', `'OTHER'`], ['criticality', `'MEDIUM'`], ['status', `'ACTIVE'`],
    ['serialNumber', `NULL::text`], ['manufacturer', `NULL::text`], ['model', `NULL::text`],
    ['operatingSystem', `NULL::text`], ['osVersion', `NULL::text`],
    ['ipAddress', `NULL::text`], ['macAddress', `NULL::text`], ['qrCodeValue', `NULL::text`],
    ['rustdeskId', `NULL::text`], ['description', `NULL::text`],
    ['createdAt', `CURRENT_TIMESTAMP`],
  ]);
  const rows = (await v1.query<{
    id: string; workspaceId: string; locationId: string; name: string; hostname: string | null;
    category: string | null; criticality: string | null; status: string | null;
    serialNumber: string | null; manufacturer: string | null; model: string | null;
    operatingSystem: string | null; osVersion: string | null;
    ipAddress: string | null; macAddress: string | null; qrCodeValue: string | null;
    rustdeskId: string | null; description: string | null; createdAt: Date;
  }>(`SELECT ${cols} FROM "Device"`)).rows;

  // Dedupe by (workspaceId, name).
  const seen = new Set<string>();
  let migrated = 0, skipped = 0;
  for (const d of rows) {
    const key = `${d.workspaceId}|${d.name}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const loc = await v2.location.findUnique({ where: { id: d.locationId }, select: { id: true } });
    if (!loc) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.device.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        workspaceId: d.workspaceId,
        locationId: d.locationId,
        name: d.name,
        hostname: d.hostname,
        category: (['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER'].includes(d.category ?? '') ? d.category : 'OTHER') as DeviceCategory,
        criticality: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(d.criticality ?? '') ? d.criticality : 'MEDIUM') as Criticality,
        status: (['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'].includes(d.status ?? '') ? d.status : 'ACTIVE') as 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED',
        serialNumber: d.serialNumber,
        manufacturer: d.manufacturer,
        model: d.model,
        operatingSystem: d.operatingSystem,
        osVersion: d.osVersion,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        qrCodeValue: d.qrCodeValue ?? `IDSK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        rustdeskId: d.rustdeskId,
        description: d.description,
        createdAt: d.createdAt,
      },
    });
    migrated++;
  }
  tally('devices', rows.length, migrated, skipped);
  log(`devices: ${migrated}/${rows.length} migrated (${skipped} skipped as dup/orphan)`);
}

// Agents -------------------------------------------------------------------

async function migrateAgents(v1: PgClient, v2: PrismaClient): Promise<void> {
  const cols = await tolerant(v1, 'AgentRegistration', [
    ['id', `''`], ['workspaceId', `''`], ['deviceId', `NULL::text`],
    ['agentToken', `''`], ['agentTokenHash', `''`],
    ['agentVersion', `'unknown'`], ['status', `'PENDING'`], ['hostname', `'unknown'`],
    ['lastSeen', `NULL::timestamp`], ['createdAt', `CURRENT_TIMESTAMP`],
  ]);
  const rows = (await v1.query<{
    id: string; workspaceId: string; deviceId: string | null; agentToken: string;
    agentTokenHash: string; agentVersion: string | null; status: string | null;
    hostname: string; lastSeen: Date | null; createdAt: Date;
  }>(`SELECT ${cols} FROM "AgentRegistration"`)).rows;

  let migrated = 0, skipped = 0;
  for (const a of rows) {
    const ws = await v2.workspace.findUnique({ where: { id: a.workspaceId }, select: { id: true } });
    if (!ws) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.agentRegistration.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        workspaceId: a.workspaceId,
        deviceId: a.deviceId,
        agentToken: a.agentToken,
        agentTokenHash: a.agentTokenHash,
        agentVersion: a.agentVersion ?? 'unknown',
        status: (['PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE'].includes(a.status ?? '') ? a.status : 'PENDING') as 'PENDING' | 'ACTIVE' | 'REJECTED' | 'INACTIVE',
        hostname: a.hostname,
        lastSeen: a.lastSeen,
        createdAt: a.createdAt,
      },
    });
    migrated++;
  }
  tally('agents', rows.length, migrated, skipped);
  log(`agents: ${migrated}/${rows.length} migrated`);
}

// Tickets ------------------------------------------------------------------

async function migrateTickets(v1: PgClient, v2: PrismaClient): Promise<void> {
  const cols = await tolerant(v1, 'Ticket', [
    ['id', `''`], ['workspaceId', `''`], ['ticketNumber', `NULL::text`],
    ['title', `'(bez tytułu)'`], ['description', `''`],
    ['status', `'OPEN'`], ['priority', `'MEDIUM'`], ['category', `NULL::text`],
    ['type', `'INCIDENT'`], ['source', `'MANUAL'`],
    ['deviceId', `NULL::text`], ['locationId', `NULL::text`],
    ['assignedToUserId', `NULL::text`], ['createdByUserId', `''`], ['resolvedByUserId', `NULL::text`],
    ['dueAt', `NULL::timestamp`], ['firstResponseAt', `NULL::timestamp`],
    ['resolvedAt', `NULL::timestamp`], ['closedAt', `NULL::timestamp`],
    ['rating', `NULL::int`], ['ratingComment', `NULL::text`], ['ratedAt', `NULL::timestamp`],
    ['resolutionSummary', `NULL::text`],
    ['createdAt', `CURRENT_TIMESTAMP`], ['deletedAt', `NULL::timestamp`],
  ]);
  const rows = (await v1.query<{
    id: string; workspaceId: string; ticketNumber: string | null; title: string;
    description: string; status: string | null; priority: string | null; category: string | null;
    type: string | null; source: string | null; deviceId: string | null; locationId: string | null;
    assignedToUserId: string | null; createdByUserId: string; resolvedByUserId: string | null;
    dueAt: Date | null; firstResponseAt: Date | null; resolvedAt: Date | null; closedAt: Date | null;
    rating: number | null; ratingComment: string | null; ratedAt: Date | null;
    resolutionSummary: string | null; createdAt: Date; deletedAt: Date | null;
  }>(`SELECT ${cols} FROM "Ticket"`)).rows;

  // Build set of v2 user ids for FK filtering.
  const userIdsInV2 = new Set((await v2.user.findMany({ select: { id: true } })).map((u) => u.id));
  const resolveUserRef = (id: string | null): string | null => id && userIdsInV2.has(id) ? id : null;

  // Ensure a system user exists for tickets whose createdBy was skipped.
  let systemUserId: string | null = null;
  if (!DRY_RUN) {
    const sys = await v2.user.upsert({
      where: { email: 'system@infradesk.pl' },
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'system@infradesk.pl', firstName: 'System', lastName: 'Migrated',
        passwordHash: '!LOCKED!', isActive: false, emailVerified: true,
      },
      update: {},
      select: { id: true },
    });
    systemUserId = sys.id;
    userIdsInV2.add(systemUserId);
  }

  let migrated = 0, skipped = 0;
  for (const t of rows) {
    if (t.status === 'CANCELLED') { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.ticket.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        workspaceId: t.workspaceId,
        ticketNumber: t.ticketNumber ?? `T-LEGACY-${t.id.slice(0, 6)}`,
        title: t.title,
        description: t.description,
        status: (['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status ?? '') ? t.status : 'OPEN') as TicketStatus,
        priority: (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(t.priority ?? '') ? t.priority : 'MEDIUM') as TicketPriority,
        type: (['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER'].includes(t.type ?? '') ? t.type : 'INCIDENT') as TicketType,
        source: (['EMAIL', 'PORTAL', 'AGENT', 'PHONE', 'AI_CHAT', 'MANUAL', 'API'].includes(t.source ?? '') ? t.source : 'MANUAL') as TicketSource,
        category: t.category,
        deviceId: t.deviceId,
        locationId: t.locationId,
        assignedToUserId: resolveUserRef(t.assignedToUserId),
        createdByUserId: resolveUserRef(t.createdByUserId) ?? systemUserId!,
        resolvedByUserId: resolveUserRef(t.resolvedByUserId),
        dueAt: t.dueAt,
        firstResponseAt: t.firstResponseAt,
        resolvedAt: t.resolvedAt,
        closedAt: t.closedAt,
        rating: t.rating,
        ratingComment: t.ratingComment,
        ratedAt: t.ratedAt,
        resolutionSummary: t.resolutionSummary,
        createdAt: t.createdAt,
        deletedAt: t.deletedAt,
      },
    });
    migrated++;
  }
  tally('tickets', rows.length, migrated, skipped);
  log(`tickets: ${migrated}/${rows.length} migrated (${skipped} CANCELLED skipped)`);
}

// TicketComments -----------------------------------------------------------

async function migrateComments(v1: PgClient, v2: PrismaClient): Promise<void> {
  const rows = (await v1.query<{
    id: string; ticketId: string; userId: string; comment: string; isInternal: boolean | null;
    createdAt: Date;
  }>(`SELECT id, "ticketId", "userId", comment, "isInternal", "createdAt" FROM "TicketComment"`)).rows;

  let migrated = 0, skipped = 0;
  for (const c of rows) {
    const t = await v2.ticket.findUnique({ where: { id: c.ticketId }, select: { id: true } });
    if (!t) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.ticketComment.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        ticketId: c.ticketId,
        userId: c.userId,
        comment: c.comment,
        isInternal: c.isInternal ?? false,
        createdAt: c.createdAt,
      },
    });
    migrated++;
  }
  tally('comments', rows.length, migrated, skipped);
  log(`comments: ${migrated}/${rows.length} migrated`);
}

// Credentials --------------------------------------------------------------

async function migrateCredentials(v1: PgClient, v2: PrismaClient): Promise<void> {
  const cols = await tolerant(v1, 'Credential', [
    ['id', `''`], ['workspaceId', `''`], ['deviceId', `NULL::text`],
    ['category', `'OTHER'`], ['name', `'bez nazwy'`], ['username', `NULL::text`],
    ['passwordEncrypted', `''`], ['passwordIv', `''`], ['passwordAuthTag', `''`],
    ['urlOrHost', `NULL::text`], ['notes', `NULL::text`], ['tags', `ARRAY[]::text[]`],
    ['createdByUserId', `''`], ['createdAt', `CURRENT_TIMESTAMP`],
  ]);
  const rows = (await v1.query<{
    id: string; workspaceId: string; deviceId: string | null; category: string | null;
    name: string; username: string | null;
    passwordEncrypted: string; passwordIv: string; passwordAuthTag: string;
    urlOrHost: string | null; notes: string | null; tags: string[] | null;
    createdByUserId: string; createdAt: Date;
  }>(`SELECT ${cols} FROM "Credential"`)).rows;

  let migrated = 0, skipped = 0;
  for (const c of rows) {
    const ws = await v2.workspace.findUnique({ where: { id: c.workspaceId }, select: { id: true } });
    if (!ws) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }
    await v2.credential.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        workspaceId: c.workspaceId,
        deviceId: c.deviceId,
        category: (['WINDOWS', 'VPN', 'EMAIL', 'APPLICATION', 'DATABASE', 'ROUTER', 'WIFI', 'SSH', 'API_KEY', 'CERTIFICATE', 'OTHER'].includes(c.category ?? '') ? c.category : 'OTHER') as CredentialCategory,
        name: c.name,
        username: c.username,
        passwordEncrypted: c.passwordEncrypted,
        passwordIv: c.passwordIv,
        passwordAuthTag: c.passwordAuthTag,
        urlOrHost: c.urlOrHost,
        notes: c.notes,
        tags: c.tags ?? [],
        createdByUserId: c.createdByUserId,
        createdAt: c.createdAt,
      },
    });
    migrated++;
  }
  tally('credentials', rows.length, migrated, skipped);
  log(`credentials: ${migrated}/${rows.length} migrated`);
}

// Orders -------------------------------------------------------------------

async function migrateOrders(v1: PgClient, v2: PrismaClient): Promise<void> {
  // v1 Order schema differs significantly across installations — skip if no title/name column.
  const hasTitle = await hasColumn(v1, 'Order', 'title');
  const hasName = await hasColumn(v1, 'Order', 'name');
  if (!hasTitle && !hasName) {
    log(`orders: skipping — v1 Order schema incompatible (no title/name)`);
    tally('orders', 0, 0, 0);
    return;
  }
  const cols = await tolerant(v1, 'Order', [
    ['id', `''`], ['workspaceId', `''`], ['orderNumber', `NULL::text`],
    [hasTitle ? 'title' : 'name', `'bez tytułu'`],
    ['status', `'DRAFT'`], ['supplierName', `NULL::text`],
    ['createdByUserId', `''`], ['createdAt', `CURRENT_TIMESTAMP`],
  ]);
  const orders = (await v1.query<{
    id: string; workspaceId: string; orderNumber: string | null; title: string; status: string | null;
    supplierName: string | null; createdByUserId: string; createdAt: Date;
  }>(`SELECT ${cols.replace('"name"', '"name" AS "title"')} FROM "Order"`)).rows;

  let migrated = 0, skipped = 0;
  for (const o of orders) {
    const ws = await v2.workspace.findUnique({ where: { id: o.workspaceId }, select: { id: true } });
    if (!ws) { skipped++; continue; }
    if (DRY_RUN) { migrated++; continue; }

    // Read items for this order
    const items = (await v1.query<{
      id: string; name: string; description: string | null;
      quantity: number; unitNet: string; totalNet: string;
    }>(`SELECT id, name, description, quantity, "unitNet"::text, "totalNet"::text
         FROM "OrderItem" WHERE "orderId" = $1`, [o.id])).rows;

    await v2.order.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        workspaceId: o.workspaceId,
        orderNumber: o.orderNumber ?? `ORD-LEGACY-${o.id.slice(0, 6)}`,
        title: o.title,
        status: (['DRAFT', 'QUOTE_SENT', 'APPROVED', 'ORDERED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED'].includes(o.status ?? '') ? o.status : 'DRAFT') as 'DRAFT' | 'QUOTE_SENT' | 'APPROVED' | 'ORDERED' | 'IN_TRANSIT' | 'DELIVERED' | 'INVOICED' | 'CANCELLED',
        supplierName: o.supplierName,
        createdByUserId: o.createdByUserId,
        createdAt: o.createdAt,
        items: {
          create: items.map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            quantity: i.quantity,
            unitNet: i.unitNet,
            totalNet: i.totalNet,
          })),
        },
      },
    });
    migrated++;
  }
  tally('orders', orders.length, migrated, skipped);
  log(`orders: ${migrated}/${orders.length} migrated`);
}

// Run ----------------------------------------------------------------------

main().catch((err) => { console.error(err); process.exit(1); });

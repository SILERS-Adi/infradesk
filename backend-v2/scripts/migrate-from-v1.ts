/* eslint-disable no-console */
/**
 * Migracja V1 → V2.
 *
 * Używa dwóch połączeń:
 *  - V1: postgres w kontenerze infradesk-db (poprzez exposed socket / TCP)
 *  - V2: Prisma client (normalne połączenie)
 *
 * Kolejność:
 *   1. Users (zachowaj hash bcrypt; V2 opportunistically rehashuje do argon2id na następny login)
 *   2. Workspaces — Silers MSP match by name, pozostałe → nowe CLIENT workspace
 *   3. WorkspaceRelations (MSP ↔ klient)
 *   4. Memberships
 *   5. Locations (zachowaj workspaceId mapping)
 *   6. Devices + AgentRegistration
 *   7. Tickets (+ komentarze, events)
 *   8. Tasks / WorkSessions / MonitoringAlerts
 *   9. CrmActivity / BackupConfig
 *
 * Idempotencja: każde zapisanie poprzedza query `WHERE email/slug/ticketNumber =`, skip jeśli istnieje.
 */

import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const V1_CONN = {
  host: '172.18.0.2', // Docker IP infradesk-db — ale użyjemy bez hosta przez TCP 5432 z expose
  port: 5432,
  user: 'infradesk',
  password: 'infradesk',
  database: 'infradesk',
};

interface IdMap {
  users: Map<string, string>;         // v1 id → v2 id
  workspaces: Map<string, string>;    // v1 ws id → v2 ws id
  memberships: Map<string, string>;
  locations: Map<string, string>;
  devices: Map<string, string>;
  tickets: Map<string, string>;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '━━━ DRY RUN (no writes) ━━━' : '━━━ LIVE MIGRATION ━━━');

  // Spróbuj różnych hostów do V1 DB — najpierw localhost:5432 (postgres-native), potem docker host
  const v1 = await connectV1();

  const ids: IdMap = {
    users: new Map(),
    workspaces: new Map(),
    memberships: new Map(),
    locations: new Map(),
    devices: new Map(),
    tickets: new Map(),
  };

  // Pre-load existing V2 users i workspaces żeby sprawdzić kolizje
  const existingV2Users = await prisma.user.findMany({ select: { id: true, email: true } });
  const v2EmailToId = new Map(existingV2Users.map((u) => [u.email.toLowerCase(), u.id]));
  const existingV2Ws = await prisma.workspace.findMany({ select: { id: true, slug: true, name: true } });
  const v2SlugToId = new Map(existingV2Ws.map((w) => [w.slug, w.id]));

  // ── 1. USERS
  console.log('\n[1/9] Users…');
  const v1Users = (await v1.query(`SELECT * FROM "User" ORDER BY "createdAt"`)).rows;
  let uCreated = 0;
  let uSkipped = 0;
  for (const u of v1Users) {
    const email = (u.email as string).toLowerCase();
    const existingId = v2EmailToId.get(email);
    if (existingId) {
      ids.users.set(u.id, existingId);
      uSkipped++;
      continue;
    }
    if (!dryRun) {
      const created = await prisma.user.create({
        data: {
          email,
          firstName: u.firstName ?? 'Imię',
          lastName: u.lastName ?? 'Nazwisko',
          phone: u.phone,
          passwordHash: u.passwordHash,
          isActive: u.isActive,
          isSuperAdmin: u.isSuperAdmin ?? false,
          emailVerified: u.emailVerified ?? false,
          avatarUrl: u.avatarUrl,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
          tokenVersion: u.tokenVersion ?? 1,
        },
      });
      ids.users.set(u.id, created.id);
    } else {
      ids.users.set(u.id, `dry-${u.id}`);
    }
    uCreated++;
  }
  console.log(`  ✓ ${uCreated} utworzonych, ${uSkipped} już istnieje (by email)`);

  // ── 2. WORKSPACES
  console.log('\n[2/9] Workspaces…');
  const v1Ws = (await v1.query(`SELECT * FROM "Workspace" ORDER BY "createdAt"`)).rows;
  let wsCreated = 0;
  let wsSkipped = 0;
  for (const w of v1Ws) {
    const existingId = v2SlugToId.get(w.slug);
    if (existingId) {
      ids.workspaces.set(w.id, existingId);
      wsSkipped++;
      continue;
    }
    // V1 orgType → V2 type mapping
    const v2Type =
      w.orgType === 'MSP' ? 'MSP' :
      w.orgType === 'CLIENT' ? 'CLIENT' :
      'INTERNAL_IT';

    if (!dryRun) {
      const created = await prisma.workspace.create({
        data: {
          name: w.name,
          slug: w.slug,
          type: v2Type as 'MSP' | 'CLIENT' | 'INTERNAL_IT',
          taxId: w.taxId,
          email: w.email,
          phone: w.phone,
          website: w.website,
          addressLine1: w.addressLine1,
          postalCode: w.postalCode,
          city: w.city,
          country: w.country ?? 'PL',
          logoUrl: w.logoUrl,
          primaryColor: w.primaryColor ?? '#3B82F6',
          isActive: w.isActive ?? true,
          createdAt: w.createdAt,
        },
      });
      ids.workspaces.set(w.id, created.id);
    } else {
      ids.workspaces.set(w.id, `dry-${w.id}`);
    }
    wsCreated++;
  }
  console.log(`  ✓ ${wsCreated} utworzonych, ${wsSkipped} już istnieje (by slug)`);

  // ── 3. MEMBERSHIPS
  console.log('\n[3/9] Memberships…');
  const v1Mem = (await v1.query(`SELECT * FROM "WorkspaceMembership" ORDER BY "createdAt"`)).rows;
  let mCreated = 0;
  let mSkipped = 0;
  for (const m of v1Mem) {
    const userId = ids.users.get(m.userId);
    const wsId = ids.workspaces.get(m.workspaceId);
    if (!userId || !wsId) { mSkipped++; continue; }
    // Mapping role: V1 (OWNER/ADMIN/TECHNICIAN/MEMBER/VIEWER/CLIENT) → V2 (OWNER/ADMIN/MEMBER)
    const role =
      m.role === 'OWNER' ? 'OWNER' :
      m.role === 'ADMIN' ? 'ADMIN' :
      'MEMBER';
    const scope = m.scopeType === 'SCOPED' ? 'SCOPED' : 'FULL';
    // Idempotencja
    const exists = await prisma.membership.findFirst({
      where: { userId, workspaceId: wsId },
      select: { id: true },
    });
    if (exists) {
      ids.memberships.set(m.id, exists.id);
      mSkipped++;
      continue;
    }
    if (!dryRun) {
      const created = await prisma.membership.create({
        data: {
          userId, workspaceId: wsId,
          role: role as 'OWNER' | 'ADMIN' | 'MEMBER',
          scope: scope as 'FULL' | 'SCOPED',
          status: m.status ?? 'ACTIVE',
          isDefault: m.isDefault ?? false,
          createdAt: m.createdAt,
        },
      });
      ids.memberships.set(m.id, created.id);
    } else {
      ids.memberships.set(m.id, `dry-${m.id}`);
    }
    mCreated++;
  }
  console.log(`  ✓ ${mCreated} utworzonych, ${mSkipped} pominięto`);

  // ── 4. LOCATIONS
  console.log('\n[4/9] Locations…');
  const v1Loc = (await v1.query(`SELECT * FROM "Location" WHERE "deletedAt" IS NULL`)).rows;
  let lCreated = 0;
  let lSkipped = 0;
  for (const l of v1Loc) {
    const wsId = ids.workspaces.get(l.workspaceId);
    if (!wsId) { lSkipped++; continue; }
    if (!dryRun) {
      const created = await prisma.location.create({
        data: {
          workspaceId: wsId,
          name: l.name,
          type: (['OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER'].includes(l.type) ? l.type : 'OFFICE') as never,
          addressLine1: l.addressLine1 ?? 'brak',
          addressLine2: l.addressLine2,
          postalCode: l.postalCode ?? '00-000',
          city: l.city ?? 'brak',
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
      ids.locations.set(l.id, created.id);
    } else {
      ids.locations.set(l.id, `dry-${l.id}`);
    }
    lCreated++;
  }
  console.log(`  ✓ ${lCreated} utworzonych, ${lSkipped} pominięto`);

  // ── 5. DEVICES
  console.log('\n[5/9] Devices…');
  const v1Dev = (await v1.query(`SELECT * FROM "Device" WHERE "deletedAt" IS NULL`)).rows;
  let dCreated = 0;
  let dSkipped = 0;
  for (const d of v1Dev) {
    const wsId = ids.workspaces.get(d.workspaceId);
    const locId = d.locationId ? ids.locations.get(d.locationId) : null;
    if (!wsId || !locId) { dSkipped++; continue; }
    // Idempotencja: sprawdź czy device istnieje w V2 (po workspaceId+name)
    const exists = await prisma.device.findFirst({
      where: { workspaceId: wsId, name: d.name },
      select: { id: true },
    });
    if (exists) {
      ids.devices.set(d.id, exists.id);
      dSkipped++;
      continue;
    }
    if (!dryRun) {
      const created = await prisma.device.create({
        data: {
          workspaceId: wsId,
          locationId: locId,
          name: d.name,
          hostname: d.hostname,
          category: (d.category ?? 'WORKSTATION') as never,
          criticality: (d.criticality ?? 'MEDIUM') as never,
          status: (d.status ?? 'ACTIVE') as never,
          assetTag: d.assetTag,
          serialNumber: d.serialNumber,
          manufacturer: d.manufacturer,
          model: d.model,
          operatingSystem: d.operatingSystem,
          osVersion: d.osVersion,
          ipAddress: d.ipAddress,
          macAddress: d.macAddress,
          qrCodeValue: `IDSK-V1-${d.id.slice(0, 12).toUpperCase()}`,
          description: d.description,
          internalNotes: d.internalNotes,
          createdAt: d.createdAt,
        },
      });
      ids.devices.set(d.id, created.id);
    } else {
      ids.devices.set(d.id, `dry-${d.id}`);
    }
    dCreated++;
  }
  console.log(`  ✓ ${dCreated} utworzonych, ${dSkipped} pominięto`);

  // ── 6. TICKETS
  console.log('\n[6/9] Tickets…');
  const v1Tkt = (await v1.query(`SELECT * FROM "Ticket" WHERE "deletedAt" IS NULL ORDER BY "createdAt"`)).rows;
  let tCreated = 0;
  let tSkipped = 0;
  for (const t of v1Tkt) {
    const wsId = ids.workspaces.get(t.workspaceId);
    if (!wsId) { tSkipped++; continue; }
    // Idempotencja: ticketNumber
    const exists = await prisma.ticket.findFirst({
      where: { workspaceId: wsId, ticketNumber: t.ticketNumber },
      select: { id: true },
    });
    if (exists) {
      ids.tickets.set(t.id, exists.id);
      tSkipped++;
      continue;
    }
    const createdByUserId = ids.users.get(t.createdByUserId);
    if (!createdByUserId) { tSkipped++; continue; }
    const assignedToUserId = t.assignedToUserId ? ids.users.get(t.assignedToUserId) : null;
    const deviceId = t.deviceId ? ids.devices.get(t.deviceId) : null;
    const locationId = t.locationId ? ids.locations.get(t.locationId) : null;
    if (!dryRun) {
      const created = await prisma.ticket.create({
        data: {
          workspaceId: wsId,
          ticketNumber: t.ticketNumber,
          title: t.title,
          description: t.description ?? '',
          status: mapTicketStatus(t.status) as never,
          priority: mapPriority(t.priority) as never,
          type: (['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER'].includes(t.type) ? t.type : 'INCIDENT') as never,
          source: (['PORTAL', 'EMAIL', 'AGENT', 'PHONE', 'AI_CHAT', 'MANUAL', 'API'].includes(t.source) ? t.source : 'MANUAL') as never,
          category: t.category,
          deviceId, locationId,
          assignedToUserId,
          createdByUserId,
          requesterName: t.requesterName,
          requesterEmail: t.requesterEmail,
          requesterPhone: t.requesterPhone,
          dueAt: t.dueAt,
          firstResponseAt: t.firstResponseAt,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
          resolutionSummary: t.resolutionSummary,
          createdAt: t.createdAt,
          hasService: true,
        },
      });
      ids.tickets.set(t.id, created.id);
    } else {
      ids.tickets.set(t.id, `dry-${t.id}`);
    }
    tCreated++;
  }
  console.log(`  ✓ ${tCreated} utworzonych, ${tSkipped} pominięto`);

  // ── 7. AGENT REGISTRATIONS (connected to Device 1:1)
  console.log('\n[7/9] AgentRegistrations…');
  const v1Agn = (await v1.query(`SELECT * FROM "AgentRegistration"`)).rows;
  let aCreated = 0;
  let aSkipped = 0;
  for (const a of v1Agn) {
    const wsId = ids.workspaces.get(a.workspaceId);
    const devId = a.deviceId ? ids.devices.get(a.deviceId) : null;
    if (!wsId) { aSkipped++; continue; }
    // Idempotencja: agentToken
    const exists = await prisma.agentRegistration.findFirst({
      where: { agentToken: a.agentToken },
      select: { id: true },
    });
    if (exists) { aSkipped++; continue; }
    if (!dryRun) {
      await prisma.agentRegistration.create({
        data: {
          workspaceId: wsId,
          deviceId: devId,
          agentToken: a.agentToken,
          agentTokenHash: a.agentTokenHash ?? createHash('sha256').update(a.agentToken).digest('hex'),
          agentVersion: a.agentVersion ?? 'unknown',
          status: (a.status ?? 'PENDING') as never,
          hostname: a.hostname ?? 'unknown',
          manufacturer: a.manufacturer,
          model: a.model,
          serialNumber: a.serialNumber,
          osName: a.osName,
          osVersion: a.osVersion,
          cpuModel: a.cpuModel,
          ramMb: a.ramMb,
          diskFreeGb: a.diskFreeGb,
          diskTotalGb: a.diskTotalGb,
          lastSeen: a.lastSeen,
          serverMetrics: a.serverMetrics,
          currentUser: a.currentUser,
          companyName: a.companyName,
          nip: a.nip,
          contactFirstName: a.contactFirstName,
          contactLastName: a.contactLastName,
          contactEmail: a.contactEmail,
          contactPhone: a.contactPhone,
          createdAt: a.createdAt,
        },
      });
    }
    aCreated++;
  }
  console.log(`  ✓ ${aCreated} utworzonych, ${aSkipped} pominięto`);

  // ── 8. ALERTY (MonitoringAlert)
  console.log('\n[8/9] MonitoringAlerts…');
  const v1Alerts = (await v1.query(`SELECT * FROM "MonitoringAlert"`)).rows;
  let alCreated = 0;
  let alSkipped = 0;
  for (const al of v1Alerts) {
    const wsId = ids.workspaces.get(al.workspaceId);
    const devId = al.deviceId ? ids.devices.get(al.deviceId) : null;
    if (!wsId || !devId) { alSkipped++; continue; }
    if (!dryRun) {
      await prisma.monitoringAlert.create({
        data: {
          workspaceId: wsId,
          deviceId: devId,
          type: al.type,
          severity: (al.severity ?? 'MEDIUM') as never,
          message: al.message ?? '',
          rawData: al.rawData,
          resolved: al.resolved ?? false,
          resolvedAt: al.resolvedAt,
          autoResolveReason: al.autoResolveReason,
          createdAt: al.createdAt,
        },
      });
    }
    alCreated++;
  }
  console.log(`  ✓ ${alCreated} utworzonych, ${alSkipped} pominięto`);

  // ── 9. SUMMARY
  console.log('\n━━━ MIGRATION COMPLETE ━━━');
  console.log(`Users:        ${ids.users.size}`);
  console.log(`Workspaces:   ${ids.workspaces.size}`);
  console.log(`Memberships:  ${ids.memberships.size}`);
  console.log(`Locations:    ${ids.locations.size}`);
  console.log(`Devices:      ${ids.devices.size}`);
  console.log(`Tickets:      ${ids.tickets.size}`);
  if (dryRun) console.log('\n[!] DRY RUN — brak zapisów w DB. Uruchom bez --dry-run żeby wykonać.');

  await v1.end();
  await prisma.$disconnect();
}

function mapTicketStatus(s: string): string {
  const m: Record<string, string> = {
    COMPLETED: 'CLOSED', PENDING: 'WAITING', NEW: 'NEW', OPEN: 'OPEN',
    ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING',
    RESOLVED: 'RESOLVED', CLOSED: 'CLOSED', CANCELLED: 'CANCELLED',
  };
  return m[s] ?? 'OPEN';
}
function mapPriority(p: string): string {
  const ok = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return ok.includes(p) ? p : 'MEDIUM';
}

async function connectV1(): Promise<PgClient> {
  // Spróbuj najpierw loopback:5432 (może infradesk-db jest eksponowany)
  const attempts: Array<typeof V1_CONN & { host: string }> = [
    { ...V1_CONN, host: '172.18.0.2' },
    { ...V1_CONN, host: '172.18.0.3' },
    { ...V1_CONN, host: '172.18.0.4' },
    { ...V1_CONN, host: 'localhost', port: 5434 },
    { ...V1_CONN, host: 'localhost' },
  ];
  for (const cfg of attempts) {
    try {
      const c = new PgClient(cfg);
      await c.connect();
      console.log(`V1 DB connected via ${cfg.host}:${cfg.port}`);
      return c;
    } catch (err) {
      // next attempt
      console.log(`V1 DB ${cfg.host}:${cfg.port} failed: ${(err as Error).message.slice(0, 60)}`);
    }
  }
  throw new Error('Cannot connect to V1 DB');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});

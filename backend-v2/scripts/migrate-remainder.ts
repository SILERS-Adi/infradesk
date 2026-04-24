/* eslint-disable no-console */
/**
 * Migracja pozostałych tabel V1→V2: TicketComment (145), CrmActivity (1), BackupConfig (1).
 * Wymaga: Tickets/Users/Devices/Locations/Workspaces/AgentRegistrations już zmigrowane (migrate-from-v1.ts).
 */
import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';

const prisma = new PrismaClient();

async function connectV1(): Promise<PgClient> {
  const hosts = ['172.18.0.3', '172.18.0.2', 'localhost'];
  for (const host of hosts) {
    const c = new PgClient({ host, port: 5432, user: 'infradesk', password: 'infradesk', database: 'infradesk' });
    try { await c.connect(); console.log(`V1 DB connected via ${host}:5432`); return c; }
    catch (e) { console.log(`V1 DB ${host}:5432 failed: ${(e as Error).message}`); }
  }
  throw new Error('Cannot connect to V1 DB');
}

async function main(): Promise<void> {
  const v1 = await connectV1();

  // Build id maps by matching V2 with V1 via stable keys
  const v2Users = await prisma.user.findMany({ select: { id: true, email: true } });
  const v1Users = (await v1.query(`SELECT id, email FROM "User"`)).rows;
  const userMap = new Map<string, string>();
  const emailToV2 = new Map(v2Users.map((u) => [u.email.toLowerCase(), u.id]));
  for (const u of v1Users) {
    const v2Id = emailToV2.get((u.email as string).toLowerCase());
    if (v2Id) userMap.set(u.id, v2Id);
  }
  console.log(`[users] ${userMap.size} mapowań`);

  const v2Tickets = await prisma.ticket.findMany({ select: { id: true, ticketNumber: true, workspaceId: true } });
  const v1Tickets = (await v1.query(`SELECT id, "ticketNumber" FROM "Ticket" WHERE "deletedAt" IS NULL`)).rows;
  const ticketMap = new Map<string, { id: string; workspaceId: string }>();
  const numberToV2 = new Map(v2Tickets.map((t) => [t.ticketNumber, { id: t.id, workspaceId: t.workspaceId }]));
  for (const t of v1Tickets) {
    const v2 = numberToV2.get(t.ticketNumber as string);
    if (v2) ticketMap.set(t.id, v2);
  }
  console.log(`[tickets] ${ticketMap.size} mapowań`);

  const v2Devices = await prisma.device.findMany({ select: { id: true, workspaceId: true, name: true } });
  const v1Devices = (await v1.query(`SELECT id, "workspaceId", name FROM "Device" WHERE "deletedAt" IS NULL`)).rows;
  const v2Workspaces = await prisma.workspace.findMany({ select: { id: true, slug: true } });
  const slugToV2 = new Map(v2Workspaces.map((w) => [w.slug, w.id]));
  const v1Workspaces = (await v1.query(`SELECT id, slug FROM "Workspace"`)).rows;
  const wsMap = new Map<string, string>();
  for (const w of v1Workspaces) {
    const v2 = slugToV2.get(w.slug as string);
    if (v2) wsMap.set(w.id, v2);
  }
  const deviceByNameInWs = new Map(v2Devices.map((d) => [`${d.workspaceId}|${d.name}`, d.id]));
  const deviceMap = new Map<string, string>();
  for (const d of v1Devices) {
    const v2Ws = wsMap.get(d.workspaceId);
    if (!v2Ws) continue;
    const v2Id = deviceByNameInWs.get(`${v2Ws}|${d.name}`);
    if (v2Id) deviceMap.set(d.id, v2Id);
  }
  console.log(`[devices] ${deviceMap.size} mapowań`);

  const v2Agents = await prisma.agentRegistration.findMany({ select: { id: true, agentToken: true, deviceId: true } });
  const v1Agents = (await v1.query(`SELECT id, "agentToken", "deviceId" FROM "AgentRegistration"`)).rows;
  const tokenToV2 = new Map(v2Agents.map((a) => [a.agentToken, a.id]));
  const agentMap = new Map<string, string>();
  for (const a of v1Agents) {
    const v2Id = tokenToV2.get(a.agentToken as string);
    if (v2Id) agentMap.set(a.id, v2Id);
  }
  console.log(`[agents] ${agentMap.size} mapowań`);

  // ── TicketComment
  console.log('\n[1/3] TicketComment…');
  const v1Comments = (await v1.query(`SELECT * FROM "TicketComment" ORDER BY "createdAt"`)).rows;
  let cCreated = 0, cSkipped = 0;
  for (const c of v1Comments) {
    const ticket = ticketMap.get(c.ticketId);
    const userId = userMap.get(c.userId);
    if (!ticket || !userId) { cSkipped++; continue; }
    const exists = await prisma.ticketComment.findFirst({
      where: { ticketId: ticket.id, userId, comment: c.comment, createdAt: c.createdAt },
      select: { id: true },
    });
    if (exists) { cSkipped++; continue; }
    await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId, comment: c.comment, isInternal: c.isInternal ?? false, createdAt: c.createdAt },
    });
    cCreated++;
  }
  console.log(`  ✓ ${cCreated} utworzonych, ${cSkipped} pominięto`);

  // ── CrmActivity
  console.log('\n[2/3] CrmActivity…');
  const v1Crm = (await v1.query(`SELECT * FROM "CrmActivity"`)).rows;
  let crCreated = 0, crSkipped = 0;
  for (const cr of v1Crm) {
    const createdBy = userMap.get(cr.createdByUserId);
    if (!createdBy) { crSkipped++; continue; }
    // Derive workspaceId: from linkedTicket OR device OR user's first membership
    let wsId: string | undefined;
    if (cr.linkedTicketId) wsId = ticketMap.get(cr.linkedTicketId)?.workspaceId;
    if (!wsId && cr.deviceId) {
      const devId = deviceMap.get(cr.deviceId);
      if (devId) {
        const d = await prisma.device.findUnique({ where: { id: devId }, select: { workspaceId: true } });
        wsId = d?.workspaceId;
      }
    }
    if (!wsId) {
      const m = await prisma.membership.findFirst({ where: { userId: createdBy, status: 'ACTIVE' }, select: { workspaceId: true } });
      wsId = m?.workspaceId;
    }
    if (!wsId) { crSkipped++; continue; }
    const exists = await prisma.crmActivity.findFirst({
      where: { workspaceId: wsId, createdByUserId: createdBy, type: cr.type, createdAt: cr.createdAt },
      select: { id: true },
    });
    if (exists) { crSkipped++; continue; }
    await prisma.crmActivity.create({
      data: {
        workspaceId: wsId,
        createdByUserId: createdBy,
        assignedToUserId: cr.assignedToUserId ? userMap.get(cr.assignedToUserId) ?? null : null,
        type: cr.type,
        title: cr.title ?? cr.subject ?? '(bez tytułu)',
        notes: cr.notes,
        scheduledAt: cr.reminderAt,
        completedAt: cr.occurredAt,
        followUpRequired: cr.followUpRequired ?? false,
        linkedTicketId: cr.linkedTicketId ? ticketMap.get(cr.linkedTicketId)?.id ?? null : null,
        createdAt: cr.createdAt,
      },
    });
    crCreated++;
  }
  console.log(`  ✓ ${crCreated} utworzonych, ${crSkipped} pominięto`);

  // ── BackupConfig
  console.log('\n[3/3] BackupConfig…');
  const v1Backups = (await v1.query(`SELECT * FROM "BackupConfig"`)).rows;
  let bCreated = 0, bSkipped = 0;
  // pick first OWNER in MSP workspace as default creator
  const fallbackOwner = await prisma.membership.findFirst({
    where: { role: 'OWNER', status: 'ACTIVE', workspace: { type: 'MSP' } },
    select: { userId: true },
  });
  const fallbackUserId = fallbackOwner?.userId;
  for (const b of v1Backups) {
    const v2AgentId = agentMap.get(b.agentRegId);
    if (!v2AgentId) { bSkipped++; continue; }
    const agent = await prisma.agentRegistration.findUnique({ where: { id: v2AgentId }, select: { workspaceId: true, deviceId: true } });
    if (!agent?.workspaceId) { bSkipped++; continue; }
    if (!fallbackUserId) { bSkipped++; continue; }
    const exists = await prisma.backupConfig.findFirst({
      where: { workspaceId: agent.workspaceId, agentRegistrationId: v2AgentId, name: b.name },
      select: { id: true },
    });
    if (exists) { bSkipped++; continue; }
    await prisma.backupConfig.create({
      data: {
        workspaceId: agent.workspaceId,
        agentRegistrationId: v2AgentId,
        deviceId: agent.deviceId,
        name: b.name,
        type: b.type as never,
        sqlHost: b.sqlHost,
        sqlPort: b.sqlPort,
        sqlDatabase: b.sqlDatabases,
        sqlUsername: b.sqlUser,
        folderPath: b.folderPath,
        cronSchedule: b.cronSchedule ?? '0 2 * * *',
        retentionDays: b.retentionDays ?? 30,
        createdByUserId: fallbackUserId,
        createdAt: b.createdAt,
      } as never,
    });
    bCreated++;
  }
  console.log(`  ✓ ${bCreated} utworzonych, ${bSkipped} pominięto`);

  await v1.end();
  await prisma.$disconnect();
  console.log('\n━━━ REMAINDER COMPLETE ━━━');
}

main().catch((err) => { console.error(err); process.exit(1); });

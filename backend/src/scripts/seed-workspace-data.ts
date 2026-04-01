// @ts-nocheck
/**
 * Seeds test data for the workspace-only model (post-cutover).
 * No Tenant/Client — everything is Workspace + WorkspaceMembership.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding workspace-model test data...\n');
  const hash = await bcrypt.hash('Test1234!', 10);

  // ── Workspace: SILERS (MSP) ─────────────────────────────────────
  const silers = await prisma.workspace.create({
    data: { name: 'SILERS', slug: 'silers', type: 'MSP', plan: 'PROFESSIONAL', email: 'adrian@silers.pl', maxAgents: 100, maxUsers: 10 },
  });

  // ── Workspace: PKS Garwolin (COMPANY) ───────────────────────────
  const pks = await prisma.workspace.create({
    data: { name: 'PKS Garwolin', slug: 'pks-garwolin', type: 'COMPANY', plan: 'FREE', email: 'biuro@pks.pl', taxId: '8261234567', city: 'Garwolin' },
  });

  // ── Workspace: Informice (MSP) ──────────────────────────────────
  const informice = await prisma.workspace.create({
    data: { name: 'Informice', slug: 'informice', type: 'MSP', plan: 'STARTER', email: 'admin@informice.pl' },
  });

  // ── Users ───────────────────────────────────────────────────────
  const adrian = await prisma.user.create({ data: { firstName: 'Adrian', lastName: 'Kowalski', email: 'adrian@silers.pl', passwordHash: hash, isSuperAdmin: true } });
  const jan = await prisma.user.create({ data: { firstName: 'Jan', lastName: 'Nowak', email: 'jan@silers.pl', passwordHash: hash } });
  const ewa = await prisma.user.create({ data: { firstName: 'Ewa', lastName: 'Wiśniewska', email: 'ewa@silers.pl', passwordHash: hash } });
  const anna = await prisma.user.create({ data: { firstName: 'Anna', lastName: 'Kamińska', email: 'anna@pks-garwolin.pl', passwordHash: hash } });
  const piotr = await prisma.user.create({ data: { firstName: 'Piotr', lastName: 'Nowicki', email: 'piotr@informice.pl', passwordHash: hash } });
  const tomek = await prisma.user.create({ data: { firstName: 'Tomek', lastName: 'Lewandowski', email: 'tomek@informice.pl', passwordHash: hash } });

  console.log('  Users: Adrian(SA), Jan, Ewa, Anna, Piotr, Tomek');

  // ── Memberships ─────────────────────────────────────────────────
  await prisma.workspaceMembership.createMany({ data: [
    { userId: adrian.id, workspaceId: silers.id, role: 'OWNER', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
    { userId: jan.id, workspaceId: silers.id, role: 'ADMIN', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
    { userId: ewa.id, workspaceId: silers.id, role: 'TECHNICIAN', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
    { userId: anna.id, workspaceId: pks.id, role: 'MEMBER', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
    { userId: piotr.id, workspaceId: informice.id, role: 'OWNER', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
    { userId: tomek.id, workspaceId: informice.id, role: 'TECHNICIAN', scopeType: 'FULL', source: 'DIRECT', isDefault: true },
  ]});

  // Adrian + Ewa also have FULL access to PKS (as MSP staff)
  await prisma.workspaceMembership.createMany({ data: [
    { userId: adrian.id, workspaceId: pks.id, role: 'ADMIN', scopeType: 'FULL', source: 'MSP_ASSIGNED' },
    { userId: ewa.id, workspaceId: pks.id, role: 'TECHNICIAN', scopeType: 'FULL', source: 'MSP_ASSIGNED' },
  ]});

  // MSP manages PKS
  const mgmt = await prisma.workspaceManagement.create({
    data: { mspWorkspaceId: silers.id, companyWorkspaceId: pks.id, status: 'ACTIVE', accessLevel: 'FULL_MANAGEMENT' },
  });

  // Piotr (Informice) → SCOPED access to PKS, only specific device
  const piotrPksMembership = await prisma.workspaceMembership.create({
    data: { userId: piotr.id, workspaceId: pks.id, role: 'TECHNICIAN', scopeType: 'SCOPED', source: 'MSP_ASSIGNED' },
  });

  console.log('  Memberships: 6 direct + 1 MSP_ASSIGNED');

  // ── Locations ───────────────────────────────────────────────────
  const pksHQ = await prisma.location.create({
    data: { workspaceId: pks.id, name: 'Główna siedziba', type: 'OFFICE', addressLine1: 'ul. Lubelska 30', postalCode: '08-400', city: 'Garwolin' },
  });
  const pksLublin = await prisma.location.create({
    data: { workspaceId: pks.id, name: 'Oddział Lublin', type: 'BRANCH', addressLine1: 'ul. Wyszyńskiego 10', postalCode: '20-400', city: 'Lublin' },
  });
  console.log('  Locations: PKS HQ, PKS Lublin');

  // ── Devices ─────────────────────────────────────────────────────
  const srv1 = await prisma.device.create({
    data: { workspaceId: pks.id, locationId: pksHQ.id, name: 'SRV-PRODDB', hostname: 'srv-proddb', status: 'ACTIVE', serialNumber: 'SN-SRV-001' },
  });
  const pc1 = await prisma.device.create({
    data: { workspaceId: pks.id, locationId: pksHQ.id, name: 'PC-ANNA', hostname: 'pc-anna', status: 'ACTIVE', assignedUserId: anna.id },
  });
  const pcLub = await prisma.device.create({
    data: { workspaceId: pks.id, locationId: pksLublin.id, name: 'PC-LUBLIN-01', hostname: 'pc-lublin-01', status: 'ACTIVE' },
  });
  console.log('  Devices: SRV-PRODDB, PC-ANNA, PC-LUBLIN-01');

  // ── AccessGrants ────────────────────────────────────────────────
  // Piotr: DEVICE grant for SRV-PRODDB
  await prisma.accessGrant.create({
    data: { membershipId: piotrPksMembership.id, resourceType: 'DEVICE', resourceId: srv1.id },
  });

  // Tomek: LOCATION grant for Lublin (create membership first)
  const tomekPksMembership = await prisma.workspaceMembership.create({
    data: { userId: tomek.id, workspaceId: pks.id, role: 'TECHNICIAN', scopeType: 'SCOPED', source: 'MSP_ASSIGNED' },
  });
  await prisma.accessGrant.create({
    data: { membershipId: tomekPksMembership.id, resourceType: 'LOCATION', resourceId: pksLublin.id },
  });
  console.log('  Grants: Piotr→SRV-PRODDB(DEVICE), Tomek→Lublin(LOCATION)');

  // ── Agents ──────────────────────────────────────────────────────
  await prisma.agentRegistration.create({
    data: { workspaceId: pks.id, deviceId: srv1.id, status: 'ACTIVE', hostname: 'srv-proddb', agentType: 'SERVER' },
  });
  await prisma.agentRegistration.create({
    data: { workspaceId: pks.id, deviceId: pc1.id, status: 'ACTIVE', hostname: 'pc-anna', agentType: 'CLIENT' },
  });
  console.log('  Agents: 2 active');

  // ── Tickets ─────────────────────────────────────────────────────
  await prisma.ticket.create({
    data: {
      workspaceId: pks.id, locationId: pksHQ.id, deviceId: srv1.id, createdByUserId: anna.id,
      ticketNumber: 'INF-2026-0001', title: 'Serwer nie odpowiada', description: 'SRV-PRODDB nie odpowiada',
      status: 'ASSIGNED', priority: 'HIGH', type: 'INCIDENT', source: 'CLIENT_PORTAL', assignedToUserId: ewa.id,
    },
  });
  await prisma.ticket.create({
    data: {
      workspaceId: pks.id, locationId: pksLublin.id, createdByUserId: adrian.id,
      ticketNumber: 'INF-2026-0002', title: 'Instalacja Wi-Fi', description: 'AP w sali 204',
      status: 'PENDING', priority: 'MEDIUM', type: 'INSTALLATION', source: 'INTERNAL',
    },
  });
  console.log('  Tickets: 2');

  // ── Tasks ───────────────────────────────────────────────────────
  await prisma.task.create({
    data: { workspaceId: pks.id, taskNumber: 'TSK-2026-0001', assignedToUserId: ewa.id, createdByUserId: adrian.id, title: 'Sprawdzić logi', status: 'IN_PROGRESS' },
  });

  // ── WorkspaceSetting ────────────────────────────────────────────
  await prisma.workspaceSetting.createMany({ data: [
    { workspaceId: silers.id, key: 'faq_url', value: 'https://silers.pl/faq' },
    { workspaceId: silers.id, key: 'support_phone', value: '+48 25 999 88 77' },
  ]});

  console.log('\n✅ Seed complete!\n');
  await prisma.$disconnect();
}

main().catch(err => { console.error('Seed failed:', err); process.exit(1); });

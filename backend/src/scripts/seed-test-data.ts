// @ts-nocheck
/**
 * Seeds test data for workspace migration DRY_RUN testing.
 * Creates realistic tenant/client/user/device/ticket structure.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test data...\n');

  const hash = await bcrypt.hash('Test1234!', 10);

  // ── Tenant: SILERS (MSP) ────────────────────────────────────────

  const silers = await prisma.tenant.create({
    data: {
      name: 'SILERS',
      slug: 'silers',
      tenantType: 'MSP',
      plan: 'PROFESSIONAL',
      ownerEmail: 'adrian@silers.pl',
      maxAgents: 100,
      maxUsers: 10,
      maxClients: 50,
    },
  });
  console.log(`  Tenant: SILERS (MSP) id=${silers.id}`);

  // ── Users in SILERS ─────────────────────────────────────────────

  const adrian = await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Adrian',
      lastName: 'Kowalski',
      email: 'adrian@silers.pl',
      passwordHash: hash,
      role: 'ADMIN',
      isSuperAdmin: true,
    },
  });

  const jan = await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Jan',
      lastName: 'Nowak',
      email: 'jan@silers.pl',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });

  const ewa = await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Ewa',
      lastName: 'Wiśniewska',
      email: 'ewa@silers.pl',
      passwordHash: hash,
      role: 'TECHNICIAN',
    },
  });

  const marek = await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Marek',
      lastName: 'Zieliński',
      email: 'marek@silers.pl',
      passwordHash: hash,
      role: 'TECHNICIAN',
    },
  });

  console.log(`  Users: Adrian(ADMIN/SA), Jan(ADMIN), Ewa(TECH), Marek(TECH)`);

  // ── Client: PKS Garwolin ────────────────────────────────────────

  const pks = await prisma.client.create({
    data: {
      tenantId: silers.id,
      name: 'PKS Garwolin',
      legalName: 'PKS Garwolin Sp. z o.o.',
      taxId: '8261234567',
      email: 'biuro@pks-garwolin.pl',
      phone: '+48 25 123 45 67',
      addressLine1: 'ul. Lubelska 30',
      postalCode: '08-400',
      city: 'Garwolin',
      status: 'ACTIVE',
      hasContract: true,
      contractHours: 20,
      contractMonthlyValue: 3500,
      hourlyRate: 180,
      contractScope: 'Serwis IT, monitoring, backup',
      managerId: ewa.id,
    },
  });

  const pksUser = await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Anna',
      lastName: 'Kamińska',
      email: 'anna@pks-garwolin.pl',
      passwordHash: hash,
      role: 'CLIENT',
      clientId: pks.id,
    },
  });

  console.log(`  Client: PKS Garwolin (id=${pks.id})`);

  // ── Client: Szkoła nr 3 ─────────────────────────────────────────

  const szkola = await prisma.client.create({
    data: {
      tenantId: silers.id,
      name: 'Szkoła Podstawowa nr 3',
      email: 'sekretariat@sp3-garwolin.pl',
      addressLine1: 'ul. Kościuszki 15',
      postalCode: '08-400',
      city: 'Garwolin',
      status: 'ACTIVE',
      hasContract: false,
      hourlyRate: 150,
    },
  });

  console.log(`  Client: Szkoła Podstawowa nr 3 (id=${szkola.id})`);

  // ── Client bez tenantId (edge case) ─────────────────────────────

  const orphan = await prisma.client.create({
    data: {
      name: 'Firma Testowa Bez Tenant',
      email: 'test@orphan.pl',
      city: 'Warszawa',
      status: 'ACTIVE',
    },
  });

  console.log(`  Client (no tenant): Firma Testowa Bez Tenant (id=${orphan.id})`);

  // ── Locations ───────────────────────────────────────────────────

  const pksHQ = await prisma.location.create({
    data: {
      tenantId: silers.id,
      clientId: pks.id,
      name: 'Główna siedziba',
      type: 'OFFICE',
      addressLine1: 'ul. Lubelska 30',
      postalCode: '08-400',
      city: 'Garwolin',
      latitude: 51.895,
      longitude: 21.615,
    },
  });

  const pksLublin = await prisma.location.create({
    data: {
      tenantId: silers.id,
      clientId: pks.id,
      name: 'Oddział Lublin',
      type: 'BRANCH',
      addressLine1: 'ul. Prymasa Wyszyńskiego 10',
      postalCode: '20-400',
      city: 'Lublin',
    },
  });

  const szkolaLoc = await prisma.location.create({
    data: {
      tenantId: silers.id,
      clientId: szkola.id,
      name: 'Budynek główny',
      type: 'OFFICE',
      addressLine1: 'ul. Kościuszki 15',
      postalCode: '08-400',
      city: 'Garwolin',
    },
  });

  console.log(`  Locations: PKS HQ, PKS Lublin, Szkoła budynek`);

  // ── Devices ─────────────────────────────────────────────────────

  const srv1 = await prisma.device.create({
    data: {
      tenantId: silers.id, clientId: pks.id, locationId: pksHQ.id,
      name: 'SRV-PRODDB', hostname: 'srv-proddb', status: 'ACTIVE',
      serialNumber: 'SN-SRV-001', macAddress: 'aa:bb:cc:dd:ee:01',
      rustdeskId: 'rd-srv1',
    },
  });

  const pc1 = await prisma.device.create({
    data: {
      tenantId: silers.id, clientId: pks.id, locationId: pksHQ.id,
      name: 'PC-ANNA', hostname: 'pc-anna', status: 'ACTIVE',
      assignedUserId: pksUser.id,
    },
  });

  const pc2 = await prisma.device.create({
    data: {
      tenantId: silers.id, clientId: pks.id, locationId: pksLublin.id,
      name: 'PC-LUBLIN-01', hostname: 'pc-lublin-01', status: 'ACTIVE',
    },
  });

  const szkolaSrv = await prisma.device.create({
    data: {
      tenantId: silers.id, clientId: szkola.id, locationId: szkolaLoc.id,
      name: 'SRV-DZIENNIK', hostname: 'srv-dziennik', status: 'ACTIVE',
    },
  });

  console.log(`  Devices: SRV-PRODDB, PC-ANNA, PC-LUBLIN-01, SRV-DZIENNIK`);

  // ── AgentRegistrations ──────────────────────────────────────────

  await prisma.agentRegistration.create({
    data: {
      tenantId: silers.id, clientId: pks.id, deviceId: srv1.id,
      status: 'ACTIVE', hostname: 'srv-proddb', agentType: 'SERVER',
      cpuUsage: 23, ramUsage: 67,
    },
  });

  await prisma.agentRegistration.create({
    data: {
      tenantId: silers.id, clientId: pks.id, deviceId: pc1.id,
      status: 'ACTIVE', hostname: 'pc-anna', agentType: 'CLIENT',
    },
  });

  // Agent only with tenantId (no clientId) — fallback case
  await prisma.agentRegistration.create({
    data: {
      tenantId: silers.id,
      status: 'PENDING', hostname: 'unknown-device', agentType: 'CLIENT',
    },
  });

  // Agent without tenantId or clientId — unmapped case
  await prisma.agentRegistration.create({
    data: {
      status: 'PENDING', hostname: 'ghost-device', agentType: 'CLIENT',
    },
  });

  console.log(`  Agents: 2 active, 1 pending (tenant only), 1 pending (orphan)`);

  // ── Tickets ─────────────────────────────────────────────────────

  await prisma.ticket.create({
    data: {
      tenantId: silers.id, clientId: pks.id, locationId: pksHQ.id,
      deviceId: srv1.id, createdByUserId: pksUser.id,
      ticketNumber: 'INF-2026-0001',
      title: 'Serwer nie odpowiada', description: 'SRV-PRODDB nie odpowiada od rana',
      status: 'ASSIGNED', priority: 'HIGH', type: 'INCIDENT', source: 'CLIENT_PORTAL',
      assignedToUserId: ewa.id,
    },
  });

  await prisma.ticket.create({
    data: {
      tenantId: silers.id, clientId: szkola.id, locationId: szkolaLoc.id,
      createdByUserId: adrian.id,
      ticketNumber: 'INF-2026-0002',
      title: 'Instalacja Wi-Fi', description: 'Nowy access point w sali 204',
      status: 'PENDING', priority: 'MEDIUM', type: 'INSTALLATION', source: 'INTERNAL',
    },
  });

  // Ticket without tenantId — edge case
  await prisma.ticket.create({
    data: {
      clientId: orphan.id, locationId: pksHQ.id, // wrong location but testing
      createdByUserId: adrian.id,
      ticketNumber: 'T-0001',
      title: 'Test ticket bez tenantId', description: 'Edge case',
      status: 'PENDING', priority: 'LOW', type: 'OTHER', source: 'INTERNAL',
    },
  });

  console.log(`  Tickets: 3 (2 normal, 1 no tenantId)`);

  // ── Tasks ───────────────────────────────────────────────────────

  await prisma.task.create({
    data: {
      tenantId: silers.id, taskNumber: 'TSK-2026-0001',
      assignedToUserId: ewa.id, createdByUserId: adrian.id,
      title: 'Sprawdzić logi serwera', status: 'IN_PROGRESS',
    },
  });

  // ── Tenant: Informice (partner MSP) ─────────────────────────────

  const informice = await prisma.tenant.create({
    data: {
      name: 'Informice',
      slug: 'informice',
      tenantType: 'MSP',
      plan: 'STARTER',
      ownerEmail: 'admin@informice.pl',
      maxAgents: 25,
      maxUsers: 5,
      maxClients: 15,
    },
  });

  const infUser = await prisma.user.create({
    data: {
      tenantId: informice.id,
      firstName: 'Piotr',
      lastName: 'Nowicki',
      email: 'piotr@informice.pl',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });

  const infTech = await prisma.user.create({
    data: {
      tenantId: informice.id,
      firstName: 'Tomek',
      lastName: 'Lewandowski',
      email: 'tomek@informice.pl',
      passwordHash: hash,
      role: 'TECHNICIAN',
    },
  });

  console.log(`  Tenant: Informice (MSP) with Piotr(ADMIN), Tomek(TECH)`);

  // ── Tenant: PKS child (BUSINESS, managed by SILERS) ─────────────

  const pksChild = await prisma.tenant.create({
    data: {
      name: 'PKS Garwolin',   // Same name as Client — duplicate detection!
      slug: 'pks-garwolin',
      tenantType: 'BUSINESS',
      plan: 'FREE',
      ownerEmail: 'admin-pks@silers.pl',
      parentTenantId: silers.id,
      defaultPartnerId: silers.id,
    },
  });

  console.log(`  Tenant: PKS Garwolin child (BUSINESS, parent=SILERS)`);

  // ── Partnership: PKS child → SILERS (full management) ──────────

  const partnership1 = await prisma.tenantPartnership.create({
    data: {
      ownerTenantId: pksChild.id,     // PKS daje dostep
      partnerTenantId: silers.id,     // SILERS otrzymuje
      status: 'ACTIVE',
      role: 'FULL_MANAGEMENT',
      name: 'SILERS zarządza PKS',
    },
  });

  // ── Partnership: PKS child → Informice (remote support) ────────

  const partnership2 = await prisma.tenantPartnership.create({
    data: {
      ownerTenantId: pksChild.id,
      partnerTenantId: informice.id,
      status: 'ACTIVE',
      role: 'REMOTE_SUPPORT',
      name: 'Informice remote support',
    },
  });

  console.log(`  Partnerships: SILERS→PKS(FULL), Informice→PKS(REMOTE)`);

  // ── SharedDevice: Informice ma dostęp do SRV-PRODDB ─────────────

  await prisma.sharedDevice.create({
    data: {
      partnershipId: partnership2.id,
      deviceId: srv1.id,
      notes: 'Dostęp do serwera produkcyjnego',
    },
  });

  console.log(`  SharedDevice: SRV-PRODDB shared with Informice`);

  // ── Settings ────────────────────────────────────────────────────

  await prisma.setting.create({
    data: { tenantId: silers.id, key: 'faq_url', value: 'https://silers.pl/faq' },
  });
  await prisma.setting.create({
    data: { tenantId: silers.id, key: 'support_phone', value: '+48 25 999 88 77' },
  });
  await prisma.appSetting.create({
    data: { tenantId: silers.id, key: 'rustdesk_enabled', value: 'true' },
  });

  // ── Tenant: PERSONAL ───────────────────────────────────────────

  const personal = await prisma.tenant.create({
    data: {
      name: 'Domowy IT',
      slug: 'personal-abc123',
      tenantType: 'PERSONAL',
      plan: 'FREE',
      ownerEmail: 'home@example.com',
      maxAgents: 3,
      maxUsers: 1,
      maxClients: 0,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: personal.id,
      firstName: 'Domowy',
      lastName: 'User',
      email: 'home@example.com',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });

  console.log(`  Tenant: Domowy IT (PERSONAL)`);

  // ── User CLIENT bez clientId (edge case) ────────────────────────

  await prisma.user.create({
    data: {
      tenantId: silers.id,
      firstName: 'Stary',
      lastName: 'Klient',
      email: 'stary@klient.pl',
      passwordHash: hash,
      role: 'CLIENT',
      // no clientId!
    },
  });

  console.log(`  User CLIENT without clientId: stary@klient.pl`);

  console.log('\n✅ Seed complete!\n');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

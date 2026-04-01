// @ts-nocheck
/**
 * Etap 0B — Migracja danych do workspace model
 *
 * BEZPIECZNY SKRYPT: nie usuwa starych tabel/kolumn, nie zmienia logiki app.
 * Tylko tworzy nowe rekordy (Workspace, Membership, Management, Grant, Setting)
 * i backfilluje workspaceId na istniejących encjach.
 *
 * WYMAGANIA PRZED URUCHOMIENIEM:
 *   1. Migracja DB (prisma migrate dev/deploy) — nowe tabele muszą istnieć
 *   2. npx prisma generate — regeneracja klienta Prisma
 *
 * Uruchomienie:
 *   DRY_RUN=1 npx ts-node src/scripts/migrate-workspace-0b.ts   # podgląd
 *   npx ts-node src/scripts/migrate-workspace-0b.ts              # migracja
 *
 * Idempotentność: sprawdza czy workspace/membership już istnieje przed tworzeniem.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const DRY_RUN = process.env.DRY_RUN === '1';

// ── Counters ────────────────────────────────────────────────────────

const counters = {
  workspacesCreated: 0,
  workspacesSkipped: 0,
  membershipsCreated: 0,
  membershipsSkipped: 0,
  managementsCreated: 0,
  managementsSkipped: 0,
  grantsCreated: 0,
  grantsSkipped: 0,
  settingsMigrated: 0,
  backfillLocation: 0,
  backfillDevice: 0,
  backfillTicket: 0,
  backfillCredential: 0,
  backfillAgent: 0,
  backfillAgentByClient: 0,
  backfillAgentByTenant: 0,
  backfillAgentUnmapped: 0,
  backfillAgentConflict: 0,
  backfillWorkSession: 0,
  backfillTask: 0,
  backfillOrder: 0,
  backfillDelegation: 0,
  backfillCrm: 0,
  backfillBackup: 0,
  backfillActivityLog: 0,
  errors: [] as string[],
  manualReview: [] as string[],
  duplicateWorkspaces: [] as string[],
  agentDetails: [] as string[],
  sharedDeviceDetails: [] as string[],
  partnershipExamples: [] as string[],
};

function log(msg: string) {
  const prefix = DRY_RUN ? '[DRY-RUN]' : '[MIGRATE]';
  console.log(`${prefix} ${msg}`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ąĄ]/g, 'a')
    .replace(/[ćĆ]/g, 'c')
    .replace(/[ęĘ]/g, 'e')
    .replace(/[ńŃ]/g, 'n')
    .replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's')
    .replace(/[źŹżŻ]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// ── Maps ────────────────────────────────────────────────────────────

const tenantToWorkspace = new Map<string, string>();
const clientToWorkspace = new Map<string, string>();

// ══════════════════════════════════════════════════════════════════════
//  PHASE 0: AUDIT
// ══════════════════════════════════════════════════════════════════════

async function audit() {
  log('═══ AUDYT DANYCH ═══');

  // ── Tenants ──────────────────────────────────────────────────────

  const tenants = await prisma.tenant.findMany({
    include: {
      _count: { select: { users: true, clients: true, agents: true, devices: true } },
    },
  });
  log(`Tenantów: ${tenants.length}`);
  for (const t of tenants) {
    log(`  [${t.tenantType}] "${t.name}" (slug=${t.slug}, plan=${t.plan}) — users:${t._count.users} clients:${t._count.clients} agents:${t._count.agents} devices:${t._count.devices}`);
  }

  // ── Clients ──────────────────────────────────────────────────────

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, legalName: true, tenantId: true, taxId: true, status: true },
  });
  log(`Clientów: ${clients.length}`);
  const clientsNoTenant = clients.filter(c => !c.tenantId);
  if (clientsNoTenant.length > 0) {
    log(`  ⚠ Clientów BEZ tenantId: ${clientsNoTenant.length}`);
    for (const c of clientsNoTenant) {
      counters.manualReview.push(`Client "${c.name}" (id=${c.id}) nie ma tenantId`);
    }
  }

  // ── Users per role ──────────────────────────────────────────────

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, tenantId: true, clientId: true, isSuperAdmin: true, createdAt: true },
  });
  const byRole: Record<string, number> = {};
  for (const u of users) {
    byRole[u.role] = (byRole[u.role] || 0) + 1;
  }
  log(`Userów: ${users.length} — ${Object.entries(byRole).map(([r, n]) => `${r}:${n}`).join(', ')}`);

  const superadmins = users.filter(u => u.isSuperAdmin);
  if (superadmins.length > 0) {
    log(`  SuperAdminów: ${superadmins.length} (${superadmins.map(u => u.email).join(', ')})`);
  }

  const usersNoTenant = users.filter(u => !u.tenantId && !u.isSuperAdmin);
  if (usersNoTenant.length > 0) {
    log(`  ⚠ Userów BEZ tenantId (nie-superadmin): ${usersNoTenant.length}`);
    for (const u of usersNoTenant) {
      counters.manualReview.push(`User "${u.email}" (role=${u.role}) nie ma tenantId`);
    }
  }

  const clientUsersNoClient = users.filter(u => u.role === 'CLIENT' && !u.clientId);
  if (clientUsersNoClient.length > 0) {
    log(`  ⚠ Userów CLIENT BEZ clientId: ${clientUsersNoClient.length}`);
    for (const u of clientUsersNoClient) {
      counters.manualReview.push(`User CLIENT "${u.email}" nie ma clientId — nie powstanie membership MEMBER`);
    }
  }

  // ── OWNER resolution preview ────────────────────────────────────

  log('\n  Podgląd OWNER vs ADMIN:');
  for (const tenant of tenants) {
    const admins = users
      .filter(u => u.tenantId === tenant.id && u.role === 'ADMIN')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (admins.length > 0) {
      log(`    Tenant "${tenant.name}": OWNER → ${admins[0].email} (najstarszy), ADMIN → ${admins.slice(1).map(u => u.email).join(', ') || '(brak)'}`);
    }
  }

  // ── Partnerships ────────────────────────────────────────────────

  const partnerships = await prisma.tenantPartnership.findMany({
    include: {
      ownerTenant: { select: { id: true, name: true, tenantType: true, slug: true } },
      partnerTenant: { select: { id: true, name: true, tenantType: true, slug: true } },
      _count: { select: { sharedDevices: true, tickets: true } },
    },
  });
  log(`\nPartnerstw: ${partnerships.length}`);
  for (const p of partnerships) {
    log(`  ${p.ownerTenant.name} →[${p.role}]→ ${p.partnerTenant.name} (status=${p.status}, shared_devices=${p._count.sharedDevices})`);
  }

  // ── Partnership mapping examples (TOP 3) ────────────────────────

  log('\n  Przykłady mapowania Partnership → WorkspaceManagement:');
  const examplePartnerships = partnerships.slice(0, 3);
  for (let i = 0; i < examplePartnerships.length; i++) {
    const p = examplePartnerships[i];
    const accessMap: Record<string, string> = {
      FULL_MANAGEMENT: 'FULL_MANAGEMENT',
      REMOTE_SUPPORT: 'REMOTE_SUPPORT',
      VIEWER: 'MONITORING_ONLY',
    };
    const statusMap: Record<string, string> = {
      ACTIVE: 'ACTIVE', PENDING: 'ACTIVE', REJECTED: 'DETACHED', REVOKED: 'DETACHED',
    };

    const example = [
      `\n  ─── Przykład ${i + 1} ───`,
      `  STARY REKORD:`,
      `    TenantPartnership id=${p.id}`,
      `    ownerTenant:   "${p.ownerTenant.name}" (type=${p.ownerTenant.tenantType}, slug=${p.ownerTenant.slug})`,
      `    partnerTenant: "${p.partnerTenant.name}" (type=${p.partnerTenant.tenantType}, slug=${p.partnerTenant.slug})`,
      `    role=${p.role}, status=${p.status}`,
      `    sharedDevices: ${p._count.sharedDevices}, tickets: ${p._count.tickets}`,
      ``,
      `  NOWY REKORD:`,
      `    WorkspaceManagement:`,
      `      mspWorkspace:     Workspace z Tenant "${p.partnerTenant.name}" (slug=${p.partnerTenant.slug})  ← partner=MSP`,
      `      companyWorkspace:  Workspace z Tenant "${p.ownerTenant.name}" (slug=${p.ownerTenant.slug})  ← owner=COMPANY`,
      `      accessLevel: ${accessMap[p.role] ?? 'REMOTE_SUPPORT'}`,
      `      status: ${statusMap[p.status] ?? 'ACTIVE'}`,
      ``,
      `  KIERUNEK: ownerTenant("${p.ownerTenant.name}") DAJE dostęp → partnerTenant("${p.partnerTenant.name}") OTRZYMUJE`,
      `  W workspace model: "${p.partnerTenant.name}" (MSP) ZARZĄDZA "${p.ownerTenant.name}" (COMPANY)`,
    ].join('\n');

    log(example);
    counters.partnershipExamples.push(example);
  }

  // ── SharedDevices detail ────────────────────────────────────────

  const sharedDevices = await prisma.sharedDevice.findMany({
    include: {
      device: {
        select: {
          id: true, name: true, hostname: true,
          client: { select: { id: true, name: true } },
        },
      },
      partnership: {
        include: {
          ownerTenant: { select: { id: true, name: true } },
          partnerTenant: {
            select: {
              id: true, name: true,
              users: { where: { role: { in: ['ADMIN', 'TECHNICIAN'] } }, select: { id: true, email: true, role: true } },
            },
          },
        },
      },
    },
  });

  if (sharedDevices.length > 0) {
    log(`\n  SharedDevice — szczegóły do manual review:`);
    for (const sd of sharedDevices) {
      if (!sd.device) {
        counters.sharedDeviceDetails.push(`SharedDevice id=${sd.id} — DANGLING: device nie istnieje`);
        continue;
      }

      const partnerUsers = sd.partnership.partnerTenant.users;
      const detail = [
        `  SharedDevice id=${sd.id}:`,
        `    Urządzenie:  "${sd.device.name}" (hostname=${sd.device.hostname}, id=${sd.device.id})`,
        `    Klient:      "${sd.device.client?.name ?? '???'}" (id=${sd.device.client?.id ?? '???'})`,
        `    Partner MSP: "${sd.partnership.partnerTenant.name}" (id=${sd.partnership.partnerTenantId})`,
        `    Partner users: ${partnerUsers.map(u => `${u.email} (${u.role})`).join(', ') || 'BRAK'}`,
        `    ──`,
        `    SUGEROWANA AKCJA:`,
        `      1. Dla każdego usera partnera utwórz:`,
        ...partnerUsers.map(u =>
          `         WorkspaceMembership(userId=${u.id}, workspaceId=[ws-klienta], role=TECHNICIAN, scopeType=SCOPED, source=MSP_ASSIGNED)`
        ),
        `      2. Następnie AccessGrant(membershipId=[powyższy], resourceType=DEVICE, resourceId=${sd.device.id})`,
      ].join('\n');

      log(detail);
      counters.sharedDeviceDetails.push(detail);
    }
  }

  // ── Duplicate workspace detection (taxId / legalName / name) ───

  log('\n  Potencjalne duplikaty Workspace (Tenant vs Client):');

  // By taxId
  const allEntitiesWithTaxId: { source: string; name: string; taxId: string; id: string }[] = [];
  for (const t of tenants) {
    // Tenant nie ma taxId w schemacie, ale Client tak
  }
  for (const c of clients) {
    if (c.taxId) allEntitiesWithTaxId.push({ source: 'Client', name: c.name, taxId: c.taxId, id: c.id });
  }

  const taxIdGroups = new Map<string, typeof allEntitiesWithTaxId>();
  for (const e of allEntitiesWithTaxId) {
    const normalized = e.taxId.replace(/[-\s]/g, '');
    const group = taxIdGroups.get(normalized) || [];
    group.push(e);
    taxIdGroups.set(normalized, group);
  }
  for (const [taxId, group] of taxIdGroups) {
    if (group.length > 1) {
      const msg = `Duplikat taxId "${taxId}": ${group.map(g => `${g.source} "${g.name}" (id=${g.id})`).join(' vs ')}`;
      log(`    ⚠ ${msg}`);
      counters.duplicateWorkspaces.push(msg);
    }
  }

  // By name (Tenant name == Client name)
  const tenantNames = new Map(tenants.map(t => [t.name.toLowerCase().trim(), t]));
  for (const c of clients) {
    const match = tenantNames.get(c.name.toLowerCase().trim());
    if (match) {
      const msg = `Tenant "${match.name}" (slug=${match.slug}) i Client "${c.name}" (id=${c.id}) mają tę samą nazwę → oba staną się Workspace`;
      log(`    ⚠ ${msg}`);
      counters.duplicateWorkspaces.push(msg);
    }
  }

  // By legalName
  const allLegalNames: { source: string; name: string; legalName: string; id: string }[] = [];
  for (const c of clients) {
    if (c.legalName) allLegalNames.push({ source: 'Client', name: c.name, legalName: c.legalName, id: c.id });
  }
  const legalGroups = new Map<string, typeof allLegalNames>();
  for (const e of allLegalNames) {
    const key = e.legalName.toLowerCase().trim();
    const group = legalGroups.get(key) || [];
    group.push(e);
    legalGroups.set(key, group);
  }
  for (const [ln, group] of legalGroups) {
    if (group.length > 1) {
      const msg = `Duplikat legalName "${ln}": ${group.map(g => `${g.source} "${g.name}" (id=${g.id})`).join(' vs ')}`;
      log(`    ⚠ ${msg}`);
      counters.duplicateWorkspaces.push(msg);
    }
  }

  if (counters.duplicateWorkspaces.length === 0) {
    log('    ✓ Brak duplikatów');
  }

  // ── Slug collision check ────────────────────────────────────────

  log('\n  Kolizje slugów:');
  const slugs = new Set<string>();
  const allNames = [
    ...tenants.map(t => ({ name: t.name, type: 'Tenant', id: t.id, existingSlug: t.slug })),
    ...clients.map(c => ({ name: c.name, type: 'Client', id: c.id, existingSlug: null as string | null })),
  ];
  let slugCollisions = 0;
  for (const item of allNames) {
    const slug = item.existingSlug || slugify(item.name);
    if (slugs.has(slug)) {
      log(`    ⚠ Kolizja slug "${slug}" — ${item.type} "${item.name}" (id=${item.id})`);
      counters.manualReview.push(`Kolizja slug "${slug}" dla ${item.type} "${item.name}" (id=${item.id})`);
      slugCollisions++;
    }
    slugs.add(slug);
  }
  if (slugCollisions === 0) log('    ✓ Brak kolizji (duplikaty będą rozwiązane automatycznie z suffixem)');

  // ── Null tenantId in operational entities ───────────────────────

  const nullChecks = [
    { name: 'Location', fn: () => prisma.location.count({ where: { tenantId: null } }) },
    { name: 'Device', fn: () => prisma.device.count({ where: { tenantId: null } }) },
    { name: 'Ticket', fn: () => prisma.ticket.count({ where: { tenantId: null } }) },
    { name: 'Credential', fn: () => prisma.credential.count({ where: { tenantId: null } }) },
    { name: 'AgentRegistration', fn: () => prisma.agentRegistration.count({ where: { tenantId: null } }) },
    { name: 'WorkSession', fn: () => prisma.workSession.count({ where: { tenantId: null } }) },
    { name: 'Task', fn: () => prisma.task.count({ where: { tenantId: null } }) },
    { name: 'Order', fn: () => prisma.order.count({ where: { tenantId: null } }) },
    { name: 'CrmActivity', fn: () => prisma.crmActivity.count({ where: { tenantId: null } }) },
  ];

  log('\n  Rekordy z tenantId=NULL:');
  for (const check of nullChecks) {
    const count = await check.fn();
    if (count > 0) {
      log(`    ⚠ ${check.name}: ${count} rekordów bez tenantId`);
    } else {
      log(`    ✓ ${check.name}: OK`);
    }
  }

  // ── AgentRegistration detailed audit ────────────────────────────

  log('\n  AgentRegistration — szczegółowy audyt:');
  const agents = await prisma.agentRegistration.findMany({
    select: {
      id: true, hostname: true, clientId: true, tenantId: true, status: true,
      client: { select: { id: true, name: true, tenantId: true } },
    },
  });

  let agByClient = 0, agByTenant = 0, agUnmapped = 0, agConflict = 0;
  for (const ag of agents) {
    const clientWs = ag.clientId ? `client→ws` : null;
    const tenantWs = ag.tenantId ? `tenant→ws` : null;

    if (ag.clientId && ag.tenantId) {
      // Check consistency: does the client belong to this tenant?
      if (ag.client && ag.client.tenantId && ag.client.tenantId !== ag.tenantId) {
        agConflict++;
        const detail = `Agent "${ag.hostname}" (id=${ag.id}): clientId→tenant=${ag.client.tenantId} vs agentId→tenant=${ag.tenantId} — KONFLIKT`;
        counters.agentDetails.push(detail);
      } else {
        agByClient++;
      }
    } else if (ag.clientId) {
      agByClient++;
    } else if (ag.tenantId) {
      agByTenant++;
      counters.agentDetails.push(`Agent "${ag.hostname}" (id=${ag.id}): tylko tenantId (brak clientId) → fallback na tenant workspace`);
    } else {
      agUnmapped++;
      counters.agentDetails.push(`Agent "${ag.hostname}" (id=${ag.id}): brak clientId i tenantId → NIE ZOSTANIE PRZYPISANY`);
    }
  }

  log(`    Mapowanie przez clientId:        ${agByClient}`);
  log(`    Mapowanie przez tenantId (fallb): ${agByTenant}`);
  log(`    Nieprzypisane (brak obu):         ${agUnmapped}`);
  log(`    Konflikty clientId vs tenantId:    ${agConflict}`);

  // ── Orphaned records ────────────────────────────────────────────

  const orphanedDevices = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*) as cnt FROM "Device" d WHERE NOT EXISTS (SELECT 1 FROM "Client" c WHERE c.id = d."clientId")`
  );
  const orphanCount = Number(orphanedDevices[0]?.cnt ?? 0);
  if (orphanCount > 0) {
    log(`\n  ⚠ Osierocone Device: ${orphanCount}`);
    counters.manualReview.push(`${orphanCount} urządzeń z nieistniejącym clientId`);
  }

  log('\n═══ KONIEC AUDYTU ═══\n');
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 1: Tenant → Workspace (MSP/PERSONAL/COMPANY)
// ══════════════════════════════════════════════════════════════════════

async function migrateTenants() {
  log('═══ FAZA 1: Tenant → Workspace ═══');
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    const existing = await prisma.workspace.findUnique({ where: { slug: tenant.slug } });
    if (existing) {
      log(`  SKIP Tenant "${tenant.name}" → Workspace already exists (slug=${tenant.slug})`);
      tenantToWorkspace.set(tenant.id, existing.id);
      counters.workspacesSkipped++;
      continue;
    }

    const wsType = tenant.tenantType === 'MSP' ? 'MSP'
      : tenant.tenantType === 'PERSONAL' ? 'PERSONAL'
      : 'COMPANY';

    const planMap: Record<string, 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'> = {
      FREE: 'FREE', STARTER: 'STARTER', PROFESSIONAL: 'PROFESSIONAL', ENTERPRISE: 'ENTERPRISE',
    };

    log(`  Tenant "${tenant.name}" → Workspace(type=${wsType}, slug=${tenant.slug})`);

    if (!DRY_RUN) {
      const ws = await prisma.workspace.create({
        data: {
          name: tenant.name,
          slug: tenant.slug,
          type: wsType as any,
          plan: planMap[tenant.plan] ?? 'FREE',
          email: tenant.ownerEmail,
          logoUrl: tenant.logoUrl,
          primaryColor: tenant.primaryColor,
          maxAgents: tenant.maxAgents,
          maxUsers: tenant.maxUsers,
          isActive: tenant.isActive,
        },
      });
      tenantToWorkspace.set(tenant.id, ws.id);
    } else {
      tenantToWorkspace.set(tenant.id, `dry-ws-${tenant.id.slice(0, 8)}`);
    }
    counters.workspacesCreated++;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 2: Client → Workspace(COMPANY)
// ══════════════════════════════════════════════════════════════════════

async function migrateClients() {
  log('═══ FAZA 2: Client → Workspace(COMPANY) ═══');
  const clients = await prisma.client.findMany();

  for (const client of clients) {
    const baseSlug = slugify(client.name || `client-${client.id.slice(0, 8)}`);
    const slug = DRY_RUN ? baseSlug : await ensureUniqueSlug(baseSlug);

    if (!DRY_RUN) {
      const existing = await prisma.workspace.findUnique({ where: { slug } });
      if (existing) {
        log(`  SKIP Client "${client.name}" → Workspace already exists (slug=${slug})`);
        clientToWorkspace.set(client.id, existing.id);
        counters.workspacesSkipped++;
        continue;
      }
    }

    let plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' = 'FREE';
    if (client.tenantId) {
      const parentWsId = tenantToWorkspace.get(client.tenantId);
      if (parentWsId && !DRY_RUN) {
        const parentWs = await prisma.workspace.findUnique({
          where: { id: parentWsId },
          select: { plan: true },
        });
        if (parentWs) plan = parentWs.plan as any;
      }
    }

    log(`  Client "${client.name}" → Workspace(COMPANY, slug=${slug})`);

    if (!DRY_RUN) {
      const ws = await prisma.workspace.create({
        data: {
          name: client.name,
          slug,
          type: 'COMPANY',
          plan,
          legalName: client.legalName,
          taxId: client.taxId,
          email: client.email,
          phone: client.phone,
          website: client.website,
          addressLine1: client.addressLine1,
          postalCode: client.postalCode,
          city: client.city,
          country: client.country,
          logoUrl: client.logoUrl,
          isActive: client.status === 'ACTIVE',
        },
      });
      clientToWorkspace.set(client.id, ws.id);
    } else {
      clientToWorkspace.set(client.id, `dry-ws-client-${client.id.slice(0, 8)}`);
    }
    counters.workspacesCreated++;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 3: User → WorkspaceMembership
//
//  Zasada OWNER: jeden per workspace — najstarszy ADMIN (wg createdAt).
//  Pozostali ADMIN → rola ADMIN (nie OWNER).
// ══════════════════════════════════════════════════════════════════════

async function migrateUsers() {
  log('═══ FAZA 3: User → WorkspaceMembership ═══');
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  // Pre-compute: for each tenantId, who is the OWNER (first ADMIN by createdAt)
  const ownerPerTenant = new Map<string, string>(); // tenantId → userId
  for (const user of users) {
    if (user.tenantId && user.role === 'ADMIN' && !ownerPerTenant.has(user.tenantId)) {
      ownerPerTenant.set(user.tenantId, user.id);
    }
  }

  log(`  OWNER resolution:`);
  for (const [tenantId, ownerId] of ownerPerTenant) {
    const owner = users.find(u => u.id === ownerId);
    log(`    Tenant ${tenantId.slice(0, 8)}... → OWNER: ${owner?.email}`);
  }

  for (const user of users) {
    // ── 3A: ADMIN/TECHNICIAN → membership in tenant workspace ─────

    if (user.tenantId && (user.role === 'ADMIN' || user.role === 'TECHNICIAN')) {
      const wsId = tenantToWorkspace.get(user.tenantId);
      if (!wsId) {
        counters.errors.push(`User "${user.email}" — tenantId ${user.tenantId} nie ma Workspace`);
        continue;
      }

      // OWNER = first ADMIN per tenant. Rest = ADMIN.
      let memberRole: string;
      if (user.role === 'ADMIN') {
        memberRole = ownerPerTenant.get(user.tenantId) === user.id ? 'OWNER' : 'ADMIN';
      } else {
        memberRole = 'TECHNICIAN';
      }

      if (!DRY_RUN) {
        const existing = await prisma.workspaceMembership.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: wsId } },
        });
        if (existing) {
          log(`  SKIP membership: ${user.email} → tenant workspace (already exists)`);
          counters.membershipsSkipped++;
        } else {
          await prisma.workspaceMembership.create({
            data: {
              userId: user.id,
              workspaceId: wsId,
              role: memberRole as any,
              scopeType: 'FULL',
              source: 'DIRECT',
              isDefault: true,
              status: 'ACTIVE',
            },
          });
          log(`  membership: ${user.email} → tenant workspace (${memberRole})`);
          counters.membershipsCreated++;
        }
      } else {
        log(`  membership: ${user.email} → tenant workspace (${memberRole})`);
        counters.membershipsCreated++;
      }
    }

    // ── 3B: CLIENT → membership in client workspace ───────────────

    if (user.role === 'CLIENT' && user.clientId) {
      const wsId = clientToWorkspace.get(user.clientId);
      if (!wsId) {
        counters.errors.push(`User CLIENT "${user.email}" — clientId ${user.clientId} nie ma Workspace COMPANY`);
        continue;
      }

      if (!DRY_RUN) {
        const existing = await prisma.workspaceMembership.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: wsId } },
        });
        if (existing) {
          log(`  SKIP membership: ${user.email} → client workspace (already exists)`);
          counters.membershipsSkipped++;
        } else {
          await prisma.workspaceMembership.create({
            data: {
              userId: user.id,
              workspaceId: wsId,
              role: 'MEMBER',
              scopeType: 'FULL',
              source: 'DIRECT',
              isDefault: true,
              status: 'ACTIVE',
            },
          });
          log(`  membership: ${user.email} → client workspace (MEMBER)`);
          counters.membershipsCreated++;
        }
      } else {
        log(`  membership: ${user.email} → client workspace (MEMBER)`);
        counters.membershipsCreated++;
      }
    }

    // ── Edge cases ────────────────────────────────────────────────

    if (user.role === 'CLIENT' && !user.clientId) {
      counters.manualReview.push(`User CLIENT "${user.email}" (id=${user.id}) nie ma clientId — brak membership`);
    }

    if (!user.tenantId && !user.isSuperAdmin && user.role !== 'CLIENT') {
      counters.manualReview.push(`User "${user.email}" (role=${user.role}) nie ma tenantId — brak membership w tenant workspace`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 4: TenantPartnership → WorkspaceManagement
// ══════════════════════════════════════════════════════════════════════

async function migratePartnerships() {
  log('═══ FAZA 4: TenantPartnership → WorkspaceManagement ═══');

  // ── 4A: Explicit partnerships ───────────────────────────────────

  const partnerships = await prisma.tenantPartnership.findMany({
    include: {
      ownerTenant: { select: { id: true, name: true } },
      partnerTenant: { select: { id: true, name: true } },
    },
  });

  for (const p of partnerships) {
    // Kierunek: ownerTenant DAJE dostęp, partnerTenant OTRZYMUJE
    // → MSP = partnerTenant, COMPANY = ownerTenant
    const mspWsId = tenantToWorkspace.get(p.partnerTenantId);
    const companyWsId = tenantToWorkspace.get(p.ownerTenantId);

    if (!mspWsId) {
      counters.errors.push(`Partnership id=${p.id}: partnerTenant "${p.partnerTenant.name}" nie ma Workspace`);
      continue;
    }
    if (!companyWsId) {
      counters.errors.push(`Partnership id=${p.id}: ownerTenant "${p.ownerTenant.name}" nie ma Workspace`);
      continue;
    }

    const accessMap: Record<string, string> = {
      FULL_MANAGEMENT: 'FULL_MANAGEMENT',
      REMOTE_SUPPORT: 'REMOTE_SUPPORT',
      VIEWER: 'MONITORING_ONLY',
    };
    const statusMap: Record<string, string> = {
      ACTIVE: 'ACTIVE', PENDING: 'ACTIVE', REJECTED: 'DETACHED', REVOKED: 'DETACHED',
    };

    log(`  Partnership: ${p.partnerTenant.name}(MSP) manages ${p.ownerTenant.name}(COMPANY) [${p.role}]`);

    if (!DRY_RUN) {
      const existing = await prisma.workspaceManagement.findUnique({
        where: { mspWorkspaceId_companyWorkspaceId: { mspWorkspaceId: mspWsId, companyWorkspaceId: companyWsId } },
      });
      if (existing) {
        log(`    SKIP — already exists`);
        counters.managementsSkipped++;
        continue;
      }
      await prisma.workspaceManagement.create({
        data: {
          mspWorkspaceId: mspWsId,
          companyWorkspaceId: companyWsId,
          status: (statusMap[p.status] ?? 'ACTIVE') as any,
          accessLevel: (accessMap[p.role] ?? 'REMOTE_SUPPORT') as any,
        },
      });
      counters.managementsCreated++;
    } else {
      counters.managementsCreated++;
    }
  }

  // ── 4B: Implicit management: Tenant → Client ───────────────────

  log('\n  Implicit management: Tenant → Client relationships...');
  const clients = await prisma.client.findMany({
    where: { tenantId: { not: null } },
    select: {
      id: true, name: true, tenantId: true,
      hasContract: true, contractHours: true, contractMonthlyValue: true,
      contractHourlyRateOverLimit: true, contractScope: true, contractStartDate: true,
      hourlyRate: true,
    },
  });

  for (const client of clients) {
    const mspWsId = tenantToWorkspace.get(client.tenantId!);
    const companyWsId = clientToWorkspace.get(client.id);

    if (!mspWsId || !companyWsId) {
      counters.errors.push(`Client "${client.name}" — brak workspace MSP lub COMPANY`);
      continue;
    }
    if (mspWsId === companyWsId) continue;

    log(`  Management: Tenant ws → Client "${client.name}" ws (FULL_MANAGEMENT)`);

    if (!DRY_RUN) {
      const existing = await prisma.workspaceManagement.findUnique({
        where: { mspWorkspaceId_companyWorkspaceId: { mspWorkspaceId: mspWsId, companyWorkspaceId: companyWsId } },
      });
      if (existing) {
        log(`    SKIP — already exists`);
        counters.managementsSkipped++;
        continue;
      }
      await prisma.workspaceManagement.create({
        data: {
          mspWorkspaceId: mspWsId,
          companyWorkspaceId: companyWsId,
          status: 'ACTIVE',
          accessLevel: 'FULL_MANAGEMENT',
          billedToMsp: true,
          contractHours: client.contractHours,
          contractMonthlyValue: client.contractMonthlyValue,
          hourlyRate: client.hourlyRate ?? client.contractHourlyRateOverLimit,
          contractScope: client.contractScope,
          contractStartDate: client.contractStartDate,
        },
      });
      counters.managementsCreated++;
    } else {
      counters.managementsCreated++;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 5: SharedDevice → AccessGrant (MANUAL REVIEW only)
// ══════════════════════════════════════════════════════════════════════

async function migrateSharedDevices() {
  log('═══ FAZA 5: SharedDevice → AccessGrant (manual review) ═══');
  log('  Per wymaganie: MSP_ASSIGNED memberships nie są automatyczne.');
  log('  SharedDevice zostaną WYLISTOWANE z sugerowanymi akcjami.\n');

  // Already detailed in audit phase. Just note count.
  if (counters.sharedDeviceDetails.length === 0) {
    log('  Brak SharedDevice do przetworzenia.');
  } else {
    log(`  ${counters.sharedDeviceDetails.length} SharedDevice wymagają ręcznej akcji (szczegóły w audycie powyżej).`);
    counters.grantsSkipped = counters.sharedDeviceDetails.length;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 6: Setting + AppSetting → WorkspaceSetting
// ══════════════════════════════════════════════════════════════════════

async function migrateSettings() {
  log('═══ FAZA 6: Setting/AppSetting → WorkspaceSetting ═══');

  const settings = await prisma.setting.findMany();
  for (const s of settings) {
    if (!s.tenantId) { continue; }
    const wsId = tenantToWorkspace.get(s.tenantId);
    if (!wsId) { counters.errors.push(`Setting key="${s.key}" — tenantId ${s.tenantId} nie ma Workspace`); continue; }

    if (!DRY_RUN) {
      const existing = await prisma.workspaceSetting.findUnique({
        where: { workspaceId_key: { workspaceId: wsId, key: `setting.${s.key}` } },
      });
      if (!existing) {
        await prisma.workspaceSetting.create({ data: { workspaceId: wsId, key: `setting.${s.key}`, value: s.value } });
        counters.settingsMigrated++;
      }
    } else {
      counters.settingsMigrated++;
    }
  }

  const appSettings = await prisma.appSetting.findMany();
  for (const s of appSettings) {
    if (!s.tenantId) { continue; }
    const wsId = tenantToWorkspace.get(s.tenantId);
    if (!wsId) { continue; }

    if (!DRY_RUN) {
      const existing = await prisma.workspaceSetting.findUnique({
        where: { workspaceId_key: { workspaceId: wsId, key: `app.${s.key}` } },
      });
      if (!existing) {
        await prisma.workspaceSetting.create({ data: { workspaceId: wsId, key: `app.${s.key}`, value: s.value } });
        counters.settingsMigrated++;
      }
    } else {
      counters.settingsMigrated++;
    }
  }

  log(`  Settings migrated: ${counters.settingsMigrated}`);
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 7: Backfill workspaceId on operational entities
// ══════════════════════════════════════════════════════════════════════

async function backfillWorkspaceIds() {
  log('═══ FAZA 7: Backfill workspaceId ═══');

  async function backfillByClient(modelName: string, counterKey: keyof typeof counters) {
    const model = (prisma as any)[modelName[0].toLowerCase() + modelName.slice(1)];

    if (DRY_RUN) {
      const count = await model.count({ where: { workspaceId: null } });
      log(`  ${modelName}: ${count} rekordów do backfill (by clientId)`);
      (counters as any)[counterKey] = count;
      return;
    }

    const records = await model.findMany({ where: { workspaceId: null }, select: { id: true, clientId: true } });
    let updated = 0;
    for (const record of records) {
      const wsId = record.clientId ? clientToWorkspace.get(record.clientId) : null;
      if (wsId) {
        await model.update({ where: { id: record.id }, data: { workspaceId: wsId } });
        updated++;
      }
    }
    (counters as any)[counterKey] = updated;
    log(`  ${modelName}: ${updated} backfilled`);
  }

  async function backfillByTenant(modelName: string, counterKey: keyof typeof counters) {
    const model = (prisma as any)[modelName[0].toLowerCase() + modelName.slice(1)];

    if (DRY_RUN) {
      const count = await model.count({ where: { workspaceId: null } });
      log(`  ${modelName}: ${count} rekordów do backfill (by tenantId)`);
      (counters as any)[counterKey] = count;
      return;
    }

    const records = await model.findMany({ where: { workspaceId: null }, select: { id: true, tenantId: true } });
    let updated = 0;
    for (const record of records) {
      const wsId = record.tenantId ? tenantToWorkspace.get(record.tenantId) : null;
      if (wsId) {
        await model.update({ where: { id: record.id }, data: { workspaceId: wsId } });
        updated++;
      }
    }
    (counters as any)[counterKey] = updated;
    log(`  ${modelName}: ${updated} backfilled`);
  }

  // Entities with clientId
  await backfillByClient('Location', 'backfillLocation');
  await backfillByClient('Device', 'backfillDevice');
  await backfillByClient('Ticket', 'backfillTicket');
  await backfillByClient('Credential', 'backfillCredential');
  await backfillByClient('WorkSession', 'backfillWorkSession');
  await backfillByClient('Order', 'backfillOrder');
  await backfillByClient('Delegation', 'backfillDelegation');
  await backfillByClient('CrmActivity', 'backfillCrm');
  await backfillByClient('BackupConfig', 'backfillBackup');

  // ── AgentRegistration — detailed with conflict detection ────────

  log('\n  AgentRegistration — szczegółowy backfill:');
  const agents = await prisma.agentRegistration.findMany({
    where: { workspaceId: null },
    select: {
      id: true, hostname: true, clientId: true, tenantId: true,
      client: { select: { tenantId: true } },
    },
  });

  let agByClient = 0, agByTenant = 0, agUnmapped = 0, agConflict = 0;

  for (const agent of agents) {
    let wsId: string | undefined;
    let method = '';

    if (agent.clientId) {
      wsId = clientToWorkspace.get(agent.clientId);
      method = 'clientId';

      // Check conflict: client's tenant != agent's tenant
      if (agent.tenantId && agent.client?.tenantId && agent.client.tenantId !== agent.tenantId) {
        agConflict++;
        counters.agentDetails.push(
          `BACKFILL CONFLICT: Agent "${agent.hostname}" (id=${agent.id}) — ` +
          `client.tenantId=${agent.client.tenantId} vs agent.tenantId=${agent.tenantId}. ` +
          `Używam clientId (priorytet).`
        );
      }
    }

    if (!wsId && agent.tenantId) {
      wsId = tenantToWorkspace.get(agent.tenantId);
      method = 'tenantId (fallback)';
    }

    if (wsId) {
      if (!DRY_RUN) {
        await prisma.agentRegistration.update({ where: { id: agent.id }, data: { workspaceId: wsId } });
      }
      if (method === 'clientId') agByClient++;
      else agByTenant++;
    } else {
      agUnmapped++;
      counters.agentDetails.push(
        `BACKFILL UNMAPPED: Agent "${agent.hostname}" (id=${agent.id}) — brak clientId i tenantId`
      );
    }
  }

  counters.backfillAgent = agByClient + agByTenant;
  counters.backfillAgentByClient = agByClient;
  counters.backfillAgentByTenant = agByTenant;
  counters.backfillAgentUnmapped = agUnmapped;
  counters.backfillAgentConflict = agConflict;

  log(`    przez clientId:        ${agByClient}`);
  log(`    przez tenantId fallb:  ${agByTenant}`);
  log(`    nieprzypisane:         ${agUnmapped}`);
  log(`    konflikty:             ${agConflict}`);

  // ── Task — via ticket.clientId or tenantId ──────────────────────

  log('\n  Task — backfill:');
  if (DRY_RUN) {
    const taskCount = await prisma.task.count({ where: { workspaceId: null } });
    log(`    ${taskCount} rekordów do backfill`);
    counters.backfillTask = taskCount;
  } else {
    const tasks = await prisma.task.findMany({
      where: { workspaceId: null },
      select: { id: true, tenantId: true, ticketId: true },
    });
    let updated = 0;
    for (const task of tasks) {
      let wsId: string | undefined;
      if (task.ticketId) {
        const ticket = await prisma.ticket.findUnique({ where: { id: task.ticketId }, select: { clientId: true } });
        if (ticket?.clientId) wsId = clientToWorkspace.get(ticket.clientId);
      }
      if (!wsId && task.tenantId) wsId = tenantToWorkspace.get(task.tenantId);
      if (wsId) {
        await prisma.task.update({ where: { id: task.id }, data: { workspaceId: wsId } });
        updated++;
      }
    }
    counters.backfillTask = updated;
    log(`    ${updated} backfilled`);
  }

  // ActivityLog — tenantId only
  await backfillByTenant('ActivityLog', 'backfillActivityLog');
}

// ══════════════════════════════════════════════════════════════════════
//  PHASE 8: Validation
// ══════════════════════════════════════════════════════════════════════

async function validate() {
  log('═══ FAZA 8: WALIDACJA ═══');

  if (DRY_RUN) {
    log('  (walidacja pominięta w DRY_RUN — uruchom bez DRY_RUN=1 żeby zweryfikować)');
    return;
  }

  // 1. Every Tenant has a Workspace
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true } });
  for (const t of tenants) {
    const ws = await prisma.workspace.findUnique({ where: { slug: t.slug } });
    if (!ws) counters.errors.push(`VALIDATION: Tenant "${t.name}" (slug=${t.slug}) nie ma Workspace`);
  }

  // 2. Every Client has a Workspace COMPANY
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  for (const c of clients) {
    const wsId = clientToWorkspace.get(c.id);
    if (!wsId) { counters.errors.push(`VALIDATION: Client "${c.name}" nie ma Workspace COMPANY`); continue; }
    const ws = await prisma.workspace.findUnique({ where: { id: wsId } });
    if (!ws || ws.type !== 'COMPANY') counters.errors.push(`VALIDATION: Workspace for "${c.name}" — type != COMPANY`);
  }

  // 3. Every active non-superadmin User has membership
  const users = await prisma.user.findMany({
    where: { isSuperAdmin: false, isActive: true },
    select: { id: true, email: true, role: true, _count: { select: { workspaceMemberships: true } } },
  });
  for (const u of users) {
    if (u._count.workspaceMemberships === 0) {
      counters.errors.push(`VALIDATION: User "${u.email}" (role=${u.role}) nie ma żadnego membership`);
    }
  }

  // 4. Exactly one OWNER per workspace
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  for (const ws of workspaces) {
    const owners = await prisma.workspaceMembership.count({
      where: { workspaceId: ws.id, role: 'OWNER' },
    });
    if (owners > 1) {
      counters.errors.push(`VALIDATION: Workspace "${ws.name}" ma ${owners} OWNERów (powinien być 1)`);
    }
  }

  // 5. Backfill completeness
  const checks = [
    { name: 'Location', fn: () => prisma.location.count({ where: { workspaceId: null } }) },
    { name: 'Device', fn: () => prisma.device.count({ where: { workspaceId: null } }) },
    { name: 'Ticket', fn: () => prisma.ticket.count({ where: { workspaceId: null } }) },
    { name: 'Credential', fn: () => prisma.credential.count({ where: { workspaceId: null } }) },
    { name: 'AgentRegistration', fn: () => prisma.agentRegistration.count({ where: { workspaceId: null } }) },
    { name: 'WorkSession', fn: () => prisma.workSession.count({ where: { workspaceId: null } }) },
    { name: 'Task', fn: () => prisma.task.count({ where: { workspaceId: null } }) },
    { name: 'Order', fn: () => prisma.order.count({ where: { workspaceId: null } }) },
    { name: 'Delegation', fn: () => prisma.delegation.count({ where: { workspaceId: null } }) },
    { name: 'CrmActivity', fn: () => prisma.crmActivity.count({ where: { workspaceId: null } }) },
    { name: 'BackupConfig', fn: () => prisma.backupConfig.count({ where: { workspaceId: null } }) },
    { name: 'ActivityLog', fn: () => prisma.activityLog.count({ where: { workspaceId: null } }) },
  ];

  for (const check of checks) {
    const count = await check.fn();
    log(count > 0 ? `  ⚠ ${check.name}: ${count} nadal bez workspaceId` : `  ✓ ${check.name}: OK`);
  }

  // 6. Dangling memberships
  const dangling = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(`
    SELECT COUNT(*) as cnt FROM "WorkspaceMembership" wm
    WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w.id = wm."workspaceId")
  `);
  if (Number(dangling[0]?.cnt ?? 0) > 0) {
    counters.errors.push(`VALIDATION: ${dangling[0].cnt} dangling memberships`);
  }

  log('  Walidacja zakończona');
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log(DRY_RUN
    ? '  WORKSPACE MIGRATION 0B — DRY RUN (no changes will be made)'
    : '  WORKSPACE MIGRATION 0B — LIVE RUN');
  console.log('═'.repeat(70) + '\n');

  try {
    await audit();
    await migrateTenants();
    await migrateClients();
    await migrateUsers();
    await migratePartnerships();
    await migrateSharedDevices();
    await migrateSettings();
    await backfillWorkspaceIds();
    await validate();
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err);
    process.exit(1);
  }

  // ── Final report ──────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('  RAPORT KOŃCOWY');
  console.log('═'.repeat(70));
  console.log(`
  Workspaces:
    created:    ${counters.workspacesCreated}
    skipped:    ${counters.workspacesSkipped}

  Memberships:
    created:    ${counters.membershipsCreated}
    skipped:    ${counters.membershipsSkipped}

  WorkspaceManagement:
    created:    ${counters.managementsCreated}
    skipped:    ${counters.managementsSkipped}

  AccessGrant:
    created:    ${counters.grantsCreated}
    manual:     ${counters.grantsSkipped}

  Settings migrated: ${counters.settingsMigrated}

  Backfill workspaceId:
    Location:          ${counters.backfillLocation}
    Device:            ${counters.backfillDevice}
    Ticket:            ${counters.backfillTicket}
    Credential:        ${counters.backfillCredential}
    WorkSession:       ${counters.backfillWorkSession}
    Order:             ${counters.backfillOrder}
    Delegation:        ${counters.backfillDelegation}
    CrmActivity:       ${counters.backfillCrm}
    BackupConfig:      ${counters.backfillBackup}
    ActivityLog:       ${counters.backfillActivityLog}
    Task:              ${counters.backfillTask}

  AgentRegistration (szczegółowo):
    przez clientId:      ${counters.backfillAgentByClient}
    przez tenantId:      ${counters.backfillAgentByTenant}
    nieprzypisane:       ${counters.backfillAgentUnmapped}
    konflikty:           ${counters.backfillAgentConflict}
  `);

  // ── Duplicate workspaces ────────────────────────────────────────

  if (counters.duplicateWorkspaces.length > 0) {
    console.log('  ⚠ POTENCJALNE DUPLIKATY WORKSPACE:');
    for (const d of counters.duplicateWorkspaces) {
      console.log(`    - ${d}`);
    }
    console.log('');
  }

  // ── Agent details ───────────────────────────────────────────────

  if (counters.agentDetails.length > 0) {
    console.log('  📋 AGENT REGISTRATION — SZCZEGÓŁY:');
    for (const d of counters.agentDetails) {
      console.log(`    - ${d}`);
    }
    console.log('');
  }

  // ── SharedDevice details ────────────────────────────────────────

  if (counters.sharedDeviceDetails.length > 0) {
    console.log('  📋 SHARED DEVICE — MANUAL REVIEW:');
    for (const d of counters.sharedDeviceDetails) {
      console.log(`    ${d}`);
    }
    console.log('');
  }

  // ── Errors ──────────────────────────────────────────────────────

  if (counters.errors.length > 0) {
    console.log('  ❌ BŁĘDY:');
    for (const e of counters.errors) {
      console.log(`    - ${e}`);
    }
    console.log('');
  }

  // ── Manual review ───────────────────────────────────────────────

  if (counters.manualReview.length > 0) {
    console.log('  ⚠ WYMAGAJĄ RĘCZNEJ DECYZJI:');
    for (const m of counters.manualReview) {
      console.log(`    - ${m}`);
    }
    console.log('');
  }

  if (counters.errors.length === 0 && counters.manualReview.length === 0) {
    console.log('  ✅ Brak błędów i problemów do przeglądu\n');
  }

  console.log('═'.repeat(70) + '\n');

  await prisma.$disconnect();
}

main();

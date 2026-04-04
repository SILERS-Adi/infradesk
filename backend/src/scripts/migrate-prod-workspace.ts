// @ts-nocheck
/**
 * Production workspace migration — simplified for InfraDesk prod DB.
 *
 * Source: Client table (no Tenant table exists on production)
 * Target: Workspace, WorkspaceMembership, backfill workspaceId
 *
 * Usage:
 *   DRY_RUN=1 npx ts-node src/scripts/migrate-prod-workspace.ts
 *   npx ts-node src/scripts/migrate-prod-workspace.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const DRY_RUN = process.env.DRY_RUN === '1';

function log(msg: string) {
  console.log(`${DRY_RUN ? '[DRY-RUN]' : '[MIGRATE]'} ${msg}`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[łŁ]/g, 'l').replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c')
    .replace(/[ęĘ]/g, 'e').replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's').replace(/[źŹżŻ]/g, 'z')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 0;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    n++;
    slug = `${base}-${n}`;
  }
  return slug;
}

const clientToWs = new Map<string, string>();
const counters = {
  wsCreated: 0, wsSkipped: 0,
  memberCreated: 0, memberSkipped: 0,
  backfill: {} as Record<string, number>,
  errors: [] as string[],
  manualReview: [] as string[],
};

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(DRY_RUN ? '  PROD MIGRATION — DRY RUN' : '  PROD MIGRATION — LIVE');
  console.log('═'.repeat(60) + '\n');

  // ══════════════════════════════════════════════════════════════
  //  PHASE 1: Create MSP workspace for the IT company (InfraDesk)
  // ══════════════════════════════════════════════════════════════

  log('═══ FAZA 1: MSP Workspace ═══');

  const MSP_NAME = 'InfraDesk';
  const MSP_SLUG = 'infradesk';
  let mspWsId: string;

  const existingMsp = await prisma.workspace.findUnique({ where: { slug: MSP_SLUG } });
  if (existingMsp) {
    log(`  SKIP: MSP workspace "${MSP_NAME}" already exists`);
    mspWsId = existingMsp.id;
    counters.wsSkipped++;
  } else if (DRY_RUN) {
    log(`  CREATE: Workspace(MSP, slug=${MSP_SLUG}, name=${MSP_NAME})`);
    mspWsId = 'dry-msp';
    counters.wsCreated++;
  } else {
    const ws = await prisma.workspace.create({
      data: { name: MSP_NAME, slug: MSP_SLUG, type: 'MSP', plan: 'PROFESSIONAL', email: 'admin@infradesk.pl', isActive: true },
    });
    mspWsId = ws.id;
    log(`  CREATED: MSP workspace id=${ws.id}`);
    counters.wsCreated++;
  }

  // ══════════════════════════════════════════════════════════════
  //  PHASE 2: Client → Workspace(COMPANY)
  // ══════════════════════════════════════════════════════════════

  log('\n═══ FAZA 2: Client → Workspace(COMPANY) ═══');

  const clients = await prisma.client.findMany();
  log(`  Clients: ${clients.length}`);

  for (const client of clients) {
    const baseSlug = slugify(client.name);
    const slug = DRY_RUN ? baseSlug : await ensureUniqueSlug(baseSlug);

    const existing = DRY_RUN ? null : await prisma.workspace.findUnique({ where: { slug } });
    if (existing) {
      log(`  SKIP: "${client.name}" → workspace exists (slug=${slug})`);
      clientToWs.set(client.id, existing.id);
      counters.wsSkipped++;
      continue;
    }

    log(`  CREATE: "${client.name}" → Workspace(COMPANY, slug=${slug})`);

    if (!DRY_RUN) {
      const ws = await prisma.workspace.create({
        data: {
          name: client.name, slug, type: 'COMPANY', plan: 'FREE',
          legalName: client.legalName, taxId: client.taxId,
          email: client.email, phone: client.phone, website: client.website,
          addressLine1: client.addressLine1, postalCode: client.postalCode,
          city: client.city, country: client.country, logoUrl: client.logoUrl,
          isActive: client.status === 'ACTIVE',
        },
      });
      clientToWs.set(client.id, ws.id);
    } else {
      clientToWs.set(client.id, `dry-ws-${client.id.slice(0, 8)}`);
    }
    counters.wsCreated++;
  }

  // ══════════════════════════════════════════════════════════════
  //  PHASE 3: User → WorkspaceMembership
  // ══════════════════════════════════════════════════════════════

  log('\n═══ FAZA 3: User → WorkspaceMembership ═══');

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  let firstAdmin = true;

  for (const user of users) {
    // ADMIN/TECHNICIAN → membership in MSP workspace
    if (user.role === 'ADMIN' || user.role === 'TECHNICIAN') {
      const memberRole = user.role === 'ADMIN' && firstAdmin ? 'OWNER' : user.role === 'ADMIN' ? 'ADMIN' : 'TECHNICIAN';
      if (user.role === 'ADMIN') firstAdmin = false;

      if (!DRY_RUN) {
        const existing = await prisma.workspaceMembership.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: mspWsId } },
        });
        if (existing) {
          log(`  SKIP: ${user.email} → MSP (exists)`);
          counters.memberSkipped++;
        } else {
          await prisma.workspaceMembership.create({
            data: { userId: user.id, workspaceId: mspWsId, role: memberRole, scopeType: 'FULL', source: 'DIRECT', isDefault: true, status: 'ACTIVE' },
          });
          log(`  CREATE: ${user.email} → MSP (${memberRole})`);
          counters.memberCreated++;
        }
      } else {
        log(`  CREATE: ${user.email} → MSP (${memberRole})`);
        counters.memberCreated++;
      }

      // Also give ADMIN/TECH full access to all COMPANY workspaces
      for (const [clientId, wsId] of clientToWs) {
        if (!DRY_RUN) {
          const existing = await prisma.workspaceMembership.findUnique({
            where: { userId_workspaceId: { userId: user.id, workspaceId: wsId } },
          });
          if (!existing) {
            await prisma.workspaceMembership.create({
              data: { userId: user.id, workspaceId: wsId, role: memberRole === 'OWNER' ? 'ADMIN' : memberRole, scopeType: 'FULL', source: 'MSP_ASSIGNED', status: 'ACTIVE' },
            });
            counters.memberCreated++;
          } else {
            counters.memberSkipped++;
          }
        } else {
          counters.memberCreated++;
        }
      }
    }

    // CLIENT → membership in their client's workspace
    if (user.role === 'CLIENT' && user.clientId) {
      const wsId = clientToWs.get(user.clientId);
      if (!wsId) {
        counters.manualReview.push(`User CLIENT "${user.email}" → clientId ${user.clientId} has no workspace`);
        continue;
      }

      if (!DRY_RUN) {
        const existing = await prisma.workspaceMembership.findUnique({
          where: { userId_workspaceId: { userId: user.id, workspaceId: wsId } },
        });
        if (existing) {
          log(`  SKIP: ${user.email} → COMPANY (exists)`);
          counters.memberSkipped++;
        } else {
          await prisma.workspaceMembership.create({
            data: { userId: user.id, workspaceId: wsId, role: 'MEMBER', scopeType: 'FULL', source: 'DIRECT', isDefault: true, status: 'ACTIVE' },
          });
          log(`  CREATE: ${user.email} → COMPANY (MEMBER)`);
          counters.memberCreated++;
        }
      } else {
        log(`  CREATE: ${user.email} → COMPANY (MEMBER)`);
        counters.memberCreated++;
      }
    }

    if (user.role === 'CLIENT' && !user.clientId) {
      counters.manualReview.push(`User CLIENT "${user.email}" has no clientId`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PHASE 4: WorkspaceManagement (MSP → COMPANY)
  // ══════════════════════════════════════════════════════════════

  log('\n═══ FAZA 4: WorkspaceManagement ═══');

  for (const [clientId, companyWsId] of clientToWs) {
    const client = clients.find(c => c.id === clientId);
    if (!DRY_RUN) {
      const existing = await prisma.workspaceManagement.findUnique({
        where: { mspWorkspaceId_companyWorkspaceId: { mspWorkspaceId: mspWsId, companyWorkspaceId: companyWsId } },
      });
      if (!existing) {
        await prisma.workspaceManagement.create({
          data: {
            mspWorkspaceId: mspWsId, companyWorkspaceId: companyWsId,
            status: 'ACTIVE', accessLevel: 'FULL_MANAGEMENT', billedToMsp: true,
            contractHours: client?.contractHours, contractMonthlyValue: client?.contractMonthlyValue,
            hourlyRate: client?.hourlyRate ?? client?.contractHourlyRateOverLimit,
          },
        });
        log(`  CREATE: MSP manages "${client?.name}"`);
      } else {
        log(`  SKIP: management exists for "${client?.name}"`);
      }
    } else {
      log(`  CREATE: MSP manages "${client?.name}"`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PHASE 5: Backfill workspaceId on operational entities
  // ══════════════════════════════════════════════════════════════

  log('\n═══ FAZA 5: Backfill workspaceId ═══');

  const tables = ['Location', 'Device', 'Ticket', 'Credential', 'CrmActivity', 'WorkSession', 'Order', 'Delegation', 'BackupConfig'];

  for (const table of tables) {
    const model = prisma[table[0].toLowerCase() + table.slice(1)];
    if (!model) { log(`  SKIP: ${table} (no model)`); continue; }

    const records = await model.findMany({ where: { workspaceId: null }, select: { id: true, clientId: true } });

    if (records.length === 0) {
      log(`  ${table}: 0 to backfill`);
      counters.backfill[table] = 0;
      continue;
    }

    let updated = 0;
    for (const rec of records) {
      const wsId = rec.clientId ? clientToWs.get(rec.clientId) : null;
      if (wsId && !DRY_RUN) {
        await model.update({ where: { id: rec.id }, data: { workspaceId: wsId } });
        updated++;
      } else if (wsId) {
        updated++;
      } else {
        counters.manualReview.push(`${table} id=${rec.id} has no clientId → cannot assign workspaceId`);
      }
    }
    counters.backfill[table] = updated;
    log(`  ${table}: ${updated}/${records.length} backfilled`);
  }

  // ActivityLog — no clientId, assign to MSP workspace
  const logs = await prisma.activityLog.findMany({ where: { workspaceId: null }, select: { id: true } });
  if (logs.length > 0 && !DRY_RUN) {
    await prisma.activityLog.updateMany({ where: { workspaceId: null }, data: { workspaceId: mspWsId } });
  }
  counters.backfill['ActivityLog'] = logs.length;
  log(`  ActivityLog: ${logs.length} → MSP workspace`);

  // ══════════════════════════════════════════════════════════════
  //  REPORT
  // ══════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(60));
  console.log('  RAPORT');
  console.log('═'.repeat(60));
  console.log(`
  Workspaces: ${counters.wsCreated} created, ${counters.wsSkipped} skipped
  Memberships: ${counters.memberCreated} created, ${counters.memberSkipped} skipped
  Backfill:`);
  for (const [t, n] of Object.entries(counters.backfill)) {
    console.log(`    ${t}: ${n}`);
  }
  if (counters.errors.length > 0) {
    console.log('\n  ERRORS:');
    counters.errors.forEach(e => console.log(`    - ${e}`));
  }
  if (counters.manualReview.length > 0) {
    console.log('\n  MANUAL REVIEW:');
    counters.manualReview.forEach(m => console.log(`    - ${m}`));
  }
  if (counters.errors.length === 0 && counters.manualReview.length === 0) {
    console.log('\n  ✅ No errors or manual review items');
  }
  console.log('\n' + '═'.repeat(60) + '\n');

  await prisma.$disconnect();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });

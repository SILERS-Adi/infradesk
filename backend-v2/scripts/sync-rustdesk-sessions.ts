/* eslint-disable no-console */
/**
 * Re-sync WorkSessions from RustDesk audit logs.
 * Idempotent via `notes: rustdesk:<guid>` marker.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_BG ?? process.env.DATABASE_URL } } });

const RUSTDESK_API = process.env.RUSTDESK_API_URL || 'http://172.18.0.1:21114';
const RUSTDESK_USER = process.env.RUSTDESK_API_USER || 'admin';
const RUSTDESK_PASS = process.env.RUSTDESK_API_PASS || '';

interface RustDeskAuditConn {
  guid: string;
  remote: string;   // "id123456789/192.168.1.1"
  local_user: string | null;
  created_at: number;
  end_time: number | null;
}

async function login(): Promise<string> {
  const r = await fetch(`${RUSTDESK_API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: RUSTDESK_USER, password: RUSTDESK_PASS, id: 'infradesk', uuid: '00000000-0000-0000-0000-000000000000', autoLogin: true, type: 'account' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`RustDesk login failed: ${r.status}`);
  const data = await r.json() as { access_token: string };
  return data.access_token;
}

async function getAuditConns(token: string, page: number, pageSize: number): Promise<RustDeskAuditConn[]> {
  const url = new URL(`${RUSTDESK_API}/api/audits/conn`);
  url.searchParams.set('current', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`RustDesk audit/conn ${r.status}`);
  const data = await r.json() as { data: RustDeskAuditConn[] };
  return data.data ?? [];
}

function parseRemote(raw: string): { id: string; name: string } {
  const m = raw.match(/^(\d+)\s*-\s*(.+)$/);
  return m ? { id: m[1]!, name: m[2]!.trim() } : { id: raw, name: raw };
}

function roundUpTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

async function main(): Promise<void> {
  console.log('━━━ RustDesk → V2 WorkSession sync ━━━');
  const token = await login();
  console.log('✓ RustDesk login');

  // Pull all pages until we get < pageSize back
  const allConns: RustDeskAuditConn[] = [];
  const pageSize = 200;
  for (let page = 1; page <= 50; page++) {
    const chunk = await getAuditConns(token, page, pageSize);
    allConns.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  console.log(`  total audit entries: ${allConns.length}`);

  const completed = allConns.filter((c) => c.end_time !== null && c.end_time > c.created_at);
  console.log(`  completed sessions: ${completed.length}`);

  const devices = await prisma.device.findMany({
    where: { rustdeskId: { not: null }, deletedAt: null },
    select: { id: true, rustdeskId: true, workspaceId: true, locationId: true },
  });
  const deviceByRustId = new Map(devices.map((d) => [d.rustdeskId!, d]));
  console.log(`  V2 devices with rustdeskId: ${devices.length}`);

  // Only users who are members of an MSP/INTERNAL_IT workspace can be technicians.
  // CLIENT workspace users (e.g. Izabela @ PKS) must NEVER be assigned as technician
  // — they are clients, not service providers.
  const techMemberships = await prisma.membership.findMany({
    where: {
      status: 'ACTIVE',
      workspace: { type: { in: ['MSP', 'INTERNAL_IT'] }, isActive: true },
      user: { isActive: true },
    },
    select: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, isSuperAdmin: true } },
      workspace: { select: { id: true, type: true } },
    },
  });

  // De-duplicate by user.id (a user may have multiple MSP memberships)
  const seenUsers = new Set<string>();
  const users = techMemberships
    .filter((m) => {
      if (seenUsers.has(m.user.id)) return false;
      seenUsers.add(m.user.id);
      return true;
    })
    .map((m) => m.user);

  const techByKey = new Map<string, string>();
  for (const u of users) {
    const prefix = (u.email.split('@')[0] ?? '').toLowerCase();
    techByKey.set(prefix, u.id);
    if (u.firstName) techByKey.set(u.firstName.toLowerCase(), u.id);
    techByKey.set(`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim().toLowerCase(), u.id);
  }

  // Explicit fallback: env RUSTDESK_FALLBACK_TECH_EMAIL > superAdmin > first MSP user
  const envEmail = process.env.RUSTDESK_FALLBACK_TECH_EMAIL?.toLowerCase();
  const fallbackTech =
    (envEmail && users.find((u) => u.email.toLowerCase() === envEmail)) ||
    users.find((u) => u.isSuperAdmin) ||
    users[0];
  if (!fallbackTech) throw new Error('No active MSP/INTERNAL_IT users in V2 (cannot resolve fallback technician)');
  console.log(`  fallback tech: ${fallbackTech.email}`);

  // Idempotency — skip already synced guids
  const existing = await prisma.workSession.findMany({
    where: { notes: { startsWith: 'rustdesk:' } },
    select: { notes: true },
  });
  const syncedGuids = new Set(existing.map((s) => (s.notes ?? '').replace('rustdesk:', '')));

  let created = 0, skippedSynced = 0, skippedNoDevice = 0;
  for (const conn of completed) {
    if (syncedGuids.has(conn.guid)) { skippedSynced++; continue; }
    const remote = parseRemote(conn.remote);
    const device = deviceByRustId.get(remote.id);
    if (!device) { skippedNoDevice++; continue; }

    const local = (conn.local_user ?? '').toLowerCase();
    const technicianId = techByKey.get(local) ?? fallbackTech.id;

    const startedAt = new Date(conn.created_at * 1000);
    const endedAt = new Date(conn.end_time! * 1000);
    const rawMin = Math.max(1, Math.floor((conn.end_time! - conn.created_at) / 60));
    const billableMin = roundUpTo15(rawMin);

    const session = await prisma.workSession.create({
      data: {
        workspaceId: device.workspaceId,
        technicianId,
        deviceId: device.id,
        locationId: device.locationId,
        status: 'COMPLETED',
        serviceMode: 'REMOTE',
        startedAt,
        endedAt,
        durationMinutes: rawMin,
        billableMinutes: billableMin,
        billable: true,
        notes: `rustdesk:${conn.guid}`,
      },
    });
    await prisma.sessionTimeEntry.create({
      data: { workSessionId: session.id, startedAt, endedAt, durationMinutes: rawMin },
    });
    created++;
  }

  console.log(`\n━━━ DONE ━━━`);
  console.log(`  utworzonych:       ${created}`);
  console.log(`  pominiętych (dupl): ${skippedSynced}`);
  console.log(`  pominiętych (no device match): ${skippedNoDevice}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });

import { PrismaClient } from '@prisma/client';

const RUSTDESK_API   = process.env.RUSTDESK_API_URL   || 'http://localhost:21114';
const RUSTDESK_TOKEN = process.env.RUSTDESK_API_TOKEN || '';
const RUSTDESK_USER  = process.env.RUSTDESK_API_USER  || '';
const RUSTDESK_PASS  = process.env.RUSTDESK_API_PASS  || '';

// Security: warn if using defaults (no credentials configured)
if (!RUSTDESK_TOKEN && !RUSTDESK_USER) {
  console.warn('[SECURITY] RUSTDESK_API_USER/RUSTDESK_API_TOKEN not configured — RustDesk integration will fail');
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  // Prefer static token (browser session or rapi_ token)
  if (RUSTDESK_TOKEN) return RUSTDESK_TOKEN;
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const r = await fetch(`${RUSTDESK_API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: RUSTDESK_USER, password: RUSTDESK_PASS, id: 'infradesk', uuid: '00000000-0000-0000-0000-000000000000', autoLogin: true, type: 'account' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk login failed: ${r.status}`);
  const data = await r.json() as { access_token: string };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}

export async function generateOneTimePassword(rustdeskId: string): Promise<string> {
  const token = await getToken();
  const r = await fetch(`${RUSTDESK_API}/api/device/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: rustdeskId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk password failed: ${r.status}`);
  const data = await r.json() as { password: string };
  return data.password;
}

export interface RustDeskPeer {
  id: string;
  guid: string;
  status: number;
  is_online: boolean;
  last_online: string;
  info: {
    ip?: string;
    device_name?: string;
    version?: string;
    cpu?: string;
    memory?: string;
    os?: string;
    username?: string;
  };
}

export async function getRustDeskPeers(): Promise<RustDeskPeer[]> {
  const token = await getToken();
  const url = new URL(`${RUSTDESK_API}/api/peers`);
  url.searchParams.set('current', '1');
  url.searchParams.set('pageSize', '200');
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`RustDesk peers failed: ${r.status}`);
  const data = await r.json() as { data: RustDeskPeer[] };
  return data.data ?? [];
}

export interface RustDeskAuditConn {
  guid: string;
  remote: string;
  local: string;
  conn_type: number;
  created_at: number;       // unix timestamp
  end_time: number | null;  // unix timestamp
  local_user?: string;
  info: string | {
    ip?: string;
    name?: string;
  };
}

/** Parse RustDesk remote field "123456 - hostname" → { id, name } */
function parseRemote(raw: string): { id: string; name: string } {
  const m = raw.match(/^(\d+)\s*-\s*(.+)$/);
  return m ? { id: m[1], name: m[2].trim() } : { id: raw, name: raw };
}

/** Round minutes UP to nearest interval (default 15 min) */
export function roundUpToInterval(minutes: number, interval = 15): number {
  if (minutes <= 0) return interval;
  return Math.ceil(minutes / interval) * interval;
}

export async function getRustDeskAuditConns(page = 1, pageSize = 50): Promise<{ data: RustDeskAuditConn[]; total: number }> {
  const token = await getToken();
  const url = new URL(`${RUSTDESK_API}/api/audits/conn`);
  url.searchParams.set('current', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`RustDesk audit conns failed: ${r.status}`);
  const data = await r.json() as { data: RustDeskAuditConn[]; total: number };
  return { data: data.data ?? [], total: data.total ?? 0 };
}

/**
 * Sync RustDesk peers with InfraDesk devices:
 * - Match by rustdeskId
 * - Update online status, IP, OS info
 * - Return summary
 */
export async function syncPeersWithDevices(prisma: PrismaClient, workspaceId?: string | null) {
  const peers = await getRustDeskPeers();
  const onlineIds = new Set(peers.filter(p => p.is_online).map(p => p.id));

  // Get all devices with rustdeskId
  const where: any = { rustdeskId: { not: null } };
  if (workspaceId) where.workspaceId = workspaceId;
  const devices = await prisma.device.findMany({ where, select: { id: true, rustdeskId: true, name: true } });

  // Get all agent registrations with rustdeskId
  const whereAgent: any = { rustdeskId: { not: null }, status: 'ACTIVE' };
  if (workspaceId) whereAgent.workspaceId = workspaceId;
  const agents = await prisma.agentRegistration.findMany({ where: whereAgent, select: { id: true, rustdeskId: true, hostname: true, deviceId: true } });

  // Build lookup: rustdeskId → peer info
  const peerMap = new Map<string, RustDeskPeer>();
  for (const p of peers) peerMap.set(p.id, p);

  let matched = 0, updated = 0, unmatched = 0;
  const onlinePeers: { rustdeskId: string; deviceName: string; ip: string; os: string; online: boolean }[] = [];

  for (const peer of peers) {
    const device = devices.find(d => d.rustdeskId === peer.id);
    const agent = agents.find(a => a.rustdeskId === peer.id);

    if (device || agent) {
      matched++;
      // Update device IP/OS if changed
      if (device && peer.info) {
        const ip = peer.info.ip?.replace('::ffff:', '') ?? undefined;
        await prisma.device.update({
          where: { id: device.id },
          data: {
            ...(ip ? { ipAddress: ip } : {}),
            ...(peer.info.os ? { operatingSystem: peer.info.os.split(' / ')[0], osVersion: peer.info.os.split(' / ')[1] } : {}),
          },
        });
        updated++;
      }
    } else {
      unmatched++;
    }

    onlinePeers.push({
      rustdeskId: peer.id,
      deviceName: peer.info?.device_name ?? '—',
      ip: peer.info?.ip?.replace('::ffff:', '') ?? '—',
      os: peer.info?.os ?? '—',
      online: peer.is_online,
    });
  }

  return { total: peers.length, matched, updated, unmatched, onlineCount: onlineIds.size, peers: onlinePeers };
}

/**
 * Get active RustDesk connections (running sessions) enriched with InfraDesk data.
 */
export async function getActiveRustDeskSessions(prisma: PrismaClient, workspaceId?: string | null) {
  const { data: conns } = await getRustDeskAuditConns(1, 100);
  const allActive = conns.filter(c => !c.end_time);

  // For each remote+user combo, find the latest CLOSED session timestamp
  const latestClosedTs = new Map<string, number>();
  for (const c of conns) {
    if (c.end_time) {
      const key = `${parseRemote(c.remote).id}::${c.local_user ?? ''}`;
      const cur = latestClosedTs.get(key) ?? 0;
      // Use end_time as the reference point
      if (c.end_time > cur) latestClosedTs.set(key, c.end_time);
    }
  }

  // Keep only the NEWEST open session per (remote, local_user)
  // that started AFTER the latest closed session for the same pair
  const best = new Map<string, typeof allActive[0]>();
  for (const c of allActive) {
    const remoteId = parseRemote(c.remote).id;
    const key = `${remoteId}::${c.local_user ?? ''}`;
    const closedTs = latestClosedTs.get(key);
    // If there's a closed session that ENDED after this one started, it's a zombie
    if (closedTs && c.created_at < closedTs) continue;
    const existing = best.get(key);
    if (!existing || c.created_at > existing.created_at) {
      best.set(key, c);
    }
  }
  const active = Array.from(best.values());

  // Get devices with rustdeskId — filtered by workspace when provided
  const deviceWhere: any = { rustdeskId: { not: null } };
  if (workspaceId) deviceWhere.workspaceId = workspaceId;
  const devices = await prisma.device.findMany({
    where: deviceWhere,
    select: { id: true, name: true, rustdeskId: true, workspaceId: true },
  });
  const deviceByRustdesk = new Map(devices.map(d => [d.rustdeskId, d]));

  // Get RustDesk users → InfraDesk users mapping
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const now = Math.floor(Date.now() / 1000);

  return active.map(c => {
    const remote = parseRemote(c.remote);
    const device = deviceByRustdesk.get(remote.id);
    const info = typeof c.info === 'string' ? JSON.parse(c.info) : c.info;
    const durationSec = now - c.created_at;
    const durationMin = Math.floor(durationSec / 60);
    const billedMin = roundUpToInterval(durationMin);

    // Try to match local_user (RustDesk username) to InfraDesk user
    const localUser = c.local_user?.toLowerCase();
    let tech = localUser ? users.find(u => {
      const emailPrefix = u.email?.split('@')[0]?.toLowerCase() ?? '';
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      return emailPrefix === localUser
        || u.firstName?.toLowerCase() === localUser
        || full === localUser
        || localUser.includes(u.firstName?.toLowerCase() ?? '___')
        || u.email?.toLowerCase() === localUser;
    }) : null;

    // If no local_user, assign to first user
    if (!tech) tech = users[0] ?? null;

    return {
      connGuid: c.guid,
      rustdeskId: remote.id,
      remoteName: remote.name,
      remoteIp: info?.ip ?? null,
      localUser: c.local_user ?? null,
      techId: tech?.id ?? null,
      techName: tech ? `${tech.firstName} ${tech.lastName}` : c.local_user ?? '—',
      startedAt: new Date(c.created_at * 1000).toISOString(),
      durationMin,
      billedMin,
      device: device ? { id: device.id, name: device.name } : null,
    };
  });
}

/**
 * Sync completed RustDesk sessions → WorkSession records.
 * - Only processes sessions not already synced (checks notes field for rustdesk guid)
 * - Rounds duration to 15-minute intervals
 * - Matches remote rustdeskId → Device → Client
 */
export async function syncCompletedRustDeskSessions(prisma: PrismaClient, _workspaceId?: string | null) {
  const { data: conns } = await getRustDeskAuditConns(1, 100);
  const completed = conns.filter(c => c.end_time);

  // Get all devices with rustdeskId
  const devices = await prisma.device.findMany({
    where: { rustdeskId: { not: null } },
    select: { id: true, name: true, rustdeskId: true, workspaceId: true },
  });
  const deviceByRustdesk = new Map(devices.map(d => [d.rustdeskId, d]));

  // Get InfraDesk users for tech matching
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  // Get already synced guids
  const existingSessions = await prisma.workSession.findMany({
    where: { notes: { startsWith: 'rustdesk:' } },
    select: { notes: true },
  });
  const syncedGuids = new Set(existingSessions.map(s => s.notes?.replace('rustdesk:', '')));

  let created = 0, skipped = 0, noMatch = 0;

  for (const conn of completed) {
    if (syncedGuids.has(conn.guid)) { skipped++; continue; }

    const remote = parseRemote(conn.remote);
    const device = deviceByRustdesk.get(remote.id);
    if (!device) { noMatch++; continue; }

    // Match local_user (RustDesk username) to InfraDesk user
    const localUser = conn.local_user?.toLowerCase();
    let tech = localUser ? users.find(u => {
      const emailPrefix = u.email?.split('@')[0]?.toLowerCase() ?? '';
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      return emailPrefix === localUser
        || u.firstName?.toLowerCase() === localUser
        || full === localUser
        || localUser.includes(u.firstName?.toLowerCase() ?? '___')
        || u.email?.toLowerCase() === localUser;
    }) : null;

    // If no local_user (not logged in to RustDesk), assign to first user
    if (!tech) tech = users[0] ?? null;
    if (!tech) { noMatch++; continue; }

    const startedAt = new Date(conn.created_at * 1000);
    const endedAt = new Date(conn.end_time! * 1000);
    const rawMin = Math.floor((conn.end_time! - conn.created_at) / 60);
    const billedMin = roundUpToInterval(rawMin);

    // Create WorkSession
    const session = await prisma.workSession.create({
      data: {
        workspaceId: device.workspaceId,
        deviceId: device.id,
        techId: tech.id,
        status: 'COMPLETED',
        startedAt,
        endedAt,
        durationMin: billedMin,
        notes: `rustdesk:${conn.guid}`,
      },
    });

    // Create time entry
    await prisma.sessionTimeEntry.create({
      data: {
        workSessionId: session.id,
        startedAt,
        endedAt,
        durationMin: rawMin,
      },
    });

    created++;
  }

  return { created, skipped, noMatch, total: completed.length };
}

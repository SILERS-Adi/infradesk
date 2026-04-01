// @ts-nocheck
/**
 * Test: Workspace middleware Etap 1A
 * Verifies resolveWorkspace + resolveMembership in isolation.
 */
import '../config';
import express from 'express';
import { resolveWorkspace, resolveMembership, authorizeWorkspace, deviceScopeFilter, locationScopeFilter, isDeviceAccessible, isLocationAccessible } from '../middleware/workspace';
import { authenticate } from '../middleware/auth';
import { signAccessToken } from '../utils/jwt';
import prisma from '../lib/prisma';
import { listDevices, getDeviceById } from '../modules/devices/devices.service';
import { listLocations, getLocationById } from '../modules/locations/locations.service';
import { listTickets, getTicketById } from '../modules/tickets/tickets.service';
import { listAllSessions } from '../modules/sessions/sessions.service';
import { listCredentials, getCredentialById } from '../modules/credentials/credentials.service';
import { getAllRegistrations } from '../modules/agent/agent.service';
import { listBackupConfigs, getBackupConfig } from '../modules/backup/backup.service';
import { ticketScopeFilter, isTicketAccessible, sessionScopeFilter, credentialScopeFilter, isCredentialAccessible, agentScopeFilter, isAgentAccessible, backupScopeFilter, isBackupAccessible } from '../middleware/workspace';

const app = express();
app.use(express.json());
app.use(resolveWorkspace);

app.get('/test/context', authenticate, resolveMembership, (req, res) => {
  res.json({
    user: req.user ? { userId: req.user.userId, email: req.user.email, isSuperAdmin: req.user.isSuperAdmin } : null,
    workspace: req.workspace ?? null,
    workspaceId: req.workspaceId ?? null,
    membership: req.membership ?? null,
  });
});

// ── Etap 1B test endpoints ────────────────────────────────────────

// Only OWNER/ADMIN allowed
app.get('/test/admin-only',
  authenticate, resolveMembership,
  authorizeWorkspace('OWNER', 'ADMIN'),
  (_req, res) => { res.json({ access: 'granted' }); }
);

// OWNER/ADMIN/TECHNICIAN
app.get('/test/tech-access',
  authenticate, resolveMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  (_req, res) => { res.json({ access: 'granted' }); }
);

// All roles
app.get('/test/member-access',
  authenticate, resolveMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER', 'VIEWER'),
  (_req, res) => { res.json({ access: 'granted' }); }
);

// ── Etap 1C test endpoints (devices + locations with scope) ───────

app.get('/test/devices', authenticate, resolveMembership, async (req, res) => {
  try {
    const result = await listDevices({
      workspaceId: req.workspaceId,
      scopeFilter: deviceScopeFilter(req.membership),
    });
    res.json(result);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/devices/:id', authenticate, resolveMembership, async (req, res) => {
  try {
    const device = await getDeviceById(req.params.id);
    if (req.membership && !isDeviceAccessible(req.membership, device.id, device.locationId)) {
      res.status(403).json({ error: 'Device not in your access scope' });
      return;
    }
    res.json(device);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/locations', authenticate, resolveMembership, async (req, res) => {
  try {
    const result = await listLocations({
      workspaceId: req.workspaceId,
      scopeFilter: locationScopeFilter(req.membership),
    });
    res.json(result);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/locations/:id', authenticate, resolveMembership, async (req, res) => {
  try {
    const location = await getLocationById(req.params.id);
    if (req.membership && !isLocationAccessible(req.membership, location.id)) {
      res.status(403).json({ error: 'Location not in your access scope' });
      return;
    }
    res.json(location);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/agents', authenticate, resolveMembership, async (req, res) => {
  try {
    const regs = await getAllRegistrations({
      workspaceId: req.workspaceId,
      scopeFilter: agentScopeFilter(req.membership),
      workspaceId: req.workspaceId,
    });
    res.json(regs);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/backups', authenticate, resolveMembership, async (req, res) => {
  try {
    const configs = await listBackupConfigs({
      scopeFilter: backupScopeFilter(req.membership),
    });
    res.json(configs);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/backups/:id', authenticate, resolveMembership, async (req, res) => {
  try {
    const config = await getBackupConfig(req.params.id);
    if (req.membership && !isBackupAccessible(req.membership, {
      agentDeviceId: (config.agent as any)?.deviceId ?? null,
      agentDeviceLocationId: (config.agent as any)?.device?.locationId ?? null,
    })) {
      res.status(403).json({ error: 'Backup not in scope' });
      return;
    }
    res.json(config);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/credentials', authenticate, resolveMembership, async (req, res) => {
  try {
    const result = await listCredentials({
      workspaceId: req.workspaceId,
      scopeFilter: credentialScopeFilter(req.membership),
    });
    res.json(result);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/credentials/:id', authenticate, resolveMembership, async (req, res) => {
  try {
    const credential = await getCredentialById(req.params.id);
    if (req.membership && !isCredentialAccessible(req.membership, {
      deviceId: credential.deviceId,
      locationId: credential.locationId,
      deviceLocationId: (credential.device as any)?.locationId ?? null,
    })) {
      res.status(403).json({ error: 'Credential not in your access scope' });
      return;
    }
    res.json(credential);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/sessions', authenticate, resolveMembership, async (req, res) => {
  try {
    const result = await listAllSessions({
      workspaceId: req.workspaceId,
      scopeFilter: sessionScopeFilter(req.membership),
    });
    res.json(result);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/tickets', authenticate, resolveMembership, async (req, res) => {
  try {
    const result = await listTickets({
      workspaceId: req.workspaceId,
      scopeFilter: ticketScopeFilter(req.membership),
    });
    res.json(result);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/tickets/:id', authenticate, resolveMembership, async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    if (req.membership && !isTicketAccessible(req.membership, {
      deviceId: ticket.deviceId,
      locationId: ticket.locationId,
      deviceLocationId: (ticket.device as any)?.locationId ?? null,
    })) {
      res.status(403).json({ error: 'Ticket not in your access scope' });
      return;
    }
    res.json(ticket);
  } catch (e: any) { res.status(e.statusCode || 500).json({ error: e.message }); }
});

app.get('/test/health', (_req, res) => { res.json({ ok: true }); });

const server = app.listen(3999, () => {
  console.log('Test server on :3999\n');
  runTests().then(() => { server.close(); process.exit(0); });
});

async function runTests() {
  await new Promise(r => setTimeout(r, 1500));
  let passed = 0, failed = 0;

  function check(name: string, ok: boolean, detail?: string) {
    if (ok) { console.log(`  ✓ ${name}`); passed++; }
    else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
  }

  // Test 1: Health
  const r1 = await fetch('http://localhost:3999/test/health');
  check('Health endpoint', (await r1.json()).ok === true);

  // Test 2: No auth → 401
  const r2 = await fetch('http://localhost:3999/test/context', {
    headers: { 'x-tenant-slug': 'silers' },
  });
  check('No auth → 401', r2.status === 401);

  // Test 3: Auth + tenant slug → workspace resolved, no membership (fake user)
  const fakeToken = signAccessToken({
    userId: 'fake-id', email: 'fake@test.com',
  });
  const r3 = await fetch('http://localhost:3999/test/context', {
    headers: { Authorization: `Bearer ${fakeToken}`, 'x-tenant-slug': 'silers' },
  });
  const d3 = await r3.json();
  check('Workspace resolved from slug', d3.workspace?.slug === 'silers');
  check('Workspace source = subdomain', d3.workspace?.source === 'subdomain');
  check('No membership for fake user', d3.membership === null);

  // Test 4: Real admin (adrian@silers.pl) → OWNER membership
  const adrian = await prisma.user.findUnique({ where: { email: 'adrian@silers.pl' } });
  if (adrian) {
    const token = signAccessToken({
      userId: adrian.id, email: adrian.email, isSuperAdmin: adrian.isSuperAdmin,
    });
    const r4 = await fetch('http://localhost:3999/test/context', {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': 'silers' },
    });
    const d4 = await r4.json();
    check('Adrian: workspace = silers', d4.workspace?.slug === 'silers');
    check('Adrian: role = OWNER', d4.membership?.role === 'OWNER');
    check('Adrian: scope = FULL', d4.membership?.scopeType === 'FULL');
    check('Adrian: source = DIRECT', d4.membership?.source === 'DIRECT');
    check('Adrian: isSuperAdmin preserved', d4.user?.isSuperAdmin === true);
  }

  // Test 5: Jan (second ADMIN) → ADMIN (not OWNER)
  const jan = await prisma.user.findUnique({ where: { email: 'jan@silers.pl' } });
  if (jan) {
    const token = signAccessToken({
      userId: jan.id, email: jan.email,
    });
    const r5 = await fetch('http://localhost:3999/test/context', {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': 'silers' },
    });
    const d5 = await r5.json();
    check('Jan: role = ADMIN (not OWNER)', d5.membership?.role === 'ADMIN');
  }

  // Test 6: Ewa (TECHNICIAN) → TECHNICIAN
  const ewa = await prisma.user.findUnique({ where: { email: 'ewa@silers.pl' } });
  if (ewa) {
    const token = signAccessToken({
      userId: ewa.id, email: ewa.email,
    });
    const r6 = await fetch('http://localhost:3999/test/context', {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': 'silers' },
    });
    const d6 = await r6.json();
    check('Ewa: role = TECHNICIAN', d6.membership?.role === 'TECHNICIAN');
  }

  // Test 7: Anna (CLIENT) → MEMBER in PKS workspace
  const anna = await prisma.user.findUnique({ where: { email: 'anna@pks-garwolin.pl' } });
  const pksWs = await prisma.workspace.findUnique({ where: { slug: 'pks-garwolin' } });
  if (anna && pksWs) {
    const token = signAccessToken({
      userId: anna.id, email: anna.email,
    });
    const r7 = await fetch('http://localhost:3999/test/context', {
      headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': pksWs.id },
    });
    const d7 = await r7.json();
    check('Anna: workspace = pks-garwolin', d7.workspace?.slug === 'pks-garwolin');
    check('Anna: source = header', d7.workspace?.source === 'header');
    check('Anna: role = MEMBER', d7.membership?.role === 'MEMBER');
    check('Anna: scope = FULL', d7.membership?.scopeType === 'FULL');
  }

  // Test 8: Piotr (Informice) → SCOPED TECHNICIAN in PKS workspace
  const piotr = await prisma.user.findUnique({ where: { email: 'piotr@informice.pl' } });
  if (piotr && pksWs) {
    const token = signAccessToken({
      userId: piotr.id, email: piotr.email,
    });
    const r8 = await fetch('http://localhost:3999/test/context', {
      headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': pksWs.id },
    });
    const d8 = await r8.json();
    check('Piotr→PKS: role = TECHNICIAN', d8.membership?.role === 'TECHNICIAN');
    check('Piotr→PKS: scope = SCOPED', d8.membership?.scopeType === 'SCOPED');
    check('Piotr→PKS: source = MSP_ASSIGNED', d8.membership?.source === 'MSP_ASSIGNED');
    check('Piotr→PKS: 1 AccessGrant (DEVICE)', d8.membership?.grants?.length === 1);
    check('Piotr→PKS: grant type = DEVICE', d8.membership?.grants?.[0]?.resourceType === 'DEVICE');
  }

  // Test 9: removed (tenant fallback no longer exists)

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1B — authorizeWorkspace tests
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1B: authorizeWorkspace ---');

  // Helper to make auth request
  async function authReq(endpoint: string, userEmail: string, headers: Record<string, string> = {}) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) return { status: 0, body: null };
    const token = signAccessToken({
      userId: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin,
    });
    const r = await fetch(`http://localhost:3999${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': 'silers', ...headers },
    });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  }

  // OWNER (adrian) → admin-only: PASS
  const t10 = await authReq('/test/admin-only', 'adrian@silers.pl');
  check('1B: OWNER → admin-only = 200', t10.status === 200);

  // ADMIN (jan) → admin-only: PASS
  const t11 = await authReq('/test/admin-only', 'jan@silers.pl');
  check('1B: ADMIN → admin-only = 200', t11.status === 200);

  // TECHNICIAN (ewa) → admin-only: DENIED
  const t12 = await authReq('/test/admin-only', 'ewa@silers.pl');
  check('1B: TECHNICIAN → admin-only = 403', t12.status === 403);

  // TECHNICIAN (ewa) → tech-access: PASS
  const t13 = await authReq('/test/tech-access', 'ewa@silers.pl');
  check('1B: TECHNICIAN → tech-access = 200', t13.status === 200);

  // MEMBER (anna) in PKS workspace → admin-only: DENIED
  const t14 = await authReq('/test/admin-only', 'anna@pks-garwolin.pl', { 'x-workspace-id': pksWs!.id, 'x-tenant-slug': '' });
  check('1B: MEMBER → admin-only = 403', t14.status === 403);

  // MEMBER (anna) in PKS workspace → member-access: PASS
  const t15 = await authReq('/test/member-access', 'anna@pks-garwolin.pl', { 'x-workspace-id': pksWs!.id, 'x-tenant-slug': '' });
  check('1B: MEMBER → member-access = 200', t15.status === 200);

  // SCOPED TECHNICIAN (piotr) in PKS workspace → tech-access: PASS
  const t16 = await authReq('/test/tech-access', 'piotr@informice.pl', { 'x-workspace-id': pksWs!.id, 'x-tenant-slug': '' });
  check('1B: SCOPED TECH → tech-access = 200', t16.status === 200);

  // SCOPED TECHNICIAN (piotr) in PKS workspace → admin-only: DENIED
  const t17 = await authReq('/test/admin-only', 'piotr@informice.pl', { 'x-workspace-id': pksWs!.id, 'x-tenant-slug': '' });
  check('1B: SCOPED TECH → admin-only = 403', t17.status === 403);

  // Legacy fallback: user without membership → falls back to JWT role
  // Legacy fallback tests removed (no more JWT role fallback)
  // Users without membership now get 403 (not legacy role mapping)
  const noMemberToken = signAccessToken({
    userId: 'no-membership-id', email: 'ghost@test.com',
  });
  const t18 = await fetch('http://localhost:3999/test/admin-only', {
    headers: { Authorization: `Bearer ${noMemberToken}` },
  });
  check('1B: no membership → 403', t18.status === 403);

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1C — enforceScope tests (Device + Location)
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1C: enforceScope (Device + Location) ---');

  // Setup: create a LOCATION grant for tomek@informice in PKS workspace
  // (piotr already has DEVICE grant for SRV-PRODDB)
  const tomek = await prisma.user.findUnique({ where: { email: 'tomek@informice.pl' } });
  const pksLublinLoc = await prisma.location.findFirst({ where: { name: 'Oddział Lublin' } });

  if (tomek && pksLublinLoc && pksWs) {
    // Tomek's membership already exists (MSP_ASSIGNED, SCOPED) with DEVICE grant for SRV-PRODDB.
    // Add a LOCATION grant for Lublin location.
    const tomekMembership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: tomek.id, workspaceId: pksWs.id } },
    });
    if (tomekMembership) {
      // Remove existing device grant and add location grant instead
      await prisma.accessGrant.deleteMany({ where: { membershipId: tomekMembership.id } });
      await prisma.accessGrant.create({
        data: { membershipId: tomekMembership.id, resourceType: 'LOCATION', resourceId: pksLublinLoc.id },
      });
    }
  }

  // Helper for scoped requests
  async function scopeReq(endpoint: string, userEmail: string, wsId: string) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) return { status: 0, body: null as any };
    const token = signAccessToken({
      userId: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin,
    });
    const r = await fetch(`http://localhost:3999${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': wsId },
    });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  }

  // ── FULL scope user (Adrian) — sees everything ──────────────────

  // Adrian has FULL membership in PKS workspace (MSP_ASSIGNED)
  const f1 = await scopeReq('/test/devices', 'adrian@silers.pl', pksWs!.id);
  check('1C: FULL user → devices list returns data', f1.status === 200 && f1.body?.data?.length > 0, `status=${f1.status} count=${f1.body?.data?.length}`);

  const f2 = await scopeReq('/test/locations', 'adrian@silers.pl', pksWs!.id);
  check('1C: FULL user → locations list returns data', f2.status === 200 && f2.body?.data?.length > 0);

  // ── SCOPED user with DEVICE grant (Piotr) — only SRV-PRODDB ────

  if (pksWs) {
    const srvDevice = await prisma.device.findFirst({ where: { hostname: 'srv-proddb' } });

    const s1 = await scopeReq('/test/devices', 'piotr@informice.pl', pksWs.id);
    check('1C: SCOPED(DEVICE) → device list filtered',
      s1.status === 200 && s1.body?.data?.length === 1,
      `count=${s1.body?.data?.length}`
    );
    check('1C: SCOPED(DEVICE) → only SRV-PRODDB',
      s1.body?.data?.[0]?.hostname === 'srv-proddb'
    );

    // Detail: accessible device
    if (srvDevice) {
      const s2 = await scopeReq(`/test/devices/${srvDevice.id}`, 'piotr@informice.pl', pksWs.id);
      check('1C: SCOPED(DEVICE) → detail of granted device = 200', s2.status === 200);
    }

    // Detail: non-accessible device
    const otherDevice = await prisma.device.findFirst({ where: { hostname: 'pc-anna' } });
    if (otherDevice) {
      const s3 = await scopeReq(`/test/devices/${otherDevice.id}`, 'piotr@informice.pl', pksWs.id);
      check('1C: SCOPED(DEVICE) → detail of non-granted device = 403', s3.status === 403);
    }

    // Locations: Piotr has only DEVICE grant, no LOCATION → empty locations
    const s4 = await scopeReq('/test/locations', 'piotr@informice.pl', pksWs.id);
    check('1C: SCOPED(DEVICE only) → locations list empty',
      s4.status === 200 && s4.body?.data?.length === 0,
      `count=${s4.body?.data?.length}`
    );
  }

  // ── SCOPED user with LOCATION grant (Tomek) — Lublin location ──

  if (pksWs && pksLublinLoc) {
    const t1 = await scopeReq('/test/locations', 'tomek@informice.pl', pksWs.id);
    check('1C: SCOPED(LOCATION) → locations list = 1',
      t1.status === 200 && t1.body?.data?.length === 1,
      `count=${t1.body?.data?.length}`
    );
    check('1C: SCOPED(LOCATION) → only Lublin',
      t1.body?.data?.[0]?.name === 'Oddział Lublin'
    );

    // Devices: Tomek should see devices IN the Lublin location
    const t2 = await scopeReq('/test/devices', 'tomek@informice.pl', pksWs.id);
    check('1C: SCOPED(LOCATION) → devices in Lublin location',
      t2.status === 200 && t2.body?.data?.length === 1,
      `count=${t2.body?.data?.length}`
    );
    check('1C: SCOPED(LOCATION) → device is PC-LUBLIN-01',
      t2.body?.data?.[0]?.hostname === 'pc-lublin-01'
    );

    // Location detail: accessible
    const t3 = await scopeReq(`/test/locations/${pksLublinLoc.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C: SCOPED(LOCATION) → detail of granted location = 200', t3.status === 200);

    // Location detail: non-accessible
    const pksHQ = await prisma.location.findFirst({ where: { name: 'Główna siedziba' } });
    if (pksHQ) {
      const t4 = await scopeReq(`/test/locations/${pksHQ.id}`, 'tomek@informice.pl', pksWs.id);
      check('1C: SCOPED(LOCATION) → detail of non-granted location = 403', t4.status === 403);
    }

    // Device detail: device in granted location
    const lublinDevice = await prisma.device.findFirst({ where: { hostname: 'pc-lublin-01' } });
    if (lublinDevice) {
      const t5 = await scopeReq(`/test/devices/${lublinDevice.id}`, 'tomek@informice.pl', pksWs.id);
      check('1C: SCOPED(LOCATION) → device detail in granted location = 200', t5.status === 200);
    }

    // Device detail: device NOT in granted location
    const srvDevice = await prisma.device.findFirst({ where: { hostname: 'srv-proddb' } });
    if (srvDevice) {
      const t6 = await scopeReq(`/test/devices/${srvDevice.id}`, 'tomek@informice.pl', pksWs.id);
      check('1C: SCOPED(LOCATION) → device detail NOT in granted location = 403', t6.status === 403);
    }
  }

  // ── SCOPED user with NO grants (edge case) ──────────────────────

  // Create a membership with SCOPED but no grants
  const noGrantUser = await prisma.user.findUnique({ where: { email: 'marek@silers.pl' } });
  if (noGrantUser && pksWs) {
    // Create temp SCOPED membership for marek in PKS workspace
    const tempMembership = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id,
        workspaceId: pksWs.id,
        role: 'VIEWER',
        scopeType: 'SCOPED',
        source: 'MSP_ASSIGNED',
        status: 'ACTIVE',
      },
    });

    const ng1 = await scopeReq('/test/devices', 'marek@silers.pl', pksWs.id);
    check('1C: SCOPED(no grants) → devices list empty',
      ng1.status === 200 && ng1.body?.data?.length === 0,
      `count=${ng1.body?.data?.length}`
    );

    const ng2 = await scopeReq('/test/locations', 'marek@silers.pl', pksWs.id);
    check('1C: SCOPED(no grants) → locations list empty',
      ng2.status === 200 && ng2.body?.data?.length === 0,
      `count=${ng2.body?.data?.length}`
    );

    // Cleanup
    await prisma.workspaceMembership.delete({ where: { id: tempMembership.id } });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1C.2 — enforceScope Ticket
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1C.2: enforceScope (Ticket) ---');

  // Test data recap:
  // Ticket INF-2026-0001: clientId=PKS, locationId=PKS_HQ, deviceId=SRV-PRODDB → Piotr has DEVICE grant for SRV-PRODDB
  // Ticket INF-2026-0002: clientId=Szkoła, locationId=Szkoła, deviceId=null → neither partner has access
  // Ticket T-0001: clientId=orphan, no tenant → edge case

  // We also need a ticket in Lublin location (for Tomek's LOCATION grant)
  const lublinTicket = await prisma.ticket.create({
    data: {
      workspaceId: pksWs!.id,
      locationId: pksLublinLoc!.id,
      createdByUserId: adrian!.id,
      ticketNumber: 'INF-2026-0003',
      title: 'Drukarka w Lublinie nie drukuje',
      description: 'Test ticket in Lublin location',
      status: 'PENDING',
      priority: 'LOW',
      type: 'INCIDENT',
      source: 'INTERNAL',
    },
  });

  // Also create a ticket linked to SRV-PRODDB but in HQ location (for Piotr's device grant test via device.locationId)
  const srvDevice = await prisma.device.findFirst({ where: { hostname: 'srv-proddb' } });

  // ── FULL user (Adrian) → sees all tickets ───────────────────────

  const ft1 = await scopeReq('/test/tickets', 'adrian@silers.pl', pksWs!.id);
  check('1C.2: FULL → tickets list returns data', ft1.status === 200 && ft1.body?.data?.length >= 2, `count=${ft1.body?.data?.length}`);

  // ── SCOPED DEVICE (Piotr: SRV-PRODDB) → only ticket for that device

  if (pksWs) {
    const st1 = await scopeReq('/test/tickets', 'piotr@informice.pl', pksWs.id);
    check('1C.2: SCOPED(DEVICE) → tickets list filtered',
      st1.status === 200 && st1.body?.data?.length === 1,
      `count=${st1.body?.data?.length}`
    );
    check('1C.2: SCOPED(DEVICE) → only SRV-PRODDB ticket',
      st1.body?.data?.[0]?.ticketNumber === 'INF-2026-0001'
    );

    // Detail: ticket with granted device = 200
    const ticket1 = await prisma.ticket.findUnique({ where: { ticketNumber: 'INF-2026-0001' } });
    if (ticket1) {
      const st2 = await scopeReq(`/test/tickets/${ticket1.id}`, 'piotr@informice.pl', pksWs.id);
      check('1C.2: SCOPED(DEVICE) → detail of device-linked ticket = 200', st2.status === 200);
    }

    // Detail: ticket without granted device = 403
    const ticket2 = await prisma.ticket.findUnique({ where: { ticketNumber: 'INF-2026-0002' } });
    if (ticket2) {
      const st3 = await scopeReq(`/test/tickets/${ticket2.id}`, 'piotr@informice.pl', pksWs.id);
      check('1C.2: SCOPED(DEVICE) → detail of unrelated ticket = 403', st3.status === 403);
    }
  }

  // ── SCOPED LOCATION (Tomek: Lublin) → ticket in Lublin location

  if (pksWs) {
    const lt1 = await scopeReq('/test/tickets', 'tomek@informice.pl', pksWs.id);
    check('1C.2: SCOPED(LOCATION) → tickets in Lublin',
      lt1.status === 200 && lt1.body?.data?.length >= 1,
      `count=${lt1.body?.data?.length}`
    );
    check('1C.2: SCOPED(LOCATION) → ticket is Lublin ticket',
      lt1.body?.data?.[0]?.ticketNumber === 'INF-2026-0003'
    );

    // Detail: ticket in granted location = 200
    const lt2 = await scopeReq(`/test/tickets/${lublinTicket.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C.2: SCOPED(LOCATION) → detail of location-linked ticket = 200', lt2.status === 200);

    // Detail: ticket in non-granted location = 403
    const ticket1 = await prisma.ticket.findUnique({ where: { ticketNumber: 'INF-2026-0001' } });
    if (ticket1) {
      const lt3 = await scopeReq(`/test/tickets/${ticket1.id}`, 'tomek@informice.pl', pksWs.id);
      check('1C.2: SCOPED(LOCATION) → detail of non-granted location ticket = 403', lt3.status === 403);
    }
  }

  // ── SCOPED no grants (Marek temp) → empty ──────────────────────

  if (noGrantUser && pksWs) {
    const tempMembership2 = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id,
        workspaceId: pksWs.id,
        role: 'VIEWER',
        scopeType: 'SCOPED',
        source: 'MSP_ASSIGNED',
        status: 'ACTIVE',
      },
    });

    const ngt1 = await scopeReq('/test/tickets', 'marek@silers.pl', pksWs.id);
    check('1C.2: SCOPED(no grants) → tickets list empty',
      ngt1.status === 200 && ngt1.body?.data?.length === 0,
      `count=${ngt1.body?.data?.length}`
    );

    await prisma.workspaceMembership.delete({ where: { id: tempMembership2.id } });
  }

  // ── Ticket without deviceId/locationId in SCOPED → not visible ──
  // T-0001 has clientId=orphan, locationId=PKS_HQ (from test data) but let's create one truly without
  const pksClientWs = pksWs;
  const noDeviceTicket = await prisma.ticket.create({
    data: {
      workspaceId: pksClientWs!.id,
      locationId: (await prisma.location.findFirst({ where: { name: 'Główna siedziba' } }))!.id,
      createdByUserId: adrian!.id,
      ticketNumber: 'INF-2026-0099',
      title: 'Ticket w HQ bez device',
      description: 'No device, location=HQ (not granted to Piotr or Tomek)',
      status: 'PENDING',
      priority: 'LOW',
      type: 'OTHER',
      source: 'INTERNAL',
    },
  });

  if (pksWs) {
    // Piotr (DEVICE grant for SRV-PRODDB) should NOT see this ticket (it's in HQ location, not granted device)
    const ndt1 = await scopeReq(`/test/tickets/${noDeviceTicket.id}`, 'piotr@informice.pl', pksWs.id);
    check('1C.2: SCOPED(DEVICE) → ticket in non-granted location without device = 403', ndt1.status === 403);

    // Tomek (LOCATION grant for Lublin) should NOT see this ticket (it's in HQ, not Lublin)
    const ndt2 = await scopeReq(`/test/tickets/${noDeviceTicket.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C.2: SCOPED(LOCATION) → ticket in non-granted location = 403', ndt2.status === 403);
  }

  // Cleanup test tickets
  await prisma.ticket.delete({ where: { id: lublinTicket.id } }).catch(() => {});
  await prisma.ticket.delete({ where: { id: noDeviceTicket.id } }).catch(() => {});

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1C.3 — enforceScope WorkSession
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1C.3: enforceScope (WorkSession) ---');

  // Create test sessions
  const silersWs = await prisma.workspace.findUnique({ where: { slug: 'silers' } });
  const pksWsId = pksWs!.id;
  const srvDev = await prisma.device.findFirst({ where: { hostname: 'srv-proddb' } });
  const lublinDev = await prisma.device.findFirst({ where: { hostname: 'pc-lublin-01' } });
  const pksHQLoc = await prisma.location.findFirst({ where: { name: 'Główna siedziba' } });
  const ticket1 = await prisma.ticket.findUnique({ where: { ticketNumber: 'INF-2026-0001' } });

  // Session 1: on SRV-PRODDB (Piotr has DEVICE grant)
  const sess1 = await prisma.workSession.create({
    data: {
      workspaceId: pksWsId, techId: ewa!.id,
      deviceId: srvDev!.id, locationId: pksHQLoc!.id,
      status: 'COMPLETED', startedAt: new Date(), endedAt: new Date(),
    },
  });

  // Session 2: in Lublin location (Tomek has LOCATION grant)
  const sess2 = await prisma.workSession.create({
    data: {
      workspaceId: pksWsId, techId: ewa!.id,
      deviceId: lublinDev!.id, locationId: pksLublinLoc!.id,
      status: 'COMPLETED', startedAt: new Date(), endedAt: new Date(),
    },
  });

  // Session 3: linked to ticket INF-2026-0001 (which has SRV-PRODDB → Piotr grant)
  const sess3 = await prisma.workSession.create({
    data: {
      workspaceId: pksWsId, techId: ewa!.id,
      ticketId: ticket1!.id, locationId: pksHQLoc!.id,
      status: 'ACTIVE', startedAt: new Date(),
    },
  });

  // Session 4: no device, no ticket, in HQ (no one has scope for this)
  const sess4 = await prisma.workSession.create({
    data: {
      workspaceId: pksWsId, techId: ewa!.id,
      locationId: pksHQLoc!.id,
      status: 'COMPLETED', startedAt: new Date(), endedAt: new Date(),
    },
  });

  // ── FULL (Adrian) — sees all ────────────────────────────────────

  const ws1 = await scopeReq('/test/sessions', 'adrian@silers.pl', pksWs!.id);
  check('1C.3: FULL → sessions list returns data',
    ws1.status === 200 && ws1.body?.data?.length >= 4,
    `count=${ws1.body?.data?.length}`
  );

  // ── SCOPED DEVICE (Piotr: SRV-PRODDB) ──────────────────────────

  if (pksWs) {
    const ps1 = await scopeReq('/test/sessions', 'piotr@informice.pl', pksWs.id);
    // Should see: sess1 (deviceId=SRV-PRODDB) + sess3 (ticket has SRV-PRODDB)
    check('1C.3: SCOPED(DEVICE) → sessions filtered',
      ps1.status === 200 && ps1.body?.data?.length === 2,
      `count=${ps1.body?.data?.length}`
    );

    // Verify which sessions
    const sessionIds = (ps1.body?.data || []).map((s: any) => s.id);
    check('1C.3: SCOPED(DEVICE) → sess1 (direct device) visible', sessionIds.includes(sess1.id));
    check('1C.3: SCOPED(DEVICE) → sess3 (via ticket device) visible', sessionIds.includes(sess3.id));
    check('1C.3: SCOPED(DEVICE) → sess4 (no device) NOT visible', !sessionIds.includes(sess4.id));
  }

  // ── SCOPED LOCATION (Tomek: Lublin) ────────────────────────────

  if (pksWs) {
    const ts1 = await scopeReq('/test/sessions', 'tomek@informice.pl', pksWs.id);
    // Should see: sess2 (locationId=Lublin)
    check('1C.3: SCOPED(LOCATION) → sessions filtered',
      ts1.status === 200 && ts1.body?.data?.length === 1,
      `count=${ts1.body?.data?.length}`
    );
    check('1C.3: SCOPED(LOCATION) → sess2 (Lublin) visible',
      (ts1.body?.data || []).some((s: any) => s.id === sess2.id)
    );
  }

  // ── SCOPED no grants ───────────────────────────────────────────

  if (noGrantUser && pksWs) {
    const tempMembership3 = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id, workspaceId: pksWs.id,
        role: 'VIEWER', scopeType: 'SCOPED', source: 'MSP_ASSIGNED', status: 'ACTIVE',
      },
    });

    const ns1 = await scopeReq('/test/sessions', 'marek@silers.pl', pksWs.id);
    check('1C.3: SCOPED(no grants) → sessions empty',
      ns1.status === 200 && ns1.body?.data?.length === 0,
      `count=${ns1.body?.data?.length}`
    );

    await prisma.workspaceMembership.delete({ where: { id: tempMembership3.id } });
  }

  // Cleanup
  await prisma.workSession.deleteMany({ where: { id: { in: [sess1.id, sess2.id, sess3.id, sess4.id] } } });

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1C.4 — enforceScope Credential
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1C.4: enforceScope (Credential) ---');

  // Create test credentials
  const { encrypt } = require('../utils/crypto');

  // Cred1: on SRV-PRODDB (Piotr's DEVICE grant)
  const cred1 = await prisma.credential.create({
    data: {
      workspaceId: pksWsId,
      deviceId: srvDev!.id, locationId: pksHQLoc!.id,
      name: 'Admin serwera', category: 'SERVER',
      username: 'root', passwordEncrypted: encrypt('secret123'),
      createdByUserId: adrian!.id,
    },
  });

  // Cred2: in Lublin location (Tomek's LOCATION grant), no device
  const cred2 = await prisma.credential.create({
    data: {
      workspaceId: pksWsId,
      locationId: pksLublinLoc!.id,
      name: 'WiFi biuro Lublin', category: 'WIFI',
      username: 'guest', passwordEncrypted: encrypt('wifi1234'),
      createdByUserId: adrian!.id,
    },
  });

  // Cred3: on device in Lublin (Tomek's LOCATION grant covers it)
  const cred3 = await prisma.credential.create({
    data: {
      workspaceId: pksWsId,
      deviceId: lublinDev!.id, locationId: pksLublinLoc!.id,
      name: 'Login Lublin PC', category: 'WINDOWS',
      username: 'user', passwordEncrypted: encrypt('pass'),
      createdByUserId: adrian!.id,
    },
  });

  // Cred4: in HQ, no device (no scope for either partner)
  const cred4 = await prisma.credential.create({
    data: {
      workspaceId: pksWsId,
      locationId: pksHQLoc!.id,
      name: 'VPN centrala', category: 'VPN',
      username: 'vpnuser', passwordEncrypted: encrypt('vpnpass'),
      createdByUserId: adrian!.id,
    },
  });

  // Cred5: no device, no location (orphan — invisible in SCOPED)
  const cred5 = await prisma.credential.create({
    data: {
      workspaceId: pksWsId,
      name: 'Stary klucz API', category: 'OTHER',
      username: 'api', passwordEncrypted: encrypt('key'),
      createdByUserId: adrian!.id,
    },
  });

  // ── FULL (Adrian) → sees all ────────────────────────────────────

  const fc1 = await scopeReq('/test/credentials', 'adrian@silers.pl', pksWs!.id);
  check('1C.4: FULL → credentials list returns data',
    fc1.status === 200 && fc1.body?.data?.length >= 5,
    `count=${fc1.body?.data?.length}`
  );

  // ── SCOPED DEVICE (Piotr: SRV-PRODDB) ──────────────────────────

  if (pksWs) {
    const sc1 = await scopeReq('/test/credentials', 'piotr@informice.pl', pksWs.id);
    check('1C.4: SCOPED(DEVICE) → credentials filtered',
      sc1.status === 200 && sc1.body?.data?.length === 1,
      `count=${sc1.body?.data?.length}`
    );
    check('1C.4: SCOPED(DEVICE) → only server cred',
      sc1.body?.data?.[0]?.name === 'Admin serwera'
    );

    // Detail: granted
    const sc2 = await scopeReq(`/test/credentials/${cred1.id}`, 'piotr@informice.pl', pksWs.id);
    check('1C.4: SCOPED(DEVICE) → detail granted = 200', sc2.status === 200);

    // Detail: non-granted
    const sc3 = await scopeReq(`/test/credentials/${cred4.id}`, 'piotr@informice.pl', pksWs.id);
    check('1C.4: SCOPED(DEVICE) → detail non-granted = 403', sc3.status === 403);

    // Detail: orphan credential (no device/location)
    const sc4 = await scopeReq(`/test/credentials/${cred5.id}`, 'piotr@informice.pl', pksWs.id);
    check('1C.4: SCOPED(DEVICE) → orphan credential = 403', sc4.status === 403);
  }

  // ── SCOPED LOCATION (Tomek: Lublin) ────────────────────────────

  if (pksWs) {
    const lc1 = await scopeReq('/test/credentials', 'tomek@informice.pl', pksWs.id);
    // Should see: cred2 (locationId=Lublin) + cred3 (device in Lublin)
    check('1C.4: SCOPED(LOCATION) → credentials filtered',
      lc1.status === 200 && lc1.body?.data?.length === 2,
      `count=${lc1.body?.data?.length}`
    );

    // Detail: granted location cred
    const lc2 = await scopeReq(`/test/credentials/${cred2.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C.4: SCOPED(LOCATION) → detail of location cred = 200', lc2.status === 200);

    // Detail: granted device-in-location cred
    const lc3 = await scopeReq(`/test/credentials/${cred3.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C.4: SCOPED(LOCATION) → detail of device-in-location cred = 200', lc3.status === 200);

    // Detail: non-granted (HQ)
    const lc4 = await scopeReq(`/test/credentials/${cred1.id}`, 'tomek@informice.pl', pksWs.id);
    check('1C.4: SCOPED(LOCATION) → detail of HQ cred = 403', lc4.status === 403);
  }

  // ── SCOPED no grants → empty ───────────────────────────────────

  if (noGrantUser && pksWs) {
    const tempMembership4 = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id, workspaceId: pksWs.id,
        role: 'VIEWER', scopeType: 'SCOPED', source: 'MSP_ASSIGNED', status: 'ACTIVE',
      },
    });

    const nc1 = await scopeReq('/test/credentials', 'marek@silers.pl', pksWs.id);
    check('1C.4: SCOPED(no grants) → credentials empty',
      nc1.status === 200 && nc1.body?.data?.length === 0,
      `count=${nc1.body?.data?.length}`
    );

    await prisma.workspaceMembership.delete({ where: { id: tempMembership4.id } });
  }

  // Cleanup
  await prisma.credential.deleteMany({ where: { id: { in: [cred1.id, cred2.id, cred3.id, cred4.id, cred5.id] } } });

  // ═══════════════════════════════════════════════════════════════════
  //  ETAP 1C.5 — enforceScope Agent + Backup
  // ═══════════════════════════════════════════════════════════════════

  console.log('\n  --- Etap 1C.5: enforceScope (Agent + Backup) ---');

  // Test data: agents already exist from seed
  // - agent on SRV-PRODDB (Piotr DEVICE grant) — ACTIVE
  // - agent on PC-ANNA (no grant) — ACTIVE
  // - agent "unknown-device" (no deviceId, tenant fallback) — PENDING

  // Create a backup config on SRV-PRODDB's agent
  const srvAgent = await prisma.agentRegistration.findFirst({
    where: { hostname: 'srv-proddb', status: 'ACTIVE' },
  });
  const annaAgent = await prisma.agentRegistration.findFirst({
    where: { hostname: 'pc-anna', status: 'ACTIVE' },
  });

  let backup1Id: string | null = null;
  let backup2Id: string | null = null;

  if (srvAgent) {
    const b1 = await prisma.backupConfig.create({
      data: {
        workspaceId: pksWsId,
        agentRegId: srvAgent.id,
        name: 'DB Backup SRV-PRODDB', type: 'SQL_POSTGRES',
        cronSchedule: '0 2 * * *', retentionDays: 30,
      },
    });
    backup1Id = b1.id;
  }

  if (annaAgent) {
    const b2 = await prisma.backupConfig.create({
      data: {
        workspaceId: pksWsId,
        agentRegId: annaAgent.id,
        name: 'Backup PC Anna', type: 'FOLDER',
        cronSchedule: '0 3 * * *', retentionDays: 7,
      },
    });
    backup2Id = b2.id;
  }

  // ── AGENT: FULL (Adrian) ────────────────────────────────────────

  const ag1 = await scopeReq('/test/agents', 'adrian@silers.pl', pksWs!.id);
  check('1C.5: Agent FULL → list returns data',
    ag1.status === 200 && ag1.body?.length >= 1,
    `count=${ag1.body?.length}`
  );

  // ── AGENT: SCOPED DEVICE (Piotr: SRV-PRODDB) ───────────────────

  if (pksWs) {
    const ag2 = await scopeReq('/test/agents', 'piotr@informice.pl', pksWs.id);
    check('1C.5: Agent SCOPED(DEVICE) → filtered',
      ag2.status === 200 && ag2.body?.length === 1,
      `count=${ag2.body?.length}`
    );
    check('1C.5: Agent SCOPED(DEVICE) → only srv-proddb',
      ag2.body?.[0]?.hostname === 'srv-proddb'
    );
  }

  // ── AGENT: SCOPED LOCATION (Tomek: Lublin) ─────────────────────
  // PC-LUBLIN-01 is in Lublin location — its agent doesn't exist in seed data,
  // so Tomek should see 0 agents (no agent registered for Lublin devices)

  if (pksWs) {
    const ag3 = await scopeReq('/test/agents', 'tomek@informice.pl', pksWs.id);
    check('1C.5: Agent SCOPED(LOCATION) → filtered (0 agents in Lublin)',
      ag3.status === 200 && ag3.body?.length === 0,
      `count=${ag3.body?.length}`
    );
  }

  // ── AGENT: SCOPED no grants ─────────────────────────────────────

  if (noGrantUser && pksWs) {
    const tmpM = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id, workspaceId: pksWs.id,
        role: 'VIEWER', scopeType: 'SCOPED', source: 'MSP_ASSIGNED', status: 'ACTIVE',
      },
    });
    const ag4 = await scopeReq('/test/agents', 'marek@silers.pl', pksWs.id);
    check('1C.5: Agent SCOPED(no grants) → empty',
      ag4.status === 200 && ag4.body?.length === 0,
      `count=${ag4.body?.length}`
    );
    await prisma.workspaceMembership.delete({ where: { id: tmpM.id } });
  }

  // ── BACKUP: FULL (Adrian) ───────────────────────────────────────

  const bk1 = await scopeReq('/test/backups', 'adrian@silers.pl', pksWs!.id);
  check('1C.5: Backup FULL → list returns data',
    bk1.status === 200 && bk1.body?.length >= 2,
    `count=${bk1.body?.length}`
  );

  // ── BACKUP: SCOPED DEVICE (Piotr: SRV-PRODDB) ──────────────────

  if (pksWs) {
    const bk2 = await scopeReq('/test/backups', 'piotr@informice.pl', pksWs.id);
    check('1C.5: Backup SCOPED(DEVICE) → filtered',
      bk2.status === 200 && bk2.body?.length === 1,
      `count=${bk2.body?.length}`
    );
    check('1C.5: Backup SCOPED(DEVICE) → only SRV backup',
      bk2.body?.[0]?.name === 'DB Backup SRV-PRODDB'
    );

    // Detail: granted
    if (backup1Id) {
      const bk3 = await scopeReq(`/test/backups/${backup1Id}`, 'piotr@informice.pl', pksWs.id);
      check('1C.5: Backup SCOPED(DEVICE) → detail granted = 200', bk3.status === 200);
    }

    // Detail: non-granted
    if (backup2Id) {
      const bk4 = await scopeReq(`/test/backups/${backup2Id}`, 'piotr@informice.pl', pksWs.id);
      check('1C.5: Backup SCOPED(DEVICE) → detail non-granted = 403', bk4.status === 403);
    }
  }

  // ── BACKUP: SCOPED no grants ────────────────────────────────────

  if (noGrantUser && pksWs) {
    const tmpM2 = await prisma.workspaceMembership.create({
      data: {
        userId: noGrantUser.id, workspaceId: pksWs.id,
        role: 'VIEWER', scopeType: 'SCOPED', source: 'MSP_ASSIGNED', status: 'ACTIVE',
      },
    });
    const bk5 = await scopeReq('/test/backups', 'marek@silers.pl', pksWs.id);
    check('1C.5: Backup SCOPED(no grants) → empty',
      bk5.status === 200 && bk5.body?.length === 0,
      `count=${bk5.body?.length}`
    );
    await prisma.workspaceMembership.delete({ where: { id: tmpM2.id } });
  }

  // Cleanup
  if (backup1Id) await prisma.backupConfig.delete({ where: { id: backup1Id } }).catch(() => {});
  if (backup2Id) await prisma.backupConfig.delete({ where: { id: backup2Id } }).catch(() => {});

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
}

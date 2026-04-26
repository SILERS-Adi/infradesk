import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';
import { registerWithWorkspace, seedLocation } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

async function seedDevice(token: string, locationId: string, name = 'srv-test') {
  const r = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${token}`)
    .send({ name, locationId, category: 'SERVER' });
  return r.body.device.id as string;
}

describe('Monitoring alerts', () => {
  it('creates alert and auto-creates ticket on CRITICAL', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const deviceId = await seedDevice(owner.accessToken, loc.id);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const res = await request(app).post('/api/v2/monitoring/alerts').set(auth)
      .send({ deviceId, type: 'disk_failing', severity: 'CRITICAL', message: 'Dysk C: SMART warning' });
    expect(res.status).toBe(201);
    expect(res.body.alert.ticketId).toBeDefined();
    expect(res.body.deduped).toBe(false);

    const tickets = await testDb.ticket.findMany({ where: { deviceId }, select: { status: true, priority: true, source: true } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.priority).toBe('CRITICAL');
    expect(tickets[0]!.source).toBe('AGENT');
  });

  it('dedupes same alert within window', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const deviceId = await seedDevice(owner.accessToken, loc.id);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const a = await request(app).post('/api/v2/monitoring/alerts').set(auth)
      .send({ deviceId, type: 'service_down', severity: 'HIGH', message: 'apache2 down' });
    const b = await request(app).post('/api/v2/monitoring/alerts').set(auth)
      .send({ deviceId, type: 'service_down', severity: 'HIGH', message: 'apache2 down (still)' });
    expect(a.body.alert.id).toBe(b.body.alert.id);
    expect(b.body.deduped).toBe(true);

    const count = await testDb.monitoringAlert.count({ where: { deviceId, type: 'service_down' } });
    expect(count).toBe(1);
  });

  it('resolve marks alert resolved with reason', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const deviceId = await seedDevice(owner.accessToken, loc.id);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const created = await request(app).post('/api/v2/monitoring/alerts').set(auth)
      .send({ deviceId, type: 'ping_lost', severity: 'MEDIUM', message: 'no ping' });
    const id = created.body.alert.id;
    const res = await request(app).post(`/api/v2/monitoring/alerts/${id}/resolve`).set(auth)
      .send({ autoResolveReason: 'ping restored' });
    expect(res.status).toBe(200);
    expect(res.body.alert.resolved).toBe(true);
    expect(res.body.alert.autoResolveReason).toBe('ping restored');
  });
});

describe('Vault credentials', () => {
  it('create + list + reveal with audit log', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const create = await request(app).post('/api/v2/vault').set(auth).send({
      name: 'Router office',
      category: 'ROUTER',
      username: 'admin',
      password: 'super-secret!Passw0rd',
      urlOrHost: '192.168.1.1',
    });
    expect(create.status).toBe(201);
    expect(create.body.credential.password).toBeUndefined();

    const list = await request(app).get('/api/v2/vault').set(auth);
    expect(list.body.credentials).toHaveLength(1);
    expect(list.body.credentials[0].password).toBeUndefined();

    const reveal = await request(app).post(`/api/v2/vault/${create.body.credential.id}/reveal`).set(auth)
      .send({ reason: 'Need for customer support' });
    expect(reveal.status).toBe(200);
    expect(reveal.body.password).toBe('super-secret!Passw0rd');

    const audit = await request(app).get(`/api/v2/vault/${create.body.credential.id}/audit`).set(auth);
    expect(audit.body.logs).toHaveLength(1);
    expect(audit.body.logs[0].reason).toBe('Need for customer support');
  });

  it('MEMBER cannot view credentials by default (VAULT=NONE)', async () => {
    const owner = await registerWithWorkspace(app);
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    await request(app).post('/api/v2/vault').set(ownerAuth).send({
      name: 'Secret', category: 'OTHER', password: 'pw', username: 'u',
    });

    // Invite a MEMBER (they get no VAULT access by default).
    const member = await registerWithWorkspace(app);
    // Create a second user as MEMBER in owner's workspace via direct DB.
    await testDb.membership.create({
      data: { userId: member.userId, workspaceId: owner.workspaceId, role: 'MEMBER', scope: 'FULL', status: 'ACTIVE' },
    });
    // Re-login to refresh token with the new membership context.
    const newTokenRes = await request(app).post('/api/v2/auth/login').send({
      email: member.email, password: 'Silers!Test2026',
    });
    // Force-select the owner's workspace via header.
    const memberAuth = { Authorization: `Bearer ${newTokenRes.body.accessToken}`, 'X-Workspace-Id': owner.workspaceId };

    const list = await request(app).get('/api/v2/vault').set(memberAuth);
    expect(list.status).toBe(403);
  });

  it('password rotation bumps lastRotatedAt', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const c = await request(app).post('/api/v2/vault').set(auth).send({
      name: 'Rotate me', category: 'OTHER', password: 'old', username: 'u',
    });
    const patch = await request(app).patch(`/api/v2/vault/${c.body.credential.id}`).set(auth).send({ password: 'new-password-123' });
    expect(patch.status).toBe(200);
    expect(patch.body.credential.lastRotatedAt).toBeDefined();

    const reveal = await request(app).post(`/api/v2/vault/${c.body.credential.id}/reveal`).set(auth).send({});
    expect(reveal.body.password).toBe('new-password-123');
  });
});

describe('Agent registration + approve', () => {
  it('register (PENDING) → approve creates Device + flips ACTIVE', async () => {
    const owner = await registerWithWorkspace(app);
    const workspace = await testDb.workspace.findUnique({ where: { id: owner.workspaceId } });
    const loc = await seedLocation(owner.workspaceId);

    const reg = await request(app).post('/api/v2/agents/register').send({
      workspaceSlug: workspace!.slug,
      hostname: 'LAPTOP-A',
      agentVersion: '4.14.6',
      manufacturer: 'Dell',
      model: 'Latitude 5530',
      serialNumber: 'SN123',
      osName: 'Windows',
      osVersion: '11',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.status).toBe('PENDING');
    expect(reg.body.agentToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const approve = await request(app).post(`/api/v2/agents/admin/${reg.body.registrationId}/approve`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ locationId: loc.id, deviceName: 'laptop-a', category: 'WORKSTATION' });
    expect(approve.status).toBe(200);
    expect(approve.body.agent.status).toBe('ACTIVE');
    expect(approve.body.agent.deviceId).toBeDefined();

    const device = await testDb.device.findUnique({ where: { id: approve.body.agent.deviceId } });
    expect(device?.name).toBe('laptop-a');
    expect(device?.serialNumber).toBe('SN123');
  });

  it('register is idempotent on (hostname, serialNumber)', async () => {
    const owner = await registerWithWorkspace(app);
    const workspace = await testDb.workspace.findUnique({ where: { id: owner.workspaceId } });
    const body = { workspaceSlug: workspace!.slug, hostname: 'SAME-HOST', serialNumber: 'SAMESN' };
    const a = await request(app).post('/api/v2/agents/register').send(body);
    const b = await request(app).post('/api/v2/agents/register').send(body);
    expect(a.body.registrationId).toBe(b.body.registrationId);
    expect(b.body.reused).toBe(true);
  });

  it('telemetry requires ACTIVE status', async () => {
    const owner = await registerWithWorkspace(app);
    const workspace = await testDb.workspace.findUnique({ where: { id: owner.workspaceId } });
    const reg = await request(app).post('/api/v2/agents/register').send({
      workspaceSlug: workspace!.slug, hostname: 'NEW-AGENT',
    });
    const res = await request(app).post('/api/v2/agents/telemetry')
      .set('Authorization', `Bearer ${reg.body.agentToken}`)
      .send({ metrics: { cpu: 12 } });
    expect(res.status).toBe(403);
  });
});

import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';
import { registerWithWorkspace, seedLocation } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

async function seedDevice(token: string, locationId: string, overrides: { name?: string; criticality?: string } = {}) {
  const r = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${token}`).send({
    name: overrides.name ?? 'srv-test',
    locationId,
    category: 'SERVER',
    criticality: overrides.criticality ?? 'MEDIUM',
  });
  return r.body.device.id as string;
}

describe('Shadow Mode AI', () => {
  it('record + resolve matches, weekly report shows accuracy', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    // Record three decisions — one unresolved, one match, one mismatch.
    const r1 = await request(app).post('/api/v2/ai/shadow/record').set(auth).send({
      feature: 'ticket_classify', input: { subject: 'Drukarka' }, aiOutput: { category: 'hardware' }, estimatedValuePln: 5,
    });
    const r2 = await request(app).post('/api/v2/ai/shadow/record').set(auth).send({
      feature: 'ticket_classify', input: { subject: 'VPN' }, aiOutput: { category: 'network' }, estimatedValuePln: 5,
    });
    await request(app).post('/api/v2/ai/shadow/record').set(auth).send({
      feature: 'ticket_classify', input: { subject: 'Outlook' }, aiOutput: { category: 'email' }, estimatedValuePln: 5,
    });
    expect(r1.status).toBe(201);

    await request(app).post(`/api/v2/ai/shadow/${r1.body.id}/resolve`).set(auth)
      .send({ humanOutput: { category: 'hardware' } });      // match
    await request(app).post(`/api/v2/ai/shadow/${r2.body.id}/resolve`).set(auth)
      .send({ humanOutput: { category: 'software' } });      // mismatch
    // r3 left unresolved.

    const report = await request(app).get('/api/v2/ai/shadow/report?days=1').set(auth);
    expect(report.status).toBe(200);
    const featureReport = report.body.features.find((f: { feature: string }) => f.feature === 'ticket_classify');
    expect(featureReport.total).toBe(3);
    expect(featureReport.resolved).toBe(2);
    expect(featureReport.matched).toBe(1);
    expect(featureReport.accuracy).toBeCloseTo(0.5, 2);
    expect(featureReport.readyForAutoApply).toBe(false); // not enough samples
    expect(report.body.totalSavingsPln).toBeGreaterThan(0);
  });

  it('resolve is idempotent (second call is no-op)', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const rec = await request(app).post('/api/v2/ai/shadow/record').set(auth).send({
      feature: 'auto_resolve', input: { ticketId: 't1' }, aiOutput: { action: 'close' },
    });
    const a = await request(app).post(`/api/v2/ai/shadow/${rec.body.id}/resolve`).set(auth).send({ humanOutput: { action: 'close' } });
    const b = await request(app).post(`/api/v2/ai/shadow/${rec.body.id}/resolve`).set(auth).send({ humanOutput: { action: 'keep' } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const row = await testDb.shadowDecision.findUnique({ where: { id: rec.body.id } });
    expect(row?.matched).toBe(true); // first resolve wins
  });
});

describe('Client Risk Score', () => {
  it('computes baseline score for a client with no signals', async () => {
    const owner = await registerWithWorkspace(app);
    const res = await request(app).get(`/api/v2/clients/risk/${owner.workspaceId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.factors).toContain('Brak sygnałów ryzyka — klient stabilny');
  });

  it('raises score when there are CRITICAL open tickets and CRITICAL devices without agent', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const loc = await seedLocation(owner.workspaceId);
    // Seed a CRITICAL device without agent.
    await seedDevice(owner.accessToken, loc.id, { name: 'srv-prod-01', criticality: 'CRITICAL' });
    // Seed a few open CRITICAL tickets.
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v2/tickets').set(auth).send({
        title: `Krytyczny problem ${i}`, description: 'opis', priority: 'CRITICAL', source: 'MANUAL',
      });
    }

    const res = await request(app).get(`/api/v2/clients/risk/${owner.workspaceId}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.factors.some((f: string) => /CRITICAL/.test(f))).toBe(true);
  });

  it('persists score via /recompute and tracks history', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const persist = await request(app).post('/api/v2/clients/risk/recompute').set(auth)
      .send({ clientWorkspaceId: owner.workspaceId });
    expect(persist.status).toBe(200);
    expect(typeof persist.body.score).toBe('number');

    const hist = await request(app).get(`/api/v2/clients/risk/${owner.workspaceId}/history?days=30`).set(auth);
    expect(hist.status).toBe(200);
    expect(hist.body.history.length).toBeGreaterThanOrEqual(1);
  });

  it('recompute requires relation with client workspace', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);
    const res = await request(app).post('/api/v2/clients/risk/recompute')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ clientWorkspaceId: b.workspaceId });
    expect(res.status).toBe(403);
  });
});

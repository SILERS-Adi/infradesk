import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';
import { registerWithWorkspace, seedLocation } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

async function makeTicket(token: string): Promise<string> {
  const r = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Session ticket', description: 'detail', source: 'MANUAL' });
  if (!r.body.ticket) throw new Error(`makeTicket failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.ticket.id;
}

describe('WorkSessions', () => {
  it('start → pause → resume → end lifecycle', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const dev = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'srv-01', locationId: loc.id, category: 'SERVER' });
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const start = await request(app).post('/api/v2/sessions/start').set(auth)
      .send({ deviceId: dev.body.device.id, serviceMode: 'REMOTE' });
    expect(start.status).toBe(201);
    const sid = start.body.session.id;
    expect(start.body.session.status).toBe('ACTIVE');

    const pause = await request(app).post(`/api/v2/sessions/${sid}/pause`).set(auth);
    expect(pause.status).toBe(200);
    expect(pause.body.session.status).toBe('PAUSED');

    const resume = await request(app).post(`/api/v2/sessions/${sid}/resume`).set(auth);
    expect(resume.body.session.status).toBe('ACTIVE');

    const end = await request(app).post(`/api/v2/sessions/${sid}/end`).set(auth).send({ notes: 'fixed' });
    expect(end.status).toBe(200);
    expect(end.body.session.status).toBe('COMPLETED');
    expect(end.body.session.endedAt).toBeDefined();
  });

  it('rejects a second active session for same technician', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const first = await request(app).post('/api/v2/sessions/start').set(auth).send({ serviceMode: 'REMOTE' });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v2/sessions/start').set(auth).send({ serviceMode: 'REMOTE' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('session_active');
  });

  it('links tickets at start and moves them to IN_PROGRESS', async () => {
    const owner = await registerWithWorkspace(app);
    const ticketId = await makeTicket(owner.accessToken);
    const start = await request(app).post('/api/v2/sessions/start')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ serviceMode: 'REMOTE', ticketIds: [ticketId] });
    expect(start.status).toBe(201);
    const t = await testDb.ticket.findUnique({ where: { id: ticketId }, select: { status: true } });
    expect(t?.status).toBe('IN_PROGRESS');
  });

  it('end with bulkCloseTicketIds transitions linked tickets to RESOLVED', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const t1 = await makeTicket(owner.accessToken);
    const t2 = await makeTicket(owner.accessToken);
    const start = await request(app).post('/api/v2/sessions/start').set(auth)
      .send({ serviceMode: 'REMOTE', ticketIds: [t1, t2] });
    const sid = start.body.session.id;

    const end = await request(app).post(`/api/v2/sessions/${sid}/end`).set(auth)
      .send({ bulkCloseTicketIds: [t1, t2], bulkResolutionSummary: 'wszystko działa' });
    expect(end.status).toBe(200);

    const ticketA = await testDb.ticket.findUnique({ where: { id: t1 }, select: { status: true, resolutionSummary: true } });
    const ticketB = await testDb.ticket.findUnique({ where: { id: t2 }, select: { status: true } });
    expect(ticketA?.status).toBe('RESOLVED');
    expect(ticketA?.resolutionSummary).toBe('wszystko działa');
    expect(ticketB?.status).toBe('RESOLVED');
  });

  it('current endpoint returns active session or null', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const none = await request(app).get('/api/v2/sessions/current').set(auth);
    expect(none.body.session).toBeNull();
    await request(app).post('/api/v2/sessions/start').set(auth).send({ serviceMode: 'REMOTE' });
    const curr = await request(app).get('/api/v2/sessions/current').set(auth);
    expect(curr.body.session).not.toBeNull();
    expect(curr.body.session.status).toBe('ACTIVE');
  });
});

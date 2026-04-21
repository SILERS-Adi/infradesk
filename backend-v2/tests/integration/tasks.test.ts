import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';
import { registerWithWorkspace } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('Tasks module', () => {
  it('creates a task with auto-numbering', async () => {
    const owner = await registerWithWorkspace(app);
    const res = await request(app)
      .post('/api/v2/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Zainstalować drukarkę', priority: 'MEDIUM' });
    expect(res.status).toBe(201);
    expect(res.body.task.taskNumber).toMatch(/^TSK-\d{4}-0001$/);
    expect(res.body.task.status).toBe('NEW');
  });

  it('monotonic task numbers per workspace', async () => {
    const owner = await registerWithWorkspace(app);
    for (let i = 1; i <= 3; i++) {
      const res = await request(app).post('/api/v2/tasks').set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ title: `Zadanie ${i}`, priority: 'MEDIUM' });
      expect(res.body.task.taskNumber).toMatch(new RegExp(`-000${i}$`));
    }
  });

  it('status transition DONE stamps completedAt', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const create = await request(app).post('/api/v2/tasks').set(auth).send({ title: 'Zadanie', priority: 'HIGH' });
    const id = create.body.task.id;
    const done = await request(app).post(`/api/v2/tasks/${id}/status`).set(auth).send({ status: 'DONE' });
    expect(done.status).toBe(200);
    expect(done.body.task.status).toBe('DONE');
    expect(done.body.task.completedAt).toBeDefined();
  });

  it('filter by scheduled=today returns only today tasks', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const today = new Date(); today.setHours(14, 0, 0, 0);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await request(app).post('/api/v2/tasks').set(auth).send({ title: 'Dzisiejsze', scheduledAt: today.toISOString() });
    await request(app).post('/api/v2/tasks').set(auth).send({ title: 'Jutrzejsze', scheduledAt: tomorrow.toISOString() });
    await request(app).post('/api/v2/tasks').set(auth).send({ title: 'Bez terminu' });
    const list = await request(app).get('/api/v2/tasks?scheduled=today').set(auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toBe('Dzisiejsze');
  });

  it('links to ticket correctly', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const ticket = await request(app).post('/api/v2/tickets').set(auth)
      .send({ title: 'Parent ticket', description: 'opis', source: 'MANUAL' });
    const task = await request(app).post('/api/v2/tasks').set(auth)
      .send({ title: 'Subtask', linkedTicketId: ticket.body.ticket.id });
    expect(task.body.task.linkedTicketId).toBe(ticket.body.ticket.id);
    const row = await testDb.task.findUnique({ where: { id: task.body.task.id }, include: { linkedTicket: true } });
    expect(row?.linkedTicket?.id).toBe(ticket.body.ticket.id);
  });
});

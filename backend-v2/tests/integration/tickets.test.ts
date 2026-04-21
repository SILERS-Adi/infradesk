import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect } from '../helpers/db';
import { registerWithWorkspace, seedLocation } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

async function setup() {
  const owner = await registerWithWorkspace(app);
  const location = await seedLocation(owner.workspaceId);
  return { owner, location };
}

describe('Tickets — create + list + detail', () => {
  it('creates a ticket with next ticket number', async () => {
    const { owner } = await setup();
    const res = await request(app)
      .post('/api/v2/tickets')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Drukarka nie drukuje', description: 'Brak papieru?', priority: 'MEDIUM', source: 'MANUAL' });
    expect(res.status).toBe(201);
    expect(res.body.ticket.ticketNumber).toMatch(/^T-\d{4}-0001$/);
    expect(res.body.ticket.status).toBe('OPEN');
    expect(res.body.ticket.priority).toBe('MEDIUM');
  });

  it('monotonic ticket numbers per workspace', async () => {
    const { owner } = await setup();
    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post('/api/v2/tickets')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ title: `Ticket ${i}`, description: 'xxx', source: 'MANUAL' });
      if (res.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('[tickets.monotonic] failed', res.status, res.body);
      }
      expect(res.status).toBe(201);
      expect(res.body.ticket.ticketNumber).toMatch(new RegExp(`^T-\\d{4}-000${i}$`));
    }
  });

  it('separate numbering between workspaces', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);
    const r1 = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ title: 'Ticket A', description: 'xxx', source: 'MANUAL' });
    const r2 = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${b.accessToken}`)
      .send({ title: 'Ticket B', description: 'yyy', source: 'MANUAL' });
    expect(r1.body.ticket.ticketNumber).toMatch(/-0001$/);
    expect(r2.body.ticket.ticketNumber).toMatch(/-0001$/);
  });

  it('ASSIGNED status when assignee provided at create', async () => {
    const { owner } = await setup();
    const res = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Assign me', description: 'body', assignedToUserId: owner.userId, source: 'MANUAL' });
    expect(res.body.ticket.status).toBe('ASSIGNED');
    expect(res.body.ticket.assignedToUserId).toBe(owner.userId);
  });

  it('lists tickets with pagination', async () => {
    const { owner } = await setup();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ title: `Paging ticket ${i}`, description: 'xxx', source: 'MANUAL' });
    }
    const list = await request(app).get('/api/v2/tickets?limit=2').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.nextCursor).toBeDefined();
  });

  it('rejects cross-workspace ticket read (enforced by workspaceId scope)', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);
    const created = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ title: 'Secret ticket', description: 'body', source: 'MANUAL' });
    const ticketId = created.body.ticket.id;
    const leak = await request(app).get(`/api/v2/tickets/${ticketId}`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(leak.status).toBe(404);
  });
});

describe('Tickets — transitions + state machine', () => {
  async function createTicket(token: string) {
    const res = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test ticket', description: 'details', source: 'MANUAL' });
    return res.body.ticket.id as string;
  }

  it('legal transition OPEN → ASSIGNED → IN_PROGRESS → RESOLVED', async () => {
    const { owner } = await setup();
    const id = await createTicket(owner.accessToken);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    expect((await request(app).post(`/api/v2/tickets/${id}/transition`).set(auth).send({ to: 'ASSIGNED' })).status).toBe(200);
    expect((await request(app).post(`/api/v2/tickets/${id}/transition`).set(auth).send({ to: 'IN_PROGRESS' })).status).toBe(200);
    const resolved = await request(app).post(`/api/v2/tickets/${id}/transition`).set(auth).send({ to: 'RESOLVED', resolutionSummary: 'Wymieniono papier' });
    expect(resolved.body.ticket.status).toBe('RESOLVED');
    expect(resolved.body.ticket.resolutionSummary).toBe('Wymieniono papier');
    expect(resolved.body.ticket.resolvedAt).toBeDefined();
  });

  it('rejects illegal transition OPEN → CLOSED', async () => {
    const { owner } = await setup();
    const id = await createTicket(owner.accessToken);
    const res = await request(app).post(`/api/v2/tickets/${id}/transition`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ to: 'CLOSED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('illegal_transition');
  });

  it('cannot rate a non-resolved ticket', async () => {
    const { owner } = await setup();
    const id = await createTicket(owner.accessToken);
    const res = await request(app).post(`/api/v2/tickets/${id}/rate`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ rating: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('rating_not_allowed');
  });
});

describe('Tickets — comments', () => {
  it('add comment + stamps firstResponseAt on first non-internal', async () => {
    const { owner } = await setup();
    const create = await request(app).post('/api/v2/tickets').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Comment ticket', description: 'body', source: 'MANUAL' });
    const id = create.body.ticket.id;

    const internal = await request(app).post(`/api/v2/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ comment: 'internal note', isInternal: true });
    expect(internal.status).toBe(201);

    const detail1 = await request(app).get(`/api/v2/tickets/${id}`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(detail1.body.ticket.firstResponseAt).toBeNull();

    const pub = await request(app).post(`/api/v2/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ comment: 'hi client', isInternal: false });
    expect(pub.status).toBe(201);

    const detail2 = await request(app).get(`/api/v2/tickets/${id}`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(detail2.body.ticket.firstResponseAt).toBeDefined();
    expect(detail2.body.ticket.comments).toHaveLength(2);
  });
});

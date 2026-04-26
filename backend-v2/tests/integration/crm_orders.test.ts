import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect } from '../helpers/db';
import { registerWithWorkspace } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('CRM Contacts', () => {
  it('creates + lists + search', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    await request(app).post('/api/v2/contacts').set(auth).send({ firstName: 'Jan', lastName: 'Kowalski', email: 'jan@example.com', position: 'Dyrektor' });
    await request(app).post('/api/v2/contacts').set(auth).send({ firstName: 'Anna', lastName: 'Nowak', email: 'anna@example.com', position: 'Księgowa' });
    const list = await request(app).get('/api/v2/contacts').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.contacts).toHaveLength(2);

    const search = await request(app).get('/api/v2/contacts?search=anna').set(auth);
    expect(search.body.contacts).toHaveLength(1);
    expect(search.body.contacts[0].lastName).toBe('Nowak');
  });

  it('isMainContact mutual exclusion within clientWorkspace', async () => {
    const owner = await registerWithWorkspace(app);
    const clientWs = await registerWithWorkspace(app); // reuse as client
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const a = await request(app).post('/api/v2/contacts').set(auth).send({ firstName: 'Kontakt', lastName: 'Główny A', clientWorkspaceId: clientWs.workspaceId, isMainContact: true });
    const b = await request(app).post('/api/v2/contacts').set(auth).send({ firstName: 'Kontakt', lastName: 'Główny B', clientWorkspaceId: clientWs.workspaceId, isMainContact: true });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const list = await request(app).get(`/api/v2/contacts?clientWorkspaceId=${clientWs.workspaceId}`).set(auth);
    const mains = list.body.contacts.filter((c: { isMainContact: boolean }) => c.isMainContact);
    expect(mains).toHaveLength(1);
    expect(mains[0].lastName).toBe('Główny B');
  });
});

describe('Orders', () => {
  it('create + auto-numbering + totals', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const res = await request(app).post('/api/v2/orders').set(auth).send({
      title: 'Zakup laptopów Dell',
      vatRate: 23,
      supplierName: 'x-kom',
      items: [
        { name: 'Dell OptiPlex 7010', quantity: 3, unitNet: 4500 },
        { name: 'Kabel USB-C', quantity: 3, unitNet: 50 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.order.orderNumber).toMatch(/^ORD-\d{4}-0001$/);
    expect(Number(res.body.order.totalNet)).toBe(13650);
    expect(Number(res.body.order.totalGross)).toBeCloseTo(16789.5, 1);
    expect(res.body.order.items).toHaveLength(2);
  });

  it('status transitions set deliveredAt on DELIVERED', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const create = await request(app).post('/api/v2/orders').set(auth).send({
      title: 'Test order',
      items: [{ name: 'Item', quantity: 1, unitNet: 100 }],
    });
    const id = create.body.order.id;
    const delivered = await request(app).post(`/api/v2/orders/${id}/status`).set(auth).send({ status: 'DELIVERED' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.order.deliveredAt).toBeDefined();
  });

  it('patch rejected when not DRAFT', async () => {
    const owner = await registerWithWorkspace(app);
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const c = await request(app).post('/api/v2/orders').set(auth).send({
      title: 'Protected order', items: [{ name: 'i', quantity: 1, unitNet: 1 }],
    });
    await request(app).post(`/api/v2/orders/${c.body.order.id}/status`).set(auth).send({ status: 'ORDERED' });
    const patch = await request(app).patch(`/api/v2/orders/${c.body.order.id}`).set(auth).send({ title: 'zmień mnie' });
    expect(patch.status).toBe(400);
    expect(patch.body.error).toBe('order_not_draft');
  });
});

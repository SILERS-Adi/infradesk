import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect } from '../helpers/db';
import { registerWithWorkspace, seedLocation } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('Devices CRUD', () => {
  it('creates a device with generated QR code', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const res = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'srv-prod-01', locationId: loc.id, category: 'SERVER', criticality: 'HIGH' });
    expect(res.status).toBe(201);
    expect(res.body.device.qrCodeValue).toMatch(/^IDSK-[0-9A-F]+$/);
    expect(res.body.device.name).toBe('srv-prod-01');
  });

  it('rejects duplicate device name within workspace', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const body = { name: 'pc-01', locationId: loc.id, category: 'WORKSTATION' };
    const a = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`).send(body);
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`).send(body);
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('device_name_taken');
  });

  it('location from another workspace is rejected', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);
    const locA = await seedLocation(a.workspaceId);
    const res = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'evil', locationId: locA.id, category: 'SERVER' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_location');
  });

  it('list + filter by search query', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    for (const name of ['srv-web-01', 'pc-acc-01', 'srv-db-01']) {
      await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name, locationId: loc.id, category: 'SERVER' });
    }
    const res = await request(app).get('/api/v2/devices?search=srv').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.devices).toHaveLength(2);
  });

  it('soft delete sets status DECOMMISSIONED', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    const c = await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'delme', locationId: loc.id, category: 'WORKSTATION' });
    const id = c.body.device.id;
    const d = await request(app).delete(`/api/v2/devices/${id}`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(d.status).toBe(200);
    const list = await request(app).get('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body.devices).toHaveLength(0);
  });
});

describe('Locations CRUD', () => {
  it('creates and lists locations', async () => {
    const owner = await registerWithWorkspace(app);
    const c = await request(app).post('/api/v2/locations').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Biuro Główne', addressLine1: 'ul. Świętokrzyska 10', postalCode: '00-050', city: 'Warszawa' });
    expect(c.status).toBe(201);
    const l = await request(app).get('/api/v2/locations').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(l.body.locations).toHaveLength(1);
    expect(l.body.locations[0].name).toBe('Biuro Główne');
  });

  it('blocks deleting location with devices', async () => {
    const owner = await registerWithWorkspace(app);
    const loc = await seedLocation(owner.workspaceId);
    await request(app).post('/api/v2/devices').set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'pc-1', locationId: loc.id, category: 'WORKSTATION' });
    const del = await request(app).delete(`/api/v2/locations/${loc.id}`).set('Authorization', `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toBe('location_has_devices');
  });
});

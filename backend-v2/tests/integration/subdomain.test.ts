import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect } from '../helpers/db';
import { registerWithWorkspace } from '../helpers/factories';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('Subdomain resolution (Host header → workspace hint)', () => {
  it('returns null workspace for reserved subdomains', async () => {
    const res = await request(app).get('/api/v2/public/workspace').set('Host', 'v2.infradesk.pl');
    expect(res.status).toBe(200);
    expect(res.body.workspace).toBeNull();
    expect(res.body.subdomain).toBeNull();
  });

  it('returns null workspace for localhost (dev)', async () => {
    const res = await request(app).get('/api/v2/public/workspace').set('Host', 'localhost:5174');
    expect(res.body.workspace).toBeNull();
  });

  it('returns workspace + branding for known subdomain', async () => {
    const owner = await registerWithWorkspace(app, { slug: 'acme' });
    const res = await request(app).get('/api/v2/public/workspace').set('Host', 'acme.infradesk.pl');
    expect(res.status).toBe(200);
    expect(res.body.workspace.slug).toBe('acme');
    expect(res.body.workspace.branding).toBeDefined();
    expect(res.body.subdomain).toBe('acme');
    expect(owner).toBeDefined();
  });

  it('returns null for unknown subdomain (no matching workspace)', async () => {
    const res = await request(app).get('/api/v2/public/workspace').set('Host', 'unknown-xyz.infradesk.pl');
    expect(res.body.workspace).toBeNull();
    expect(res.body.subdomain).toBe('unknown-xyz');
  });

  it('slug-exists endpoint: available for new slug', async () => {
    const res = await request(app).get('/api/v2/public/workspace/exists?slug=brand-new');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it('slug-exists: taken after registration', async () => {
    await registerWithWorkspace(app, { slug: 'already-taken' });
    const res = await request(app).get('/api/v2/public/workspace/exists?slug=already-taken');
    expect(res.body.available).toBe(false);
  });

  it('slug-exists: invalid format', async () => {
    const res = await request(app).get('/api/v2/public/workspace/exists?slug=AA');
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe('invalid_format');
  });
});

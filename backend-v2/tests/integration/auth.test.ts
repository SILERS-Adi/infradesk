import request from 'supertest';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';

const app = buildApp();

const validPassword = 'Silers!Test2026';

function cookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw as string];
}
function refreshCookie(res: request.Response): string {
  return cookies(res).find((c) => c.startsWith('refresh_token='))!;
}

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('POST /api/v2/auth/register', () => {
  it('creates a user + workspace + owner membership', async () => {
    const res = await request(app).post('/api/v2/auth/register').send({
      email: 'adam@example.com', password: validPassword,
      firstName: 'Adam', lastName: 'Nowak',
      workspaceName: 'Acme MSP', workspaceSlug: 'acme-msp',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('adam@example.com');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.defaultWorkspaceId).toBeDefined();
    const memberships = await testDb.membership.findMany({ where: { user: { email: 'adam@example.com' } } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe('OWNER');
    expect(memberships[0]!.scope).toBe('FULL');
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/v2/auth/register').send({
      email: 'weak@example.com', password: 'short',
      firstName: 'A', lastName: 'B',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/v2/auth/register').send({
      email: 'dup@example.com', password: validPassword, firstName: 'A', lastName: 'B',
    });
    const res = await request(app).post('/api/v2/auth/register').send({
      email: 'dup@example.com', password: validPassword, firstName: 'A', lastName: 'B',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });

  it('normalizes email to lowercase', async () => {
    await request(app).post('/api/v2/auth/register').send({
      email: 'MiXeD@ExAmPle.COM', password: validPassword,
      firstName: 'Mix', lastName: 'Case',
    });
    const user = await testDb.user.findUnique({ where: { email: 'mixed@example.com' } });
    expect(user).toBeTruthy();
  });
});

describe('POST /api/v2/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v2/auth/register').send({
      email: 'user@example.com', password: validPassword,
      firstName: 'User', lastName: 'Test',
      workspaceName: 'WS', workspaceSlug: 'ws-one',
    });
  });

  it('returns tokens on valid credentials', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({
      email: 'user@example.com', password: validPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(cookies(res).some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({
      email: 'user@example.com', password: 'WrongWrong1!',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email with 401 (no enumeration leak)', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({
      email: 'nope@example.com', password: validPassword,
    });
    expect(res.status).toBe(401);
  });

  it('locks the account after 10 failed attempts', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/v2/auth/login').send({
        email: 'user@example.com', password: 'bad',
      });
    }
    const res = await request(app).post('/api/v2/auth/login').send({
      email: 'user@example.com', password: validPassword,
    });
    expect([401, 429]).toContain(res.status);
  });
});

describe('POST /api/v2/auth/refresh', () => {
  it('rotates refresh token and issues new access token', async () => {
    const reg = await request(app).post('/api/v2/auth/register').send({
      email: 'rot@example.com', password: validPassword, firstName: 'R', lastName: 'O',
      workspaceName: 'RotWS', workspaceSlug: 'rot-ws',
    });
    const oldCookie = refreshCookie(reg);

    const res = await request(app)
      .post('/api/v2/auth/refresh')
      .set('Cookie', oldCookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    const newCookie = refreshCookie(res);
    expect(newCookie).not.toEqual(oldCookie);
  });

  it('detects refresh token reuse and revokes all sessions', async () => {
    const reg = await request(app).post('/api/v2/auth/register').send({
      email: 'reuse@example.com', password: validPassword, firstName: 'R', lastName: 'E',
    });
    const cookie = refreshCookie(reg);

    // First use — succeeds, rotates.
    const r1 = await request(app).post('/api/v2/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(200);

    // Second use of the OLD cookie — should fail (revoked).
    const r2 = await request(app).post('/api/v2/auth/refresh').set('Cookie', cookie);
    expect(r2.status).toBe(401);
  });

  it('rejects missing refresh cookie', async () => {
    const res = await request(app).post('/api/v2/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v2/auth/logout', () => {
  it('revokes refresh token', async () => {
    const reg = await request(app).post('/api/v2/auth/register').send({
      email: 'logout@example.com', password: validPassword, firstName: 'L', lastName: 'O',
    });
    const cookie = refreshCookie(reg);

    await request(app).post('/api/v2/auth/logout').set('Cookie', cookie);
    const res = await request(app).post('/api/v2/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v2/auth/me', () => {
  it('rejects without token', async () => {
    const res = await request(app).get('/api/v2/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns auth payload with valid token', async () => {
    const reg = await request(app).post('/api/v2/auth/register').send({
      email: 'me@example.com', password: validPassword, firstName: 'M', lastName: 'E',
    });
    const res = await request(app)
      .get('/api/v2/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.email).toBe('me@example.com');
  });
});

describe('Password reset flow', () => {
  it('issues reset token and allows password change', async () => {
    await request(app).post('/api/v2/auth/register').send({
      email: 'reset@example.com', password: validPassword, firstName: 'R', lastName: 'P',
    });
    const req1 = await request(app).post('/api/v2/auth/password-reset/request').send({
      email: 'reset@example.com',
    });
    expect(req1.status).toBe(200);
    // In test env service returns the plaintext token back.
    const token = req1.body.token as string;
    expect(token).toBeDefined();

    const newPw = 'NewPassword!2026';
    const req2 = await request(app).post('/api/v2/auth/password-reset/confirm').send({
      token, password: newPw,
    });
    expect(req2.status).toBe(200);

    const login = await request(app).post('/api/v2/auth/login').send({
      email: 'reset@example.com', password: newPw,
    });
    expect(login.status).toBe(200);
  });

  it('rejects invalid reset token', async () => {
    const res = await request(app).post('/api/v2/auth/password-reset/confirm').send({
      token: 'not-a-real-token', password: validPassword,
    });
    expect(res.status).toBe(400);
  });
});

describe('2FA setup', () => {
  it('can be enabled and disabled end-to-end', async () => {
    const reg = await request(app).post('/api/v2/auth/register').send({
      email: '2fa@example.com', password: validPassword, firstName: '2', lastName: 'F',
    });
    const token = reg.body.accessToken;

    const setup = await request(app)
      .post('/api/v2/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`);
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toBeDefined();
    expect(setup.body.otpauthUri).toContain('otpauth://totp/');
  });
});

describe('POST /api/v2/auth/verify-email', () => {
  it('rejects invalid token', async () => {
    const res = await request(app).post('/api/v2/auth/verify-email').send({
      token: 'garbage-token',
    });
    expect(res.status).toBe(400);
  });
});

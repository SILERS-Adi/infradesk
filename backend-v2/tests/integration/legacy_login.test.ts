import request from 'supertest';
import bcrypt from 'bcrypt';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect, testDb } from '../helpers/db';

const app = buildApp();

beforeEach(async () => { await resetDatabase(); });
afterAll(async () => { await disconnect(); });

describe('Legacy bcrypt login (v1 migrated users)', () => {
  it('logs in with a bcrypt hash AND rehashes to argon2 on success', async () => {
    const email = 'legacy@test.local';
    const password = 'LegacyOne!99';
    const legacyHash = await bcrypt.hash(password, 10);

    // Seed user directly as if migrated from v1.
    await testDb.user.create({
      data: { email, firstName: 'L', lastName: 'E', passwordHash: legacyHash, isActive: true },
    });

    const res = await request(app).post('/api/v2/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const updated = await testDb.user.findUnique({ where: { email }, select: { passwordHash: true } });
    expect(updated!.passwordHash).not.toEqual(legacyHash);
    expect(updated!.passwordHash.startsWith('$argon2')).toBe(true);

    // Subsequent login continues to work (now argon2).
    const second = await request(app).post('/api/v2/auth/login').send({ email, password });
    expect(second.status).toBe(200);
  });

  it('rejects wrong password on legacy bcrypt hash', async () => {
    const legacyHash = await bcrypt.hash('CorrectPass!99', 10);
    await testDb.user.create({
      data: { email: 'wrong@test.local', firstName: 'W', lastName: 'R', passwordHash: legacyHash, isActive: true },
    });
    const res = await request(app).post('/api/v2/auth/login').send({ email: 'wrong@test.local', password: 'BadPass!99' });
    expect(res.status).toBe(401);
  });
});

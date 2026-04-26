import bcrypt from 'bcrypt';
import { hashPassword, verifyPassword, isLegacyHash, validatePasswordStrength } from '../../src/lib/password';

describe('password library', () => {
  it('hashPassword returns an argon2id hash', async () => {
    const hash = await hashPassword('MyPassword!2026');
    expect(hash).toMatch(/^\$argon2id/);
  });

  it('verifyPassword matches argon2 round-trip', async () => {
    const hash = await hashPassword('MyPassword!2026');
    expect(await verifyPassword(hash, 'MyPassword!2026')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('verifyPassword accepts legacy bcrypt hashes (v1 compat)', async () => {
    const legacy = await bcrypt.hash('LegacyPass!99', 10);
    expect(isLegacyHash(legacy)).toBe(true);
    expect(await verifyPassword(legacy, 'LegacyPass!99')).toBe(true);
    expect(await verifyPassword(legacy, 'wrong')).toBe(false);
  });

  it('isLegacyHash distinguishes schemes', async () => {
    const argon = await hashPassword('x');
    expect(isLegacyHash(argon)).toBe(false);
    const bcryptHash = await bcrypt.hash('x', 10);
    expect(isLegacyHash(bcryptHash)).toBe(true);
  });

  it('validatePasswordStrength rejects weak inputs', () => {
    expect(validatePasswordStrength('short').ok).toBe(false);
    expect(validatePasswordStrength('nouppercasebutlong123!').ok).toBe(false);
    expect(validatePasswordStrength('NoSpecial123').ok).toBe(false);
    expect(validatePasswordStrength('Valid!Passw0rd').ok).toBe(true);
  });
});

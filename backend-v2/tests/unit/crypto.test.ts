import { encrypt, decrypt, randomToken, hashToken } from '../../src/lib/crypto';

describe('crypto', () => {
  it('round-trips AES-256-GCM', () => {
    const plain = 'poufne-hasło-klienta!123';
    const enc = encrypt(plain);
    expect(enc.ciphertext).not.toContain(plain);
    expect(decrypt(enc)).toBe(plain);
  });
  it('different ciphertexts for same plaintext (random IV)', () => {
    const p = 'foo';
    expect(encrypt(p).ciphertext).not.toEqual(encrypt(p).ciphertext);
  });
  it('fails decryption with wrong authTag', () => {
    const enc = encrypt('x');
    const tampered = { ...enc, authTag: Buffer.alloc(16).toString('base64') };
    expect(() => decrypt(tampered)).toThrow();
  });
  it('randomToken produces base64url', () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(40);
  });
  it('hashToken is deterministic', () => {
    expect(hashToken('abc')).toEqual(hashToken('abc'));
    expect(hashToken('abc')).not.toEqual(hashToken('abd'));
  });
});

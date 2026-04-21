import { generateSecret, generateCode, verifyCode, otpauthUri, generateBackupCodes } from '../../src/modules/auth/totp';

describe('TOTP', () => {
  it('generates 32-char base32 secret', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
  });
  it('generates and verifies 6-digit code', () => {
    const s = generateSecret();
    const code = generateCode(s);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyCode(s, code)).toBe(true);
  });
  it('rejects wrong code', () => {
    const s = generateSecret();
    expect(verifyCode(s, '000000')).toBe(false);
  });
  it('accepts codes within +/-30s drift', () => {
    const s = generateSecret();
    const now = Date.now();
    const past = generateCode(s, now - 31_000);
    expect(verifyCode(s, past, now)).toBe(true);
  });
  it('otpauth URI contains secret and issuer', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'me@example.com', 'TestCo');
    expect(uri).toContain('otpauth://totp/TestCo');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=TestCo');
  });
  it('generates 10 unique backup codes', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{10}$/);
  });
});

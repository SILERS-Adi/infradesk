import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import { config } from '../config';

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: config.ARGON_MEMORY_COST,
  timeCost: config.ARGON_TIME_COST,
  parallelism: config.ARGON_PARALLELISM,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

/**
 * Dual-scheme verification: argon2id is primary, bcrypt as legacy fallback
 * so users migrated from v1 (bcrypt) can log in without password reset.
 * Hash prefix reveals the scheme: argon2 starts with `$argon2`, bcrypt with `$2a$|$2b$|$2y$`.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash) return false;
  try {
    if (hash.startsWith('$argon2')) return await argon2.verify(hash, plain);
    if (/^\$2[aby]\$/.test(hash)) return await bcrypt.compare(plain, hash);
    return false;
  } catch {
    return false;
  }
}

/** True when the stored hash is in the legacy scheme and should be re-hashed on next login. */
export function isLegacyHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}

export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < 10) return { ok: false, reason: 'Hasło musi mieć min. 10 znaków' };
  if (!/[a-z]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać małą literę' };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać dużą literę' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać cyfrę' };
  if (!/[^a-zA-Z0-9]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać znak specjalny' };
  return { ok: true };
}

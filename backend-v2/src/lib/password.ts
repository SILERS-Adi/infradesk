import argon2 from 'argon2';
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

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < 10) return { ok: false, reason: 'Hasło musi mieć min. 10 znaków' };
  if (!/[a-z]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać małą literę' };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać dużą literę' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać cyfrę' };
  if (!/[^a-zA-Z0-9]/.test(password)) return { ok: false, reason: 'Hasło musi zawierać znak specjalny' };
  return { ok: true };
}

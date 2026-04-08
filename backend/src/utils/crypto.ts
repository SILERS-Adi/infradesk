import * as crypto from 'crypto';
import { config } from '../config';

const KDF_SALT = 'infradesk-kdf-v1'; // Static salt — key itself provides entropy

/** Derive a proper 32-byte key using scrypt (used for new encryptions) */
function getDerivedKey(): Buffer {
  return crypto.scryptSync(config.encryptionKey, KDF_SALT, 32);
}

/** Legacy key derivation (padEnd) — used only for decrypting old data */
function getLegacyKey(): Buffer {
  return Buffer.from(config.encryptionKey.padEnd(32).slice(0, 32));
}

/**
 * Encrypt text with AES-256-CBC using proper KDF.
 * Output format: v2:iv_hex:ciphertext_hex
 */
export function encrypt(text: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return 'v2:' + iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt text. Supports both:
 *   - v2:iv:ciphertext (new KDF format)
 *   - iv:ciphertext (legacy padEnd format)
 */
export function decrypt(encrypted: string): string {
  if (encrypted.startsWith('v2:')) {
    // New format: v2:iv:ciphertext
    const parts = encrypted.slice(3).split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted value format (v2)');
    const key = getDerivedKey();
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Legacy format: iv:ciphertext (padEnd key)
  const parts = encrypted.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted value format');
  const key = getLegacyKey();
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

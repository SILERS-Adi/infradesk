import * as crypto from 'crypto';
import { config } from '../config';

const KDF_SALT = 'infradesk-kdf-v1';
const HMAC_KEY_SALT = 'infradesk-hmac-v1';

/** Derive a proper 32-byte key using scrypt (for AES-256-CBC) */
function getDerivedKey(): Buffer {
  return crypto.scryptSync(config.encryptionKey, KDF_SALT, 32);
}

/** Derive HMAC key (separate from encryption key) */
function getHmacKey(): Buffer {
  return crypto.scryptSync(config.encryptionKey, HMAC_KEY_SALT, 32);
}

/** Legacy key derivation (padEnd) — used only for decrypting old data */
function getLegacyKey(): Buffer {
  return Buffer.from(config.encryptionKey.padEnd(32).slice(0, 32));
}

/**
 * Encrypt text with AES-256-CBC + HMAC-SHA256 integrity.
 * Output format: v2:iv_hex:ciphertext_hex:hmac_hex
 */
export function encrypt(text: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const payload = iv.toString('hex') + ':' + encrypted;
  const hmac = crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');

  return 'v2:' + payload + ':' + hmac;
}

/**
 * Decrypt text. Supports:
 *   - v2:iv:ciphertext:hmac (new format with integrity check)
 *   - v2:iv:ciphertext (new format without HMAC — transition period)
 *   - iv:ciphertext (legacy padEnd format)
 */
export function decrypt(encrypted: string): string {
  if (encrypted.startsWith('v2:')) {
    const content = encrypted.slice(3);
    const parts = content.split(':');

    if (parts.length === 3) {
      // New format with HMAC: iv:ciphertext:hmac
      const payload = parts[0] + ':' + parts[1];
      const hmac = parts[2];
      const expected = crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) {
        throw new Error('HMAC verification failed — data may have been tampered with');
      }
      const key = getDerivedKey();
      const iv = Buffer.from(parts[0], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    if (parts.length === 2) {
      // Transition format without HMAC: iv:ciphertext
      const key = getDerivedKey();
      const iv = Buffer.from(parts[0], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    throw new Error('Invalid encrypted value format (v2)');
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

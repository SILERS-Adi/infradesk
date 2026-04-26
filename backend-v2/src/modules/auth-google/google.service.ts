import { OAuth2Client } from 'google-auth-library';
import { prismaBg as prisma } from "../../lib/prisma-bg";
import { encrypt, decrypt } from '../../lib/crypto';
import { config } from '../../config';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../lib/logger';

// Scopes requested. `openid email profile` identifies user, gmail.readonly & calendar.readonly
// are the actual API access scopes. Refresh tokens require `access_type=offline` + `prompt=consent`.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export interface GoogleTokensDecoded {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string; // ISO
  scope: string;
  email: string;
}

/**
 * Throws 500 HttpError if GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI not configured.
 * All route handlers that talk to Google must call this first.
 */
export function assertConfigured(): void {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
    throw HttpError.internal('Google OAuth not configured', 'google_not_configured');
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI);
}

export function buildOAuthClient(): OAuth2Client {
  assertConfigured();
  return new OAuth2Client({
    clientId: config.GOOGLE_CLIENT_ID!,
    clientSecret: config.GOOGLE_CLIENT_SECRET!,
    redirectUri: config.GOOGLE_REDIRECT_URI!,
  });
}

/**
 * Encrypt token blob as JSON using AES-256-GCM (VAULT_MASTER_KEY) and store
 * as a single string `"<iv>.<authTag>.<ciphertext>"` — fits one TEXT column.
 */
export function encryptTokens(tokens: GoogleTokensDecoded): string {
  const payload = encrypt(JSON.stringify(tokens));
  return `${payload.iv}.${payload.authTag}.${payload.ciphertext}`;
}

export function decryptTokens(stored: string): GoogleTokensDecoded {
  const parts = stored.split('.');
  if (parts.length !== 3) throw new Error('Malformed googleTokens blob');
  const [iv, authTag, ciphertext] = parts;
  const json = decrypt({ iv, authTag, ciphertext });
  return JSON.parse(json) as GoogleTokensDecoded;
}

export async function saveTokensForUser(userId: string, tokens: GoogleTokensDecoded): Promise<void> {
  const enc = encryptTokens(tokens);
  await prisma.user.update({
    where: { id: userId },
    // Prisma client may lag behind until `prisma generate` is run; cast to any for forward-compat.
    data: { googleTokens: enc } as unknown as { googleTokens: string },
  });
}

export async function loadTokensForUser(userId: string): Promise<GoogleTokensDecoded | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleTokens: true } as unknown as { googleTokens: true },
  }) as unknown as { googleTokens: string | null } | null;
  if (!user?.googleTokens) return null;
  try {
    return decryptTokens(user.googleTokens);
  } catch (err) {
    logger.warn({ err, userId }, '[google] failed to decrypt stored tokens');
    return null;
  }
}

export async function clearTokensForUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { googleTokens: null } as unknown as { googleTokens: null },
  });
}

/**
 * Returns a fresh OAuth2 client bound to the user's tokens, auto-refreshing
 * the access token if expired. Persists rotated refresh token back to DB.
 */
export async function getAuthedClientForUser(userId: string): Promise<OAuth2Client> {
  const tokens = await loadTokensForUser(userId);
  if (!tokens) throw HttpError.badRequest('User has no Google tokens', 'google_not_connected');

  const client = buildOAuthClient();
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: new Date(tokens.expiresAt).getTime(),
    scope: tokens.scope,
  });

  // Auto-refresh hook — google-auth-library emits 'tokens' when it rotates.
  client.on('tokens', async (newTokens) => {
    try {
      const merged: GoogleTokensDecoded = {
        ...tokens,
        accessToken: newTokens.access_token ?? tokens.accessToken,
        refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
        expiresAt: newTokens.expiry_date
          ? new Date(newTokens.expiry_date).toISOString()
          : tokens.expiresAt,
        scope: newTokens.scope ?? tokens.scope,
      };
      await saveTokensForUser(userId, merged);
    } catch (err) {
      logger.warn({ err, userId }, '[google] failed to persist rotated tokens');
    }
  });

  return client;
}

/**
 * Revokes the refresh token on Google's side, then clears DB entry.
 */
export async function revokeAndClear(userId: string): Promise<void> {
  const tokens = await loadTokensForUser(userId);
  if (!tokens) return;
  if (isGoogleConfigured()) {
    try {
      const client = buildOAuthClient();
      client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      // Revoking the refresh_token invalidates all derived access tokens.
      await client.revokeToken(tokens.refreshToken ?? tokens.accessToken);
    } catch (err) {
      // Non-fatal — clear local state regardless so UI isn't stuck.
      logger.warn({ err, userId }, '[google] revokeToken failed, clearing locally');
    }
  }
  await clearTokensForUser(userId);
}

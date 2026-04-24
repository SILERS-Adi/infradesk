/**
 * OIDC Provider service — V2 acts as an OpenID Connect identity provider.
 * Real flow: Nextcloud (and other OIDC clients) redirect user to V2, V2 issues
 * signed id_tokens + access_tokens via RSA (RS256).
 *
 * Keys loaded from env:
 *   OIDC_PRIVATE_KEY — base64-encoded PEM (PKCS8 RSA 2048)
 *   OIDC_PUBLIC_JWK  — JSON JWK with kid + alg=RS256
 *   OIDC_ISSUER      — public issuer URL, e.g. https://infradesk.pl
 */
import { SignJWT, importPKCS8, type JWK } from 'jose';
type KeyLike = Awaited<ReturnType<typeof importPKCS8>>;
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../utils/httpError';

const PRIVATE_KEY_B64 = process.env.OIDC_PRIVATE_KEY;
const PUBLIC_JWK_RAW = process.env.OIDC_PUBLIC_JWK;
const ISSUER = process.env.OIDC_ISSUER ?? 'https://infradesk.pl';

if (!PRIVATE_KEY_B64) {
  // Fail fast in production so misconfig is visible at boot.
  // eslint-disable-next-line no-console
  console.warn('[auth-oidc] OIDC_PRIVATE_KEY is not set — /oauth endpoints will 500');
}
if (!PUBLIC_JWK_RAW) {
  // eslint-disable-next-line no-console
  console.warn('[auth-oidc] OIDC_PUBLIC_JWK is not set — /oauth/jwks will 500');
}

let cachedPrivateKey: KeyLike | undefined;
let cachedPublicJwk: JWK | undefined;

async function getPrivateKey(): Promise<KeyLike> {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (!PRIVATE_KEY_B64) throw HttpError.internal('OIDC signing key not configured');
  const pem = Buffer.from(PRIVATE_KEY_B64, 'base64').toString('utf-8');
  cachedPrivateKey = await importPKCS8(pem, 'RS256');
  return cachedPrivateKey;
}

export function getPublicJwk(): JWK {
  if (cachedPublicJwk) return cachedPublicJwk;
  if (!PUBLIC_JWK_RAW) throw HttpError.internal('OIDC public JWK not configured');
  cachedPublicJwk = JSON.parse(PUBLIC_JWK_RAW) as JWK;
  return cachedPublicJwk;
}

export function getIssuer(): string {
  return ISSUER;
}

export function getKid(): string {
  return (getPublicJwk().kid as string) ?? 'infradesk-v2';
}

// ─────────────────────────────── Clients ────────────────────────────────

export async function findClientById(clientId: string) {
  return prisma.oauthClient.findUnique({ where: { clientId } });
}

export async function verifyClientSecret(clientId: string, secret: string): Promise<boolean> {
  const client = await findClientById(clientId);
  if (!client) return false;
  return bcrypt.compare(secret, client.clientSecretHash);
}

// ─────────────────────────── Authorization code ─────────────────────────

export async function issueAuthCode(params: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
}): Promise<string> {
  const code = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await prisma.oauthAuthCode.create({
    data: {
      code,
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      expiresAt,
    },
  });
  return code;
}

export async function consumeAuthCode(code: string, clientId: string, redirectUri: string) {
  const row = await prisma.oauthAuthCode.findUnique({ where: { code } });
  if (!row) throw HttpError.badRequest('invalid_grant', 'invalid_grant');
  if (row.used) throw HttpError.badRequest('code already used', 'invalid_grant');
  if (row.expiresAt.getTime() < Date.now()) throw HttpError.badRequest('code expired', 'invalid_grant');
  if (row.clientId !== clientId) throw HttpError.badRequest('client mismatch', 'invalid_grant');
  if (row.redirectUri !== redirectUri) throw HttpError.badRequest('redirect_uri mismatch', 'invalid_grant');
  await prisma.oauthAuthCode.update({ where: { code }, data: { used: true } });
  return row;
}

// ───────────────────────────── Token signing ────────────────────────────

export interface IdTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  azp: string;
}

export async function signIdToken(params: {
  user: { id: string; email: string; firstName: string; lastName: string; emailVerified: boolean };
  clientId: string;
  ttlSeconds?: number;
}): Promise<string> {
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? 3600;
  return new SignJWT({
    email: params.user.email,
    email_verified: params.user.emailVerified,
    name: `${params.user.firstName} ${params.user.lastName}`.trim(),
    given_name: params.user.firstName,
    family_name: params.user.lastName,
    azp: params.clientId,
  })
    .setProtectedHeader({ alg: 'RS256', kid: getKid(), typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(params.user.id)
    .setAudience(params.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(key);
}

export async function signOidcAccessToken(params: {
  userId: string;
  clientId: string;
  scope: string;
  ttlSeconds?: number;
}): Promise<string> {
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? 3600;
  return new SignJWT({
    scope: params.scope,
    client_id: params.clientId,
    token_use: 'access',
  })
    .setProtectedHeader({ alg: 'RS256', kid: getKid(), typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setSubject(params.userId)
    .setAudience(params.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(key);
}

// ─────────────────────────── User lookup ────────────────────────────────

export async function getUserInfo(userId: string, scope: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user) throw HttpError.notFound('User not found');
  const scopes = new Set(scope.split(/\s+/));
  const out: Record<string, unknown> = { sub: user.id };
  if (scopes.has('email')) {
    out.email = user.email;
    out.email_verified = user.emailVerified;
  }
  if (scopes.has('profile')) {
    out.name = `${user.firstName} ${user.lastName}`.trim();
    out.given_name = user.firstName;
    out.family_name = user.lastName;
    out.preferred_username = user.email;
  }
  return out;
}

// ───────────────────── Discovery document ───────────────────────────────

export function discoveryDocument() {
  const iss = ISSUER;
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/api/v2/oauth/authorize`,
    token_endpoint: `${iss}/api/v2/oauth/token`,
    userinfo_endpoint: `${iss}/api/v2/oauth/userinfo`,
    jwks_uri: `${iss}/api/v2/oauth/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat', 'azp',
      'email', 'email_verified', 'name', 'given_name', 'family_name', 'preferred_username',
    ],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  };
}

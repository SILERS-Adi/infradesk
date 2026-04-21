import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength, isLegacyHash } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { randomToken, hashToken, encrypt, decrypt } from '../../lib/crypto';
import { HttpError } from '../../utils/httpError';
import { config } from '../../config';
import { generateSecret, verifyCode, otpauthUri, generateBackupCodes } from './totp';
import type { RegisterInput, LoginInput } from './auth.schemas';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  expiresInSeconds: number;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    twoFactorEnabled: boolean;
    emailVerified: boolean;
  };
  tokens: AuthTokens;
  defaultWorkspaceId?: string;
}

async function issueTokens(user: { id: string; email: string; tokenVersion: number; isSuperAdmin: boolean }, workspaceId?: string, membershipId?: string): Promise<AuthTokens> {
  const jti = randomToken(16);
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    workspaceId,
    membershipId,
    tokenVersion: user.tokenVersion,
    isSuperAdmin: user.isSuperAdmin,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti, tokenVersion: user.tokenVersion });

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      tokenVersion: user.tokenVersion,
      expiresAt: new Date(Date.now() + config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    refreshJti: jti,
    expiresInSeconds: config.JWT_ACCESS_TTL_MIN * 60,
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const pw = validatePasswordStrength(input.password);
  if (!pw.ok) throw HttpError.badRequest(pw.reason!, 'weak_password');

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw HttpError.conflict('Email already registered', 'email_taken');

  const passwordHash = await hashPassword(input.password);
  const emailVerifyToken = randomToken(24);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash,
        emailVerifyToken: hashToken(emailVerifyToken),
        emailVerifySentAt: new Date(),
      },
      select: { id: true, email: true, firstName: true, lastName: true, twoFactorEnabled: true, emailVerified: true, tokenVersion: true, isSuperAdmin: true },
    });

    let workspaceId: string | undefined;
    let membershipId: string | undefined;
    if (input.workspaceName) {
      const slug = input.workspaceSlug ?? slugify(input.workspaceName);
      const ws = await tx.workspace.create({
        data: {
          name: input.workspaceName,
          slug,
          type: 'MSP',
          plan: 'STARTER',
        },
      });
      workspaceId = ws.id;
      const m = await tx.membership.create({
        data: {
          userId: user.id,
          workspaceId: ws.id,
          role: 'OWNER',
          scope: 'FULL',
          isDefault: true,
          status: 'ACTIVE',
        },
      });
      membershipId = m.id;
    }

    return { user, workspaceId, membershipId };
  });

  const tokens = await issueTokens(created.user, created.workspaceId, created.membershipId);

  // TODO: send verification email (plaintext token) — deferred until SMTP module wired.
  return {
    user: {
      id: created.user.id,
      email: created.user.email,
      firstName: created.user.firstName,
      lastName: created.user.lastName,
      twoFactorEnabled: created.user.twoFactorEnabled,
      emailVerified: created.user.emailVerified,
    },
    tokens,
    defaultWorkspaceId: created.workspaceId,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

export async function login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true, email: true, firstName: true, lastName: true, passwordHash: true,
      twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true,
      emailVerified: true, isActive: true, deletedAt: true, tokenVersion: true,
      isSuperAdmin: true, loginAttempts: true, lockedUntil: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw HttpError.unauthorized('Nieprawidłowy email lub hasło', 'invalid_credentials');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw HttpError.tooMany('Konto tymczasowo zablokowane — spróbuj później', 'account_locked');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    await registerFailedLogin(user.id, user.loginAttempts ?? 0);
    throw HttpError.unauthorized('Nieprawidłowy email lub hasło', 'invalid_credentials');
  }

  // 2FA verification
  if (user.twoFactorEnabled) {
    if (!input.twoFactorCode) {
      throw HttpError.unauthorized('Wymagany kod 2FA', 'two_factor_required');
    }
    const valid = await verifyTwoFactor(user, input.twoFactorCode);
    if (!valid) {
      await registerFailedLogin(user.id, user.loginAttempts ?? 0);
      throw HttpError.unauthorized('Nieprawidłowy kod 2FA', 'invalid_two_factor');
    }
  }

  // Opportunistic rehash: migrate legacy bcrypt hashes to argon2id on next successful login.
  const updateData: Record<string, unknown> = {
    loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ipAddress ?? null,
  };
  if (isLegacyHash(user.passwordHash)) {
    updateData.passwordHash = await hashPassword(input.password);
  }
  await prisma.user.update({ where: { id: user.id }, data: updateData });

  const defaultMembership = await prisma.membership.findFirst({
    where: { userId: user.id, status: 'ACTIVE', isDefault: true },
    select: { id: true, workspaceId: true },
  }) ?? await prisma.membership.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, workspaceId: true },
  });

  const tokens = await issueTokens(
    { id: user.id, email: user.email, tokenVersion: user.tokenVersion, isSuperAdmin: user.isSuperAdmin },
    defaultMembership?.workspaceId,
    defaultMembership?.id,
  );

  // Touch refresh token metadata
  await prisma.refreshToken.update({
    where: { id: tokens.refreshJti },
    data: { ipAddress: ipAddress ?? null, userAgent: userAgent?.slice(0, 400) ?? null },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      twoFactorEnabled: user.twoFactorEnabled,
      emailVerified: user.emailVerified,
    },
    tokens,
    defaultWorkspaceId: defaultMembership?.workspaceId,
  };
}

async function verifyTwoFactor(
  user: { id: string; twoFactorSecret: string | null; twoFactorBackupCodes: unknown },
  code: string,
): Promise<boolean> {
  if (!user.twoFactorSecret) return false;
  try {
    const secret = decrypt(JSON.parse(user.twoFactorSecret));
    if (/^\d{6}$/.test(code) && verifyCode(secret, code)) return true;
  } catch {
    // fall through to backup-code check
  }
  // Backup code path
  const backups = Array.isArray(user.twoFactorBackupCodes) ? (user.twoFactorBackupCodes as string[]) : [];
  const hashed = hashToken(code);
  const idx = backups.indexOf(hashed);
  if (idx >= 0) {
    const remaining = [...backups];
    remaining.splice(idx, 1);
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: remaining } });
    return true;
  }
  return false;
}

async function registerFailedLogin(userId: string, current: number): Promise<void> {
  const next = current + 1;
  const updates: { loginAttempts: number; lockedUntil?: Date } = { loginAttempts: next };
  if (next >= 10) {
    updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  await prisma.user.update({ where: { id: userId }, data: updates });
}

export async function refresh(rawRefreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw HttpError.unauthorized('Invalid refresh token', 'refresh_invalid');
  }

  const record = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
    select: { id: true, userId: true, tokenHash: true, revokedAt: true, expiresAt: true, tokenVersion: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw HttpError.unauthorized('Refresh token expired or revoked', 'refresh_expired');
  }
  if (record.tokenHash !== hashToken(rawRefreshToken)) {
    // Possible token reuse — revoke whole family.
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.user.update({ where: { id: record.userId }, data: { tokenVersion: { increment: 1 } } });
    throw HttpError.unauthorized('Refresh token reuse detected — all sessions revoked', 'refresh_reuse');
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true, tokenVersion: true, isSuperAdmin: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) {
    throw HttpError.unauthorized('Account not active', 'account_inactive');
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    throw HttpError.unauthorized('Token version mismatch', 'refresh_invalid');
  }

  // Rotate: mark old revoked, issue new.
  const defaultMembership = await prisma.membership.findFirst({
    where: { userId: user.id, status: 'ACTIVE', isDefault: true },
    select: { id: true, workspaceId: true },
  });

  const newTokens = await issueTokens(user, defaultMembership?.workspaceId, defaultMembership?.id);
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return newTokens;
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // ignore
  }
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
  ]);
}

// Password reset

export async function requestPasswordReset(email: string): Promise<{ token?: string }> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return {}; // silent — do not reveal existence
  const token = randomToken(24);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  // TODO email delivery — returning token for test env only
  return config.isTest ? { token } : {};
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const pw = validatePasswordStrength(newPassword);
  if (!pw.ok) throw HttpError.badRequest(pw.reason!, 'weak_password');

  const hashed = hashToken(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashed, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  if (!record) throw HttpError.badRequest('Token wygasł lub jest nieprawidłowy', 'reset_invalid');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

// 2FA

export async function setupTwoFactor(userId: string, email: string): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: JSON.stringify(encrypt(secret)), twoFactorEnabled: false },
  });
  return { secret, otpauthUri: otpauthUri(secret, email) };
}

export async function confirmTwoFactor(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorSecret) throw HttpError.badRequest('2FA setup not started', 'two_factor_not_setup');
  const secret = decrypt(JSON.parse(user.twoFactorSecret));
  if (!verifyCode(secret, code)) throw HttpError.badRequest('Nieprawidłowy kod', 'invalid_two_factor');

  const backups = generateBackupCodes();
  const hashed = backups.map(hashToken);
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: hashed },
  });
  return { backupCodes: backups };
}

export async function disableTwoFactor(userId: string, password: string, code: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) throw HttpError.badRequest('2FA not enabled', 'two_factor_not_enabled');
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw HttpError.unauthorized('Nieprawidłowe hasło', 'invalid_credentials');
  const secret = decrypt(JSON.parse(user.twoFactorSecret));
  if (!verifyCode(secret, code)) throw HttpError.badRequest('Nieprawidłowy kod', 'invalid_two_factor');

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, tokenVersion: true },
  });
  if (!user) throw HttpError.unauthorized('Użytkownik nie znaleziony', 'invalid_credentials');
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw HttpError.unauthorized('Nieprawidłowe obecne hasło', 'invalid_credentials');
  validatePasswordStrength(newPassword);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  // Revoke all refresh tokens — user must re-login.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Email verification

export async function verifyEmail(token: string): Promise<void> {
  const hashed = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: hashed },
    select: { id: true, emailVerifySentAt: true },
  });
  if (!user) throw HttpError.badRequest('Invalid verification token', 'verify_invalid');
  const expired = user.emailVerifySentAt && (Date.now() - user.emailVerifySentAt.getTime()) > 7 * 24 * 60 * 60 * 1000;
  if (expired) throw HttpError.badRequest('Verification token expired', 'verify_expired');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifySentAt: null },
  });
}

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken, JwtPayload } from '../../utils/jwt';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { validatePassword } from '../../utils/passwordPolicy';
import { LoginInput, RegisterInput } from './auth.validation';
import { sendMail } from '../../lib/mailer';

export async function loginService(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await logActivity(prisma, {
    entityType: 'User',
    entityId: user.id,
    actionType: 'LOGIN',
    description: `User ${user.email} logged in`,
    performedByUserId: user.id,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    },
  };
}

export async function refreshTokenService(refreshToken: string) {
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 401);
  }

  const newPayload: JwtPayload = {
    userId: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
  };

  const newAccessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

export async function getMeService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isSuperAdmin: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

/* ── Forgot Password ─────────────────────────────────────────────────────── */

export async function forgotPasswordService(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user || !user.isActive) return { sent: true };

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await prisma.passwordResetToken.create({
    data: { email, token, expiresAt },
  });

  const resetUrl = `${process.env.FRONTEND_URL || 'https://infradesk.pl'}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Resetowanie hasła — InfraDesk</h2>
      <p>Otrzymaliśmy prośbę o zresetowanie hasła dla konta <strong>${email}</strong>.</p>
      <p>Kliknij poniższy przycisk, aby ustawić nowe hasło:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(145deg, #6D28D9, #2563EB); color: #fff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px;">
          Ustaw nowe hasło
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Link jest ważny przez <strong>24 godziny</strong>.</p>
      <p style="color: #6b7280; font-size: 14px;">Jeśli nie prosiłeś/-aś o reset hasła, zignoruj tę wiadomość — Twoje hasło pozostanie niezmienione.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #9ca3af; font-size: 11px;">InfraDesk by SILERS · infradesk.pl</p>
    </div>
  `;

  await sendMail(email, 'Resetowanie hasła — InfraDesk', html);

  return { sent: true };
}

export async function resetPasswordService(token: string, newPassword: string) {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetToken) throw new AppError('Nieprawidłowy link resetowania', 400);
  if (resetToken.usedAt) throw new AppError('Ten link został już wykorzystany', 400);
  if (resetToken.expiresAt < new Date()) throw new AppError('Link wygasł — poproś o nowy', 400);

  const user = await prisma.user.findUnique({ where: { email: resetToken.email } });
  if (!user || !user.isActive) throw new AppError('Konto nie istnieje lub jest nieaktywne', 400);

  validatePassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  await logActivity(prisma, {
    entityType: 'User',
    entityId: user.id,
    actionType: 'UPDATE',
    description: `Password reset via email for ${user.email}`,
    performedByUserId: user.id,
  });

  return { success: true };
}

/* ── Register ────────────────────────────────────────────────────────── */

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics (ąćęłńóśźż)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  if (slug.length < 3) slug = slug + '-app';
  let candidate = slug;
  let suffix = 2;
  while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${suffix}`;
    suffix++;
  }
  return candidate;
}

export async function registerService(data: RegisterInput) {
  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError('Ten adres email jest już zarejestrowany', 409);

  // Validate password
  validatePassword(data.password);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const isCompany = data.accountType === 'company';

  // Validate company fields
  if (isCompany && !data.companyShortName) {
    throw new AppError('Krótka nazwa firmy jest wymagana', 400);
  }

  // Generate slug
  const slug = isCompany
    ? await uniqueSlug(data.companyShortName!)
    : await uniqueSlug(`user-${data.firstName}-${data.lastName}`);

  // Create user + workspace + membership in transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        passwordHash,
      },
    });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const workspace = await tx.workspace.create({
      data: {
        name: isCompany ? (data.companyName || data.companyShortName!) : `${data.firstName} ${data.lastName}`,
        slug,
        type: isCompany ? 'COMPANY' : 'PERSONAL',
        legalName: isCompany ? data.companyName : null,
        taxId: isCompany ? data.taxId : null,
        email: data.email,
        phone: data.phone || null,
        subscriptionStatus: 'TRIAL',
        trialEndDate: trialEnd,
      },
    });

    await tx.workspaceMembership.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'OWNER',
        isDefault: true,
      },
    });

    return { user, workspace };
  });

  // Auto-login after registration
  const payload: JwtPayload = {
    userId: result.user.id,
    email: result.user.email,
    isSuperAdmin: false,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await logActivity(prisma, {
    entityType: 'User',
    entityId: result.user.id,
    actionType: 'CREATE',
    description: `New ${data.accountType} account registered: ${data.email}`,
    performedByUserId: result.user.id,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: result.user.id,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      isSuperAdmin: false,
    },
    workspace: {
      id: result.workspace.id,
      name: result.workspace.name,
      slug: result.workspace.slug,
      type: result.workspace.type,
    },
  };
}

export async function checkSlugAvailability(slug: string): Promise<boolean> {
  const clean = slugify(slug);
  if (clean.length < 3) return false;
  const existing = await prisma.workspace.findUnique({ where: { slug: clean } });
  return !existing;
}

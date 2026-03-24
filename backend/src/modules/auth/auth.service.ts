import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken, JwtPayload } from '../../utils/jwt';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { LoginInput } from './auth.validation';

export async function loginService(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { client: { select: { id: true, name: true } } },
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
    role: user.role,
    clientId: user.clientId,
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
      role: user.role,
      clientId: user.clientId,
      client: user.client,
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
    role: user.role,
    clientId: user.clientId,
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
      role: true,
      clientId: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      client: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

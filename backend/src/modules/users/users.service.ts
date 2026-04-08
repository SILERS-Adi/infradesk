import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { validatePassword } from '../../utils/passwordPolicy';
import { CreateUserInput, UpdateUserInput } from './users.validation';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  isActive: true,
  downloadPin: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

export async function listUsers(params: {
  isActive?: boolean;
  page?: number;
  limit?: number;
  workspaceId?: string | null;
}) {
  const { isActive, page = 1, limit: rawLimit = 20, workspaceId } = params;
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  // If workspaceId is provided, list users who are members of that workspace
  if (workspaceId) {
    const memberships = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        ...(isActive !== undefined ? { user: { isActive } } : {}),
      },
      include: {
        user: { select: userSelect },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const total = await prisma.workspaceMembership.count({
      where: {
        workspaceId,
        ...(isActive !== undefined ? { user: { isActive } } : {}),
      },
    });
    return {
      data: memberships.map(m => ({ ...m.user, membershipRole: m.role })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  const where: Record<string, unknown> = {};
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserById(id: string, workspaceId: string) {
  // Always verify workspace membership first to prevent cross-workspace access
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: id, workspaceId } },
  });
  if (!membership) throw new AppError('User not found', 404);

  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

export async function createUser(data: CreateUserInput, performedByUserId: string, workspaceId?: string | null) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError('Email already in use', 409);
  }

  validatePassword(data.password);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      isActive: data.isActive,
    },
    select: userSelect,
  });

  // Add to workspace if provided
  if (workspaceId) {
    await prisma.workspaceMembership.create({
      data: { workspaceId, userId: user.id, role: 'MEMBER' },
    }).catch(() => {});
  }

  await logActivity(prisma, {
    entityType: 'User',
    entityId: user.id,
    actionType: 'CREATE',
    description: `User ${user.email} created`,
    performedByUserId,
  });

  return user;
}

export async function updateUser(id: string, data: UpdateUserInput, performedByUserId: string, workspaceId?: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('User not found', 404);
  }

  if (workspaceId) {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: id, workspaceId } },
    });
    if (!membership) throw new AppError('User not found', 404);
  }

  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
    if (emailTaken) {
      throw new AppError('Email already in use', 409);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName  !== undefined) updateData.lastName  = data.lastName;
  if (data.email     !== undefined) updateData.email     = data.email;
  if (data.phone     !== undefined) updateData.phone     = data.phone;
  if (data.isActive  !== undefined) updateData.isActive  = data.isActive;
  if (data.notificationSettings !== undefined) updateData.notificationSettings = data.notificationSettings;
  if (data.downloadPin !== undefined) updateData.downloadPin = data.downloadPin;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: userSelect,
  });

  await logActivity(prisma, {
    entityType: 'User',
    entityId: id,
    actionType: 'UPDATE',
    description: `User ${user.email} updated`,
    performedByUserId,
  });

  return user;
}

export async function deleteUser(id: string, performedByUserId: string, workspaceId?: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('User not found', 404);
  }

  if (workspaceId) {
    const membership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: id, workspaceId } },
    });
    if (!membership) throw new AppError('User not found', 404);
  }

  // Soft delete - deactivate instead of deleting
  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  await logActivity(prisma, {
    entityType: 'User',
    entityId: id,
    actionType: 'DELETE',
    description: `User ${existing.email} deactivated`,
    performedByUserId,
  });
}

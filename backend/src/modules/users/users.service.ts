import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateUserInput, UpdateUserInput } from './users.validation';
import { Role } from '@prisma/client';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  roles: true,
  clientId: true,
  permissions: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: { id: true, name: true },
  },
};

export async function listUsers(params: {
  role?: Role;
  clientId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  const { role, clientId, isActive, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (clientId) where.clientId = clientId;
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

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

export async function createUser(data: CreateUserInput, performedByUserId: string) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError('Email already in use', 409);
  }

  if (data.role === 'CLIENT' && !data.clientId) {
    throw new AppError('clientId is required for CLIENT role', 400);
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const roles = data.roles?.length ? data.roles as Role[] : [data.role as Role];

  const user = await prisma.user.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role as Role,
      roles,
      clientId: data.clientId,
      isActive: data.isActive,
      permissions: data.permissions ?? undefined,
    },
    select: userSelect,
  });

  await logActivity(prisma, {
    entityType: 'User',
    entityId: user.id,
    actionType: 'CREATE',
    description: `User ${user.email} created`,
    performedByUserId,
  });

  return user;
}

export async function updateUser(id: string, data: UpdateUserInput, performedByUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('User not found', 404);
  }

  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
    if (emailTaken) {
      throw new AppError('Email already in use', 409);
    }
  }

  // Build update payload explicitly to avoid passing unknown fields to Prisma
  const updateData: Record<string, unknown> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName  !== undefined) updateData.lastName  = data.lastName;
  if (data.email     !== undefined) updateData.email     = data.email;
  if (data.phone     !== undefined) updateData.phone     = data.phone;
  if (data.clientId  !== undefined) updateData.clientId  = data.clientId;
  if (data.isActive  !== undefined) updateData.isActive  = data.isActive;
  if (data.permissions !== undefined) updateData.permissions = data.permissions;
  if (data.notificationSettings !== undefined) updateData.notificationSettings = data.notificationSettings;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  // Determine final roles — Prisma requires { set: [...] } for array update
  let finalRoles: Role[];
  if (data.roles?.length) {
    finalRoles = data.roles as Role[];
  } else if (data.role) {
    finalRoles = [data.role as Role];
  } else {
    finalRoles = existing.roles as Role[];
  }
  // Primary role: highest privilege in finalRoles
  const priority: Role[] = ['ADMIN', 'TECHNICIAN', 'CLIENT'];
  const primaryRole = data.role as Role | undefined
    ?? priority.find(r => finalRoles.includes(r))
    ?? finalRoles[0];

  updateData.role  = primaryRole;
  updateData.roles = { set: finalRoles };

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

export async function deleteUser(id: string, performedByUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('User not found', 404);
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

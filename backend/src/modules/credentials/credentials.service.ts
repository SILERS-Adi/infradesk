import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { encrypt, decrypt } from '../../utils/crypto';
import { CreateCredentialInput, UpdateCredentialInput } from './credentials.validation';
import { CredentialCategory } from '@prisma/client';

const credentialSelect = {
  id: true,
  clientId: true,
  locationId: true,
  deviceId: true,
  name: true,
  category: true,
  username: true,
  urlOrHost: true,
  port: true,
  additionalData: true,
  notes: true,
  isSharedWithClient: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  accessTypeId: true,
  userId: true,
  client:     { select: { id: true, name: true } },
  location:   { select: { id: true, name: true } },
  device:     { select: { id: true, name: true } },
  createdBy:  { select: { id: true, firstName: true, lastName: true, email: true } },
  accessType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
  user:       { select: { id: true, firstName: true, lastName: true } },
};

export async function listCredentials(params: {
  clientId?: string;
  locationId?: string;
  deviceId?: string;
  category?: CredentialCategory;
  page?: number;
  limit?: number;
  requestingUser: { role: string; clientId?: string | null };
}) {
  const { clientId, locationId, deviceId, category, page = 1, limit = 20, requestingUser } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (requestingUser.role === 'CLIENT') {
    where.clientId = requestingUser.clientId;
    where.isSharedWithClient = true;
  } else if (clientId) {
    where.clientId = clientId;
  }

  if (locationId) where.locationId = locationId;
  if (deviceId) where.deviceId = deviceId;
  if (category) where.category = category;

  const [credentials, total] = await Promise.all([
    prisma.credential.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      select: credentialSelect,
    }),
    prisma.credential.count({ where }),
  ]);

  // Never return passwordEncrypted in listings
  return {
    data: credentials,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCredentialById(
  id: string,
  requestingUser: { role: string; clientId?: string | null }
) {
  const credential = await prisma.credential.findUnique({
    where: { id },
    select: credentialSelect,
  });

  if (!credential) {
    throw new AppError('Credential not found', 404);
  }

  if (requestingUser.role === 'CLIENT') {
    if (credential.clientId !== requestingUser.clientId || !credential.isSharedWithClient) {
      throw new AppError('Access denied', 403);
    }
  }

  return credential;
}

export async function revealCredential(
  id: string,
  requestingUser: { role: string; clientId?: string | null; userId: string }
) {
  const credential = await prisma.credential.findUnique({
    where: { id },
    select: { ...credentialSelect, passwordEncrypted: true },
  });

  if (!credential) {
    throw new AppError('Credential not found', 404);
  }

  if (requestingUser.role === 'CLIENT') {
    if (credential.clientId !== requestingUser.clientId || !credential.isSharedWithClient) {
      throw new AppError('Access denied', 403);
    }
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decrypt(credential.passwordEncrypted);
  } catch {
    throw new AppError('Failed to decrypt password', 500);
  }

  await logActivity(prisma, {
    entityType: 'Credential',
    entityId: id,
    actionType: 'VIEW_SECRET',
    description: `Password revealed for credential "${credential.name}"`,
    performedByUserId: requestingUser.userId,
    metadata: { credentialName: credential.name, clientId: credential.clientId },
  });

  return {
    ...credential,
    password: decryptedPassword,
    passwordEncrypted: undefined,
  };
}

export async function createCredential(data: CreateCredentialInput, performedByUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) {
    throw new AppError('Client not found', 404);
  }

  if (data.locationId) {
    const location = await prisma.location.findUnique({ where: { id: data.locationId } });
    if (!location || location.clientId !== data.clientId) {
      throw new AppError('Location not found or does not belong to client', 404);
    }
  }

  if (data.deviceId) {
    const device = await prisma.device.findUnique({ where: { id: data.deviceId } });
    if (!device || device.clientId !== data.clientId) {
      throw new AppError('Device not found or does not belong to client', 404);
    }
  }

  const passwordEncrypted = encrypt(data.password);

  const credential = await prisma.credential.create({
    data: {
      clientId:          data.clientId,
      locationId:        data.locationId,
      deviceId:          data.deviceId,
      accessTypeId:      data.accessTypeId,
      userId:            data.userId,
      name:              data.name,
      category:          data.category as CredentialCategory,
      username:          data.username,
      passwordEncrypted,
      urlOrHost:         data.urlOrHost,
      port:              data.port,
      additionalData:    data.additionalData,
      notes:             data.notes,
      isSharedWithClient: data.isSharedWithClient,
      createdByUserId:   performedByUserId,
    },
    select: credentialSelect,
  });

  await logActivity(prisma, {
    entityType: 'Credential',
    entityId: credential.id,
    actionType: 'CREATE',
    description: `Credential "${credential.name}" created`,
    performedByUserId,
  });

  return credential;
}

export async function updateCredential(id: string, data: UpdateCredentialInput, performedByUserId: string) {
  const existing = await prisma.credential.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Credential not found', 404);
  }

  const updateData: Record<string, unknown> = { ...data };

  if (data.password) {
    updateData.passwordEncrypted = encrypt(data.password);
    delete updateData.password;
  }

  if (data.category) {
    updateData.category = data.category as CredentialCategory;
  }

  const credential = await prisma.credential.update({
    where: { id },
    data: updateData,
    select: credentialSelect,
  });

  await logActivity(prisma, {
    entityType: 'Credential',
    entityId: id,
    actionType: 'UPDATE',
    description: `Credential "${credential.name}" updated`,
    performedByUserId,
  });

  return credential;
}

export async function deleteCredential(id: string, performedByUserId: string) {
  const existing = await prisma.credential.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Credential not found', 404);
  }

  await prisma.credential.delete({ where: { id } });

  await logActivity(prisma, {
    entityType: 'Credential',
    entityId: id,
    actionType: 'DELETE',
    description: `Credential "${existing.name}" deleted`,
    performedByUserId,
  });
}

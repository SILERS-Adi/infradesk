import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateDeviceInput, UpdateDeviceInput } from './devices.validation';
import { DeviceStatus, DeviceCriticality, AgentStatus } from '@prisma/client';

const deviceSelect = {
  id: true,
  clientId: true,
  locationId: true,
  deviceTypeId: true,
  name: true,
  assetTag: true,
  manufacturer: true,
  model: true,
  serialNumber: true,
  hostname: true,
  ipAddress: true,
  macAddress: true,
  operatingSystem: true,
  osVersion: true,
  warrantyUntil: true,
  purchaseDate: true,
  status: true,
  criticality: true,
  qrCodeValue: true,
  description: true,
  clientVisibleNotes: true,
  rustdeskId: true,
  rdpAddress: true,
  sshAddress: true,
  anydeskId: true,
  teamviewerId: true,
  customRemoteLink: true,
  assignedUserId:   true,
  installationDate: true,
  warrantyMonths:   true,
  gpsLat:           true,
  gpsLon:           true,
  createdAt: true,
  updatedAt: true,
  client:       { select: { id: true, name: true } },
  location:     { select: { id: true, name: true, addressLine1: true, postalCode: true, city: true, country: true } },
  deviceType:   { select: { id: true, name: true, icon: true } },
  assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  agents: {
    where:   { status: AgentStatus.ACTIVE },
    orderBy: { lastSeen: 'desc' as const },
    take:    1,
    select:  { lastSeen: true, currentUser: true },
  },
};

const deviceSelectWithInternalNotes = {
  ...deviceSelect,
  internalNotes: true,
};

export async function listDevices(params: {
  clientId?: string;
  locationId?: string;
  status?: DeviceStatus;
  criticality?: DeviceCriticality;
  search?: string;
  page?: number;
  limit?: number;
  requestingUser: { role: string; clientId?: string | null };
}) {
  const { clientId, locationId, status, criticality, search, page = 1, limit = 20, requestingUser } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (requestingUser.role === 'CLIENT') {
    where.clientId = requestingUser.clientId;
  } else if (clientId) {
    where.clientId = clientId;
  }

  if (locationId) where.locationId = locationId;
  if (status) where.status = status;
  if (criticality) where.criticality = criticality;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { hostname: { contains: search, mode: 'insensitive' } },
      { ipAddress: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { assetTag: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      select: requestingUser.role === 'CLIENT' ? deviceSelect : deviceSelectWithInternalNotes,
    }),
    prisma.device.count({ where }),
  ]);

  return {
    data: devices,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDeviceById(
  id: string,
  requestingUser: { role: string; clientId?: string | null }
) {
  const device = await prisma.device.findUnique({
    where: { id },
    select: requestingUser.role === 'CLIENT' ? deviceSelect : deviceSelectWithInternalNotes,
  });

  if (!device) {
    throw new AppError('Device not found', 404);
  }

  if (requestingUser.role === 'CLIENT' && device.clientId !== requestingUser.clientId) {
    throw new AppError('Access denied', 403);
  }

  // Dołącz dane z najnowszej rejestracji agenta
  const agent = await prisma.agentRegistration.findFirst({
    where: { deviceId: id, status: AgentStatus.ACTIVE },
    orderBy: { lastSeen: 'desc' },
    select: {
      cpuModel: true, cpuCores: true, cpuThreads: true,
      ramTotalGb: true, gpuModel: true, motherboard: true,
      cpuUsage: true, ramUsage: true,
      diskFree: true, diskTotal: true, cpuTempC: true,
      diskInfo: true, networkIfaces: true,
      lastSeen: true,
      windowsVersion: true, lastBootTime: true,
    },
  }) as any;

  return { ...device, agentInfo: agent ?? null };
}

export async function getDeviceByQrValue(qrCodeValue: string) {
  const device = await prisma.device.findUnique({
    where: { qrCodeValue },
    select: {
      id: true,
      name: true,
      assetTag: true,
      manufacturer: true,
      model: true,
      serialNumber: true,
      status: true,
      criticality: true,
      clientVisibleNotes: true,
      client: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, addressLine1: true, postalCode: true, city: true, country: true } },
      deviceType: { select: { id: true, name: true, icon: true } },
    },
  });

  if (!device) {
    throw new AppError('Device not found', 404);
  }

  return device;
}

export async function createDevice(data: CreateDeviceInput, performedByUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) {
    throw new AppError('Client not found', 404);
  }

  const location = await prisma.location.findUnique({ where: { id: data.locationId } });
  if (!location) {
    throw new AppError('Location not found', 404);
  }

  if (location.clientId !== data.clientId) {
    throw new AppError('Location does not belong to the specified client', 400);
  }

  const device = await prisma.device.create({
    data: {
      ...data,
      qrCodeValue:      uuidv4(),
      warrantyUntil:    data.warrantyUntil ? new Date(data.warrantyUntil) : undefined,
      purchaseDate:     data.purchaseDate ? new Date(data.purchaseDate) : undefined,
      installationDate: data.installationDate ? new Date(data.installationDate) : null,
      warrantyMonths:   data.warrantyMonths ?? null,
      gpsLat:           data.gpsLat ?? null,
      gpsLon:           data.gpsLon ?? null,
      status:           (data.status as DeviceStatus) ?? DeviceStatus.ACTIVE,
      criticality:      (data.criticality as DeviceCriticality) ?? DeviceCriticality.MEDIUM,
    },
    select: deviceSelectWithInternalNotes,
  });

  await logActivity(prisma, {
    entityType: 'Device',
    entityId: device.id,
    actionType: 'CREATE',
    description: `Device "${device.name}" created`,
    performedByUserId,
  });

  return device;
}

export async function updateDevice(id: string, data: UpdateDeviceInput, performedByUserId: string) {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Device not found', 404);
  }

  if (data.locationId) {
    const location = await prisma.location.findUnique({ where: { id: data.locationId } });
    if (!location) {
      throw new AppError('Location not found', 404);
    }
    if (location.clientId !== existing.clientId) {
      throw new AppError('Location does not belong to device client', 400);
    }
  }

  const device = await prisma.device.update({
    where: { id },
    data: {
      ...data,
      warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : data.warrantyUntil,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : data.purchaseDate,
      status: data.status as DeviceStatus | undefined,
      criticality: data.criticality as DeviceCriticality | undefined,
    },
    select: deviceSelectWithInternalNotes,
  });

  await logActivity(prisma, {
    entityType: 'Device',
    entityId: id,
    actionType: 'UPDATE',
    description: `Device "${device.name}" updated`,
    performedByUserId,
  });

  return device;
}

export async function deleteDevice(id: string, performedByUserId: string) {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Device not found', 404);
  }

  await prisma.device.update({
    where: { id },
    data: { status: 'RETIRED' },
  });

  await logActivity(prisma, {
    entityType: 'Device',
    entityId: id,
    actionType: 'DELETE',
    description: `Device "${existing.name}" retired`,
    performedByUserId,
  });
}

export async function generateDeviceQrCode(id: string): Promise<string> {
  const device = await prisma.device.findUnique({
    where: { id },
    select: { id: true, qrCodeValue: true, name: true },
  });

  if (!device) {
    throw new AppError('Device not found', 404);
  }

  // Generate QR code as base64 PNG
  const qrDataUrl = await QRCode.toDataURL(device.qrCodeValue, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  return qrDataUrl;
}

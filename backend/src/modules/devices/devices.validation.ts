import { z } from 'zod';

export const createDeviceSchema = z.object({
  clientId: z.string().uuid(),
  locationId: z.string().uuid(),
  deviceTypeId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  assetTag: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  hostname: z.string().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  macAddress: z.string().optional().nullable(),
  operatingSystem: z.string().optional().nullable(),
  osVersion: z.string().optional().nullable(),
  warrantyUntil: z.string().datetime().optional().nullable(),
  purchaseDate: z.string().datetime().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BROKEN', 'RETIRED', 'IN_SERVICE']).default('ACTIVE'),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  description: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  clientVisibleNotes: z.string().optional().nullable(),
  rustdeskId: z.string().optional().nullable(),
  rdpAddress: z.string().optional().nullable(),
  sshAddress: z.string().optional().nullable(),
  anydeskId: z.string().optional().nullable(),
  teamviewerId: z.string().optional().nullable(),
  customRemoteLink: z.string().optional().nullable(),
  assignedUserId:   z.string().uuid().optional().nullable(),
  installationDate: z.string().datetime().optional().nullable(),
  warrantyMonths:   z.number().int().min(0).optional().nullable(),
  gpsLat:           z.number().optional().nullable(),
  gpsLon:           z.number().optional().nullable(),
  managerId:        z.string().uuid().optional().nullable(),
});

export const updateDeviceSchema = createDeviceSchema.omit({ clientId: true }).partial();

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

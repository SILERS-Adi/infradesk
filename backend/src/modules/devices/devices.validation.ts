import { z } from 'zod';

export const createDeviceSchema = z.object({
  locationId: z.string().uuid(),
  deviceTypeId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  assetTag: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  hostname: z.string().optional().nullable(),
  ipAddress: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Nieprawidłowy format adresu IP').optional().nullable(),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Nieprawidłowy format adresu MAC').optional().nullable(),
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
  rdpAddress: z.string().max(500).optional().nullable(),
  sshAddress: z.string().max(500).optional().nullable(),
  anydeskId: z.string().optional().nullable(),
  teamviewerId: z.string().optional().nullable(),
  customRemoteLink: z.string().max(2000).refine(
    (val) => !val || /^https?:\/\//.test(val),
    { message: 'Link musi zaczynać się od http:// lub https://' }
  ).optional().nullable(),
  assignedUserId:   z.string().uuid().optional().nullable(),
  installationDate: z.string().datetime().optional().nullable(),
  warrantyMonths:   z.number().int().min(0).optional().nullable(),
  gpsLat:           z.number().min(-90).max(90).optional().nullable(),
  gpsLon:           z.number().min(-180).max(180).optional().nullable(),
  managerId:        z.string().uuid().optional().nullable(),
});

export const updateDeviceSchema = createDeviceSchema.partial();

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

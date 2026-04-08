import { z } from 'zod';

export const createCredentialSchema = z.object({
  locationId:   z.string().uuid().optional().nullable(),
  deviceId:     z.string().uuid().optional().nullable(),
  accessTypeId: z.string().uuid().optional().nullable(),
  userId:       z.string().uuid().optional().nullable(),
  name:         z.string().min(1).max(200),
  category:     z.enum(['ROUTER', 'SERVER', 'WINDOWS', 'EMAIL', 'VPN', 'WIFI', 'DOMAIN', 'NAS', 'CAMERA', 'OTHER']).default('OTHER'),
  username:     z.string().optional(),
  password:     z.string().min(1),
  urlOrHost: z.string().max(500).refine(
    (val) => !val || !/^(javascript|data|vbscript):/i.test(val),
    { message: 'Niedozwolony protokół' }
  ).optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  additionalData: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isSharedWithClient: z.boolean().default(false),
});

export const updateCredentialSchema = createCredentialSchema.partial();

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;

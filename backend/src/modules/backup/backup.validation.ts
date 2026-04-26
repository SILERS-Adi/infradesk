import { z } from 'zod';

export const createBackupConfigSchema = z.object({
  agentRegId:      z.string().uuid(),
  name:            z.string().min(1).max(200),
  type:            z.enum(['SQL_MYSQL', 'SQL_POSTGRES', 'SQL_MSSQL', 'FOLDER']),
  enabled:         z.boolean().default(true),
  sqlHost:         z.string().optional().nullable(),
  sqlPort:         z.number().int().optional().nullable(),
  sqlUser:         z.string().optional().nullable(),
  sqlPassEnc:      z.string().optional().nullable(),
  sqlDatabases:    z.string().optional().nullable(),
  folderPath:      z.string().optional().nullable(),
  googleDriveFolder:       z.string().optional().nullable(),
  googleDriveRefreshToken: z.string().optional().nullable(),
  googleDriveEmail:        z.string().optional().nullable(),
  useInfradeskCloud:       z.boolean().optional().default(false),
  localBackupPath:         z.string().optional().nullable(),
  ftpHost:                 z.string().optional().nullable(),
  ftpPort:                 z.number().int().optional().nullable(),
  ftpUser:                 z.string().optional().nullable(),
  ftpPassEnc:              z.string().optional().nullable(),
  ftpPath:                 z.string().optional().nullable(),
  notifyEmail:             z.string().optional().nullable(),
  cronSchedule:            z.string().default('0 2 * * *'),
  retentionDays:   z.number().int().min(1).max(365).default(30),
  encryptBackups:  z.boolean().default(true),
  encryptionKey:   z.string().optional().nullable(),
});

export const updateBackupConfigSchema = createBackupConfigSchema.partial();

export const backupReportSchema = z.object({
  configId:      z.string().uuid(),
  sizeBytes:     z.number().optional(),
  fileName:      z.string().optional(),
  googleDriveId: z.string().optional(),
  error:         z.string().optional(),
});

export type CreateBackupConfigInput = z.infer<typeof createBackupConfigSchema>;
export type UpdateBackupConfigInput = z.infer<typeof updateBackupConfigSchema>;

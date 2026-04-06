import api from './client';

export interface BackupConfig {
  id: string;
  agentRegId: string;
  clientId: string;
  name: string;
  type: 'SQL_MYSQL' | 'SQL_POSTGRES' | 'SQL_MSSQL' | 'FOLDER';
  enabled: boolean;
  sqlHost?: string;
  sqlPort?: number;
  sqlUser?: string;
  sqlPassEnc?: string;
  sqlDatabases?: string;
  folderPath?: string;
  googleDriveFolder?: string;
  googleDriveRefreshToken?: string;
  googleDriveEmail?: string;
  localBackupPath?: string;
  ftpHost?: string;
  ftpPort?: number;
  ftpUser?: string;
  ftpPassEnc?: string;
  ftpPath?: string;
  notifyEmail?: string;
  cronSchedule: string;
  retentionDays: number;
  encryptBackups: boolean;
  encryptionKey?: string;
  lastRunAt?: string;
  lastStatus?: string;
  agent?: { id: string; hostname: string };
  client?: { id: string; name: string };
  history?: BackupHistory[];
}

export interface BackupHistory {
  id: string;
  backupConfigId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  sizeBytes?: number;
  fileName?: string;
  googleDriveId?: string;
  errorMessage?: string;
}

export const backupApi = {
  getConfigs: (params?: { clientId?: string; agentRegId?: string }) =>
    api.get('/backup/configs', { params }).then(r => r.data as BackupConfig[]),

  getConfig: (id: string) =>
    api.get(`/backup/configs/${id}`).then(r => r.data as BackupConfig),

  create: (data: Partial<BackupConfig>) =>
    api.post('/backup/configs', data).then(r => r.data as BackupConfig),

  update: (id: string, data: Partial<BackupConfig>) =>
    api.patch(`/backup/configs/${id}`, data).then(r => r.data as BackupConfig),

  delete: (id: string) =>
    api.delete(`/backup/configs/${id}`),

  getHistory: (configId: string) =>
    api.get(`/backup/configs/${configId}/history`).then(r => r.data as BackupHistory[]),

  runNow: (configId: string) =>
    api.post(`/backup/configs/${configId}/run-now`).then(r => r.data),

  // Google Drive OAuth
  getGoogleAuthUrl: () =>
    api.get('/backup/google/auth-url').then(r => r.data as { url: string }),

  exchangeGoogleCode: (code: string) =>
    api.post('/backup/google/exchange', { code }).then(r => r.data as { email: string; refreshToken: string }),
};

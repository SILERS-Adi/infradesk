import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { sendMail } from '../../lib/mailer';
import { CreateBackupConfigInput, UpdateBackupConfigInput } from './backup.validation';
import { encrypt } from '../../utils/crypto';

// ── Config CRUD ──────────────────────────────────────────────────────────────

export async function listBackupConfigs(params: { workspaceId?: string | null; agentRegId?: string; scopeFilter?: Record<string, unknown> }) {
  const where: Record<string, unknown> = {};
  if (params.workspaceId) where.workspaceId = params.workspaceId;
  if (params.agentRegId) where.agentRegId = params.agentRegId;

  if (params.scopeFilter && Object.keys(params.scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), params.scopeFilter];
  }

  return prisma.backupConfig.findMany({
    where,
    include: {
      agent: { select: { id: true, hostname: true, deviceId: true, device: { select: { locationId: true } } } },
      history: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBackupConfig(id: string) {
  const config = await prisma.backupConfig.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, hostname: true, deviceId: true, device: { select: { locationId: true } } } },
    },
  });
  if (!config) throw new AppError('Backup config not found', 404);
  return config;
}

export async function createBackupConfig(data: CreateBackupConfigInput, performedByUserId?: string) {
  // Encrypt SQL password if provided
  let sqlPassEnc = data.sqlPassEnc ?? null;
  if (sqlPassEnc && !sqlPassEnc.includes(':')) {
    sqlPassEnc = encrypt(sqlPassEnc);
  }

  // Generate encryption key for backups if enabled and not provided
  let encKey = data.encryptionKey ?? null;
  if (data.encryptBackups && !encKey) {
    const { randomBytes } = await import('crypto');
    encKey = randomBytes(32).toString('base64url');
  }

  const config = await prisma.backupConfig.create({
    data: {
      ...data,
      sqlPassEnc,
      encryptionKey: encKey,
    },
    include: {
      agent: { select: { id: true, hostname: true } },
    },
  });

  if (performedByUserId) {
    await logActivity(prisma, {
      entityType: 'BackupConfig', entityId: config.id, actionType: 'CREATE',
      description: `Backup config "${config.name}" created (type=${config.type})`,
      performedByUserId, workspaceId: config.workspaceId,
    }).catch(() => {});
  }

  return config;
}

export async function updateBackupConfig(id: string, data: UpdateBackupConfigInput, performedByUserId?: string) {
  const existing = await prisma.backupConfig.findUnique({ where: { id } });
  if (!existing) throw new AppError('Backup config not found', 404);

  let sqlPassEnc = data.sqlPassEnc;
  if (sqlPassEnc && !sqlPassEnc.includes(':')) {
    sqlPassEnc = encrypt(sqlPassEnc);
  }

  const updated = await prisma.backupConfig.update({
    where: { id },
    data: { ...data, sqlPassEnc },
  });

  if (performedByUserId) {
    await logActivity(prisma, {
      entityType: 'BackupConfig', entityId: id, actionType: 'UPDATE',
      description: `Backup config "${existing.name}" updated`,
      performedByUserId, workspaceId: existing.workspaceId,
    }).catch(() => {});
  }

  return updated;
}

export async function deleteBackupConfig(id: string, performedByUserId?: string) {
  const existing = await prisma.backupConfig.findUnique({ where: { id } });
  if (!existing) throw new AppError('Backup config not found', 404);

  await prisma.backupConfig.delete({ where: { id } });

  if (performedByUserId) {
    await logActivity(prisma, {
      entityType: 'BackupConfig', entityId: id, actionType: 'DELETE',
      description: `Backup config "${existing.name}" deleted`,
      performedByUserId, workspaceId: existing.workspaceId,
    }).catch(() => {});
  }
}

export async function getBackupHistory(configId: string, limit = 50) {
  return prisma.backupHistory.findMany({
    where: { backupConfigId: configId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

// ── Agent reporting ──────────────────────────────────────────────────────────

export async function getAgentBackupConfigs(agentToken: string) {
  const reg = await prisma.agentRegistration.findUnique({ where: { agentToken } });
  if (!reg) throw new AppError('Agent not found', 404);

  return prisma.backupConfig.findMany({
    where: { agentRegId: reg.id, enabled: true },
    select: {
      id: true,
      name: true,
      type: true,
      sqlHost: true,
      sqlPort: true,
      sqlUser: true,
      sqlPassEnc: true,
      sqlDatabases: true,
      folderPath: true,
      googleDriveFolder: true,
      cronSchedule: true,
      retentionDays: true,
      encryptBackups: true,
      encryptionKey: true,
      lastRunAt: true,
    },
  });
}

export async function reportBackupStart(configId: string) {
  await prisma.backupConfig.update({
    where: { id: configId },
    data: { lastRunAt: new Date(), lastStatus: 'RUNNING' },
  });

  return prisma.backupHistory.create({
    data: { backupConfigId: configId, status: 'RUNNING' },
  });
}

export async function reportBackupComplete(historyId: string, data: {
  sizeBytes?: number;
  fileName?: string;
  googleDriveId?: string;
}) {
  const history = await prisma.backupHistory.update({
    where: { id: historyId },
    data: {
      status: 'SUCCESS',
      completedAt: new Date(),
      sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null,
      fileName: data.fileName,
      googleDriveId: data.googleDriveId,
    },
    include: { config: { include: { workspace: { select: { email: true, name: true } } } } },
  });

  await prisma.backupConfig.update({
    where: { id: history.backupConfigId },
    data: { lastStatus: 'SUCCESS' },
  });

  // Notify workspace admin
  try {
    if (history.config.workspace?.email) {
      const sizeMB = data.sizeBytes ? (data.sizeBytes / 1024 / 1024).toFixed(1) : '?';
      await sendMail(
        history.config.workspace.email,
        `[InfraDesk] Backup "${history.config.name}" — sukces`,
        `<p>Backup <strong>${history.config.name}</strong> zakończony pomyślnie.</p>
         <p>Rozmiar: ${sizeMB} MB | Plik: ${data.fileName ?? 'n/a'}</p>`
      );
    }
  } catch { /* silent */ }

  return history;
}

export async function reportBackupFailed(configId: string, error: string) {
  const history = await prisma.backupHistory.create({
    data: {
      backupConfigId: configId,
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: error,
    },
    include: { config: { include: { workspace: { select: { email: true, name: true } } } } },
  });

  await prisma.backupConfig.update({
    where: { id: configId },
    data: { lastStatus: 'FAILED' },
  });

  // Notify workspace admin
  try {
    if (history.config.workspace?.email) {
      await sendMail(
        history.config.workspace.email,
        `[InfraDesk] Backup "${history.config.name}" — BŁĄD`,
        `<p>Backup <strong>${history.config.name}</strong> zakończył się błędem.</p>
         <p style="color:red;">${error}</p>
         <p>Skontaktuj się z administratorem InfraDesk.</p>`
      );
    }
  } catch { /* silent */ }

  return history;
}

// ── Retention cleanup ────────────────────────────────────────────────────────

export async function cleanupOldBackups() {
  const configs = await prisma.backupConfig.findMany({ where: { enabled: true } });

  for (const cfg of configs) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.retentionDays);

    const old = await prisma.backupHistory.findMany({
      where: {
        backupConfigId: cfg.id,
        status: 'SUCCESS',
        startedAt: { lt: cutoff },
      },
    });

    if (old.length > 0) {
      // TODO: Delete from Google Drive (needs credentials)
      await prisma.backupHistory.deleteMany({
        where: { id: { in: old.map(h => h.id) } },
      });
    }
  }
}

import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { sendMail } from '../../lib/mailer';
import { CreateBackupConfigInput, UpdateBackupConfigInput } from './backup.validation';
import { encrypt } from '../../utils/crypto';

// ── Config CRUD ──────────────────────────────────────────────────────────────

export async function listBackupConfigs(params: { workspaceId?: string | null; agentRegId?: string; clientId?: string; scopeFilter?: Record<string, unknown> }) {
  const where: Record<string, unknown> = {};
  if (params.workspaceId) where.workspaceId = params.workspaceId;
  if (params.agentRegId) where.agentRegId = params.agentRegId;
  // MSP company filter — narrow by agent's workspace (not backup config's)
  if (params.clientId) {
    where.agent = { ...((where.agent as any) || {}), workspaceId: params.clientId };
  }

  if (params.scopeFilter && Object.keys(params.scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), params.scopeFilter];
  }

  const configs = await prisma.backupConfig.findMany({
    where,
    include: {
      agent: {
        select: {
          id: true, hostname: true, deviceId: true, workspaceId: true, companyName: true,
          device: { select: { locationId: true } },
          workspace: { select: { id: true, name: true } },
        },
      },
      history: { orderBy: { startedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Map agent workspace info to client field + fix BigInt serialization
  return configs.map(c => ({
    ...c,
    history: c.history?.map(h => ({ ...h, sizeBytes: h.sizeBytes ? Number(h.sizeBytes) : null })),
    client: c.agent?.workspace
      ? { id: c.agent.workspace.id, name: c.agent.companyName || c.agent.workspace.name }
      : c.agent?.companyName
        ? { id: '', name: c.agent.companyName }
        : undefined,
  }));
}

export async function getBackupConfig(id: string, workspaceId?: string) {
  const config = await prisma.backupConfig.findFirst({
    where: workspaceId ? { id, workspaceId } : { id },
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

export async function updateBackupConfig(id: string, data: UpdateBackupConfigInput, performedByUserId?: string, workspaceId?: string) {
  const existing = await prisma.backupConfig.findFirst({ where: workspaceId ? { id, workspaceId } : { id } });
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

export async function deleteBackupConfig(id: string, performedByUserId?: string, workspaceId?: string) {
  const existing = await prisma.backupConfig.findFirst({ where: workspaceId ? { id, workspaceId } : { id } });
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

export async function getBackupHistory(configId: string, workspaceId?: string, limit = 50) {
  // Verify config belongs to workspace before returning history
  if (workspaceId) {
    const config = await prisma.backupConfig.findFirst({ where: { id: configId, workspaceId } });
    if (!config) throw new AppError('Backup config not found', 404);
  }
  return prisma.backupHistory.findMany({
    where: { backupConfigId: configId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

// ── Agent reporting ──────────────────────────────────────────────────────────

export async function getAgentBackupConfigs(agentToken: string) {
  const { decrypt } = require('../../utils/crypto');
  const reg = await prisma.agentRegistration.findUnique({ where: { agentToken } });
  if (!reg) throw new AppError('Agent not found', 404);

  const configs = await prisma.backupConfig.findMany({
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
      localBackupPath: true,
      useInfradeskCloud: true,
      googleDriveFolder: true,
      googleDriveRefreshToken: true,
      googleDriveEmail: true,
      ftpHost: true,
      ftpPort: true,
      ftpUser: true,
      ftpPassEnc: true,
      ftpPath: true,
      cronSchedule: true,
      retentionDays: true,
      encryptBackups: true,
      encryptionKey: true,
      lastRunAt: true,
    },
  });

  // Decrypt passwords before sending to agent
  return configs.map(c => ({
    ...c,
    sqlPassword: c.sqlPassEnc ? (() => { try { return decrypt(c.sqlPassEnc); } catch { return c.sqlPassEnc; } })() : null,
    ftpPassword: c.ftpPassEnc ? (() => { try { return decrypt(c.ftpPassEnc); } catch { return c.ftpPassEnc; } })() : null,
    sqlPassEnc: undefined,
    ftpPassEnc: undefined,
  }));
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

  // Cleanup stuck RUNNING backups (older than 2 hours → mark as FAILED)
  const stuckCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const stuck = await prisma.backupHistory.findMany({
    where: { status: 'RUNNING', startedAt: { lt: stuckCutoff } },
  });
  if (stuck.length > 0) {
    await prisma.backupHistory.updateMany({
      where: { id: { in: stuck.map(h => h.id) } },
      data: { status: 'FAILED', errorMessage: 'Timeout — backup nie ukończony w 2h', completedAt: new Date() },
    });
    // Also update config lastStatus
    const configIds = [...new Set(stuck.map(h => h.backupConfigId))];
    for (const cid of configIds) {
      await prisma.backupConfig.update({ where: { id: cid }, data: { lastStatus: 'FAILED' } }).catch(() => {});
    }
  }
}

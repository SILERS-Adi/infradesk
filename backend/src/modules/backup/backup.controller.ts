import { Request, Response, NextFunction } from 'express';
import {
  listBackupConfigs, getBackupConfig, createBackupConfig, updateBackupConfig,
  deleteBackupConfig, getBackupHistory, getAgentBackupConfigs,
  reportBackupStart, reportBackupComplete, reportBackupFailed,
} from './backup.service';
import { backupScopeFilter, isBackupAccessible } from '../../middleware/workspace';

// ── Admin endpoints ──────────────────────────────────────────────────────────

export async function getConfigs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { agentRegId } = req.query as Record<string, string>;
    const configs = await listBackupConfigs({
      workspaceId: req.workspaceId,
      agentRegId,
      scopeFilter: backupScopeFilter(req.membership),
    });
    res.json(configs);
  } catch (err) { next(err); }
}

export async function getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = await getBackupConfig(req.params.id);

    if (req.membership && !isBackupAccessible(req.membership, {
      agentDeviceId: (config.agent as any)?.deviceId ?? null,
      agentDeviceLocationId: (config.agent as any)?.device?.locationId ?? null,
    })) {
      res.status(403).json({ error: 'Backup config not in your access scope' });
      return;
    }

    res.json(config);
  } catch (err) { next(err); }
}

export async function postConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = await createBackupConfig(req.body, req.user?.userId);
    res.status(201).json(config);
  } catch (err) { next(err); }
}

export async function patchConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = await updateBackupConfig(req.params.id, req.body, req.user?.userId);
    res.json(config);
  } catch (err) { next(err); }
}

export async function removeConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteBackupConfig(req.params.id, req.user?.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const history = await getBackupHistory(req.params.id);
    res.json(history);
  } catch (err) { next(err); }
}

export async function runNow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Just trigger via WebSocket to the agent
    const config = await getBackupConfig(req.params.id);
    const { notifyAgent } = await import('../../utils/websocket');
    const reg = await import('../../lib/prisma').then(m => m.default.agentRegistration.findUnique({ where: { id: config.agentRegId } }));
    if (reg) {
      notifyAgent(reg.agentToken, { type: 'backup_run', configId: config.id });
    }
    res.json({ ok: true, message: 'Backup triggered' });
  } catch (err) { next(err); }
}

// ── Agent endpoints ──────────────────────────────────────────────────────────

export async function agentGetConfigs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req as any).agentToken as string;
    const configs = await getAgentBackupConfigs(token);
    res.json(configs);
  } catch (err) { next(err); }
}

export async function agentReportStart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { configId } = req.body;
    const history = await reportBackupStart(configId);
    res.json({ historyId: history.id });
  } catch (err) { next(err); }
}

export async function agentReportComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { historyId, sizeBytes, fileName, googleDriveId } = req.body;
    const history = await reportBackupComplete(historyId, { sizeBytes, fileName, googleDriveId });
    res.json(history);
  } catch (err) { next(err); }
}

export async function agentReportFailed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { configId, error } = req.body;
    const history = await reportBackupFailed(configId, error);
    res.json(history);
  } catch (err) { next(err); }
}

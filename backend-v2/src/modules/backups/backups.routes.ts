import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { isAgentOnline, notifyAgent } from '../agents-ws/agents-ws.server';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { encrypt } from '../../lib/crypto';
import { logActivity, reqContext } from '../activity-logs/logActivity';

const router = Router();
router.use(requireAuth, requireWorkspace);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['SQL_MYSQL', 'SQL_POSTGRES', 'SQL_MSSQL', 'FOLDER']),
  agentRegistrationId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  sqlHost: z.string().optional(),
  sqlPort: z.coerce.number().int().positive().optional(),
  sqlDatabase: z.string().optional(),
  sqlUsername: z.string().optional(),
  sqlPassword: z.string().optional(),   // plaintext — will encrypt
  folderPath: z.string().optional(),
  googleDriveFolder: z.string().optional(),
  useInfradeskCloud: z.boolean().default(false),
  localBackupPath: z.string().optional(),
  ftpHost: z.string().optional(),
  ftpUsername: z.string().optional(),
  ftpPassword: z.string().optional(),
  cronSchedule: z.string().default('0 2 * * *'),
  retentionDays: z.coerce.number().int().min(1).max(3650).default(30),
  encryptBackups: z.boolean().default(true),
  clientProvidedKey: z.boolean().default(false),
});

const updateSchema = createSchema.partial();

// Helpers
function publicShape(b: { sqlPasswordEnc: string | null; ftpPasswordEnc: string | null } & Record<string, unknown>) {
  const { sqlPasswordEnc, sqlPasswordIv, sqlPasswordAuthTag, ftpPasswordEnc, ftpPasswordIv, ftpPasswordAuthTag, encryptionKeyEnc, encryptionKeyIv, encryptionKeyAuthTag, ...safe } = b as unknown as Record<string, unknown>;
  void sqlPasswordEnc; void sqlPasswordIv; void sqlPasswordAuthTag; void ftpPasswordEnc; void ftpPasswordIv; void ftpPasswordAuthTag; void encryptionKeyEnc; void encryptionKeyIv; void encryptionKeyAuthTag;
  return { ...safe, hasSqlPassword: !!b.sqlPasswordEnc, hasFtpPassword: !!b.ftpPasswordEnc };
}

// GET /backups
router.get('/', requireAccess(MODULES.BACKUPS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agentRegistrationId = typeof req.query.agentRegistrationId === 'string' ? req.query.agentRegistrationId : undefined;
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;

    // Cross-workspace read for MSP providers — config może leżeć w client workspace
    // ALBO w provider workspace (jeśli agent zarejestrował się tam). Aby panel
    // providera widział wszystkie kopie urządzeń klienta, dolinkuję tu workspace
    // klientów + provider sam.
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];

    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds } };
    // OR — config może mieć tylko deviceId, tylko agentRegistrationId, lub oba.
    // AND wykluczy te z NULL po jednej stronie.
    const orConditions: Record<string, unknown>[] = [];
    if (deviceId) orConditions.push({ deviceId });
    if (agentRegistrationId) orConditions.push({ agentRegistrationId });
    if (orConditions.length > 0) where.OR = orConditions;

    const items = await prisma.backupConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        history: { orderBy: { startedAt: 'desc' }, take: 1 },
        _count: { select: { history: true } },
      },
    });
    res.json({ configs: items.map(publicShape) });
  } catch (err) { next(err); }
});

// POST /backups
router.post('/', requireAccess(MODULES.BACKUPS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const data: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      name: input.name,
      type: input.type,
      agentRegistrationId: input.agentRegistrationId,
      deviceId: input.deviceId,
      sqlHost: input.sqlHost,
      sqlPort: input.sqlPort,
      sqlDatabase: input.sqlDatabase,
      sqlUsername: input.sqlUsername,
      folderPath: input.folderPath,
      googleDriveFolder: input.googleDriveFolder,
      useInfradeskCloud: input.useInfradeskCloud,
      localBackupPath: input.localBackupPath,
      ftpHost: input.ftpHost,
      ftpUsername: input.ftpUsername,
      cronSchedule: input.cronSchedule,
      retentionDays: input.retentionDays,
      encryptBackups: input.encryptBackups,
      clientProvidedKey: input.clientProvidedKey,
      createdByUserId: req.auth!.sub,
      lastStatus: 'NEVER_RAN',
    };
    if (input.sqlPassword) {
      const enc = encrypt(input.sqlPassword);
      data.sqlPasswordEnc = enc.ciphertext; data.sqlPasswordIv = enc.iv; data.sqlPasswordAuthTag = enc.authTag;
    }
    if (input.ftpPassword) {
      const enc = encrypt(input.ftpPassword);
      data.ftpPasswordEnc = enc.ciphertext; data.ftpPasswordIv = enc.iv; data.ftpPasswordAuthTag = enc.authTag;
    }
    const c = await prisma.backupConfig.create({ data: data as never });
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'backup',
      entityId: c.id,
      actionType: 'created',
      description: `Dodano konfigurację backupu "${c.name}" (${c.type})`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { type: c.type, cron: c.cronSchedule },
    });
    res.status(201).json({ config: publicShape(c) });
  } catch (err) { next(err); }
});

// GET /backups/:id — with history
router.get('/:id', requireAccess(MODULES.BACKUPS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await prisma.backupConfig.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      include: { history: { orderBy: { startedAt: 'desc' }, take: 50 } },
    });
    if (!c) throw HttpError.notFound();
    res.json({ config: publicShape(c), history: c.history });
  } catch (err) { next(err); }
});

// PATCH /backups/:id
router.patch('/:id', requireAccess(MODULES.BACKUPS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.backupConfig.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();

    const data: Record<string, unknown> = { ...input };
    delete data.sqlPassword; delete data.ftpPassword;
    if (input.sqlPassword) {
      const enc = encrypt(input.sqlPassword);
      data.sqlPasswordEnc = enc.ciphertext; data.sqlPasswordIv = enc.iv; data.sqlPasswordAuthTag = enc.authTag;
    }
    if (input.ftpPassword) {
      const enc = encrypt(input.ftpPassword);
      data.ftpPasswordEnc = enc.ciphertext; data.ftpPasswordIv = enc.iv; data.ftpPasswordAuthTag = enc.authTag;
    }
    const c = await prisma.backupConfig.update({ where: { id: existing.id }, data });
    res.json({ config: publicShape(c) });
  } catch (err) { next(err); }
});

// POST /backups/:id/run-now
//
// Pushes a backup_run command via WS to the agent that owns this BackupConfig.
// The agent (v5) executes the actual backup (SQL dump / folder zip / upload),
// reports progress via /api/agent/backup/start|complete|failed.
router.post('/:id/run-now', requireAccess(MODULES.BACKUPS, 'edit'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.backupConfig.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, agentRegistrationId: true, name: true },
    });
    if (!existing) throw HttpError.notFound();
    if (!existing.agentRegistrationId) {
      throw HttpError.badRequest(
        'Backup nie ma przypisanego asystenta (agentRegistrationId puste)',
        'no_agent',
      );
    }

    // Pre-create the BackupHistory row so agent can reference it
    const run = await prisma.backupHistory.create({
      data: {
        backupConfigId: existing.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
    await prisma.backupConfig.update({
      where: { id: existing.id },
      data: { lastStatus: 'RUNNING', lastRunAt: new Date() },
    });

    // Push command to agent (require online).
    let pushed = false;
    let pushError: string | null = null;
    if (isAgentOnline(existing.agentRegistrationId)) {
      try {
        // Fire-and-forget — backup takes minutes/hours; agent will report
        // progress via /agent/backup/* compat endpoints (start/complete/failed).
        notifyAgent(existing.agentRegistrationId, {
          type: 'backup_run',
          configId: existing.id,
          historyId: run.id,
        });
        pushed = true;
      } catch (err) {
        pushError = (err as Error).message;
      }
    } else {
      pushError = 'Agent jest offline';
    }

    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'backup',
      entityId: existing.id,
      actionType: 'run_now',
      description: pushed
        ? `Ręcznie uruchomiono backup "${existing.name}" (push do asystenta)`
        : `Próba uruchomienia backupu "${existing.name}" — ${pushError}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { runId: run.id, pushed, pushError },
    });

    if (!pushed) {
      // Mark history as failed since we couldn't reach the agent.
      await prisma.backupHistory.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: pushError ?? 'Nie udało się wysłać polecenia do asystenta',
        },
      });
      await prisma.backupConfig.update({
        where: { id: existing.id },
        data: { lastStatus: 'FAILED' },
      });
      res.status(409).json({
        error: 'agent_offline',
        message: pushError ?? 'Asystent jest offline — uruchom go i spróbuj ponownie',
      });
      return;
    }

    res.status(202).json({
      run,
      message: 'Backup uruchomiony — asystent wykona zadanie i zaraportuje wynik.',
    });
  } catch (err) { next(err); }
});

// DELETE /backups/:id
router.delete('/:id', requireAccess(MODULES.BACKUPS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.backupConfig.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.backupConfig.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

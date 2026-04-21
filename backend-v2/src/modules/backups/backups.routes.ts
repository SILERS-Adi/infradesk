import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { encrypt } from '../../lib/crypto';

const router = Router();
router.use(requireAuth, requireWorkspace);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['SQL_MYSQL', 'SQL_POSTGRES', 'SQL_MSSQL', 'FOLDER']),
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
    const items = await prisma.backupConfig.findMany({
      where: { workspaceId: req.workspaceId! },
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
router.post('/:id/run-now', requireAccess(MODULES.BACKUPS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.backupConfig.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const run = await prisma.backupHistory.create({
      data: {
        backupConfigId: existing.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
    await prisma.backupConfig.update({ where: { id: existing.id }, data: { lastStatus: 'RUNNING', lastRunAt: new Date() } });
    // TODO: actual backup worker (BullMQ) — teraz tylko rekord, workers w Sprint 6
    res.status(202).json({ run, message: 'Backup scheduled (worker TODO in Sprint 6)' });
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

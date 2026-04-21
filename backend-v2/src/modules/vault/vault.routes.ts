import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess, loadMembershipContext } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { encrypt, decrypt } from '../../lib/crypto';

const router = Router();
router.use(requireAuth, requireWorkspace);

const CATEGORIES = ['WINDOWS', 'VPN', 'EMAIL', 'APPLICATION', 'DATABASE', 'ROUTER', 'WIFI', 'SSH', 'API_KEY', 'CERTIFICATE', 'OTHER'] as const;
const ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES),
  username: z.string().max(200).optional(),
  password: z.string().min(1).max(2000),
  urlOrHost: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  deviceId: z.string().uuid().optional(),
  visibleToRoles: z.array(z.enum(ROLES)).default(['OWNER', 'ADMIN']),
  expiresAt: z.string().datetime().optional(),
  rotationPolicyDays: z.number().int().min(1).max(730).optional(),
});

const updateSchema = createSchema.partial();
const revealSchema = z.object({ reason: z.string().max(200).optional() });

function toSummary(c: {
  id: string; workspaceId: string; name: string; category: string;
  username: string | null; urlOrHost: string | null; tags: string[];
  deviceId: string | null; visibleToRoles: string[];
  expiresAt: Date | null; lastRotatedAt: Date | null; rotationPolicyDays: number | null;
  createdByUserId: string; createdAt: Date; updatedAt: Date;
}) {
  // Never return password/iv/authTag by default.
  return c;
}

router.get('/', requireAccess(MODULES.VAULT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const q = z.object({
      category: z.string().optional(),
      deviceId: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
    }).parse(req.query);
    const where: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      deletedAt: null,
      visibleToRoles: { has: ctx.role },
    };
    if (q.category) where.category = { in: q.category.split(',') };
    if (q.deviceId) where.deviceId = q.deviceId;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { username: { contains: q.search, mode: 'insensitive' } },
        { urlOrHost: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const creds = await prisma.credential.findMany({
      where, orderBy: { name: 'asc' },
      select: {
        id: true, workspaceId: true, name: true, category: true, username: true,
        urlOrHost: true, tags: true, deviceId: true, visibleToRoles: true,
        expiresAt: true, lastRotatedAt: true, rotationPolicyDays: true,
        createdByUserId: true, createdAt: true, updatedAt: true,
      },
    });
    res.json({ credentials: creds.map(toSummary) });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.VAULT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    if (input.deviceId) {
      const d = await prisma.device.findFirst({
        where: { id: input.deviceId, workspaceId: req.workspaceId!, deletedAt: null },
        select: { id: true },
      });
      if (!d) throw HttpError.badRequest('Device nie należy do workspace', 'invalid_device');
    }
    const { password, ...rest } = input;
    const enc = encrypt(password);
    const created = await prisma.credential.create({
      data: {
        ...rest,
        workspaceId: req.workspaceId!,
        passwordEncrypted: enc.ciphertext,
        passwordIv: enc.iv,
        passwordAuthTag: enc.authTag,
        createdByUserId: req.auth!.sub,
        expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : null,
      },
      select: {
        id: true, workspaceId: true, name: true, category: true, username: true,
        urlOrHost: true, tags: true, deviceId: true, visibleToRoles: true,
        expiresAt: true, lastRotatedAt: true, rotationPolicyDays: true,
        createdByUserId: true, createdAt: true, updatedAt: true,
      },
    });
    res.status(201).json({ credential: created });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.VAULT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const c = await prisma.credential.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: {
        id: true, workspaceId: true, name: true, category: true, username: true,
        urlOrHost: true, notes: true, tags: true, deviceId: true, visibleToRoles: true,
        expiresAt: true, lastRotatedAt: true, rotationPolicyDays: true,
        createdByUserId: true, createdAt: true, updatedAt: true,
      },
    });
    if (!c) throw HttpError.notFound();
    if (!c.visibleToRoles.includes(ctx.role)) throw HttpError.forbidden('Brak uprawnień do tego credentiala');
    res.json({ credential: c });
  } catch (err) { next(err); }
});

/**
 * Returns the decrypted password in plaintext.
 * Always writes a CredentialViewLog entry — auditable.
 */
router.post('/:id/reveal', requireAccess(MODULES.VAULT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = revealSchema.parse(req.body);
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const c = await prisma.credential.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: {
        id: true, passwordEncrypted: true, passwordIv: true, passwordAuthTag: true,
        visibleToRoles: true, username: true,
      },
    });
    if (!c) throw HttpError.notFound();
    if (!c.visibleToRoles.includes(ctx.role)) throw HttpError.forbidden('Brak uprawnień do tego credentiala');

    const plaintext = decrypt({ ciphertext: c.passwordEncrypted, iv: c.passwordIv, authTag: c.passwordAuthTag });
    await prisma.credentialViewLog.create({
      data: {
        credentialId: c.id,
        userId: req.auth!.sub,
        ipAddress: req.ip?.slice(0, 50),
        userAgent: req.get('user-agent')?.slice(0, 400),
        reason: input.reason,
      },
    });
    res.json({ username: c.username, password: plaintext });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.VAULT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.credential.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const data: Record<string, unknown> = { ...input, password: undefined };
    if (input.password) {
      const enc = encrypt(input.password);
      data.passwordEncrypted = enc.ciphertext;
      data.passwordIv = enc.iv;
      data.passwordAuthTag = enc.authTag;
      data.lastRotatedAt = new Date();
    }
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const c = await prisma.credential.update({
      where: { id: existing.id },
      data,
      select: {
        id: true, workspaceId: true, name: true, category: true, username: true,
        urlOrHost: true, tags: true, deviceId: true, visibleToRoles: true,
        expiresAt: true, lastRotatedAt: true, rotationPolicyDays: true,
        createdByUserId: true, createdAt: true, updatedAt: true,
      },
    });
    res.json({ credential: c });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.VAULT, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.credential.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.credential.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/audit', requireAccess(MODULES.VAULT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cred = await prisma.credential.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!cred) throw HttpError.notFound();
    const logs = await prisma.credentialViewLog.findMany({
      where: { credentialId: cred.id },
      orderBy: { viewedAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    res.json({ logs });
  } catch (err) { next(err); }
});

export default router;

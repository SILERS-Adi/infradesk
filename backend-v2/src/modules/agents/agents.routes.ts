import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { randomToken, hashToken } from '../../lib/crypto';

const router = Router();

// --------------------------------------------------------------------------
// Agent-authenticated endpoints (Bearer token, no user auth)
// --------------------------------------------------------------------------

async function authAgent(req: Request): Promise<{ registrationId: string; deviceId: string | null; workspaceId: string; status: string }> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw HttpError.unauthorized('Missing agent token');
  const token = header.slice(7).trim();
  const tokenHash = hashToken(token);
  const reg = await prisma.agentRegistration.findUnique({
    where: { agentTokenHash: tokenHash },
    select: { id: true, deviceId: true, workspaceId: true, status: true },
  });
  if (!reg) throw HttpError.unauthorized('Invalid agent token');
  return { registrationId: reg.id, deviceId: reg.deviceId, workspaceId: reg.workspaceId, status: reg.status };
}

// Public registration — agent calls this with hardware fingerprint.
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      workspaceSlug: z.string().min(1).max(80),
      hostname: z.string().min(1).max(120),
      agentVersion: z.string().max(40).optional(),
      manufacturer: z.string().max(120).optional(),
      model: z.string().max(120).optional(),
      serialNumber: z.string().max(120).optional(),
      osName: z.string().max(60).optional(),
      osVersion: z.string().max(60).optional(),
      cpuModel: z.string().max(120).optional(),
      ramMb: z.number().int().optional(),
      companyName: z.string().max(200).optional(),
      nip: z.string().max(20).optional(),
      contactFirstName: z.string().max(100).optional(),
      contactLastName: z.string().max(100).optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().max(40).optional(),
    }).parse(req.body);

    const workspace = await prisma.workspace.findUnique({
      where: { slug: input.workspaceSlug },
      select: { id: true, isActive: true },
    });
    if (!workspace || !workspace.isActive) throw HttpError.notFound('Workspace not found');

    // Idempotent by (workspaceId, hostname, serialNumber).
    const existing = await prisma.agentRegistration.findFirst({
      where: { workspaceId: workspace.id, hostname: input.hostname, serialNumber: input.serialNumber ?? null },
      select: { id: true, agentToken: true, status: true },
    });
    if (existing) {
      res.json({ registrationId: existing.id, agentToken: existing.agentToken, status: existing.status, reused: true });
      return;
    }

    const token = randomToken(32);
    const reg = await prisma.agentRegistration.create({
      data: {
        workspaceId: workspace.id,
        agentToken: token,
        agentTokenHash: hashToken(token),
        agentVersion: input.agentVersion ?? 'unknown',
        status: 'PENDING',
        hostname: input.hostname,
        manufacturer: input.manufacturer,
        model: input.model,
        serialNumber: input.serialNumber,
        osName: input.osName,
        osVersion: input.osVersion,
        cpuModel: input.cpuModel,
        ramMb: input.ramMb,
        companyName: input.companyName,
        nip: input.nip,
        contactFirstName: input.contactFirstName,
        contactLastName: input.contactLastName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
      },
      select: { id: true, agentToken: true, status: true },
    });
    res.status(201).json({ registrationId: reg.id, agentToken: reg.agentToken, status: reg.status, reused: false });
  } catch (err) { next(err); }
});

// Heartbeat + telemetry — agent → server.
router.post('/telemetry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await authAgent(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not approved');

    const input = z.object({
      metrics: z.record(z.unknown()).optional(),
      currentUser: z.string().max(120).optional(),
      diskFreeGb: z.number().optional(),
      diskTotalGb: z.number().optional(),
      agentVersion: z.string().max(40).optional(),
    }).parse(req.body);

    await prisma.agentRegistration.update({
      where: { id: reg.registrationId },
      data: {
        lastSeen: new Date(),
        serverMetrics: (input.metrics ?? undefined) as never,
        currentUser: input.currentUser,
        diskFreeGb: input.diskFreeGb,
        diskTotalGb: input.diskTotalGb,
        agentVersion: input.agentVersion ?? undefined,
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------------------
// Admin endpoints (user auth + workspace + MODULES.DEVICES edit)
// --------------------------------------------------------------------------

const adminRouter = Router();
adminRouter.use(requireAuth, requireWorkspace);

adminRouter.get('/', requireAccess(MODULES.DEVICES, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ status: z.string().optional() }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.status) where.status = { in: q.status.split(',') };
    const agents = await prisma.agentRegistration.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: {
        id: true, hostname: true, status: true, agentVersion: true, lastSeen: true,
        manufacturer: true, model: true, osName: true, osVersion: true,
        companyName: true, contactFirstName: true, contactLastName: true, contactEmail: true,
        createdAt: true, deviceId: true,
      },
    });
    res.json({ agents });
  } catch (err) { next(err); }
});

const approveSchema = z.object({
  locationId: z.string().uuid(),
  deviceName: z.string().min(1).max(120),
  category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']).default('WORKSTATION'),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

adminRouter.post('/:id/approve', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = approveSchema.parse(req.body);
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
    });
    if (!reg) throw HttpError.notFound();
    if (reg.status === 'ACTIVE') throw HttpError.badRequest('Agent jest już zatwierdzony', 'already_active');

    const loc = await prisma.location.findFirst({
      where: { id: input.locationId, workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!loc) throw HttpError.badRequest('Location nie należy do workspace', 'invalid_location');

    const { default: crypto } = await import('crypto');
    const qrCodeValue = `IDSK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const updated = await prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          workspaceId: req.workspaceId!,
          locationId: input.locationId,
          name: input.deviceName,
          hostname: reg.hostname,
          category: input.category,
          criticality: input.criticality,
          status: 'ACTIVE',
          qrCodeValue,
          serialNumber: reg.serialNumber,
          manufacturer: reg.manufacturer,
          model: reg.model,
          operatingSystem: reg.osName,
          osVersion: reg.osVersion,
        },
      });
      return tx.agentRegistration.update({
        where: { id: reg.id },
        data: { status: 'ACTIVE', deviceId: device.id, approvedAt: new Date(), approvedByUserId: req.auth!.sub },
      });
    });
    res.json({ agent: updated });
  } catch (err) { next(err); }
});

adminRouter.post('/:id/reject', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, status: true },
    });
    if (!reg) throw HttpError.notFound();
    const updated = await prisma.agentRegistration.update({
      where: { id: reg.id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectedByUserId: req.auth!.sub },
    });
    res.json({ agent: updated });
  } catch (err) { next(err); }
});

router.use('/admin', adminRouter);

export default router;

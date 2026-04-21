import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const DEVICE_CATEGORIES = ['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER'] as const;
const CRITICALITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUS = ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  locationId: z.string().uuid(),
  hostname: z.string().max(120).optional(),
  category: z.enum(DEVICE_CATEGORIES),
  criticality: z.enum(CRITICALITY).default('MEDIUM'),
  status: z.enum(STATUS).default('ACTIVE'),
  assetTag: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  operatingSystem: z.string().max(60).optional(),
  osVersion: z.string().max(60).optional(),
  ipAddress: z.string().max(50).optional(),
  macAddress: z.string().max(50).optional(),
  purchaseDate: z.string().datetime().optional(),
  installationDate: z.string().datetime().optional(),
  warrantyUntil: z.string().datetime().optional(),
  assignedUserId: z.string().uuid().optional(),
  rustdeskId: z.string().max(40).optional(),
  rdpAddress: z.string().max(200).optional(),
  sshAddress: z.string().max(200).optional(),
  anydeskId: z.string().max(40).optional(),
  teamviewerId: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  clientVisibleNotes: z.string().max(2000).optional(),
});

const updateSchema = createSchema.partial();

function generateQrValue(): string {
  return `IDSK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

router.get('/', requireAccess(MODULES.DEVICES, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      status: z.string().optional(),
      locationId: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
    }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId!, deletedAt: null };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.locationId) where.locationId = q.locationId;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { hostname: { contains: q.search, mode: 'insensitive' } },
        { serialNumber: { contains: q.search, mode: 'insensitive' } },
        { ipAddress: { contains: q.search } },
      ];
    }
    const devices = await prisma.device.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, hostname: true, category: true, criticality: true, status: true,
        ipAddress: true, macAddress: true, operatingSystem: true, osVersion: true,
        qrCodeValue: true,
        location: { select: { id: true, name: true, city: true } },
      },
    });
    res.json({ devices });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const loc = await prisma.location.findFirst({
      where: { id: input.locationId, workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!loc) throw HttpError.badRequest('Location nie należy do workspace', 'invalid_location');

    const dup = await prisma.device.findFirst({
      where: { workspaceId: req.workspaceId!, name: input.name, deletedAt: null },
      select: { id: true },
    });
    if (dup) throw HttpError.conflict('Device o takiej nazwie już istnieje', 'device_name_taken');

    const d = await prisma.device.create({
      data: {
        ...input,
        workspaceId: req.workspaceId!,
        qrCodeValue: generateQrValue(),
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
        installationDate: input.installationDate ? new Date(input.installationDate) : null,
        warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null,
      },
    });
    res.status(201).json({ device: d });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.DEVICES, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const d = await prisma.device.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      include: {
        location: { select: { id: true, name: true, city: true } },
        agent: { select: { id: true, status: true, lastSeen: true } },
        _count: { select: { tickets: true, alerts: true } },
      },
    });
    if (!d) throw HttpError.notFound();
    res.json({ device: d });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.device.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!existing) throw HttpError.notFound();
    if (input.name && input.name !== existing.name) {
      const dup = await prisma.device.findFirst({
        where: { workspaceId: req.workspaceId!, name: input.name, deletedAt: null, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (dup) throw HttpError.conflict('Device o takiej nazwie już istnieje', 'device_name_taken');
    }
    const data = {
      ...input,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
      installationDate: input.installationDate ? new Date(input.installationDate) : undefined,
      warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : undefined,
    };
    const d = await prisma.device.update({ where: { id: existing.id }, data });
    res.json({ device: d });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.DEVICES, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.device.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.device.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: 'DECOMMISSIONED' } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

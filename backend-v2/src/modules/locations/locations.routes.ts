import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const createSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  type: z.enum(['OFFICE', 'WAREHOUSE', 'RETAIL', 'HOME_OFFICE', 'OTHER']).default('OFFICE'),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20),
  city: z.string().min(1).max(80),
  country: z.string().length(2).default('PL'),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLon: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().int().min(10).max(5000).optional(),
  autoCheckInEnabled: z.boolean().optional(),
  requireQrConfirmation: z.boolean().optional(),
  workspaceId: z.string().uuid().optional(),
});

const updateSchema = createSchema.partial();

/**
 * Resolve target workspaceId. If caller passed workspaceId in body/query different from req.workspaceId,
 * verify MSP has active WorkspaceRelation with that client workspace.
 */
async function resolveTargetWs(req: Request, overrideWsId: string | undefined): Promise<string> {
  const target = overrideWsId ?? req.workspaceId!;
  if (overrideWsId && overrideWsId !== req.workspaceId) {
    const rel = await prisma.workspaceRelation.findFirst({
      where: { providerWorkspaceId: req.workspaceId!, clientWorkspaceId: overrideWsId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!rel) throw HttpError.forbidden('Brak aktywnej relacji z klientem');
  }
  return target;
}

router.get('/', requireAccess(MODULES.LOCATIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ workspaceId: z.string().uuid().optional() }).parse(req.query);
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canViewLocations: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds }, deletedAt: null };
    if (q.workspaceId) {
      if (!visibleWsIds.includes(q.workspaceId)) throw HttpError.forbidden('Brak dostępu do tej firmy');
      where.workspaceId = q.workspaceId;
    }
    const locations = await prisma.location.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ locations });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.LOCATIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const { workspaceId: overrideWs, ...rest } = input;
    const targetWs = await resolveTargetWs(req, overrideWs);
    const l = await prisma.location.create({ data: { ...rest, workspaceId: targetWs } });
    res.status(201).json({ location: l });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.LOCATIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canViewLocations: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const l = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: { in: visibleWsIds }, deletedAt: null },
      include: { devices: { select: { id: true, name: true, category: true, status: true } } },
    });
    if (!l) throw HttpError.notFound();
    res.json({ location: l });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.LOCATIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const { workspaceId: _unused, ...rest } = input;
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canViewLocations: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const existing = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: { in: visibleWsIds }, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const l = await prisma.location.update({ where: { id: existing.id }, data: rest });
    res.json({ location: l });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.LOCATIONS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canViewLocations: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const existing = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: { in: visibleWsIds }, deletedAt: null },
      select: { id: true, devices: { select: { id: true } } },
    });
    if (!existing) throw HttpError.notFound();
    if (existing.devices.length > 0) {
      throw HttpError.conflict('Lokalizacja ma przypisane urządzenia', 'location_has_devices');
    }
    await prisma.location.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

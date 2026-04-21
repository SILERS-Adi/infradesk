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
});

const updateSchema = createSchema.partial();

router.get('/', requireAccess(MODULES.LOCATIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const locations = await prisma.location.findMany({
      where: { workspaceId: req.workspaceId!, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    res.json({ locations });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.LOCATIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const l = await prisma.location.create({ data: { ...input, workspaceId: req.workspaceId! } });
    res.status(201).json({ location: l });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.LOCATIONS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const l = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      include: { devices: { select: { id: true, name: true, category: true, status: true } } },
    });
    if (!l) throw HttpError.notFound();
    res.json({ location: l });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.LOCATIONS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const l = await prisma.location.update({ where: { id: existing.id }, data: input });
    res.json({ location: l });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.LOCATIONS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.location.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
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

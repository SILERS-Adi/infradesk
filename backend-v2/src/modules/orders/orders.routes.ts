import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  quantity: z.number().int().min(1).default(1),
  unitNet: z.number().nonnegative(),
});

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  supplierName: z.string().max(120).optional(),
  clientWorkspaceId: z.string().uuid().optional(),
  vatRate: z.number().min(0).max(100).default(23),
  expectedDeliveryDate: z.string().datetime().optional(),
  items: z.array(itemSchema).min(1).max(200),
});

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  supplierName: z.string().max(120).optional().nullable(),
  supplierOrderRef: z.string().max(120).optional().nullable(),
  expectedDeliveryDate: z.string().datetime().optional().nullable(),
  vatRate: z.number().min(0).max(100).optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'QUOTE_SENT', 'APPROVED', 'ORDERED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED']),
});

async function nextOrderNumber(workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  return prisma.$transaction(async (tx) => {
    const last = await tx.order.findFirst({
      where: { workspaceId, orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    let n = 1;
    if (last) {
      const matched = last.orderNumber.match(/-(\d+)$/);
      if (matched) n = parseInt(matched[1]!, 10) + 1;
    }
    return `${prefix}${String(n).padStart(4, '0')}`;
  });
}

function computeTotals(items: Array<{ quantity: number; unitNet: number }>, vatRatePct: number) {
  const totalNet = items.reduce((acc, i) => acc + i.quantity * i.unitNet, 0);
  const totalGross = totalNet * (1 + vatRatePct / 100);
  return { totalNet, totalGross };
}

router.get('/', requireAccess(MODULES.ORDERS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ status: z.string().optional(), search: z.string().max(120).optional() }).parse(req.query);
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE', canReceiveTickets: true },
      select: { clientWorkspaceId: true },
    });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const where: Record<string, unknown> = { workspaceId: { in: visibleWsIds } };
    if (q.status) where.status = { in: q.status.split(',') };
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { orderNumber: { contains: q.search.toUpperCase() } },
        { supplierName: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const orders = await prisma.order.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: {
        items: { select: { id: true, name: true, quantity: true, unitNet: true, totalNet: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      },
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.ORDERS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const orderNumber = await nextOrderNumber(req.workspaceId!);
    const { totalNet, totalGross } = computeTotals(input.items, input.vatRate);

    const created = await prisma.order.create({
      data: {
        workspaceId: req.workspaceId!,
        clientWorkspaceId: input.clientWorkspaceId,
        orderNumber, title: input.title,
        description: input.description,
        supplierName: input.supplierName,
        vatRate: new Prisma.Decimal(input.vatRate),
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
        totalNet: new Prisma.Decimal(totalNet.toFixed(2)),
        totalGross: new Prisma.Decimal(totalGross.toFixed(2)),
        createdByUserId: req.auth!.sub,
        status: 'DRAFT',
        items: {
          create: input.items.map((i) => ({
            name: i.name,
            description: i.description,
            quantity: i.quantity,
            unitNet: new Prisma.Decimal(i.unitNet.toFixed(2)),
            totalNet: new Prisma.Decimal((i.quantity * i.unitNet).toFixed(2)),
          })),
        },
      },
      include: { items: true },
    });
    res.status(201).json({ order: created });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.ORDERS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const o = await prisma.order.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      include: {
        items: true,
        linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      },
    });
    if (!o) throw HttpError.notFound();
    res.json({ order: o });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.ORDERS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.order.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, status: true },
    });
    if (!existing) throw HttpError.notFound();
    if (existing.status !== 'DRAFT') {
      throw HttpError.badRequest('Modyfikować można tylko szkice', 'order_not_draft');
    }
    const o = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...input,
        vatRate: input.vatRate !== undefined ? new Prisma.Decimal(input.vatRate) : undefined,
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : input.expectedDeliveryDate,
      },
    });
    res.json({ order: o });
  } catch (err) { next(err); }
});

router.post('/:id/status', requireAccess(MODULES.ORDERS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = statusSchema.parse(req.body);
    const existing = await prisma.order.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    const data: Record<string, unknown> = { status: input.status };
    if (input.status === 'DELIVERED') data.deliveredAt = new Date();
    const o = await prisma.order.update({ where: { id: existing.id }, data });
    res.json({ order: o });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.ORDERS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, status: true },
    });
    if (!existing) throw HttpError.notFound();
    if (!['DRAFT', 'CANCELLED'].includes(existing.status)) {
      throw HttpError.badRequest('Zamówienie w toku — anuluj najpierw', 'order_in_progress');
    }
    await prisma.order.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

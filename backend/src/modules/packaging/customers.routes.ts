import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// ── GET / — List customers (paginated, searchable) ─────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { search, page, per_page } = req.query as Record<string, string>;
    const pageNum = page ? parseInt(page) : 1;
    const perPage = per_page ? parseInt(per_page) : 50;
    const skip = (pageNum - 1) * perPage;

    const where: any = { workspaceId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { login: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [customers, total] = await prisma.$transaction([
      prisma.packingCustomer.findMany({
        where,
        orderBy: { lastOrderAt: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.packingCustomer.count({ where }),
    ]);

    res.json({
      data: customers,
      total,
      page: pageNum,
      perPage,
      totalPages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
});

// ── GET /:id — Customer details with shipment history ──────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const customer = await prisma.packingCustomer.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        shipments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            courier: true,
            createdAt: true,
            trackingNumber: true,
          },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    res.json(customer);
  } catch (err) { next(err); }
});

// ── PATCH /:id — Update notes ──────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { notes } = req.body;

    const customer = await prisma.packingCustomer.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const updated = await prisma.packingCustomer.update({
      where: { id: customer.id },
      data: { notes },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

export default router;

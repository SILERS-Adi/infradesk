import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

/**
 * GET / — List customers (paginated, searchable, sortable)
 * Matches PakOps: GET /customers/
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const {
      search,
      page: pageStr,
      per_page: perPageStr,
      sort: sortParam,
    } = req.query as Record<string, string>;

    const page = pageStr ? Math.max(1, parseInt(pageStr)) : 1;
    const perPage = perPageStr ? Math.min(100, Math.max(1, parseInt(perPageStr))) : 20;

    const where: any = { workspaceId };
    if (search) {
      where.OR = [
        { login: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await prisma.packingCustomer.count({ where });

    // Sort
    const sortField = sortParam || '-totalOrders';
    const desc = sortField.startsWith('-');
    const fieldName = desc ? sortField.slice(1) : sortField;
    const fieldMap: Record<string, string> = {
      total_orders: 'totalOrders',
      total_spent: 'totalSpent',
      last_order_at: 'lastOrderAt',
      created_at: 'createdAt',
    };
    const prismaField = fieldMap[fieldName] || fieldName;
    const orderBy: any = { [prismaField]: desc ? 'desc' : 'asc' };

    const customers = await prisma.packingCustomer.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    });

    res.json({
      items: customers.map(c => ({
        id: c.id,
        allegro_user_id: c.allegroUserId,
        login: c.login,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
        company_name: c.companyName,
        phone: c.phone,
        total_orders: c.totalOrders,
        total_spent: c.totalSpent || 0,
        last_order_at: c.lastOrderAt ? c.lastOrderAt.toISOString() : null,
        created_at: c.createdAt.toISOString(),
      })),
      total,
      page,
      per_page: perPage,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
});

/**
 * GET /:customer_id — Customer detail with order history
 * Matches PakOps: GET /customers/{customer_id}
 */
router.get('/:customer_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;

    const customer = await prisma.packingCustomer.findFirst({
      where: { id: req.params.customer_id, workspaceId },
    });
    if (!customer) {
      res.status(404).json({ detail: 'Customer not found' });
      return;
    }

    // Get orders
    const orders = await prisma.shipment.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    res.json({
      id: customer.id,
      allegro_user_id: customer.allegroUserId,
      login: customer.login,
      email: customer.email,
      first_name: customer.firstName,
      last_name: customer.lastName,
      company_name: customer.companyName,
      phone: customer.phone,
      address_street: customer.addressStreet,
      address_city: customer.addressCity,
      address_zip: customer.addressZip,
      nip: customer.nip,
      notes: customer.notes,
      total_orders: customer.totalOrders,
      total_spent: customer.totalSpent || 0,
      first_order_at: customer.firstOrderAt ? customer.firstOrderAt.toISOString() : null,
      last_order_at: customer.lastOrderAt ? customer.lastOrderAt.toISOString() : null,
      created_at: customer.createdAt.toISOString(),
      orders: orders.map(o => ({
        id: o.id,
        allegro_order_id: o.externalId || o.orderNumber,
        status: o.status.toLowerCase(),
        total_amount: o.totalAmount || 0,
        allegro_created_at: o.createdAt.toISOString(),
      })),
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /:customer_id — Update customer notes
 * Matches PakOps: PATCH /customers/{customer_id}
 */
router.patch('/:customer_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const { notes } = req.body;

    const customer = await prisma.packingCustomer.findFirst({
      where: { id: req.params.customer_id, workspaceId },
    });
    if (!customer) {
      res.status(404).json({ detail: 'Customer not found' });
      return;
    }

    if (notes !== undefined) {
      await prisma.packingCustomer.update({
        where: { id: customer.id },
        data: { notes },
      });
    }

    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});

export default router;

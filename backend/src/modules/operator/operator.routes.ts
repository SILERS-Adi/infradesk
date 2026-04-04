import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

/**
 * Middleware: require organization_type = it_operator
 */
async function requireOperator(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.isSuperAdmin) { next(); return; }
  const wsId = req.workspaceId;
  if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

  const ws = await prisma.workspace.findUnique({ where: { id: wsId }, select: { organizationType: true } });
  if (!ws || ws.organizationType !== 'it_operator') {
    res.status(403).json({ error: 'Dostępne tylko dla Centrum Obsługi IT', code: 'NOT_OPERATOR' });
    return;
  }
  next();
}

// Helper: get all client workspace IDs for this operator
async function getClientWorkspaceIds(operatorWsId: string, filterClientId?: string): Promise<string[]> {
  const where: any = { providerWorkspaceId: operatorWsId, status: 'ACTIVE' };
  if (filterClientId) where.clientWorkspaceId = filterClientId;

  const relations = await prisma.workspaceRelation.findMany({
    where,
    select: { clientWorkspaceId: true },
  });
  return relations.map(r => r.clientWorkspaceId);
}

// Helper: generate slug from name
function slugify(text: string): string {
  return text.toLowerCase().replace(/[ąćęłńóśżź]/g, c => 'acelnoszzaceelnooszz'['ąćęłńóśżź'.indexOf(c)] ?? c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const exists = await prisma.workspace.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    attempt++;
  }
}

// POST /api/operator/clients — create a new client workspace + relation
router.post('/clients', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorWsId = req.workspaceId!;
    const { name, legalName, taxId, email, phone, contactPerson, city } = req.body;

    if (!name || !name.trim()) { res.status(400).json({ error: 'Nazwa firmy jest wymagana' }); return; }

    const slug = await uniqueSlug(name);

    // Create client workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug,
        type: 'COMPANY',
        organizationType: 'client_external_it',
        legalName: legalName?.trim() || null,
        taxId: taxId?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        plan: 'FREE',
        enabledModules: ['infrastructure', 'service-desk'],
      },
    });

    // Create workspace relation (operator → client)
    const relation = await prisma.workspaceRelation.create({
      data: {
        clientWorkspaceId: workspace.id,
        providerWorkspaceId: operatorWsId,
        canViewDevices: true,
        canViewUsers: true,
        canViewLocations: true,
        canReceiveTickets: true,
        canCreateTicketsOnBehalf: true,
        canAccessAlerts: true,
        isDefaultHelpdeskProvider: true,
        status: 'ACTIVE',
      },
    });

    // Set helpdesk settings on client workspace to route to this operator
    await prisma.workspaceHelpdeskSettings.create({
      data: {
        workspaceId: workspace.id,
        ticketRoutingMode: 'send_to_default_provider',
        defaultProviderWorkspaceId: operatorWsId,
      },
    });

    res.status(201).json({ workspace, relation });
  } catch (err) { next(err); }
});

// GET /api/operator/clients — list all client companies
router.get('/clients', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;

    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: wsId, status: 'ACTIVE' },
      include: {
        clientWorkspace: {
          select: {
            id: true, name: true, slug: true, legalName: true, taxId: true,
            email: true, phone: true, logoUrl: true, city: true, isActive: true,
          },
        },
      },
    });

    // Enrich with stats
    const clients = await Promise.all(relations.map(async r => {
      const [deviceCount, ticketCount, activeTickets] = await Promise.all([
        prisma.device.count({ where: { workspaceId: r.clientWorkspaceId } }),
        prisma.ticket.count({ where: { workspaceId: r.clientWorkspaceId } }),
        prisma.ticket.count({ where: { workspaceId: r.clientWorkspaceId, status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }),
      ]);

      return {
        relationId: r.id,
        workspace: r.clientWorkspace,
        permissions: {
          canViewDevices: r.canViewDevices,
          canViewUsers: r.canViewUsers,
          canViewLocations: r.canViewLocations,
          canReceiveTickets: r.canReceiveTickets,
          canCreateTicketsOnBehalf: r.canCreateTicketsOnBehalf,
          canAccessAlerts: r.canAccessAlerts,
        },
        isDefaultHelpdeskProvider: r.isDefaultHelpdeskProvider,
        stats: { deviceCount, ticketCount, activeTickets },
      };
    }));

    res.json(clients);
  } catch (err) { next(err); }
});

// GET /api/operator/tickets — tickets from all clients
router.get('/tickets', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { clientWorkspaceId, status, priority, page = '1', per_page = '50' } = req.query as Record<string, string>;

    const clientIds = await getClientWorkspaceIds(wsId, clientWorkspaceId);
    if (clientIds.length === 0) { res.json({ data: [], pagination: { total: 0, page: 1, per_page: 50 } }); return; }

    const where: any = { workspaceId: { in: clientIds } };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
          location: { select: { id: true, name: true } },
          device: { select: { id: true, name: true, hostname: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(per_page),
        take: parseInt(per_page),
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ data: tickets, pagination: { total, page: parseInt(page), per_page: parseInt(per_page) } });
  } catch (err) { next(err); }
});

// GET /api/operator/devices — devices from all clients
router.get('/devices', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { clientWorkspaceId } = req.query as Record<string, string>;

    // Only get clients where we have device viewing permission
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: wsId, status: 'ACTIVE', canViewDevices: true, ...(clientWorkspaceId ? { clientWorkspaceId } : {}) },
      select: { clientWorkspaceId: true },
    });
    const clientIds = relations.map(r => r.clientWorkspaceId);
    if (clientIds.length === 0) { res.json([]); return; }

    const devices = await prisma.device.findMany({
      where: { workspaceId: { in: clientIds } },
      include: {
        workspace: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    res.json(devices);
  } catch (err) { next(err); }
});

// GET /api/operator/stats — dashboard stats across all clients
router.get('/stats', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;

    const clientIds = await getClientWorkspaceIds(wsId);
    if (clientIds.length === 0) {
      res.json({ clientCount: 0, deviceCount: 0, ticketCount: 0, activeTickets: 0, agentCount: 0 });
      return;
    }

    const [clientCount, deviceCount, ticketCount, activeTickets, agentCount] = await Promise.all([
      clientIds.length,
      prisma.device.count({ where: { workspaceId: { in: clientIds } } }),
      prisma.ticket.count({ where: { workspaceId: { in: clientIds } } }),
      prisma.ticket.count({ where: { workspaceId: { in: clientIds }, status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }),
      prisma.agentRegistration.count({ where: { workspaceId: { in: clientIds }, status: 'APPROVED' } }),
    ]);

    res.json({ clientCount, deviceCount, ticketCount, activeTickets, agentCount });
  } catch (err) { next(err); }
});

export default router;

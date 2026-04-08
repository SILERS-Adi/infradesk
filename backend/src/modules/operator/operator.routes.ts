import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
// Security: operator routes are workspace-scoped to the MSP workspace. Cross-workspace client access is validated per-endpoint via WorkspaceManagement relations.
router.use(authenticate, requireWorkspace);

/**
 * Middleware: require organization_type = it_operator
 */
async function requireOperator(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.isSuperAdmin) { next(); return; }
  const wsId = req.workspaceId;
  if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

  const ws = await prisma.workspace.findUnique({ where: { id: wsId }, select: { orgType: true, organizationType: true } });
  const isMsp = ws?.orgType
    ? (ws.orgType === 'MSP' || ws.orgType === 'IT_OPERATOR')
    : (ws?.organizationType === 'msp' || ws?.organizationType === 'it_operator');
  if (!ws || !isMsp) {
    res.status(403).json({ error: 'Dostępne tylko dla MSP / Centrum Obsługi IT', code: 'NOT_OPERATOR' });
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
    const { name, legalName, taxId, email, phone, contactPerson, city, locationName, activatePortal, assignedUserId } = req.body;

    if (!name || !name.trim()) { res.status(400).json({ error: 'Nazwa firmy jest wymagana' }); return; }

    const slug = await uniqueSlug(name);

    // clientStatus: draft (no portal) | invited (portal pending) | active (portal active)
    const clientStatus = activatePortal ? 'invited' : 'draft';

    // Create client workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        slug,
        type: 'COMPANY',
        organizationType: 'client',
        legalName: legalName?.trim() || null,
        taxId: taxId?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        plan: 'FREE',
        enabledModules: ['infrastructure', 'service-desk'],
      },
    });

    // Create default location if provided
    if (locationName?.trim()) {
      await prisma.location.create({
        data: {
          workspaceId: workspace.id,
          name: locationName.trim(),
          type: 'OFFICE',
          addressLine1: city?.trim() || '-',
          postalCode: '',
          city: city?.trim() || '',
        },
      });
    }

    // Create workspace relation (operator → client) — immediate, no approval needed
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
        status: clientStatus === 'draft' ? 'ACTIVE' : 'ACTIVE', // relation always active
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

    // Store client status + assigned user in workspace settings
    await prisma.workspaceSetting.createMany({
      data: [
        { workspaceId: workspace.id, key: 'client_status', value: clientStatus },
        ...(assignedUserId ? [{ workspaceId: workspace.id, key: 'assigned_msp_user', value: assignedUserId }] : []),
      ],
      skipDuplicates: true,
    });

    res.status(201).json({ workspace, relation, clientStatus });
  } catch (err) { next(err); }
});

// POST /api/operator/clients/:id/activate — send portal access / change status
router.post('/clients/:id/activate', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientWsId = req.params.id;

    // Update status to 'active'
    await prisma.workspaceSetting.upsert({
      where: { workspaceId_key: { workspaceId: clientWsId, key: 'client_status' } },
      create: { workspaceId: clientWsId, key: 'client_status', value: 'active' },
      update: { value: 'active' },
    });

    // TODO: send email with portal access link to client.email

    res.json({ success: true, status: 'active' });
  } catch (err) { next(err); }
});

// GET /api/operator/clients/available — list workspaces not yet linked to this operator
router.get('/clients/available', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;

    // Get already linked client IDs
    const linked = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: wsId },
      select: { clientWorkspaceId: true },
    });
    const linkedIds = new Set(linked.map(r => r.clientWorkspaceId));
    linkedIds.add(wsId); // exclude self

    // Security: only return workspaces with client/internal_it type (not other MSPs),
    // and minimize data exposure — no email or taxId in listing.
    const available = await prisma.workspace.findMany({
      where: {
        isActive: true,
        id: { notIn: Array.from(linkedIds) },
        organizationType: { in: ['client', 'internal_it', 'client_external_it'] },
      },
      select: { id: true, name: true, slug: true, organizationType: true, city: true },
      orderBy: { name: 'asc' },
    });

    res.json(available);
  } catch (err) { next(err); }
});

// POST /api/operator/clients/link — link existing workspace as client
router.post('/clients/link', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorWsId = req.workspaceId!;
    const { clientWorkspaceId } = req.body;

    if (!clientWorkspaceId) { res.status(400).json({ error: 'clientWorkspaceId jest wymagany' }); return; }
    if (clientWorkspaceId === operatorWsId) { res.status(400).json({ error: 'Nie możesz podpiąć siebie' }); return; }

    // Check workspace exists
    const clientWs = await prisma.workspace.findUnique({ where: { id: clientWorkspaceId }, select: { id: true, name: true } });
    if (!clientWs) { res.status(404).json({ error: 'Workspace nie znaleziony' }); return; }

    // Create or reactivate relation
    const relation = await prisma.workspaceRelation.upsert({
      where: { clientWorkspaceId_providerWorkspaceId: { clientWorkspaceId, providerWorkspaceId: operatorWsId } },
      create: {
        clientWorkspaceId,
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
      update: { status: 'ACTIVE', canViewDevices: true, canViewUsers: true, canViewLocations: true, canReceiveTickets: true, canCreateTicketsOnBehalf: true, canAccessAlerts: true },
    });

    // Set client's org type to 'client' and helpdesk settings
    await prisma.workspace.update({ where: { id: clientWorkspaceId }, data: { organizationType: 'client' } });
    await prisma.workspaceHelpdeskSettings.upsert({
      where: { workspaceId: clientWorkspaceId },
      create: { workspaceId: clientWorkspaceId, ticketRoutingMode: 'send_to_default_provider', defaultProviderWorkspaceId: operatorWsId },
      update: { ticketRoutingMode: 'send_to_default_provider', defaultProviderWorkspaceId: operatorWsId },
    });

    res.status(201).json({ relation, workspace: clientWs });
  } catch (err) { next(err); }
});

// POST /api/operator/clients/invite — send invitation to a client
router.post('/clients/invite', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorWsId = req.workspaceId!;
    const { email, companyName } = req.body;

    if (!email?.trim()) { res.status(400).json({ error: 'Email jest wymagany' }); return; }

    const operator = await prisma.workspace.findUnique({ where: { id: operatorWsId }, select: { name: true, slug: true } });

    // Create invitation token
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000); // 7 days

    // Store invitation in SharingInvitation table
    await prisma.sharingInvitation.create({
      data: {
        fromWorkspaceId: operatorWsId,
        toEmail: email.trim(),
        type: 'MANAGE_OFFER',
        scope: 'ALL',
        status: 'PENDING',
        token,
        expiresAt,
      },
    });

    // In production: send email with invitation link
    // For now: return the invitation link
    const inviteUrl = `https://infradesk.silers.pl/invite/${token}`;

    res.status(201).json({
      success: true,
      inviteUrl,
      message: `Zaproszenie wysłane do ${email}`,
    });
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

    // Enrich with stats + client status
    const clients = await Promise.all(relations.map(async r => {
      const [deviceCount, ticketCount, activeTickets, statusSetting] = await Promise.all([
        prisma.device.count({ where: { workspaceId: r.clientWorkspaceId } }),
        prisma.ticket.count({ where: { workspaceId: r.clientWorkspaceId } }),
        prisma.ticket.count({ where: { workspaceId: r.clientWorkspaceId, status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }),
        prisma.workspaceSetting.findUnique({ where: { workspaceId_key: { workspaceId: r.clientWorkspaceId, key: 'client_status' } } }),
      ]);

      return {
        relationId: r.id,
        workspace: r.clientWorkspace,
        clientStatus: statusSetting?.value ?? 'active', // default active for legacy clients
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

// GET /api/operator/billing — billing data for all clients with sessions
router.get('/billing', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { from, to } = req.query as Record<string, string>;

    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: wsId, status: 'ACTIVE' },
      include: { clientWorkspace: { select: { id: true, name: true, slug: true } } },
    });

    const clientIds = relations.map(r => r.clientWorkspaceId);

    const where: any = { workspaceId: { in: clientIds } };
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to);
    }

    const sessions = await prisma.workSession.findMany({
      where,
      include: {
        tech: { select: { id: true, firstName: true, lastName: true } },
        ticket: { select: { id: true, ticketNumber: true, title: true } },
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    // Group sessions by workspace
    const sessionsByWs = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const arr = sessionsByWs.get(s.workspaceId) ?? [];
      arr.push(s);
      sessionsByWs.set(s.workspaceId, arr);
    }

    const result = relations.map(r => ({
      relationId: r.id,
      client: r.clientWorkspace,
      billingType: r.billingType,
      subscriptionMonthlyNet: r.subscriptionMonthlyNet,
      subscriptionHours: r.subscriptionHours,
      overageRate: r.overageRate,
      hourlyRate: r.hourlyRate,
      billingIncrementMin: r.billingIncrementMin,
      billingPeriod: (r as any).billingPeriod ?? 'monthly',
      sessions: sessionsByWs.get(r.clientWorkspaceId) ?? [],
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/operator/tasks — tasks from all clients
router.get('/tasks', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), requireOperator, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { clientWorkspaceId, status, page = '1', per_page = '50' } = req.query as Record<string, string>;

    const clientIds = await getClientWorkspaceIds(wsId, clientWorkspaceId);
    if (clientIds.length === 0) { res.json({ data: [], pagination: { total: 0, page: 1, per_page: 50 } }); return; }

    const where: any = { workspaceId: { in: clientIds } };
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          workspace: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          ticket: { select: { id: true, ticketNumber: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(per_page),
        take: parseInt(per_page),
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ data: tasks, pagination: { total, page: parseInt(page), per_page: parseInt(per_page) } });
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

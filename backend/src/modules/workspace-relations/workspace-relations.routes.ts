import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
// Security: workspace-relations routes are workspace-scoped to the caller's primary workspace. Cross-workspace relation access (client ↔ provider) is validated per-endpoint by checking relation ownership.
router.use(authenticate, requireWorkspace);

// GET /api/workspace-relations — list relations for current workspace (as client or provider)
router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const [asClient, asProvider] = await Promise.all([
      prisma.workspaceRelation.findMany({
        where: { clientWorkspaceId: wsId, status: 'ACTIVE' },
        include: { providerWorkspace: { select: { id: true, name: true, slug: true, logoUrl: true, email: true, phone: true } } },
      }),
      prisma.workspaceRelation.findMany({
        where: { providerWorkspaceId: wsId, status: 'ACTIVE' },
        include: { clientWorkspace: { select: { id: true, name: true, slug: true, logoUrl: true, email: true, phone: true, legalName: true, taxId: true } } },
      }),
    ]);

    res.json({ asClient, asProvider });
  } catch (err) { next(err); }
});

// GET /api/workspace-relations/:id — single relation with billing data
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relation = await prisma.workspaceRelation.findUnique({
      where: { id: req.params.id },
      include: {
        clientWorkspace: { select: { id: true, name: true } },
        providerWorkspace: { select: { id: true, name: true } },
      },
    });
    if (!relation) { res.status(404).json({ error: 'Not found' }); return; }
    if (relation.clientWorkspaceId !== req.workspaceId && relation.providerWorkspaceId !== req.workspaceId) {
      res.status(403).json({ error: 'No access' }); return;
    }
    res.json(relation);
  } catch (err) { next(err); }
});

// POST /api/workspace-relations — create relation (operator adds client)
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const { clientWorkspaceId, providerWorkspaceId, isDefaultHelpdeskProvider, permissions } = req.body;

    // Determine direction: if current workspace is the provider
    const clientId = clientWorkspaceId || req.body.clientId;
    const providerId = providerWorkspaceId || wsId;

    if (!clientId) { res.status(400).json({ error: 'clientWorkspaceId is required' }); return; }
    if (clientId === providerId) { res.status(400).json({ error: 'Cannot create relation with self' }); return; }

    const relation = await prisma.workspaceRelation.upsert({
      where: { clientWorkspaceId_providerWorkspaceId: { clientWorkspaceId: clientId, providerWorkspaceId: providerId } },
      create: {
        clientWorkspaceId: clientId,
        providerWorkspaceId: providerId,
        isDefaultHelpdeskProvider: isDefaultHelpdeskProvider ?? true,
        ...(permissions ?? {}),
      },
      update: {
        status: 'ACTIVE',
        isDefaultHelpdeskProvider: isDefaultHelpdeskProvider ?? undefined,
        ...(permissions ?? {}),
      },
    });

    // If setting as default helpdesk provider, also create/update helpdesk settings
    if (isDefaultHelpdeskProvider) {
      await prisma.workspaceHelpdeskSettings.upsert({
        where: { workspaceId: clientId },
        create: {
          workspaceId: clientId,
          ticketRoutingMode: 'send_to_default_provider',
          defaultProviderWorkspaceId: providerId,
        },
        update: {
          defaultProviderWorkspaceId: providerId,
          ticketRoutingMode: 'send_to_default_provider',
        },
      });
    }

    res.status(201).json(relation);
  } catch (err) { next(err); }
});

// PATCH /api/workspace-relations/:id — update permissions
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const { id } = req.params;

    const existing = await prisma.workspaceRelation.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Relation not found' }); return; }
    if (existing.clientWorkspaceId !== wsId && existing.providerWorkspaceId !== wsId) {
      res.status(403).json({ error: 'No access to this relation' }); return;
    }

    const {
      canViewDevices, canViewUsers, canViewLocations, canReceiveTickets,
      canCreateTicketsOnBehalf, canAccessAlerts, isDefaultHelpdeskProvider,
      billingType, subscriptionMonthlyNet, subscriptionHours, overageRate,
      hourlyRate, billingIncrementMin, billingPeriod, contractFileUrl,
    } = req.body;

    const updated = await prisma.workspaceRelation.update({
      where: { id },
      data: {
        canViewDevices: canViewDevices ?? undefined,
        canViewUsers: canViewUsers ?? undefined,
        canViewLocations: canViewLocations ?? undefined,
        canReceiveTickets: canReceiveTickets ?? undefined,
        canCreateTicketsOnBehalf: canCreateTicketsOnBehalf ?? undefined,
        canAccessAlerts: canAccessAlerts ?? undefined,
        isDefaultHelpdeskProvider: isDefaultHelpdeskProvider ?? undefined,
        billingType: billingType ?? undefined,
        subscriptionMonthlyNet: subscriptionMonthlyNet !== undefined ? Number(subscriptionMonthlyNet) || null : undefined,
        subscriptionHours: subscriptionHours !== undefined ? Number(subscriptionHours) || null : undefined,
        overageRate: overageRate !== undefined ? Number(overageRate) || null : undefined,
        hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) || null : undefined,
        billingIncrementMin: billingIncrementMin !== undefined ? Number(billingIncrementMin) : undefined,
        billingPeriod: billingPeriod ?? undefined,
        contractFileUrl: contractFileUrl ?? undefined,
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/workspace-relations/:id — detach
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const { id } = req.params;

    const existing = await prisma.workspaceRelation.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Relation not found' }); return; }
    if (existing.clientWorkspaceId !== wsId && existing.providerWorkspaceId !== wsId) {
      res.status(403).json({ error: 'No access' }); return;
    }

    await prisma.workspaceRelation.update({
      where: { id },
      data: { status: 'DETACHED' },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

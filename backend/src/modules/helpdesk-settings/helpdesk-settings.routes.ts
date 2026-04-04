import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate);

// GET /api/helpdesk-settings — get helpdesk config for current workspace
router.get('/', withWorkspaceMembership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const settings = await prisma.workspaceHelpdeskSettings.findUnique({
      where: { workspaceId: wsId },
    });

    // Return defaults if none exist
    res.json(settings ?? {
      workspaceId: wsId,
      ticketRoutingMode: 'internal_only',
      defaultProviderWorkspaceId: null,
      allowUserProviderSelection: false,
      allowAssistantAutoCreate: true,
      allowAlertAutoCreate: true,
    });
  } catch (err) { next(err); }
});

// PUT /api/helpdesk-settings — save helpdesk config
router.put('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const {
      ticketRoutingMode,
      defaultProviderWorkspaceId,
      allowUserProviderSelection,
      allowAssistantAutoCreate,
      allowAlertAutoCreate,
    } = req.body;

    const settings = await prisma.workspaceHelpdeskSettings.upsert({
      where: { workspaceId: wsId },
      create: {
        workspaceId: wsId,
        ticketRoutingMode: ticketRoutingMode ?? 'internal_only',
        defaultProviderWorkspaceId: defaultProviderWorkspaceId ?? null,
        allowUserProviderSelection: allowUserProviderSelection ?? false,
        allowAssistantAutoCreate: allowAssistantAutoCreate ?? true,
        allowAlertAutoCreate: allowAlertAutoCreate ?? true,
      },
      update: {
        ticketRoutingMode: ticketRoutingMode ?? undefined,
        defaultProviderWorkspaceId: defaultProviderWorkspaceId ?? undefined,
        allowUserProviderSelection: allowUserProviderSelection ?? undefined,
        allowAssistantAutoCreate: allowAssistantAutoCreate ?? undefined,
        allowAlertAutoCreate: allowAlertAutoCreate ?? undefined,
      },
    });

    res.json(settings);
  } catch (err) { next(err); }
});

export default router;

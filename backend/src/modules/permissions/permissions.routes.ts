import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';
import { pushToUser } from '../events/events.routes';

const router = Router();
router.use(authenticate, requireWorkspace);

/**
 * Permission tree definition — maps nodeId to human-readable labels.
 * Used by frontend to render the tree editor.
 */
const PERMISSION_TREE = [
  {
    nodeId: 'infrastructure',
    label: 'Infrastruktura IT',
    children: [
      { nodeId: 'infrastructure.devices', label: 'Urządzenia' },
      { nodeId: 'infrastructure.agents', label: 'Agenty' },
      { nodeId: 'infrastructure.monitoring', label: 'Audyt i sieć' },
      { nodeId: 'infrastructure.backups', label: 'Kopie zapasowe' },
      { nodeId: 'infrastructure.activity-logs', label: 'Logi aktywności' },
    ],
  },
  {
    nodeId: 'service-desk',
    label: 'Serwis i obsługa IT',
    children: [
      { nodeId: 'service-desk.tickets', label: 'Zgłoszenia' },
      { nodeId: 'service-desk.tasks', label: 'Zadania' },
      { nodeId: 'service-desk.orders', label: 'Zamówienia' },
      { nodeId: 'service-desk.delegations', label: 'Delegacje' },
      { nodeId: 'service-desk.crm', label: 'CRM' },
      { nodeId: 'service-desk.sessions', label: 'Sesje pracy' },
      { nodeId: 'service-desk.billing', label: 'Rozliczenia' },
    ],
  },
  {
    nodeId: 'invoicing',
    label: 'Finanse',
    children: [
      { nodeId: 'invoicing.documents', label: 'Dokumenty' },
      { nodeId: 'invoicing.contractors', label: 'Kontrahenci' },
      { nodeId: 'invoicing.products', label: 'Produkty' },
      { nodeId: 'invoicing.payments', label: 'Płatności' },
      { nodeId: 'invoicing.reports', label: 'Raporty' },
    ],
  },
  {
    nodeId: 'packaging',
    label: 'Pakowanie',
    children: [
      { nodeId: 'packaging.shipments', label: 'Zamówienia' },
      { nodeId: 'packaging.picking', label: 'Kompletacja' },
      { nodeId: 'packaging.packing', label: 'Pakowanie' },
      { nodeId: 'packaging.carriers', label: 'Kurierzy' },
      { nodeId: 'packaging.reports', label: 'Raporty' },
    ],
  },
  {
    nodeId: 'skp',
    label: 'SKP',
    children: [
      { nodeId: 'skp.inspections', label: 'Przeglądy' },
      { nodeId: 'skp.vehicles', label: 'Pojazdy' },
    ],
  },
  {
    nodeId: 'vault',
    label: 'Sejf haseł',
    children: [
      { nodeId: 'vault.mine', label: 'Moje wpisy' },
      { nodeId: 'vault.shared', label: 'Współdzielone' },
    ],
  },
  {
    nodeId: 'company',
    label: 'Moja firma',
    adminOnly: true,
    children: [
      { nodeId: 'company.data', label: 'Moje dane' },
      { nodeId: 'company.locations', label: 'Lokalizacje' },
      { nodeId: 'company.users', label: 'Użytkownicy', adminOnly: true },
      { nodeId: 'company.settings', label: 'Ustawienia', adminOnly: true },
      { nodeId: 'company.sharing', label: 'Udostępnianie', adminOnly: true },
      { nodeId: 'company.smtp', label: 'SMTP', adminOnly: true },
      { nodeId: 'company.billing', label: 'Billing', adminOnly: true },
    ],
  },
];

// GET /api/permissions/tree — return the permission tree definition
router.get('/tree', (req: Request, res: Response) => {
  res.json({ tree: PERMISSION_TREE });
});

// GET /api/permissions/me — current user's effective permissions for current workspace
router.get('/me/current', withWorkspaceMembership, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.membership) { res.status(403).json({ error: 'No membership' }); return; }
    const full = await prisma.workspaceMembership.findUnique({
      where: { id: req.membership.id },
      select: {
        id: true, role: true, accountType: true, accessScope: true, scopeType: true,
        permissionOverrides: { select: { nodeId: true, level: true, canDelete: true } },
        workspace: { select: { orgType: true } },
      },
    });
    if (!full) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(full);
  } catch (err) { next(err); }
});

// GET /api/permissions/:membershipId — get overrides for a member
router.get('/:membershipId', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { membershipId } = req.params;

    const membership = await prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true, accountType: true, accessScope: true, role: true,
        permissionOverrides: { select: { nodeId: true, level: true, canDelete: true } },
      },
    });

    if (!membership) { res.status(404).json({ error: 'Membership not found' }); return; }
    // Ensure same workspace
    const target = await prisma.workspaceMembership.findUnique({ where: { id: membershipId }, select: { workspaceId: true } });
    if (target?.workspaceId !== req.workspaceId) { res.status(403).json({ error: 'Cross-workspace access denied' }); return; }

    res.json(membership);
  } catch (err) { next(err); }
});

// Zod schema for permission updates
const updatePermissionsSchema = z.object({
  accountType: z.enum(['ADMIN', 'USER']).optional(),
  accessScope: z.enum(['FULL', 'RESTRICTED']).optional(),
  overrides: z.array(z.object({
    nodeId: z.string().min(1).max(100),
    level: z.enum(['FULL', 'VIEW', 'NONE']),
    canDelete: z.boolean().optional(),
  })).optional(),
});

// PUT /api/permissions/:membershipId — save overrides for a member
router.put('/:membershipId', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { membershipId } = req.params;

    // Validate request body
    const parseResult = updatePermissionsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(422).json({ error: 'Validation error', details: parseResult.error.flatten().fieldErrors });
      return;
    }
    const { accountType, accessScope, overrides } = parseResult.data;

    // Verify same workspace + pobierz orgType
    const target = await prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      select: { workspaceId: true, role: true, workspace: { select: { orgType: true } } },
    });
    if (!target || target.workspaceId !== req.workspaceId) { res.status(403).json({ error: 'Cross-workspace access denied' }); return; }

    // Don't allow changing OWNER accountType
    if (target.role === 'OWNER' && accountType && accountType !== 'ADMIN') {
      res.status(400).json({ error: 'Cannot change Owner account type' }); return;
    }

    const wsOrgType = (target as any).workspace?.orgType;
    const isMspWs = wsOrgType === 'MSP' || wsOrgType === 'IT_OPERATOR';
    const isClientWs = wsOrgType === 'CLIENT';

    // Update membership fields
    const updateData: any = {};
    if (accountType && ['ADMIN', 'USER'].includes(accountType)) updateData.accountType = accountType;
    if (accessScope && ['FULL', 'RESTRICTED'].includes(accessScope)) updateData.accessScope = accessScope;

    // Map accountType to role — orgType decides: MSP USER→TECHNICIAN, CLIENT USER→MEMBER
    if (accountType === 'ADMIN' && target.role !== 'OWNER') {
      updateData.role = 'ADMIN';
    } else if (accountType === 'USER' && target.role !== 'OWNER') {
      if (isMspWs) updateData.role = 'TECHNICIAN';          // MSP: user = członek zespołu (panel /dashboard)
      else if (isClientWs) updateData.role = 'MEMBER';      // CLIENT: user = pracownik (portal /panel)
      else updateData.role = accessScope === 'FULL' ? 'TECHNICIAN' : 'MEMBER';  // INTERNAL_IT fallback
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.workspaceMembership.update({ where: { id: membershipId }, data: updateData });
    }

    // Replace overrides if provided
    if (overrides && Array.isArray(overrides)) {
      // Delete all existing
      await prisma.userPermissionOverride.deleteMany({ where: { membershipId } });
      // Create new
      if (overrides.length > 0) {
        await prisma.userPermissionOverride.createMany({
          data: overrides.map(o => ({
            membershipId,
            nodeId: o.nodeId,
            level: o.level || 'FULL',
            canDelete: !!o.canDelete,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Notify target user via SSE that their permissions changed — client hook will refetch
    const targetUser = await prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      select: { userId: true },
    });
    if (targetUser) pushToUser(targetUser.userId, 'permissions-updated', { membershipId });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Permission Schemas (templates) ──

// GET /api/permissions/schemas — list all schemas for workspace
router.get('/schemas/list', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }
    const schemas = await prisma.permissionSchema.findMany({
      where: { workspaceId: wsId },
      orderBy: { name: 'asc' },
    });
    res.json(schemas);
  } catch (err) { next(err); }
});

// POST /api/permissions/schemas — create a new schema
router.post('/schemas', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }
    const { name, description, overrides } = req.body;
    if (!name) { res.status(400).json({ error: 'Nazwa schematu jest wymagana' }); return; }
    const schema = await prisma.permissionSchema.create({
      data: { workspaceId: wsId, name, description: description || null, overrides: overrides || [] },
    });
    res.status(201).json(schema);
  } catch (err) { next(err); }
});

// PUT /api/permissions/schemas/:id — update schema
router.put('/schemas/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const { id } = req.params;
    const { name, description, overrides } = req.body;
    const existing = await prisma.permissionSchema.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== wsId) { res.status(404).json({ error: 'Schema not found' }); return; }
    const updated = await prisma.permissionSchema.update({
      where: { id },
      data: { name: name ?? existing.name, description: description ?? existing.description, overrides: overrides ?? existing.overrides },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/permissions/schemas/:id
router.delete('/schemas/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const { id } = req.params;
    const existing = await prisma.permissionSchema.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== wsId) { res.status(404).json({ error: 'Schema not found' }); return; }
    await prisma.permissionSchema.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/permissions/schemas/:id/duplicate
router.post('/schemas/:id/duplicate', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    const { id } = req.params;
    const existing = await prisma.permissionSchema.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== wsId) { res.status(404).json({ error: 'Schema not found' }); return; }
    const copy = await prisma.permissionSchema.create({
      data: { workspaceId: wsId, name: `${existing.name} (kopia)`, description: existing.description, overrides: existing.overrides },
    });
    res.status(201).json(copy);
  } catch (err) { next(err); }
});

export default router;

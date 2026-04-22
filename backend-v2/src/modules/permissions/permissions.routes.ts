import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess, loadMembershipContext } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES, effectiveLevel, visibleModules } from '../../utils/canAccess';

const router = Router();

const overrideSchema = z.object({
  moduleKey: z.string().min(2).max(60),
  level: z.enum(['NONE', 'VIEW', 'EDIT', 'DELETE']),
});

const grantSchema = z.object({
  resourceType: z.enum(['DEVICE', 'LOCATION', 'CLIENT_WORKSPACE']),
  resourceId: z.string().uuid(),
  level: z.enum(['VIEW', 'EDIT', 'DELETE']),
});

// Current user's effective permissions within the active workspace.
router.get('/me', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const modules: Record<string, string> = {};
    for (const key of Object.values(MODULES)) modules[key] = effectiveLevel(ctx, key);
    res.json({
      role: ctx.role,
      scope: ctx.scope,
      overrides: ctx.overrides,
      grants: ctx.grants,
      effective: modules,
      visible: visibleModules(ctx),
    });
  } catch (err) { next(err); }
});

router.get(
  '/:membershipId/overrides',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true, overrides: true, grants: true },
      });
      if (!m) throw HttpError.notFound();
      res.json({ overrides: m.overrides, grants: m.grants });
    } catch (err) { next(err); }
  },
);

router.put(
  '/:membershipId/overrides',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = z.object({ overrides: z.array(overrideSchema) }).parse(req.body);
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!m) throw HttpError.notFound();
      await prisma.$transaction([
        prisma.permissionOverride.deleteMany({ where: { membershipId: m.id } }),
        prisma.permissionOverride.createMany({
          data: input.overrides.map((o) => ({ membershipId: m.id, moduleKey: o.moduleKey, level: o.level })),
        }),
      ]);
      res.json({ success: true, count: input.overrides.length });
    } catch (err) { next(err); }
  },
);

router.post(
  '/:membershipId/grants',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = grantSchema.parse(req.body);
      const m = await prisma.membership.findFirst({
        where: { id: String(req.params.membershipId), workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!m) throw HttpError.notFound();
      const grant = await prisma.accessGrant.create({
        data: { membershipId: m.id, ...input },
      });
      res.status(201).json({ grant });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:membershipId/grants/:grantId',
  requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.accessGrant.deleteMany({
        where: { id: String(req.params.grantId), membership: { id: String(req.params.membershipId), workspaceId: req.workspaceId! } },
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION TREE — hierarchiczna definicja modułów (UI tree editor używa)
// ─────────────────────────────────────────────────────────────────────────────
const PERMISSION_TREE = [
  {
    nodeId: 'infrastructure',
    label: 'Infrastruktura IT',
    children: [
      { nodeId: 'infrastructure.devices', label: 'Urządzenia' },
      { nodeId: 'infrastructure.agents', label: 'Asystenci' },
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
      { nodeId: 'service-desk.alerts', label: 'Alerty' },
      { nodeId: 'service-desk.billing', label: 'Rozliczenia' },
    ],
  },
  {
    nodeId: 'clients',
    label: 'Klienci i kontakty',
    children: [
      { nodeId: 'clients.clients', label: 'Firmy klientów' },
      { nodeId: 'clients.contacts', label: 'Kontakty / CRM' },
      { nodeId: 'clients.locations', label: 'Lokalizacje' },
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
    nodeId: 'ai',
    label: 'AI — Iris',
    children: [
      { nodeId: 'ai.chat', label: 'Czat' },
      { nodeId: 'ai.shadow', label: 'Shadow Mode', adminOnly: true },
      { nodeId: 'ai.insights', label: 'Insights' },
      { nodeId: 'ai.usage', label: 'Koszty AI', adminOnly: true },
    ],
  },
  {
    nodeId: 'company',
    label: 'Moja firma',
    adminOnly: true,
    children: [
      { nodeId: 'company.data', label: 'Moje dane' },
      { nodeId: 'company.users', label: 'Użytkownicy', adminOnly: true },
      { nodeId: 'company.plan', label: 'Plan i moduły', adminOnly: true },
      { nodeId: 'company.settings', label: 'Ustawienia', adminOnly: true },
      { nodeId: 'company.portal', label: 'Portal klienta', adminOnly: true },
    ],
  },
];

router.get('/tree', requireAuth, requireWorkspace, (_req: Request, res: Response) => {
  res.json({ tree: PERMISSION_TREE });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION SCHEMAS (quick-apply templates per workspace)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/schemas/list', requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await prisma.permissionSchema.findMany({
        where: { workspaceId: req.workspaceId! },
        orderBy: { name: 'asc' },
      });
      res.json(list);
    } catch (err) { next(err); }
  });

router.post('/schemas', requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(400).optional().nullable(),
        overrides: z.array(z.object({
          nodeId: z.string().min(1),
          level: z.enum(['FULL', 'VIEW', 'NONE']),
          canDelete: z.boolean().optional(),
        })),
      }).parse(req.body);
      const s = await prisma.permissionSchema.create({
        data: {
          workspaceId: req.workspaceId!,
          name: input.name,
          description: input.description ?? null,
          overrides: input.overrides as never,
        },
      });
      res.status(201).json(s);
    } catch (err) { next(err); }
  });

router.put('/schemas/:id', requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.permissionSchema.findFirst({
        where: { id: String(req.params.id), workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!existing) throw HttpError.notFound();
      const input = z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(400).nullable().optional(),
        overrides: z.array(z.object({
          nodeId: z.string(), level: z.enum(['FULL', 'VIEW', 'NONE']), canDelete: z.boolean().optional(),
        })).optional(),
      }).parse(req.body);
      const s = await prisma.permissionSchema.update({
        where: { id: existing.id },
        data: { ...input, overrides: input.overrides as never },
      });
      res.json(s);
    } catch (err) { next(err); }
  });

router.delete('/schemas/:id', requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.permissionSchema.deleteMany({
        where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

router.post('/schemas/:id/duplicate', requireAuth, requireWorkspace,
  requireAccess(MODULES.MEMBERS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const src = await prisma.permissionSchema.findFirst({
        where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      });
      if (!src) throw HttpError.notFound();
      const dup = await prisma.permissionSchema.create({
        data: {
          workspaceId: req.workspaceId!,
          name: `${src.name} (kopia)`,
          description: src.description,
          overrides: src.overrides as never,
        },
      });
      res.status(201).json(dup);
    } catch (err) { next(err); }
  });

export default router;

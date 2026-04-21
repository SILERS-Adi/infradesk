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

const DEDUPE_WINDOW_MINUTES = 60;

const createAlertSchema = z.object({
  deviceId: z.string().uuid(),
  type: z.string().min(1).max(80),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  message: z.string().min(1).max(1000),
  rawData: z.record(z.unknown()).optional(),
});

const resolveSchema = z.object({
  autoResolveReason: z.string().max(200).optional(),
});

// List alerts.
router.get('/alerts', requireAccess(MODULES.MONITORING, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      resolved: z.enum(['true', 'false']).optional(),
      severity: z.string().optional(),
      deviceId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.resolved !== undefined) where.resolved = q.resolved === 'true';
    if (q.severity) where.severity = { in: q.severity.split(',') };
    if (q.deviceId) where.deviceId = q.deviceId;
    const alerts = await prisma.monitoringAlert.findMany({
      where, orderBy: { createdAt: 'desc' }, take: q.limit,
      include: { device: { select: { id: true, name: true, hostname: true } } },
    });
    res.json({ alerts });
  } catch (err) { next(err); }
});

/**
 * Create (or dedup) an alert. If a non-resolved alert exists for the same
 * (deviceId, type) within DEDUPE_WINDOW_MINUTES, updates message + rawData
 * and returns it instead of creating a duplicate.
 *
 * For severity HIGH+ auto-create a linked Ticket (once per alert).
 */
router.post('/alerts', requireAccess(MODULES.MONITORING, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAlertSchema.parse(req.body);
    const device = await prisma.device.findFirst({
      where: { id: input.deviceId, workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!device) throw HttpError.badRequest('Device nie należy do workspace', 'invalid_device');

    const windowStart = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000);
    const existing = await prisma.monitoringAlert.findFirst({
      where: {
        workspaceId: req.workspaceId!,
        deviceId: input.deviceId,
        type: input.type,
        resolved: false,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const updated = await prisma.monitoringAlert.update({
        where: { id: existing.id },
        data: {
          message: input.message,
          rawData: (input.rawData ?? undefined) as never,
          severity: input.severity,
        },
      });
      res.json({ alert: updated, deduped: true });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const alert = await tx.monitoringAlert.create({
        data: {
          workspaceId: req.workspaceId!,
          deviceId: input.deviceId,
          type: input.type,
          severity: input.severity,
          message: input.message,
          rawData: (input.rawData ?? undefined) as never,
        },
      });
      // Auto-create ticket for HIGH/CRITICAL.
      if (input.severity === 'HIGH' || input.severity === 'CRITICAL') {
        const year = new Date().getFullYear();
        const prefix = `T-${year}-`;
        const lastTicket = await tx.ticket.findFirst({
          where: { workspaceId: req.workspaceId!, ticketNumber: { startsWith: prefix } },
          orderBy: { ticketNumber: 'desc' },
          select: { ticketNumber: true },
        });
        let n = 1;
        if (lastTicket) {
          const m = lastTicket.ticketNumber.match(/-(\d+)$/);
          if (m) n = parseInt(m[1]!, 10) + 1;
        }
        const ticket = await tx.ticket.create({
          data: {
            workspaceId: req.workspaceId!,
            ticketNumber: `${prefix}${String(n).padStart(4, '0')}`,
            title: `[${input.severity}] ${input.type} — ${device.name}`,
            description: input.message,
            status: 'OPEN',
            priority: input.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            source: 'AGENT',
            deviceId: input.deviceId,
            createdByUserId: req.auth!.sub,
          },
        });
        await tx.monitoringAlert.update({ where: { id: alert.id }, data: { ticketId: ticket.id } });
        await tx.ticketEvent.create({
          data: { ticketId: ticket.id, userId: req.auth!.sub, eventType: 'created', toValue: 'OPEN', metadata: { alertId: alert.id } },
        });
        return { ...alert, ticketId: ticket.id };
      }
      return alert;
    });
    res.status(201).json({ alert: created, deduped: false });
  } catch (err) { next(err); }
});

router.post('/alerts/:id/resolve', requireAccess(MODULES.MONITORING, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = resolveSchema.parse(req.body);
    const alert = await prisma.monitoringAlert.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, resolved: true },
    });
    if (!alert) throw HttpError.notFound();
    if (alert.resolved) { res.json({ alert, alreadyResolved: true }); return; }

    const updated = await prisma.monitoringAlert.update({
      where: { id: alert.id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedByUserId: req.auth!.sub,
        autoResolveReason: input.autoResolveReason ?? 'manual',
      },
    });
    res.json({ alert: updated });
  } catch (err) { next(err); }
});

export default router;

import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import {
  createTicketSchema, updateTicketSchema, transitionSchema,
  commentSchema, listQuerySchema, rateTicketSchema,
} from './tickets.schemas';
import * as service from './tickets.service';
import type { TicketStatus } from '../../utils/ticketStateMachine';
import { logActivity, reqContext } from '../activity-logs/logActivity';

const router = Router();

router.use(requireAuth, requireWorkspace);

router.get('/', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const relations = await prisma.workspaceRelation.findMany({ where: { providerWorkspaceId: req.workspaceId!, canReceiveTickets: true, status: 'ACTIVE' }, select: { clientWorkspaceId: true } });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const result = await service.listTickets(req.workspaceId!, { ...q, visibleWsIds });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTicketSchema.parse(req.body);
    const ticket = await service.createTicket(req.workspaceId!, req.auth!.sub, input);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: ticket.id,
      actionType: 'created',
      description: `Utworzono ticket ${(ticket as any).ticketNumber ?? ticket.id}: ${input.title}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { priority: input.priority, category: input.category, deviceId: input.deviceId ?? null },
    });
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await service.getTicket(req.workspaceId!, String(req.params.id));
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateTicketSchema.parse(req.body);
    const t = await service.updateTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'updated',
      description: `Zaktualizowano ticket ${(t as any).ticketNumber ?? t.id}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { changedFields: Object.keys(input) },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.post('/:id/transition', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = transitionSchema.parse(req.body);
    const t = await service.transitionTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input.to as TicketStatus, {
      resolutionSummary: input.resolutionSummary,
      reason: input.reason,
    });
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'status_changed',
      description: `Zmieniono status ticketa ${(t as any).ticketNumber ?? t.id} na ${input.to}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { to: input.to, reason: input.reason ?? null },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.post('/:id/comments', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = commentSchema.parse(req.body);
    const c = await service.addComment(req.workspaceId!, req.auth!.sub, String(req.params.id), input.comment, input.isInternal);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'commented',
      description: `Dodano ${input.isInternal ? 'wewnętrzny ' : ''}komentarz`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { isInternal: input.isInternal, commentId: c.id },
    });
    res.status(201).json({ comment: c });
  } catch (err) { next(err); }
});

router.post('/:id/rate', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rateTicketSchema.parse(req.body);
    const t = await service.rateTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input.rating, input.comment);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'updated',
      description: `Oceniono ticket: ${input.rating}/5`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { rating: input.rating },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteTicket(req.workspaceId!, req.auth!.sub, String(req.params.id));
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'deleted',
      description: `Usunięto ticket`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

import { Router, type Request, type Response, type NextFunction } from 'express';
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

const router = Router();

router.use(requireAuth, requireWorkspace);

router.get('/', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const result = await service.listTickets(req.workspaceId!, q);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTicketSchema.parse(req.body);
    const ticket = await service.createTicket(req.workspaceId!, req.auth!.sub, input);
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
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.post('/:id/comments', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = commentSchema.parse(req.body);
    const c = await service.addComment(req.workspaceId!, req.auth!.sub, String(req.params.id), input.comment, input.isInternal);
    res.status(201).json({ comment: c });
  } catch (err) { next(err); }
});

router.post('/:id/rate', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rateTicketSchema.parse(req.body);
    const t = await service.rateTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input.rating, input.comment);
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteTicket(req.workspaceId!, req.auth!.sub, String(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import {
  getTickets,
  getTicket,
  postTicket,
  patchTicket,
  postComment,
  postAssign,
  postStatus,
  cancelTicket,
  removeTicket,
} from './tickets.controller';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import {
  createTicketSchema,
  updateTicketSchema,
  addCommentSchema,
  assignTicketSchema,
  changeStatusSchema,
  rateTicketSchema,
} from './tickets.validation';

const router = Router();

router.use(authenticate, requireWorkspace);

router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getTickets);
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getTicket);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), validate(createTicketSchema), postTicket);
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateTicketSchema), patchTicket);
router.post('/:id/comments', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), validate(addCommentSchema), postComment);
router.post('/:id/assign', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(assignTicketSchema), postAssign);
router.post('/:id/status', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(changeStatusSchema), postStatus);
router.post('/:id/cancel', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), cancelTicket);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), removeTicket);

// Rate ticket (any authenticated member — typically client)
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
router.post('/:id/rate', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), validate(rateTicketSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, ratingComment } = req.body;

    const ticket = await prisma.ticket.findFirst({ where: { id, workspaceId: req.workspaceId! }, select: { status: true, rating: true } });
    if (!ticket) throw new AppError('Zgłoszenie nie znalezione', 404);
    if (!['COMPLETED', 'RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new AppError('Można oceniać tylko zakończone zgłoszenia', 400);
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        rating,
        ratingComment: ratingComment?.trim() || null,
        ratedAt: new Date(),
        ratedByUserId: req.user!.userId,
      },
    });

    res.json({ rating: updated.rating, ratingComment: updated.ratingComment, ratedAt: updated.ratedAt });
  } catch (err) { next(err); }
});

export default router;

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
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import {
  createTicketSchema,
  updateTicketSchema,
  addCommentSchema,
  assignTicketSchema,
  changeStatusSchema,
} from './tickets.validation';

const router = Router();

router.use(authenticate);

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
router.post('/:id/rate', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, ratingComment } = req.body;

    if (!rating || ![1, 2, 3].includes(rating)) {
      res.status(400).json({ error: 'Rating musi być 1, 2 lub 3' }); return;
    }

    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { status: true, rating: true } });
    if (!ticket) { res.status(404).json({ error: 'Zgłoszenie nie znalezione' }); return; }
    if (!['COMPLETED', 'RESOLVED', 'CLOSED'].includes(ticket.status)) {
      res.status(400).json({ error: 'Można oceniać tylko zakończone zgłoszenia' }); return;
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

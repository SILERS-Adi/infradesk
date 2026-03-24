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
import { authenticate, authorize } from '../../middleware/auth';
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

router.get('/', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getTickets);
router.get('/:id', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getTicket);
router.post('/', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), validate(createTicketSchema), postTicket);
router.patch('/:id', authorize('ADMIN', 'TECHNICIAN'), validate(updateTicketSchema), patchTicket);
router.post('/:id/comments', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), validate(addCommentSchema), postComment);
router.post('/:id/assign', authorize('ADMIN', 'TECHNICIAN'), validate(assignTicketSchema), postAssign);
router.post('/:id/status', authorize('ADMIN', 'TECHNICIAN'), validate(changeStatusSchema), postStatus);
router.post('/:id/cancel', authenticate, authorize('ADMIN', 'TECHNICIAN'), cancelTicket);
router.delete('/:id', authorize('ADMIN'), removeTicket);

export default router;

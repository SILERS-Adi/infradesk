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

export default router;

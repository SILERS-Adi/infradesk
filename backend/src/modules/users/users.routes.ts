import { Router } from 'express';
import { getUsers, getUser, postUser, patchUser, removeUser } from './users.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createUserSchema, updateUserSchema } from './users.validation';
import { checkLimit } from '../../middleware/planLimits';

const router = Router();

router.use(authenticate, withWorkspaceMembership);

router.get('/', authorizeWorkspace('OWNER', 'ADMIN'), getUsers);
router.get('/:id', authorizeWorkspace('OWNER', 'ADMIN'), getUser);
router.post('/', authorizeWorkspace('OWNER', 'ADMIN'), checkLimit('users'), validate(createUserSchema), postUser);
router.patch('/:id', validate(updateUserSchema), patchUser);  // auth check moved into controller (self-or-admin)
router.delete('/:id', authorizeWorkspace('OWNER', 'ADMIN'), removeUser);

export default router;

import { Router } from 'express';
import { getUsers, getUser, postUser, patchUser, removeUser } from './users.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createUserSchema, updateUserSchema } from './users.validation';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', validate(createUserSchema), postUser);
router.patch('/:id', validate(updateUserSchema), patchUser);
router.delete('/:id', removeUser);

export default router;

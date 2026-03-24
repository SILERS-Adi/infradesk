import { Router } from 'express';
import { getClients, getClient, postClient, patchClient, removeClient, deactivate, checkNip, getFavorites, toggleFavorite } from './clients.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createClientSchema, updateClientSchema } from './clients.validation';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'TECHNICIAN'));

router.get('/check-nip', checkNip);           // must be before /:id
router.get('/favorites', authenticate, getFavorites);
router.get('/', getClients);
router.get('/:id', getClient);
router.post('/', authorize('ADMIN'), validate(createClientSchema), postClient);
router.patch('/:id', authorize('ADMIN'), validate(updateClientSchema), patchClient);
router.post('/:id/deactivate', authorize('ADMIN'), deactivate);
router.delete('/:id', authorize('ADMIN'), removeClient);
router.post('/:id/favorite', authenticate, toggleFavorite);

export default router;

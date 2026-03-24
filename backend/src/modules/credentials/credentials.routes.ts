import { Router } from 'express';
import {
  getCredentials,
  getCredential,
  revealCredentialPassword,
  postCredential,
  patchCredential,
  removeCredential,
} from './credentials.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCredentialSchema, updateCredentialSchema } from './credentials.validation';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getCredentials);
router.get('/:id', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), getCredential);
router.post('/:id/reveal', authorize('ADMIN', 'TECHNICIAN', 'CLIENT'), revealCredentialPassword);
router.post('/', authorize('ADMIN', 'TECHNICIAN'), validate(createCredentialSchema), postCredential);
router.patch('/:id', authorize('ADMIN', 'TECHNICIAN'), validate(updateCredentialSchema), patchCredential);
router.delete('/:id', authorize('ADMIN'), removeCredential);

export default router;

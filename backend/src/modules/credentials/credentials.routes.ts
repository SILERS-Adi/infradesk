import { Router } from 'express';
import {
  getCredentials,
  getCredential,
  revealCredentialPassword,
  postCredential,
  patchCredential,
  removeCredential,
} from './credentials.controller';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createCredentialSchema, updateCredentialSchema } from './credentials.validation';

const router = Router();

router.use(authenticate);

router.get('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getCredentials);
router.get('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), getCredential);
import { credentialRevealLimiter } from '../../middleware/rateLimit';
router.post('/:id/reveal', credentialRevealLimiter, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'), revealCredentialPassword);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createCredentialSchema), postCredential);
router.patch('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateCredentialSchema), patchCredential);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('vault', 'DELETE'), removeCredential);

export default router;

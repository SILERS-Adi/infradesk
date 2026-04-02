import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createDocumentSchema, updateDocumentSchema } from './invoicing.validation';
import * as ctrl from './invoicing.controller';

const router = Router();

router.use(authenticate);

// List documents
router.get('/', ctrl.listDocuments);

// Get single document
router.get('/:id', ctrl.getDocument);

// Create document
router.post('/',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(createDocumentSchema),
  ctrl.createDocument,
);

// Update document
router.put('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(updateDocumentSchema),
  ctrl.updateDocument,
);

// Delete document
router.delete('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN'),
  ctrl.deleteDocument,
);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createProductSchema, updateProductSchema } from './products.validation';
import * as ctrl from './products.controller';

const router = Router();
router.use(authenticate, requireWorkspace);
// Auto-search product image by name
router.get('/image-search', async (req, res, next) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) { res.json({ imageUrl: null }); return; }

    // Try Unsplash free API
    try {
      const resp = await fetch(`https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=1`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        const photo = data?.results?.[0];
        if (photo?.urls?.small) {
          res.json({ imageUrl: photo.urls.small, source: 'unsplash', credit: photo.user?.name });
          return;
        }
      }
    } catch {}

    res.json({ imageUrl: null });
  } catch (err) { next(err); }
});

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createProductSchema), ctrl.create);
router.put('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateProductSchema), ctrl.update);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('invoicing.products', 'DELETE'), ctrl.remove);

export default router;

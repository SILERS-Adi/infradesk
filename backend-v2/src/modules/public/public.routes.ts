import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

/**
 * GET /api/v2/public/workspace
 *
 * Returns branding + basic info for the workspace resolved from Host header.
 * Called by the frontend BEFORE login so login page can show "Logowanie — Dwór Osmolice"
 * with proper logo/color. If Host is global (v2.infradesk.pl) → returns `workspace: null`.
 */
router.get('/workspace', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.resolvedWorkspace) {
      res.json({ workspace: null, subdomain: req.hostSubdomain ?? null });
      return;
    }
    res.json({
      workspace: {
        slug: req.resolvedWorkspace.slug,
        name: req.resolvedWorkspace.name,
        type: req.resolvedWorkspace.type,
        branding: {
          logoUrl: req.resolvedWorkspace.brandingLogoUrl,
          primaryColor: req.resolvedWorkspace.brandingPrimaryColor,
        },
      },
      subdomain: req.hostSubdomain,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/v2/public/workspace/exists?slug=foo
 * Used by registration form to check if slug is taken before submitting.
 */
router.get('/workspace/exists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.query.slug ?? '').toLowerCase().trim();
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      res.json({ available: false, reason: 'invalid_format' });
      return;
    }
    const existing = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    res.json({ available: !existing, slug });
  } catch (err) { next(err); }
});

export default router;

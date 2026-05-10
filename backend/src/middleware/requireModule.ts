import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/**
 * Middleware: require the current user to have access to a specific permission-tree module.
 * - ADMIN/OWNER/accountType=ADMIN → pass
 * - accessScope != RESTRICTED → pass
 * - Override for moduleKey or any ancestor (prefix) with level !== 'NONE' → pass
 * - Otherwise 403
 */
export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.isSuperAdmin) return next();
      if (!req.membership) { res.status(403).json({ error: 'No workspace membership' }); return; }

      const m = await prisma.workspaceMembership.findUnique({
        where: { id: req.membership.id },
        select: {
          role: true, accountType: true, accessScope: true,
          permissionOverrides: { select: { nodeId: true, level: true } },
        },
      });
      if (!m) { res.status(403).json({ error: 'Membership not found' }); return; }

      if (m.role === 'OWNER' || m.role === 'ADMIN' || m.accountType === 'ADMIN') return next();
      if (m.accessScope !== 'RESTRICTED') return next();

      const map = new Map(m.permissionOverrides.map(o => [o.nodeId, o.level]));
      const exact = map.get(moduleKey);
      if (exact === 'FULL' || exact === 'VIEW') return next();
      if (exact === 'NONE') { res.status(403).json({ error: `Brak dostępu do modułu: ${moduleKey}` }); return; }

      // Check parent path (e.g. "infrastructure.activity-logs" → "infrastructure")
      const parent = moduleKey.split('.')[0];
      if (parent !== moduleKey) {
        const p = map.get(parent);
        if (p === 'FULL' || p === 'VIEW') return next();
        if (p === 'NONE') { res.status(403).json({ error: `Brak dostępu do modułu: ${parent}` }); return; }
      }

      // RESTRICTED + no override = deny
      res.status(403).json({ error: `Brak dostępu do modułu: ${moduleKey}` });
    } catch (err) {
      next(err);
    }
  };
}

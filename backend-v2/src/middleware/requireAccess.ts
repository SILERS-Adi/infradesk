import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from '../utils/httpError';
import { canAccess, type MembershipContext, type ModuleAction, type Role, type Scope } from '../utils/canAccess';

/**
 * Requires that the authenticated user has at least `action` permission for `moduleKey`
 * within their active workspace. Loads overrides + grants lazily from DB.
 */
export function requireAccess(moduleKey: string, action: ModuleAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw HttpError.unauthorized();
      if (!req.membershipId) throw HttpError.forbidden('Workspace context missing');

      const ctx = await loadMembershipContext(req.membershipId, req.auth.isSuperAdmin ?? false);
      if (!canAccess(ctx, moduleKey, action)) {
        throw HttpError.forbidden(`Access denied for ${moduleKey}:${action}`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function loadMembershipContext(
  membershipId: string,
  isSuperAdmin: boolean,
): Promise<MembershipContext> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: {
      role: true,
      scope: true,
      overrides: { select: { moduleKey: true, level: true } },
      grants: { select: { resourceType: true, resourceId: true, level: true } },
    },
  });
  if (!membership) throw HttpError.forbidden('Membership not found');
  return {
    role: membership.role as Role,
    scope: membership.scope as Scope,
    overrides: membership.overrides,
    grants: membership.grants,
    isSuperAdmin,
  };
}

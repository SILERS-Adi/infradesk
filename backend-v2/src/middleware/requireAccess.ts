import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from '../utils/httpError';
import {
  canAccess,
  meetsPlanRequirement,
  planUpgradeRequired,
  MODULES,
  type MembershipContext,
  type ModuleAction,
  type Role,
  type Scope,
  type WorkspacePlan,
} from '../utils/canAccess';

/**
 * Requires that the authenticated user has at least `action` permission for `moduleKey`
 * within their active workspace. Loads overrides + grants lazily from DB.
 *
 * P1.1: dodatkowy plan check — jeśli moduł wymaga wyższego planu niż obecny
 * workspace plan, blokujemy niezależnie od role/PermissionOverride. To pewność,
 * że admin nie może obejść paywall przez nadanie override sobie/innym.
 * Wyjątek: MODULES.BILLING — OWNER musi mieć dostęp do upgrade nawet na START.
 */
export function requireAccess(moduleKey: string, action: ModuleAction = 'view') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw HttpError.unauthorized();
      if (!req.membershipId) throw HttpError.forbidden('Workspace context missing');

      const ctx = await loadMembershipContext(req.membershipId, req.auth.isSuperAdmin ?? false);

      // Plan-based gating ZANIM canAccess(role) — żeby paywall nie był do
      // obejścia przez admina nadającego sobie PermissionOverride.
      if (moduleKey !== MODULES.BILLING && !ctx.isSuperAdmin) {
        if (!meetsPlanRequirement(ctx.workspacePlan, moduleKey)) {
          const required = planUpgradeRequired(ctx.workspacePlan, moduleKey);
          throw HttpError.forbidden(
            `Moduł ${moduleKey} wymaga planu ${required} (obecny: ${ctx.workspacePlan}).`,
            'plan_upgrade_required',
          );
        }
      }

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
): Promise<MembershipContext & { workspacePlan: WorkspacePlan }> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: {
      role: true,
      scope: true,
      overrides: { select: { moduleKey: true, level: true } },
      grants: { select: { resourceType: true, resourceId: true, level: true } },
      workspace: { select: { plan: true } },
    },
  });
  if (!membership) throw HttpError.forbidden('Membership not found');
  return {
    role: membership.role as Role,
    scope: membership.scope as Scope,
    overrides: membership.overrides,
    grants: membership.grants,
    isSuperAdmin,
    workspacePlan: membership.workspace.plan as WorkspacePlan,
  };
}

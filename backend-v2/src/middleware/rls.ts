import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Sets Postgres session variables used by RLS policies:
 *   app.current_workspace  — active workspace UUID
 *   app.current_user       — authenticated user UUID
 *   app.is_super_admin     — '1' for bypass, else '0'
 */
export async function applyRlsContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) return next();
  try {
    const workspaceId = req.workspaceId ?? '';
    const userId = req.auth.sub;
    const superAdmin = req.auth.isSuperAdmin ? '1' : '0';
    await prisma.$executeRawUnsafe(
      `SELECT set_config('app.current_workspace', $1, true),
              set_config('app.current_user', $2, true),
              set_config('app.is_super_admin', $3, true)`,
      workspaceId,
      userId,
      superAdmin,
    );
    next();
  } catch (err) {
    next(err);
  }
}

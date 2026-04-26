import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { Request } from 'express';

export interface LogActivityInput {
  workspaceId: string;
  entityType: string;
  entityId: string;
  actionType: string;
  description: string;
  performedByUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write-only audit trail. Never throws — failures are logged but do not break caller.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: input.workspaceId,
        entityType: input.entityType,
        entityId: input.entityId,
        actionType: input.actionType,
        description: input.description,
        performedByUserId: input.performedByUserId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: (input.metadata ?? undefined) as any,
      },
    });
  } catch (err) {
    logger.warn({ err, input }, 'activity-log write failed');
  }
}

/**
 * Extract IP + user-agent from Express request.
 */
export function reqContext(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
    userAgent: (req.headers['user-agent'] as string) || null,
  };
}

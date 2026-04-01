import { PrismaClient } from '@prisma/client';

interface LogActivityParams {
  entityType: string;
  entityId: string;
  actionType: string;
  description: string;
  performedByUserId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logActivity(
  prisma: PrismaClient,
  params: LogActivityParams
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        actionType: params.actionType,
        description: params.description,
        performedByUserId: params.performedByUserId || null,
        workspaceId: params.workspaceId || undefined,
        metadata: params.metadata ? (params.metadata as any) : undefined,
      },
    });
  } catch (error) {
    // Activity logging should never break main flow
    console.error('Failed to log activity:', error);
  }
}

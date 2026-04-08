import prisma from '../../lib/prisma';

export async function listActivityLogs(params: {
  entityType?: string;
  entityId?: string;
  performedByUserId?: string;
  actionType?: string;
  page?: number;
  limit?: number;
  workspaceId?: string | null;
  workspaceIds?: string[];
}) {
  const { entityType, entityId, performedByUserId, actionType, page = 1, limit: rawLimit = 50, workspaceId, workspaceIds } = params;
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (workspaceIds && workspaceIds.length > 0) {
    where.workspaceId = { in: workspaceIds };
  } else if (workspaceId) {
    where.workspaceId = workspaceId;
  }
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (performedByUserId) where.performedByUserId = performedByUserId;
  if (actionType) where.actionType = actionType;

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return {
    data: logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

import { Request, Response, NextFunction } from 'express';
import { listActivityLogs } from './activityLogs.service';

export async function getActivityLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { entityType, entityId, performedByUserId, actionType, page, limit } =
      req.query as Record<string, string>;

    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];
    const result = await listActivityLogs({
      entityType,
      entityId,
      performedByUserId,
      actionType,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      workspaceId: wsIds.length > 1 ? undefined : req.workspaceId,
      workspaceIds: wsIds.length > 1 ? wsIds : undefined,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

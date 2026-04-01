import { Request, Response, NextFunction } from 'express';
import { getAdminDashboard, getClientDashboard } from './dashboard.service';

export async function adminDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getAdminDashboard(req.workspaceId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function clientDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = (req.query.workspaceId as string) || req.workspaceId;
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId required' });
      return;
    }
    const data = await getClientDashboard(workspaceId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

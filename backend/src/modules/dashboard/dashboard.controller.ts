import { Request, Response, NextFunction } from 'express';
import { getAdminDashboard, getClientDashboard } from './dashboard.service';

export async function adminDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getAdminDashboard(req.workspaceId!);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function clientDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Always use workspace from auth context — never from query params
    if (!req.workspaceId) {
      res.status(400).json({ error: 'Workspace context required' });
      return;
    }
    const data = await getClientDashboard(req.workspaceId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

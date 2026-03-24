import { Request, Response, NextFunction } from 'express';
import { getAdminDashboard, getClientDashboard } from './dashboard.service';
import { AppError } from '../../middleware/errorHandler';

export async function adminDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getAdminDashboard();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function clientDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    let clientId: string;

    if (user.role === 'CLIENT') {
      if (!user.clientId) {
        throw new AppError('No client associated with this account', 400);
      }
      clientId = user.clientId;
    } else {
      // ADMIN or TECHNICIAN can query any client
      clientId = req.query.clientId as string;
      if (!clientId) {
        throw new AppError('clientId query parameter is required', 400);
      }
    }

    const data = await getClientDashboard(clientId);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';
import { loginService, refreshTokenService, getMeService } from './auth.service';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const result = await refreshTokenService(refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await getMeService(userId);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';
import { sendNotificationSchema } from './notifications.validation';
import * as svc from './notifications.service';

export async function send(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sendNotificationSchema.parse(req.body);
    const result = await svc.sendNotifications(data, req.user!.userId);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await svc.getMyNotifications(req.user!.userId);
    res.json(items);
  } catch (err) { next(err); }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await svc.getUnreadCount(req.user!.userId);
    res.json({ count });
  } catch (err) { next(err); }
}

export async function read(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids } = req.body as { ids: string[] };
    await svc.markRead(req.user!.userId, ids ?? []);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function readAll(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.markAllRead(req.user!.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

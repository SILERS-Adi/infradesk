import { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { getVapidPublicKey } from '../../lib/webpush';

export async function getPublicKey(req: Request, res: Response, next: NextFunction) {
  try {
    const key = await getVapidPublicKey();
    res.json({ publicKey: key });
  } catch (err) { next(err); }
}

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Invalid subscription object' });
      return;
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user!.userId },
      create: { userId: req.user!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

export async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return; }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user!.userId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

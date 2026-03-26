import { Request, Response, NextFunction } from 'express';
import { verifyPin, requestPin, listPinRequests } from './downloads.service';

export async function postVerifyPin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pin } = req.body as { pin: string };
    if (!pin || typeof pin !== 'string') {
      res.status(400).json({ error: 'PIN jest wymagany' });
      return;
    }
    const result = await verifyPin(pin.trim());
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postRequestPin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Podaj poprawny adres e-mail' });
      return;
    }
    const result = await requestPin(email.trim().toLowerCase());
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPinRequests(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await listPinRequests();
    res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
}

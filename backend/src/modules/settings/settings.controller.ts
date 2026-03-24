import { Request, Response, NextFunction } from 'express';
import { getSetting, setSetting, getContactInfo, getFaqItems } from './settings.service';

export async function getSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key } = req.params;
    const setting = await getSetting(key);
    if (!setting) {
      res.status(404).json({ error: 'Setting not found' });
      return;
    }
    res.json(setting);
  } catch (err) {
    next(err);
  }
}

export async function putSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key } = req.params;
    const { value } = req.body as { value: string };
    if (typeof value !== 'string') {
      res.status(400).json({ error: 'value must be a string' });
      return;
    }
    const setting = await setSetting(key, value);
    res.json(setting);
  } catch (err) {
    next(err);
  }
}

export async function getContactHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await getContactInfo();
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

export async function getFaqHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await getFaqItems(true); // agent endpoint — only 'agent' and 'both'
    res.json(items);
  } catch (err) {
    next(err);
  }
}

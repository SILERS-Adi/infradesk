import { Request, Response, NextFunction } from 'express';
import { getSetting, setSetting, getContactInfo, getFaqItems, getSmtpSettings, saveSmtpSettings, testSmtp } from './settings.service';
import prisma from '../../lib/prisma';
import { logActivity } from '../../utils/activityLogger';

export async function getSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key } = req.params;
    const setting = await getSetting(key, req.workspaceId);
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
    const setting = await setSetting(key, value, req.workspaceId);
    await logActivity(prisma, {
      entityType: 'Setting', entityId: key, actionType: 'UPDATE',
      description: `Setting "${key}" updated`,
      performedByUserId: req.user?.userId, workspaceId: req.workspaceId ?? undefined,
    }).catch(() => {});
    res.json(setting);
  } catch (err) {
    next(err);
  }
}

export async function getContactHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contact = await getContactInfo(req.workspaceId);
    res.json(contact);
  } catch (err) {
    next(err);
  }
}

export async function getFaqHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const items = await getFaqItems(true, req.workspaceId); // agent endpoint — only 'agent' and 'both'
    res.json(items);
  } catch (err) {
    next(err);
  }
}

export async function getSmtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getSmtpSettings(req.workspaceId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function putSmtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = req.body as {
      smtp_host?: string;
      smtp_port?: string | number;
      smtp_user?: string;
      smtp_pass?: string;
      smtp_from?: string;
    };
    const result = await saveSmtpSettings(data, req.workspaceId);
    await logActivity(prisma, {
      entityType: 'Setting', entityId: 'smtp', actionType: 'UPDATE',
      description: `SMTP settings updated (host=${data.smtp_host ?? 'unchanged'})`,
      performedByUserId: req.user?.userId, workspaceId: req.workspaceId ?? undefined,
    }).catch(() => {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function postSmtpTestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Podaj adres e-mail' });
      return;
    }
    await testSmtp(email);
    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
}

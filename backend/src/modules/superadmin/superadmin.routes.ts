import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';

const router = Router();

// All superadmin routes require auth + isSuperAdmin
router.use(authenticate, async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) { res.status(401).json({ error: 'Auth required' }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) { res.status(403).json({ error: 'Superadmin access required' }); return; }
  next();
});

// ── Platform Config ─────────────────────────────────────────────────

router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config) {
      config = await prisma.platformConfig.create({ data: { id: 'global' } });
    }
    const safe = { ...config };
    if (safe.paymentApiKey) safe.paymentApiKey = '••••' + safe.paymentApiKey.slice(-4);
    if (safe.notifySmtpPass) safe.notifySmtpPass = '••••';
    if (safe.alertSmtpPass) safe.alertSmtpPass = '••••';
    res.json(safe);
  } catch (err) { next(err); }
});

router.patch('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    if (data.paymentApiKey?.startsWith('••••')) delete data.paymentApiKey;
    if (data.notifySmtpPass === '••••') delete data.notifySmtpPass;
    if (data.alertSmtpPass === '••••') delete data.alertSmtpPass;

    const config = await prisma.platformConfig.upsert({
      where: { id: 'global' },
      update: data,
      create: { id: 'global', ...data },
    });
    res.json(config);
  } catch (err) { next(err); }
});

// ── All Workspaces ─────────────────────────────────────────────────────

router.get('/tenants', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        _count: { select: { memberships: true, agents: true, devices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(workspaces);
  } catch (err) { next(err); }
});

router.patch('/tenants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const workspace = await prisma.workspace.update({ where: { id }, data });
    res.json(workspace);
  } catch (err) { next(err); }
});

router.delete('/tenants/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.workspace.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── All Users (global) ──────────────────────────────────────────────

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, firstName: true, lastName: true, email: true,
        isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(users);
  } catch (err) { next(err); }
});

router.patch('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: { id: true, email: true, isSuperAdmin: true, isActive: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// ── Platform Stats ──────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [tenants, users, agents, devices, tickets, msp, company, personal] = await Promise.all([
      prisma.workspace.count(),
      prisma.user.count(),
      prisma.agentRegistration.count({ where: { status: 'ACTIVE' } }),
      prisma.device.count(),
      prisma.ticket.count(),
      prisma.workspace.count({ where: { type: 'MSP' } }),
      prisma.workspace.count({ where: { type: 'COMPANY' } }),
      prisma.workspace.count({ where: { type: 'PERSONAL' } }),
    ]);
    res.json({ tenants, users, agents, devices, tickets, byType: { msp, business: company, personal } });
  } catch (err) { next(err); }
});

// ── Email test ──────────────────────────────────────────────────────

router.post('/test-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, to } = req.body as { type: 'notify' | 'alert'; to: string };
    if (!to) { res.status(400).json({ error: 'to email required' }); return; }

    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config) { res.status(400).json({ error: 'Config not set' }); return; }

    const nodemailer = require('nodemailer');
    const smtp = type === 'alert'
      ? { host: config.alertSmtpHost, port: config.alertSmtpPort, user: config.alertSmtpUser, pass: config.alertSmtpPass, from: config.alertSmtpFrom, fromName: config.alertSmtpFromName }
      : { host: config.notifySmtpHost, port: config.notifySmtpPort, user: config.notifySmtpUser, pass: config.notifySmtpPass, from: config.notifySmtpFrom, fromName: config.notifySmtpFromName };

    if (!smtp.host || !smtp.user) { res.status(400).json({ error: `SMTP ${type} nie skonfigurowany` }); return; }

    const transport = nodemailer.createTransport({
      host: smtp.host, port: smtp.port || 587, secure: (smtp.port || 587) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transport.sendMail({
      from: `"${smtp.fromName || 'InfraDesk'}" <${smtp.from || smtp.user}>`,
      to,
      subject: `InfraDesk — test ${type === 'alert' ? 'alertu' : 'powiadomienia'}`,
      html: `<p>To jest wiadomość testowa z kanału <strong>${type === 'alert' ? 'ALERTY' : 'POWIADOMIENIA'}</strong>.</p><p>Jeśli ją widzisz — konfiguracja działa poprawnie.</p>`,
    });

    res.json({ sent: true });
  } catch (err) { next(err); }
});

export default router;

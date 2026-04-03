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
  const wsId = req.params.id;
  const steps = [
    ['invoicingPayment', () => prisma.invoicingPayment.deleteMany({ where: { workspaceId: wsId } })],
    ['invoiceDocumentItem', () => prisma.invoiceDocumentItem.deleteMany({ where: { document: { workspaceId: wsId } } })],
    ['invoiceDocument', () => prisma.invoiceDocument.deleteMany({ where: { workspaceId: wsId } })],
    ['invoicingContractor', () => prisma.invoicingContractor.deleteMany({ where: { workspaceId: wsId } })],
    ['invoicingProduct', () => prisma.invoicingProduct.deleteMany({ where: { workspaceId: wsId } })],
    ['shipmentItem', () => prisma.shipmentItem.deleteMany({ where: { shipment: { workspaceId: wsId } } })],
    ['shipment', () => prisma.shipment.deleteMany({ where: { workspaceId: wsId } })],
    ['packingOrderItem', () => prisma.packingOrderItem.deleteMany({ where: { order: { workspaceId: wsId } } })],
    ['packingOrder', () => prisma.packingOrder.deleteMany({ where: { workspaceId: wsId } })],
    ['serviceInspection', () => prisma.serviceInspection.deleteMany({ where: { workspaceId: wsId } })],
    ['serviceVehicle', () => prisma.serviceVehicle.deleteMany({ where: { workspaceId: wsId } })],
    // notification has no workspaceId — skip (no FK to workspace)
    ['activityLog', () => prisma.activityLog.deleteMany({ where: { workspaceId: wsId } })],
    ['sessionTimeEntry', () => prisma.sessionTimeEntry.deleteMany({ where: { workSession: { workspaceId: wsId } } })],
    ['workSession', () => prisma.workSession.deleteMany({ where: { workspaceId: wsId } })],
    ['crmActivity', () => prisma.crmActivity.deleteMany({ where: { workspaceId: wsId } })],
    ['credential', () => prisma.credential.deleteMany({ where: { workspaceId: wsId } })],
    ['ticketComment', () => prisma.ticketComment.deleteMany({ where: { ticket: { workspaceId: wsId } } })],
    ['ticket', () => prisma.ticket.deleteMany({ where: { workspaceId: wsId } })],
    ['backupHistory', () => prisma.backupHistory.deleteMany({ where: { config: { workspaceId: wsId } } })],
    ['backupConfig', () => prisma.backupConfig.deleteMany({ where: { workspaceId: wsId } })],
    ['agentRegistration', () => prisma.agentRegistration.deleteMany({ where: { workspaceId: wsId } })],
    ['task', () => prisma.task.deleteMany({ where: { workspaceId: wsId } })],
    ['orderItem', () => prisma.orderItem.deleteMany({ where: { order: { workspaceId: wsId } } })],
    ['order', () => prisma.order.deleteMany({ where: { workspaceId: wsId } })],
    ['delegation', () => prisma.delegation.deleteMany({ where: { workspaceId: wsId } })],
    ['device', () => prisma.device.deleteMany({ where: { workspaceId: wsId } })],
    // deviceType and accessType are global (no workspaceId) — skip
    ['location', () => prisma.location.deleteMany({ where: { workspaceId: wsId } })],
    ['workspaceSetting', () => prisma.workspaceSetting.deleteMany({ where: { workspaceId: wsId } })],
    ['workspaceManagement', () => prisma.workspaceManagement.deleteMany({ where: { OR: [{ companyWorkspaceId: wsId }, { mspWorkspaceId: wsId }] } })],
    ['accessGrant', () => prisma.accessGrant.deleteMany({ where: { membership: { workspaceId: wsId } } })],
    // pushSubscription has no workspaceId — skip
    ['workspaceMembership', () => prisma.workspaceMembership.deleteMany({ where: { workspaceId: wsId } })],
    ['workspace', () => prisma.workspace.delete({ where: { id: wsId } })],
  ] as [string, () => Promise<any>][];

  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err: any) {
      console.error(`DELETE workspace FAILED at step [${name}]:`, err?.message);
      res.status(400).json({ error: `Nie udało się usunąć: błąd na etapie ${name}`, detail: err?.message });
      return;
    }
  }
  res.status(204).send();
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

// ── Change user password (SuperAdmin) ───────────────────────────────

router.post('/users/:id/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Hasło musi mieć minimum 6 znaków' });
      return;
    }
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    res.json({ success: true });
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

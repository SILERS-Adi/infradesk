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

// ── Workspaces list (for selects) ───────────────────────────────────

router.get('/workspaces-list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    res.json(workspaces);
  } catch (err) { next(err); }
});

// ── All Users (global) ──────────────────────────────────────────────

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
        workspaceMemberships: {
          select: {
            id: true, role: true, scopeType: true, source: true, workspaceId: true,
            workspace: { select: { id: true, name: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(users);
  } catch (err) { next(err); }
});

router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, email, password, phone, workspaceId, role } = req.body;
    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ error: 'firstName, lastName, email, password are required' }); return;
    }
    if (password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { res.status(409).json({ error: 'Email already in use' }); return; }

    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { firstName, lastName, email, phone: phone || null, passwordHash },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (workspaceId) {
      await prisma.workspaceMembership.create({
        data: { userId: user.id, workspaceId, role: role || 'MEMBER', scopeType: 'FULL', source: 'DIRECT' },
      }).catch(() => {});
    }

    res.status(201).json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'isActive', 'isSuperAdmin'] as const;
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (data.email) {
      const taken = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: req.params.id } } });
      if (taken) { res.status(409).json({ error: 'Email already in use' }); return; }
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true, isSuperAdmin: true },
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

// ── Workspace memberships (SuperAdmin) ──────────────────────────────

router.post('/users/:id/memberships', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, role, scopeType } = req.body;
    if (!workspaceId) { res.status(400).json({ error: 'workspaceId is required' }); return; }
    const existing = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: req.params.id, workspaceId } },
    });
    if (existing) { res.status(409).json({ error: 'User is already a member of this workspace' }); return; }
    const membership = await prisma.workspaceMembership.create({
      data: {
        userId: req.params.id, workspaceId,
        role: role || 'MEMBER', scopeType: scopeType || 'FULL',
        source: 'DIRECT',
      },
      include: { workspace: { select: { id: true, name: true, type: true } } },
    });
    res.status(201).json(membership);
  } catch (err) { next(err); }
});

router.patch('/users/:id/memberships/:membershipId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, scopeType } = req.body;
    const data: Record<string, any> = {};
    if (role) data.role = role;
    if (scopeType) data.scopeType = scopeType;
    const membership = await prisma.workspaceMembership.update({
      where: { id: req.params.membershipId },
      data,
      include: { workspace: { select: { id: true, name: true, type: true } } },
    });
    res.json(membership);
  } catch (err) { next(err); }
});

router.delete('/users/:id/memberships/:membershipId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.accessGrant.deleteMany({ where: { membershipId: req.params.membershipId } });
    await prisma.userPermissionOverride.deleteMany({ where: { membershipId: req.params.membershipId } });
    await prisma.workspaceMembership.delete({ where: { id: req.params.membershipId } });
    res.status(204).send();
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

import './config'; // Load env first
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initWebSocket } from './utils/websocket';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import locationsRoutes from './modules/locations/locations.routes';
import devicesRoutes from './modules/devices/devices.routes';
import credentialsRoutes from './modules/credentials/credentials.routes';
import ticketsRoutes from './modules/tickets/tickets.routes';
import activityLogsRoutes from './modules/activityLogs/activityLogs.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import uploadRoutes from './modules/upload/upload.routes';
import crmRoutes from './modules/crm/crm.routes';
import accessTypesRoutes from './modules/accessTypes/accessTypes.routes';
import { seedAccessTypes } from './modules/accessTypes/accessTypes.service';
import agentRoutes from './modules/agent/agent.routes';
import sessionsRoutes from './modules/sessions/sessions.routes';
import settingsRoutes from './modules/settings/settings.routes';
import { initDefaultSettings } from './modules/settings/settings.service';
import tasksRouter from './modules/tasks/tasks.routes';
import { getContactHandler, getFaqHandler } from './modules/settings/settings.controller';
import ordersRouter from './modules/orders/orders.routes';
import delegationsRouter from './modules/delegations/delegations.routes';
import aiRouter from './modules/ai/ai.routes';
import notificationsRouter from './modules/notifications/notifications.routes';
import downloadsRouter from './modules/downloads/downloads.routes';
import geolocationRouter from './modules/geolocation/geolocation.routes';
import backupRouter from './modules/backup/backup.routes';
import { cleanupOldBackups } from './modules/backup/backup.service';
import pushRouter from './modules/push/push.routes';
import { initWebPush } from './lib/webpush';
import tenantRoutes from './modules/tenant/tenant.routes';
import partnersRouter from './modules/partners/partners.routes';
import superadminRouter from './modules/superadmin/superadmin.routes';
import subscriptionsRouter from './modules/subscriptions/subscriptions.routes';
import invoicingRouter from './modules/invoicing/invoicing.routes';
import contractorsRouter from './modules/invoicing/contractors.routes';
import productsRouter from './modules/invoicing/products.routes';
import invoicingReportsRouter from './modules/invoicing/reports.routes';
import invoicingPaymentsRouter from './modules/invoicing/payments.routes';
import packagingRouter from './modules/packaging/packaging.routes';
import packagingReportsRouter from './modules/packaging/reports.routes';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { resolveWorkspace } from './middleware/workspace';
import { requestLogger } from './middleware/requestLogger';
import prisma from './lib/prisma';

// Public device QR lookup (no auth)
import { getDeviceByQr } from './modules/devices/devices.controller';

const app = express();

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (PDFs, logos)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Request logging
app.use(requestLogger);

// Workspace resolution
app.use(resolveWorkspace);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Speed test upload endpoint (measures upload speed)
app.post('/api/speedtest/upload', express.raw({ limit: '50mb', type: '*/*' }), (_req, res) => {
  const size = _req.body?.length || 0;
  res.json({ received: size, timestamp: new Date().toISOString() });
});

// Public QR code resolve endpoint (no auth required)
app.get('/api/qr/:qrCodeValue', getDeviceByQr);

// Protected API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/access-types', accessTypesRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tasks', tasksRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/delegations', delegationsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/geolocation', geolocationRouter);
app.use('/api/backup', backupRouter);
app.use('/api/push', pushRouter);
app.use('/api/tenant', tenantRoutes);
app.use('/api/partners', partnersRouter);
app.use('/api/superadmin', superadminRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/invoicing/documents', invoicingRouter);
app.use('/api/invoicing/contractors', contractorsRouter);
app.use('/api/invoicing/products', productsRouter);
app.use('/api/invoicing/reports', invoicingReportsRouter);
app.use('/api/invoicing/payments', invoicingPaymentsRouter);
app.use('/api/packaging/shipments', packagingRouter);
app.use('/api/packaging/reports', packagingReportsRouter);
// Public agent endpoints (no auth)
app.get('/api/agent/contact', getContactHandler);
app.get('/api/agent/faq',     getFaqHandler);

// Workspace endpoints (Etap 2)
app.get('/api/workspaces/my', authenticate, async (req, res, next) => {
  try {
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: req.user!.userId, status: 'ACTIVE' },
      select: {
        id: true,
        role: true,
        scopeType: true,
        source: true,
        isDefault: true,
        allowedModules: true,
        workspace: {
          select: {
            id: true, name: true, slug: true, type: true, plan: true,
            logoUrl: true, primaryColor: true, isActive: true,
            managedBy: {
              where: { status: 'ACTIVE' },
              select: { mspWorkspace: { select: { id: true, name: true, slug: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { workspace: { name: 'asc' } }],
    });

    const result = memberships.map(m => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      type: m.workspace.type,
      plan: m.workspace.plan,
      logoUrl: m.workspace.logoUrl,
      primaryColor: m.workspace.primaryColor,
      role: m.role,
      scopeType: m.scopeType,
      source: m.source,
      isDefault: m.isDefault,
      allowedModules: m.allowedModules,
      managedBy: (m.workspace.managedBy as any)?.[0]?.mspWorkspace?.name ?? null,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// Workspace membership management (Etap 2.3)
import { resolveWorkspace as _rw, resolveMembership, authorizeWorkspace, withWorkspaceMembership } from './middleware/workspace';

app.get('/api/workspaces/members', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const wsId = req.workspace?.id;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const members = await prisma.workspaceMembership.findMany({
      where: { workspaceId: wsId },
      select: {
        id: true, role: true, scopeType: true, source: true, status: true,
        isDefault: true, allowedModules: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, isActive: true } },
        accessGrants: { select: { id: true, resourceType: true, resourceId: true } },
      },
      orderBy: [{ role: 'asc' }, { user: { lastName: 'asc' } }],
    });

    res.json(members);
  } catch (err) { next(err); }
});

app.post('/api/workspaces/members', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const wsId = req.workspace?.id;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    const { email, role, scopeType, grants } = req.body as {
      email: string; role: string; scopeType: string;
      grants?: { resourceType: string; resourceId: string }[];
    };
    if (!email || !role) { res.status(400).json({ error: 'email and role required' }); return; }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Check if already a member
    const existing = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: wsId } },
    });
    if (existing) { res.status(409).json({ error: 'User already a member of this workspace' }); return; }

    // Determine source
    const source = req.membership?.source === 'DIRECT' ? 'MSP_ASSIGNED' : 'DIRECT';

    const membership = await prisma.workspaceMembership.create({
      data: {
        userId: user.id,
        workspaceId: wsId,
        role: role as any,
        scopeType: (scopeType ?? 'FULL') as any,
        source: source as any,
        status: 'ACTIVE',
        accessGrants: grants?.length ? {
          create: grants.map(g => ({ resourceType: g.resourceType as any, resourceId: g.resourceId })),
        } : undefined,
      },
      select: {
        id: true, role: true, scopeType: true, source: true, status: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        accessGrants: { select: { id: true, resourceType: true, resourceId: true } },
      },
    });

    // Audit log
    await prisma.activityLog.create({
      data: {
        entityType: 'WorkspaceMembership', entityId: membership.id, actionType: 'CREATE',
        description: `Member added: ${email} as ${role} (scope=${scopeType ?? 'FULL'})`,
        performedByUserId: req.user!.userId,
        workspaceId: wsId,
      },
    }).catch(() => {});

    res.status(201).json(membership);
  } catch (err) { next(err); }
});

app.patch('/api/workspaces/members/:membershipId', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { membershipId } = req.params;
    const { role, scopeType, grants } = req.body as {
      role?: string; scopeType?: string;
      grants?: { resourceType: string; resourceId: string }[];
    };

    const existing = await prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!existing || existing.workspaceId !== req.workspace?.id) {
      res.status(404).json({ error: 'Membership not found' }); return;
    }

    // OWNER protection: last OWNER cannot change their own role
    if (existing.role === 'OWNER' && role && role !== 'OWNER') {
      const ownerCount = await prisma.workspaceMembership.count({
        where: { workspaceId: req.workspace!.id, role: 'OWNER', status: 'ACTIVE' },
      });
      if (ownerCount <= 1) {
        res.status(400).json({ error: 'Cannot change role of the last OWNER. Transfer ownership first.' }); return;
      }
    }

    // Only OWNER can assign OWNER role
    if (role === 'OWNER' && req.membership?.role !== 'OWNER') {
      res.status(403).json({ error: 'Only OWNER can assign OWNER role' }); return;
    }

    const updateData: Record<string, unknown> = {};
    if (role) updateData.role = role;
    if (scopeType) updateData.scopeType = scopeType;

    const updated = await prisma.workspaceMembership.update({
      where: { id: membershipId },
      data: updateData,
      select: {
        id: true, role: true, scopeType: true, source: true, status: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        accessGrants: { select: { id: true, resourceType: true, resourceId: true } },
      },
    });

    // Replace grants if provided
    if (grants !== undefined) {
      await prisma.accessGrant.deleteMany({ where: { membershipId } });
      if (grants.length > 0) {
        await prisma.accessGrant.createMany({
          data: grants.map(g => ({ membershipId, resourceType: g.resourceType as any, resourceId: g.resourceId })),
        });
      }
      const freshGrants = await prisma.accessGrant.findMany({
        where: { membershipId },
        select: { id: true, resourceType: true, resourceId: true },
      });
      (updated as any).accessGrants = freshGrants;
    }

    // Audit log
    await prisma.activityLog.create({
      data: {
        entityType: 'WorkspaceMembership', entityId: membershipId, actionType: 'UPDATE',
        description: `Membership updated: ${existing.user.email} → role=${role ?? existing.role}, scope=${scopeType ?? existing.scopeType}`,
        performedByUserId: req.user!.userId,
        workspaceId: req.workspace!.id,
      },
    }).catch(() => {});

    res.json(updated);
  } catch (err) { next(err); }
});

app.delete('/api/workspaces/members/:membershipId', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { membershipId } = req.params;
    const existing = await prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!existing || existing.workspaceId !== req.workspace?.id) {
      res.status(404).json({ error: 'Membership not found' }); return;
    }

    // Don't allow removing yourself
    if (existing.userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot remove yourself from workspace' }); return;
    }

    // OWNER protection: cannot remove last OWNER
    if (existing.role === 'OWNER') {
      const ownerCount = await prisma.workspaceMembership.count({
        where: { workspaceId: req.workspace!.id, role: 'OWNER', status: 'ACTIVE' },
      });
      if (ownerCount <= 1) {
        res.status(400).json({ error: 'Cannot remove the last OWNER of workspace' }); return;
      }
    }

    await prisma.accessGrant.deleteMany({ where: { membershipId } });
    await prisma.workspaceMembership.delete({ where: { id: membershipId } });

    // Audit log
    await prisma.activityLog.create({
      data: {
        entityType: 'WorkspaceMembership', entityId: membershipId, actionType: 'DELETE',
        description: `Member removed: ${existing.user.email} (was ${existing.role})`,
        performedByUserId: req.user!.userId,
        workspaceId: req.workspace!.id,
      },
    }).catch(() => {});

    res.status(204).send();
  } catch (err) { next(err); }
});

// Device types (simple lookup + create)
app.get('/api/device-types', authenticate, async (_req, res, next) => {
  try {
    const types = await prisma.deviceType.findMany({ orderBy: { name: 'asc' } });
    res.json(types);
  } catch (err) { next(err); }
});
app.post('/api/device-types', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { name, icon } = req.body as { name: string; icon?: string };
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    const type = await prisma.deviceType.create({ data: { name: name.trim(), icon } });
    res.status(201).json(type);
  } catch (err) { next(err); }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — must be last
app.use(errorHandler);

const PORT = Number(config.port);

seedAccessTypes().catch(console.error);
initDefaultSettings().catch(console.error);
initWebPush().catch(console.error);
// Backup retention cleanup every 6 hours
setInterval(() => cleanupOldBackups().catch(e => console.error('Backup cleanup error:', e)), 6 * 60 * 60 * 1000);

// RustDesk → WorkSession sync every 2 minutes
setInterval(async () => {
  try {
    const { syncCompletedRustDeskSessions } = await import('./utils/rustdesk');
    const result = await syncCompletedRustDeskSessions(prisma);
    if (result.created > 0) console.log(`RustDesk sync: ${result.created} new sessions imported`);
  } catch (e) { /* silent — RustDesk may be unavailable */ }
}, 2 * 60 * 1000);
// Run once on startup after 10s
setTimeout(async () => {
  try {
    const { syncCompletedRustDeskSessions } = await import('./utils/rustdesk');
    const result = await syncCompletedRustDeskSessions(prisma);
    if (result.created > 0) console.log(`RustDesk sync (startup): ${result.created} sessions imported`);
  } catch (e) { /* silent */ }
}, 10_000);

const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`InfraDesk API running on port ${PORT} [${config.nodeEnv}]`);
});

export default app;

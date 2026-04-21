import './config'; // Load env first
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initWebSocket } from './utils/websocket';
import { withWorkspaceMembership } from './middleware/workspace';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import locationsRoutes from './modules/locations/locations.routes';
import devicesRoutes from './modules/devices/devices.routes';
import credentialsRoutes from './modules/credentials/credentials.routes';
import ticketsRoutes from './modules/tickets/tickets.routes';
import activityLogsRoutes from './modules/activityLogs/activityLogs.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import panelRoutes from './modules/panel/panel.routes';
import uploadRoutes, { secureFileDownload } from './modules/upload/upload.routes';
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
import monitoringRouter from './modules/monitoring/monitoring.routes';
import { cleanupOldBackups } from './modules/backup/backup.service';
import pushRouter from './modules/push/push.routes';
import { initWebPush } from './lib/webpush';
import tenantRoutes from './modules/tenant/tenant.routes';
import partnersRouter from './modules/partners/partners.routes';
import superadminRouter from './modules/superadmin/superadmin.routes';
import subscriptionsRouter from './modules/subscriptions/subscriptions.routes';
import ticketReportsRouter from './modules/tickets/tickets.reports';
import invoicingRouter from './modules/invoicing/invoicing.routes';
import contractorsRouter from './modules/invoicing/contractors.routes';
import productsRouter from './modules/invoicing/products.routes';
import invoicingReportsRouter from './modules/invoicing/reports.routes';
import invoicingPaymentsRouter from './modules/invoicing/payments.routes';
import serviceVehiclesRouter from './modules/service/vehicles.routes';
import serviceInspectionsRouter from './modules/service/inspections.routes';
import packagingRouter from './modules/packaging/packaging.routes';
import packagingReportsRouter from './modules/packaging/reports.routes';
import packagingOrdersRouter from './modules/packaging/orders.routes';
import packingRouter from './modules/packaging/packing.routes';
import pickingRouter from './modules/packaging/picking.routes';
import batchesRouter from './modules/packaging/batches.routes';
import carriersRouter from './modules/packaging/carriers.routes';
import pakCustomersRouter from './modules/packaging/customers.routes';
import pakDashboardRouter from './modules/packaging/dashboard.routes';
import wavesRouter from './modules/packaging/waves.routes';
import shippingRouter from './modules/packaging/shipping.routes';
import billingRouter, { billingWebhookRouter } from './modules/billing/billing.routes';
import sharingRouter from './modules/sharing/sharing.routes';
import menuPreferencesRouter from './modules/menu-preferences/menu-preferences.routes';
import permissionsRouter from './modules/permissions/permissions.routes';
import workspaceRelationsRouter from './modules/workspace-relations/workspace-relations.routes';
import helpdeskSettingsRouter from './modules/helpdesk-settings/helpdesk-settings.routes';
import operatorRouter from './modules/operator/operator.routes';
import workspaceConfigRouter from './modules/workspace-config/workspace-config.routes';
import eventsRouter from './modules/events/events.routes';
import { requireModule } from './middleware/requireModule';
import slaRouter from './modules/sla/sla.routes';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { resolveWorkspace, requireModule } from './middleware/workspace';
import { requestLogger } from './middleware/requestLogger';
import { deepHealthCheck, getMetrics, checkAndAlert, recordError } from './utils/monitoring';
import prisma from './lib/prisma';

// Public device QR lookup (no auth)
import { getDeviceByQr } from './modules/devices/devices.controller';

import cookieParser from 'cookie-parser';

const app = express();

// ── Security headers (helmet) ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow cross-origin images (logos, avatars)
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS — strict origin whitelist
const baseDomain = process.env.BASE_DOMAIN || 'infradesk.pl';
const CORS_WHITELIST = new Set([
  `https://${baseDomain}`,
  `https://www.${baseDomain}`,
  `https://app.${baseDomain}`,
  // Dev origins (only active when NODE_ENV !== production)
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'] : []),
]);
// Add any workspace subdomains dynamically from env
if (process.env.CORS_EXTRA_ORIGINS) {
  process.env.CORS_EXTRA_ORIGINS.split(',').forEach(o => CORS_WHITELIST.add(o.trim()));
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow: no origin (server-to-server / same-origin), or exact whitelist match,
      // or valid subdomain pattern (*.infradesk.pl)
      if (!origin) {
        callback(null, true);
      } else if (CORS_WHITELIST.has(origin)) {
        callback(null, true);
      } else if (origin.match(new RegExp(`^https://[a-z0-9-]+\\.${baseDomain.replace('.', '\\.')}$`))) {
        // Dynamic workspace subdomains (e.g. https://firma-xyz.infradesk.pl)
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-CSRF-Token'],
    credentials: true,
  })
);

// Cookie parser
app.use(cookieParser());

// CSRF protection (Double Submit Cookie — validates X-CSRF-Token header on state-changing requests)
import { csrfProtection } from './middleware/csrf';
app.use(csrfProtection);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (PDFs, logos)
// Security note: uploads are served publicly because workspace logos and avatars are
// referenced in public contexts (login page, public ticket forms). File names use
// timestamp + random hash making URL guessing infeasible. Sensitive documents should
// use the /api/downloads endpoint with PIN auth instead.
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Global rate limit — 200 req/min per IP (protects against DoS, doesn't affect normal use)
import rateLimit from 'express-rate-limit';
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/metrics',
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests', retryAfter: res.getHeader('Retry-After') });
  },
}));

// Request logging
app.use(requestLogger);

// Workspace resolution
app.use(resolveWorkspace);

// Auto-resolve workspace if not set — find user's single/default membership
app.use('/api', async (req, _res, next) => {
  const skip = ['/auth', '/superadmin', '/workspaces', '/push', '/agent', '/qr', '/health'];
  if (skip.some(p => req.path.startsWith(p))) return next();
  if (req.method === 'OPTIONS') return next();

  // If already resolved by header/subdomain — continue
  if (req.workspaceId) return next();

  // If authenticated but no workspace — try to auto-resolve from user's memberships
  if (req.headers.authorization) {
    try {
      const { authenticate: authFn } = require('./middleware/auth');
      // Parse user from token (lightweight — just decode, don't call full middleware)
      const token = req.headers.authorization.replace('Bearer ', '');
      const jwt = require('./utils/jwt');
      const payload = jwt.verifyAccessToken(token);
      if (payload?.userId) {
        const membership = await prisma.workspaceMembership.findFirst({
          where: { userId: payload.userId, status: 'ACTIVE' },
          include: { workspace: { select: { id: true, slug: true, type: true, isActive: true } } },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
        if (membership?.workspace?.isActive) {
          req.workspaceId = membership.workspace.id;
          req.workspace = { id: membership.workspace.id, slug: membership.workspace.slug, type: membership.workspace.type, source: 'header' as const };
        }
      }
    } catch { /* silent — continue without workspace */ }
  }
  next();
});

// Health checks
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/health/deep', async (_req, res) => {
  try {
    const health = await deepHealthCheck();
    // Add Redis status
    const { isRedisConnected } = require('./lib/redis');
    (health as any).redis = isRedisConnected() ? 'connected' : 'disconnected';
    const status = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(status).json(health);
  } catch (e: any) {
    res.status(503).json({ status: 'down', error: e.message });
  }
});

// Metrics endpoint (lightweight Prometheus-compatible JSON)
app.get('/metrics', (_req, res) => {
  res.json(getMetrics());
});

// Speed test upload endpoint (measures upload speed)
app.post('/api/speedtest/upload', express.raw({ limit: '50mb', type: '*/*' }), (_req, res) => {
  const size = _req.body?.length || 0;
  res.json({ received: size, timestamp: new Date().toISOString() });
});

// Public QR code resolve endpoint (no auth required, rate-limited)
import { publicTicketLimiter, qrLookupLimiter } from './middleware/rateLimit';
app.get('/api/qr/:qrCodeValue', qrLookupLimiter, getDeviceByQr);

// ── Auth (public + protected mix) ──
app.use('/api/auth', authRoutes);

// ── Core (no module guard — always available) ──
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/panel', panelRoutes);                        // ID Panel — nowy UX (obok /portal/*)
app.use('/api/upload', uploadRoutes);
app.use('/api/files', secureFileDownload(UPLOADS_DIR)); // Authenticated file download for sensitive attachments
app.use('/api/notifications', notificationsRouter);
app.use('/api/push', pushRouter);
app.use('/api/access-types', accessTypesRoutes);
app.use('/api/geolocation', geolocationRouter);

// ── Permanent sections (always available, no module guard) ──
app.use('/api/credentials', authenticate, withWorkspaceMembership, requireModule('vault'), credentialsRoutes);            // Sejf haseł
app.use('/api/ai', aiRouter);                              // Asystent AI
app.use('/api/locations', locationsRoutes);                 // Moja firma: Lokalizacje
app.use('/api/users', usersRoutes);                        // Moja firma: Użytkownicy
app.use('/api/settings', settingsRoutes);                  // Moja firma: Ustawienia
app.use('/api/downloads', downloadsRouter);                // Moja firma: Pobieranie

// ── Module: infrastructure ──
app.use('/api/devices', authenticate, requireModule('infrastructure'), devicesRoutes);
app.use('/api/agent', agentRoutes);                        // Agent has mixed public+authenticated
app.use('/api/activity-logs', authenticate, withWorkspaceMembership, requireModule('infrastructure.activity-logs'), activityLogsRoutes);
// Agent cloud upload — uses agent token, no JWT required (must be before authenticated backup routes)
import multer from 'multer';
import path from 'path';
import fs from 'fs';
const INFRADESK_BACKUP_PATH = process.env.INFRADESK_BACKUP_PATH || '/var/backups/infradesk';
app.post('/api/backup/cloud/upload', async (req, res, next) => {
  try {
    const token = req.headers['x-agent-token'] as string;
    if (!token) { res.status(401).json({ error: 'Agent token required' }); return; }
    const agent = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
    if (!agent) { res.status(401).json({ error: 'Invalid agent token' }); return; }
    const configId = req.headers['x-backup-config-id'] as string;
    if (!configId) { res.status(400).json({ error: 'Config ID required' }); return; }
    const config = await prisma.backupConfig.findUnique({ where: { id: configId } });
    if (!config?.useInfradeskCloud) { res.status(400).json({ error: 'Cloud not enabled' }); return; }
    const wsDir = path.join(INFRADESK_BACKUP_PATH, config.workspaceId, configId);
    fs.mkdirSync(wsDir, { recursive: true });
    const upload = multer({
      storage: multer.diskStorage({
        destination: (_r: any, _f: any, cb: any) => cb(null, wsDir),
        filename: (_r: any, file: any, cb: any) => cb(null, `${new Date().toISOString().replace(/[:.]/g, '-')}_${file.originalname}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 * 1024 },
    }).single('backup');
    upload(req as any, res as any, (err: any) => {
      if (err) { res.status(400).json({ error: err.message }); return; }
      if (!(req as any).file) { res.status(400).json({ error: 'No file' }); return; }
      console.log(`[CLOUD] Backup uploaded: ${(req as any).file.filename} (${(req as any).file.size} bytes)`);
      res.json({ ok: true, fileName: (req as any).file.filename, sizeBytes: (req as any).file.size });
    });
  } catch (err) { next(err); }
});
app.use('/api/backup', authenticate, requireModule('infrastructure'), backupRouter);
app.use('/api/monitoring', monitoringRouter);

// ── Module: service-desk ──
app.use('/api/tickets', authenticate, requireModule('service-desk'), ticketsRoutes);
app.use('/api/tickets/reports', authenticate, requireModule('service-desk'), ticketReportsRouter);
app.use('/api/tasks', authenticate, requireModule('service-desk'), tasksRouter);
app.use('/api/orders', authenticate, requireModule('service-desk'), ordersRouter);
app.use('/api/delegations', authenticate, requireModule('service-desk'), delegationsRouter);
app.use('/api/crm', authenticate, requireModule('service-desk'), crmRoutes);
app.use('/api/sessions', authenticate, requireModule('service-desk'), sessionsRoutes);

// ── Admin / platform ──
app.use('/api/tenant', tenantRoutes);
app.use('/api/partners', partnersRouter);
app.use('/api/superadmin', superadminRouter);
app.use('/api/subscriptions', subscriptionsRouter);
// Module-gated routes — requireModule checks workspace.enabledModules
app.use('/api/invoicing/documents', authenticate, requireModule('invoicing'), invoicingRouter);
app.use('/api/invoicing/contractors', authenticate, requireModule('invoicing'), contractorsRouter);
app.use('/api/invoicing/products', authenticate, requireModule('invoicing'), productsRouter);
app.use('/api/invoicing/reports', authenticate, requireModule('invoicing'), invoicingReportsRouter);
app.use('/api/invoicing/payments', authenticate, requireModule('invoicing'), invoicingPaymentsRouter);
app.use('/api/packaging/shipments', authenticate, requireModule('packaging'), packagingRouter);
app.use('/api/packaging/reports', authenticate, requireModule('packaging'), packagingReportsRouter);
app.use('/api/packaging/orders', authenticate, requireModule('packaging'), packagingOrdersRouter);
app.use('/api/packaging/packing', authenticate, requireModule('packaging'), packingRouter);
app.use('/api/packaging/picking', authenticate, requireModule('packaging'), pickingRouter);
app.use('/api/packaging/batches', authenticate, requireModule('packaging'), batchesRouter);
app.use('/api/packaging/carriers', authenticate, requireModule('packaging'), carriersRouter);
app.use('/api/packaging/customers', authenticate, requireModule('packaging'), pakCustomersRouter);
app.use('/api/packaging/dashboard', authenticate, requireModule('packaging'), pakDashboardRouter);
app.use('/api/packaging/waves', authenticate, requireModule('packaging'), wavesRouter);
app.use('/api/packaging/shipping', authenticate, requireModule('packaging'), shippingRouter);
app.use('/api/billing/webhook', billingWebhookRouter); // Public webhook (verified by secret)
app.use('/api/billing', billingRouter);
app.use('/api/sharing', sharingRouter);
app.use('/api/menu-preferences', menuPreferencesRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/workspace-relations', workspaceRelationsRouter);
app.use('/api/helpdesk-settings', helpdeskSettingsRouter);
app.use('/api/operator', operatorRouter);
app.use('/api/workspace-config', workspaceConfigRouter);
app.use('/api/events', eventsRouter);
app.use('/api/sla', slaRouter);
app.use('/api/service/vehicles', authenticate, requireModule('skp'), serviceVehiclesRouter);
app.use('/api/service/inspections', authenticate, requireModule('skp'), serviceInspectionsRouter);
// Public agent endpoints (no auth)
app.get('/api/agent/contact', getContactHandler);
app.get('/api/agent/faq',     getFaqHandler);

// ── Public ticket submission (no auth) ──
import { resolveTicketProvider } from './utils/ticketRouting';
import { createTicket as createTicketService } from './modules/tickets/tickets.service';

app.get('/api/public/tickets/:workspaceSlug', publicTicketLimiter, async (req, res, next) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: req.params.workspaceSlug },
      select: { id: true, name: true, slug: true, organizationType: true, logoUrl: true, primaryColor: true },
    });
    if (!workspace || !workspace) { res.status(404).json({ error: 'Workspace nie znaleziony' }); return; }

    // Get locations for the form
    const locations = await prisma.location.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });

    // If deviceId in query — get device info
    let device = null;
    if (req.query.deviceId) {
      device = await prisma.device.findFirst({
        where: { id: req.query.deviceId as string, workspaceId: workspace.id },
        select: { id: true, name: true, hostname: true, type: true },
      });
    }

    res.json({ workspace, locations, device });
  } catch (err) { next(err); }
});

app.post('/api/public/tickets/:workspaceSlug', publicTicketLimiter, async (req, res, next) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: req.params.workspaceSlug },
      select: { id: true, name: true },
    });
    if (!workspace) { res.status(404).json({ error: 'Workspace nie znaleziony' }); return; }

    const { title, description, priority, type, locationId, deviceId, reporterName, reporterPhone } = req.body;
    if (!title || !description) { res.status(400).json({ error: 'Tytuł i opis są wymagane' }); return; }

    // Resolve provider
    const routing = await resolveTicketProvider(workspace.id);

    // Find or create a system user for public submissions
    let systemUser = await prisma.user.findFirst({ where: { email: 'system@infradesk.local' } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: 'system@infradesk.local', firstName: 'System', lastName: 'InfraDesk', passwordHash: '', isActive: true },
      });
    }

    const ticket = await createTicketService({
      workspaceId: workspace.id,
      title,
      description,
      priority: priority || 'MEDIUM',
      type: type || 'INCIDENT',
      source: deviceId ? 'QR_SCAN' : 'CLIENT_PORTAL',
      locationId: locationId || undefined,
      deviceId: deviceId || undefined,
      reporterName: reporterName || undefined,
      reporterPhone: reporterPhone || undefined,
    }, { userId: systemUser.id });

    // Set provider on ticket if routing resolved
    if (routing.providerWorkspaceId) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          requesterWorkspaceId: workspace.id,
          providerWorkspaceId: routing.providerWorkspaceId,
        },
      });
    }

    res.status(201).json({ success: true, ticketNumber: ticket.ticketNumber });
  } catch (err) { next(err); }
});

/** Migrate old module keys to new ones */
function migrateModuleKeys(modules: string[]): string[] {
  const result = new Set<string>();
  for (const m of modules) {
    if (m === 'helpdesk') {
      result.add('infrastructure');
      result.add('service-desk');
    } else if (m === 'service') {
      result.add('skp');
    } else {
      result.add(m);
    }
  }
  return Array.from(result);
}

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
            logoUrl: true, primaryColor: true, isActive: true, enabledModules: true, organizationType: true,
            orgType: true, platformBillingMode: true, accountManagedBy: true,
            modules: { select: { moduleKey: true, state: true, activatedAt: true, expiresAt: true } },
            subscriptionStatus: true, trialEndDate: true, billingCycle: true, monthlyPrice: true, lastConfig: true, paidUntil: true,
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
      enabledModules: migrateModuleKeys(m.workspace.enabledModules ?? ['helpdesk']),
      organizationType: m.workspace.organizationType ?? 'internal_it',
      orgType: m.workspace.orgType,
      platformBillingMode: m.workspace.platformBillingMode,
      accountManagedBy: m.workspace.accountManagedBy,
      modules: m.workspace.modules,
      managedBy: (m.workspace.managedBy as any)?.[0]?.mspWorkspace?.name ?? null,
      subscriptionStatus: m.workspace.subscriptionStatus,
      trialEndDate: m.workspace.trialEndDate,
      billingCycle: m.workspace.billingCycle,
      monthlyPrice: m.workspace.monthlyPrice,
      lastConfig: m.workspace.lastConfig,
      paidUntil: m.workspace.paidUntil,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// Save workspace configuration (from configurator)
// Onboarding — set organization type + helpdesk settings
app.put('/api/workspaces/onboarding', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'Workspace context required' }); return; }

    // Verify OWNER/ADMIN
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId: wsId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership && !req.user!.isSuperAdmin) { res.status(403).json({ error: 'Brak uprawnień' }); return; }

    const { organizationType, ticketRoutingMode, defaultProviderWorkspaceId } = req.body;

    if (organizationType && ['client', 'internal_it', 'msp', 'client_external_it', 'it_operator'].includes(organizationType)) {
      // Write to both legacy (organizationType) and canonical (orgType)
      const orgTypeMap: Record<string, string> = {
        msp: 'MSP', it_operator: 'MSP',
        client: 'CLIENT', client_external_it: 'CLIENT',
        internal_it: 'INTERNAL_IT',
      };
      await prisma.workspace.update({
        where: { id: wsId },
        data: {
          organizationType,
          orgType: (orgTypeMap[organizationType] ?? 'INTERNAL_IT') as any,
        },
      });
    }

    if (ticketRoutingMode) {
      await prisma.workspaceHelpdeskSettings.upsert({
        where: { workspaceId: wsId },
        create: { workspaceId: wsId, ticketRoutingMode, defaultProviderWorkspaceId: defaultProviderWorkspaceId ?? null },
        update: { ticketRoutingMode, defaultProviderWorkspaceId: defaultProviderWorkspaceId ?? undefined },
      });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

app.post('/api/workspaces/save-config', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { workspaceId, config, billingCycle, monthlyPrice } = req.body;
    if (!workspaceId || !config) { res.status(400).json({ error: 'workspaceId and config required' }); return; }

    // Verify ownership
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access to this workspace' }); return; }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        lastConfig: config,
        billingCycle: billingCycle || 'MONTHLY',
        monthlyPrice: monthlyPrice || 0,
      },
    });
    res.json({ success: true, lastConfig: updated.lastConfig });
  } catch (err) { next(err); }
});

// Get workspace subscription info (public for renewal flow)
app.get('/api/workspaces/:id/subscription', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const wsId = req.params.id;
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId: wsId, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access' }); return; }

    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: { subscriptionStatus: true, trialEndDate: true, billingCycle: true, monthlyPrice: true, lastConfig: true, paidUntil: true, type: true, name: true },
    });
    res.json(ws);
  } catch (err) { next(err); }
});

// Workspace membership management (Etap 2.3)
import { resolveWorkspace as _rw, resolveMembership, authorizeWorkspace, withWorkspaceMembership } from './middleware/workspace';


// Role-orgType consistency guard — prevents adding MEMBER/VIEWER to MSP workspace or TECHNICIAN/OWNER to client portal
async function enforceRoleOrgTypeConsistency(workspaceId: string, role: string | undefined) {
  if (!role) return;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { orgType: true, name: true },
  });
  if (!ws) return;
  const isMspType = ws.orgType === 'MSP' || ws.orgType === 'IT_OPERATOR';
  const isClientType = ws.orgType === 'CLIENT';
  const isClientRole = role === 'MEMBER' || role === 'VIEWER';
  const isOperationalRole = role === 'TECHNICIAN';

  if (isMspType && isClientRole) {
    const err: any = new Error(`Firma "${ws.name}" jest typu MSP/IT — nie można dodać roli ${role} (to rola klienta). Użyj Administrator lub Technik.`);
    err.status = 400;
    throw err;
  }
  if (isClientType && isOperationalRole) {
    const err: any = new Error(`Firma "${ws.name}" jest typu Klient — nie można dodać roli ${role} (to rola MSP). Użyj Administrator klienta lub Pracownik.`);
    err.status = 400;
    throw err;
  }
}

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

        await enforceRoleOrgTypeConsistency(req.workspace!.id, role);
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

    // Guard — prevent role that doesn't match workspace orgType
    await enforceRoleOrgTypeConsistency(req.workspace!.id, role);

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

// ── Workspace Settings: Google Drive ────────────────────────────────
app.get('/api/workspaces/settings/google-drive', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const settings = await prisma.workspaceSetting.findMany({
      where: { workspaceId: req.workspace!.id, key: { in: ['google_client_id', 'google_client_secret'] } },
    });
    const result: Record<string, string> = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json(result);
  } catch (err) { next(err); }
});

app.put('/api/workspaces/settings/google-drive', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { google_client_id, google_client_secret } = req.body;
    const wsId = req.workspace!.id;
    for (const [key, value] of Object.entries({ google_client_id, google_client_secret }) as [string, string][]) {
      await prisma.workspaceSetting.upsert({
        where: { workspaceId_key: { workspaceId: wsId, key } },
        update: { value: value || '' },
        create: { workspaceId: wsId, key, value: value || '' },
      });
    }
    res.json({ ok: true });
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
// Background jobs — BullMQ (Redis) with setInterval fallback
import { startJobScheduler } from './jobs/scheduler';
startJobScheduler().catch(e => console.error('Job scheduler init error:', e));

const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`InfraDesk API running on port ${PORT} [${config.nodeEnv}]`);
});

// ── Uncaught exception / rejection handlers ─────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  recordError(err.message);
  // Give time to flush logs, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[ERROR] Unhandled rejection:', msg);
  recordError(msg);
});

// ── Graceful shutdown ───────────────────────────────────────────────────────

function gracefulShutdown(signal: string) {
  console.log(`[SHUTDOWN] ${signal} received — closing server gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('[SHUTDOWN] HTTP server closed');

    // Close WebSocket connections
    const { agentConnections } = await import('./utils/websocket');
    for (const [, ws] of agentConnections) {
      ws.close(1001, 'Server shutting down');
    }
    console.log('[SHUTDOWN] WebSocket connections closed');

    // Close Redis
    try {
      const { closeRedis } = await import('./lib/redis');
      await closeRedis();
      console.log('[SHUTDOWN] Redis disconnected');
    } catch {}

    // Close database connection
    try {
      await prisma.$disconnect();
      console.log('[SHUTDOWN] Database disconnected');
    } catch {}

    process.exit(0);
  });

  // Force shutdown after 10s if graceful fails
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

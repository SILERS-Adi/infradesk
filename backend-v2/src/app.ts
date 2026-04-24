import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { requestId } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { resolveWorkspaceFromHost } from './middleware/resolveWorkspace';
import { requireAuth } from './middleware/auth';
import publicRouter from './modules/public/public.routes';
import authRouter from './modules/auth/auth.routes';
import authGoogleRouter from './modules/auth-google/auth-google.routes';
import workspacesRouter from './modules/workspaces/workspaces.routes';
import membershipsRouter from './modules/memberships/memberships.routes';
import usersRouter from './modules/users/users.routes';
import permissionsRouter from './modules/permissions/permissions.routes';
import ticketsRouter from './modules/tickets/tickets.routes';
import tasksRouter from './modules/tasks/tasks.routes';
import delegationsRouter, { calendarRouter, billingRouter } from './modules/delegations/delegations.routes';
import clientsRouter from './modules/clients/clients.routes';
import backupsRouter from './modules/backups/backups.routes';
import devicesRouter from './modules/devices/devices.routes';
import locationsRouter from './modules/locations/locations.routes';
import sessionsRouter from './modules/sessions/sessions.routes';
import crmRouter from './modules/crm/crm.routes';
import ordersRouter from './modules/orders/orders.routes';
import monitoringRouter from './modules/monitoring/monitoring.routes';
import vaultRouter from './modules/vault/vault.routes';
import agentsRouter from './modules/agents/agents.routes';
import agentCompatRouter from './modules/agent-compat/agent-compat.routes';
import shadowRouter from './modules/shadow/shadow.routes';
import riskRouter from './modules/risk/risk.routes';
import activityLogsRouter from './modules/activity-logs/activity-logs.routes';
import monitoringOverviewRouter from './modules/monitoring/monitoring-overview.routes';
import aiRouter from './modules/ai/ai.routes';
import crmEmailRouter from './modules/crm-email/crm-email.routes';
import downloadsRouter from './modules/downloads/downloads.routes';
import { irisEmbedRouter } from './modules/iris/iris-embed.controller';
import { irisChatRouter } from './modules/iris/iris-chat.controller';
import oauthRouter, { discoveryRouter as oauthDiscoveryRouter } from './modules/auth-oidc/auth-oidc.routes';
import settingsRouter from './modules/settings/settings.routes';
import path from 'path';

export function buildApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet({ contentSecurityPolicy: false }));
  // CORS: allow explicit origins + wildcard *.infradesk.pl (production subdomains)
  const WILDCARD_PATTERN = /^https:\/\/([a-z0-9-]{3,40}\.)?infradesk\.pl$/;
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (config.corsOrigins.includes(origin)) return cb(null, true);
        if (WILDCARD_PATTERN.test(origin)) return cb(null, true);
        return cb(new Error('CORS: origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Resolve workspace from Host header — populates req.resolvedWorkspace + req.hostSubdomain
  app.use(resolveWorkspaceFromHost);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'infradesk-backend-v2', version: '2.0.0-alpha.1' });
  });

  if (!config.isTest) app.use(globalLimiter);

  app.use('/api/v2/public', publicRouter);
  app.use('/api/v2/auth', authRouter);
  // Sprint 6: per-user Google OAuth (Gmail + Calendar readonly).
  // Mounted under /api/v2/auth/google/* — does not conflict with /auth auth flows.
  app.use('/api/v2/auth/google', authGoogleRouter);
  app.use('/api/v2/workspaces', workspacesRouter);
  app.use('/api/v2/memberships', membershipsRouter);
  app.use('/api/v2/users', usersRouter);
  app.use('/api/v2/permissions', permissionsRouter);
  app.use('/api/v2/tickets', ticketsRouter);
  app.use('/api/v2/tasks', tasksRouter);
  app.use('/api/v2/delegations', delegationsRouter);
  app.use('/api/v2/calendar', calendarRouter);
  app.use('/api/v2/billing', billingRouter);
  app.use('/api/v2/clients', clientsRouter);
  app.use('/api/v2/backups', backupsRouter);
  app.use('/api/v2/devices', devicesRouter);
  app.use('/api/v2/locations', locationsRouter);
  app.use('/api/v2/sessions', sessionsRouter);
  app.use('/api/v2/contacts', crmRouter);
  app.use('/api/v2/orders', ordersRouter);
  app.use('/api/v2/monitoring', monitoringRouter);
  app.use('/api/v2/monitoring', monitoringOverviewRouter);
  app.use('/api/v2/vault', vaultRouter);
  app.use('/api/v2/agents', agentsRouter);
  app.use('/api/agent', agentCompatRouter); // V1 desktop agent compatibility (no /v2 prefix)
  app.use('/api/v2/ai/shadow', shadowRouter);
  app.use('/api/v2/ai', aiRouter);
  app.use('/api/v2/crm', crmEmailRouter);
  app.use('/api/v2/clients/risk', riskRouter);
  app.use('/api/v2/activity-logs', activityLogsRouter);
  app.use('/api/v2/downloads', downloadsRouter);
  app.use('/api/v2/iris', irisChatRouter());
  app.use('/api/v2/iris', irisEmbedRouter(requireAuth));
  app.use("/api/v2/settings", settingsRouter);
  // Static uploads (logos, etc.) served under /uploads/* for the backend origin.
  app.use("/uploads", express.static(path.resolve(process.env.UPLOADS_DIR || "/home/adrian/infradesk/backend-v2/uploads"), { maxAge: "7d", fallthrough: true }));
  app.use('/api/v2/oauth', oauthRouter);
  app.use('/', oauthDiscoveryRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

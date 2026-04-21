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
import publicRouter from './modules/public/public.routes';
import authRouter from './modules/auth/auth.routes';
import workspacesRouter from './modules/workspaces/workspaces.routes';
import membershipsRouter from './modules/memberships/memberships.routes';
import usersRouter from './modules/users/users.routes';
import permissionsRouter from './modules/permissions/permissions.routes';
import ticketsRouter from './modules/tickets/tickets.routes';
import tasksRouter from './modules/tasks/tasks.routes';
import delegationsRouter, { calendarRouter, billingRouter } from './modules/delegations/delegations.routes';
import clientsRouter from './modules/clients/clients.routes';
import devicesRouter from './modules/devices/devices.routes';
import locationsRouter from './modules/locations/locations.routes';
import sessionsRouter from './modules/sessions/sessions.routes';
import crmRouter from './modules/crm/crm.routes';
import ordersRouter from './modules/orders/orders.routes';
import monitoringRouter from './modules/monitoring/monitoring.routes';
import vaultRouter from './modules/vault/vault.routes';
import agentsRouter from './modules/agents/agents.routes';
import shadowRouter from './modules/shadow/shadow.routes';
import riskRouter from './modules/risk/risk.routes';

export function buildApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet({ contentSecurityPolicy: false }));
  // CORS: allow explicit origins + wildcard *.infradesk.pl (production subdomains)
  const WILDCARD_PATTERN = /^https?:\/\/[a-z0-9-]{3,40}\.infradesk\.pl$/;
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
  app.use('/api/v2/devices', devicesRouter);
  app.use('/api/v2/locations', locationsRouter);
  app.use('/api/v2/sessions', sessionsRouter);
  app.use('/api/v2/contacts', crmRouter);
  app.use('/api/v2/orders', ordersRouter);
  app.use('/api/v2/monitoring', monitoringRouter);
  app.use('/api/v2/vault', vaultRouter);
  app.use('/api/v2/agents', agentsRouter);
  app.use('/api/v2/ai/shadow', shadowRouter);
  app.use('/api/v2/clients/risk', riskRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

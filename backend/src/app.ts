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
import clientsRoutes from './modules/clients/clients.routes';
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

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { authenticate, authorize } from './middleware/auth';
import prisma from './lib/prisma';

// Public device QR lookup (no auth)
import { getDeviceByQr } from './modules/devices/devices.controller';

const app = express();

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public QR code resolve endpoint (no auth required)
app.get('/api/qr/:qrCodeValue', getDeviceByQr);

// Protected API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clients', clientsRoutes);
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
// Public agent endpoints (no auth)
app.get('/api/agent/contact', getContactHandler);
app.get('/api/agent/faq',     getFaqHandler);

// Device types (simple lookup + create)
app.get('/api/device-types', authenticate, async (_req, res, next) => {
  try {
    const types = await prisma.deviceType.findMany({ orderBy: { name: 'asc' } });
    res.json(types);
  } catch (err) { next(err); }
});
app.post('/api/device-types', authenticate, authorize('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
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

const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`InfraDesk API running on port ${PORT} [${config.nodeEnv}]`);
});

export default app;

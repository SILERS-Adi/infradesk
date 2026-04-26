import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import {
  agentAuth, postRegister, postMetrics, postTicket,
  getRegistrations, getAuditData, postApprove, postApproveNewClient, postPushUpdate, postWindowsUpdate, postRestartService, postSystemReboot, postWakeDevice, postNotify, deleteReg, getStatus, getConnectPassword,
  getRustdeskPeers, getRustdeskSessions, postRustdeskSync, getRustdeskActiveSessions, postRustdeskSyncSessions,
} from './agent.controller';
import {
  registerSchema, metricsSchema, agentTicketSchema, approveSchema,
} from './agent.validation';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tylko obrazy (jpg/png/webp)'));
  },
});

import { agentRegisterLimiter } from '../../middleware/rateLimit';

const router = Router();

// Public — agent registration (no auth required)
router.post('/register', agentRegisterLimiter, validate(registerSchema), postRegister);

// Agent token auth — for agent app
router.get('/status',   agentAuth, getStatus);
router.post('/metrics', agentAuth, validate(metricsSchema), postMetrics);
router.post('/ticket',  agentAuth, validate(agentTicketSchema), postTicket);
router.get('/tickets',  agentAuth, async (req, res, next) => {
  try {
    const token = (req as any).agentToken as string;
    const reg = await prisma.agentRegistration.findUnique({
      where: { agentToken: token },
      select: { workspaceId: true, deviceId: true },
    });
    if (!reg?.workspaceId) { res.status(401).json({ error: 'unauthorized' }); return; }
    const tickets = await prisma.ticket.findMany({
      where: {
        workspaceId: reg.workspaceId,
        ...(reg.deviceId ? { deviceId: reg.deviceId } : {}),
      },
      select: {
        id: true, ticketNumber: true, title: true, status: true,
        priority: true, source: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(tickets.map(t => ({ ...t, number: t.ticketNumber })));
  } catch (err) { next(err); }
});
router.post('/upload',  agentAuth, upload.single('file'), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (err) { next(err); }
});

// Agent backup endpoints
import { agentGetConfigs, agentReportStart, agentReportComplete, agentReportFailed, getHistory as agentGetHistory } from '../backup/backup.controller';
router.get('/backup-configs',               agentAuth, agentGetConfigs);
router.get('/backup-configs/:id/history',   agentAuth, async (req, res, next) => {
  try {
    const token = (req as any).agentToken as string;
    const reg = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
    if (!reg) { res.status(404).json({ error: 'Not found' }); return; }
    // Agent-authenticated: verify config belongs to this agent, skip workspace check
    const config = await prisma.backupConfig.findFirst({ where: { id: req.params.id, agentRegId: reg.id } });
    if (!config) { res.status(404).json({ error: 'Config not found' }); return; }
    const history = await prisma.backupHistory.findMany({
      where: { backupConfigId: config.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json(JSON.parse(JSON.stringify(history, (_, v) => typeof v === 'bigint' ? Number(v) : v)));
  } catch (err) { next(err); }
});
router.post('/backup/start',     agentAuth, agentReportStart);
router.post('/backup/complete',  agentAuth, agentReportComplete);
router.post('/backup/failed',    agentAuth, agentReportFailed);
router.post('/backup/run-now',   agentAuth, agentReportStart); // alias for agent-initiated run

// Admin auth — waiting room management
router.get('/audit',                authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getAuditData);

// RustDesk integration (before /:id routes to avoid param matching)
router.get('/rustdesk/peers',       authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getRustdeskPeers);
router.get('/rustdesk/sessions',    authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getRustdeskSessions);
router.get('/rustdesk/active',      authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getRustdeskActiveSessions);
router.post('/rustdesk/sync',       authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postRustdeskSync);
router.post('/rustdesk/sync-sessions', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postRustdeskSyncSessions);

router.get('/',                     authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getRegistrations);
router.post('/:id/approve',         authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), validate(approveSchema), postApprove);
router.post('/:id/approve-new-client', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postApproveNewClient);
router.post('/:id/connect',         authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getConnectPassword);
router.post('/:id/push-update',     authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postPushUpdate);
router.post('/:id/windows-update',   authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postWindowsUpdate);
router.post('/:id/restart-service',  authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postRestartService);
router.post('/:id/system-reboot',    authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), postSystemReboot);
router.post('/:id/wake',             authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postWakeDevice);
router.post('/:id/notify',           authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), postNotify);
router.delete('/:id',               authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), deleteReg);

// ── Secure Remote Commands ──────────────────────────────────────
import { sendCommand } from '../../utils/remoteCommand';
import prisma from '../../lib/prisma';

// POST /api/agent/:id/command — send whitelisted command to agent
router.post('/:id/command', authenticate, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { command, payload } = req.body;

    if (!command) { res.status(400).json({ error: 'command is required' }); return; }

    // Get agent token — verify workspace ownership (MSP can access client agents)
    let agentWhere: any = { id };
    if (req.workspaceId) {
      const { getMspWorkspaceIds } = require('../../utils/mspScope');
      const wsIds = await getMspWorkspaceIds(req.workspaceId);
      agentWhere.workspaceId = wsIds.length > 1 ? { in: wsIds } : req.workspaceId;
    }
    const agent = await prisma.agentRegistration.findFirst({
      where: agentWhere,
      select: { agentToken: true, hostname: true },
    });
    if (!agent) { res.status(404).json({ error: 'Asystent nie znaleziony' }); return; }

    const result = await sendCommand({
      agentToken: agent.agentToken,
      command,
      payload: payload ?? {},
      timeoutMs: 30000,
      userId: req.user!.userId,
      workspaceId: req.workspaceId ?? undefined,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.message.includes('not connected')) {
      res.status(503).json({ error: 'Asystent nie jest połączony — może wymagać aktualizacji lub restartu', code: 'AGENT_OFFLINE' });
    } else if (err.message.includes('timed out')) {
      res.status(504).json({ error: 'Asystent nie odpowiedział w czasie', code: 'TIMEOUT' });
    } else if (err.message.includes('not allowed')) {
      res.status(403).json({ error: err.message, code: 'COMMAND_NOT_ALLOWED' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;

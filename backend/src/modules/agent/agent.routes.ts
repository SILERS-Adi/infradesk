import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import {
  agentAuth, postRegister, postMetrics, postTicket, getMyAgentTickets, getAgentTicketDetail, postAgentTicketComment, postAgentTicketCancel, patchAgentTicket,
  getRegistrations, getAuditData, postApprove, postApproveNewClient, postPushUpdate, postWindowsUpdate, postRestartService, postSystemReboot, postWakeDevice, deleteReg, getStatus, getConnectPassword,
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
router.get('/tickets',   agentAuth, getMyAgentTickets);
router.get('/tickets/:id',          agentAuth, getAgentTicketDetail);
router.post('/tickets/:id/comments', agentAuth, postAgentTicketComment);
router.post('/tickets/:id/cancel',   agentAuth, postAgentTicketCancel);
router.patch('/tickets/:id',        agentAuth, patchAgentTicket);
router.post('/upload',  agentAuth, upload.single('file'), (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (err) { next(err); }
});

// Agent backup endpoints
import { agentGetConfigs, agentReportStart, agentReportComplete, agentReportFailed } from '../backup/backup.controller';
router.get('/backup-configs',    agentAuth, agentGetConfigs);
router.post('/backup/start',     agentAuth, agentReportStart);
router.post('/backup/complete',  agentAuth, agentReportComplete);
router.post('/backup/failed',    agentAuth, agentReportFailed);

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

    // Get agent token
    const agent = await prisma.agentRegistration.findUnique({
      where: { id },
      select: { agentToken: true, hostname: true },
    });
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

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
      res.status(503).json({ error: 'Agent jest offline', code: 'AGENT_OFFLINE' });
    } else if (err.message.includes('timed out')) {
      res.status(504).json({ error: 'Agent nie odpowiedział w czasie', code: 'TIMEOUT' });
    } else if (err.message.includes('not allowed')) {
      res.status(403).json({ error: err.message, code: 'COMMAND_NOT_ALLOWED' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  agentAuth, postRegister, postMetrics, postTicket,
  getRegistrations, postApprove, postApproveNewClient, postPushUpdate, postWindowsUpdate, postRestartService, postSystemReboot, postWakeDevice, deleteReg, getStatus, getConnectPassword,
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

const router = Router();

// Public — agent registration (no auth required)
router.post('/register', validate(registerSchema), postRegister);

// Agent token auth — for agent app
router.get('/status',   agentAuth, getStatus);
router.post('/metrics', agentAuth, validate(metricsSchema), postMetrics);
router.post('/ticket',  agentAuth, validate(agentTicketSchema), postTicket);
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
router.get('/',                     authenticate, authorize('ADMIN', 'TECHNICIAN'), getRegistrations);
router.post('/:id/approve',         authenticate, authorize('ADMIN'), validate(approveSchema), postApprove);
router.post('/:id/approve-new-client', authenticate, authorize('ADMIN', 'TECHNICIAN'), postApproveNewClient);
router.post('/:id/connect',         authenticate, authorize('ADMIN', 'TECHNICIAN'), getConnectPassword);
router.post('/:id/push-update',     authenticate, authorize('ADMIN'), postPushUpdate);
router.post('/:id/windows-update',   authenticate, authorize('ADMIN'), postWindowsUpdate);
router.post('/:id/restart-service',  authenticate, authorize('ADMIN'), postRestartService);
router.post('/:id/system-reboot',    authenticate, authorize('ADMIN'), postSystemReboot);
router.post('/:id/wake',             authenticate, authorize('ADMIN', 'TECHNICIAN'), postWakeDevice);
router.delete('/:id',               authenticate, authorize('ADMIN'), deleteReg);

export default router;

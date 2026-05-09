import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import {
  createTicketSchema, updateTicketSchema, transitionSchema,
  commentSchema, listQuerySchema, rateTicketSchema,
} from './tickets.schemas';
import * as service from './tickets.service';
import type { TicketStatus } from '../../utils/ticketStateMachine';
import { logActivity, reqContext } from '../activity-logs/logActivity';
import { HttpError } from '../../utils/httpError';

const router = Router();

router.use(requireAuth, requireWorkspace);

router.get('/', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const relations = await prisma.workspaceRelation.findMany({ where: { providerWorkspaceId: req.workspaceId!, canReceiveTickets: true, status: 'ACTIVE' }, select: { clientWorkspaceId: true } });
    const visibleWsIds = [req.workspaceId!, ...relations.map((r) => r.clientWorkspaceId)];
    const result = await service.listTickets(req.workspaceId!, { ...q, visibleWsIds });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTicketSchema.parse(req.body);
    const ticket = await service.createTicket(req.workspaceId!, req.auth!.sub, input);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: ticket.id,
      actionType: 'created',
      description: `Utworzono ticket ${(ticket as any).ticketNumber ?? ticket.id}: ${input.title}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { priority: input.priority, category: input.category, deviceId: input.deviceId ?? null },
    });
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
});

router.get('/:id', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await service.getTicket(req.workspaceId!, String(req.params.id));
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.patch('/:id', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateTicketSchema.parse(req.body);
    const t = await service.updateTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'updated',
      description: `Zaktualizowano ticket ${(t as any).ticketNumber ?? t.id}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { changedFields: Object.keys(input) },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.post('/:id/transition', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = transitionSchema.parse(req.body);
    const t = await service.transitionTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input.to as TicketStatus, {
      resolutionSummary: input.resolutionSummary,
      reason: input.reason,
    });
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'status_changed',
      description: `Zmieniono status ticketa ${(t as any).ticketNumber ?? t.id} na ${input.to}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { to: input.to, reason: input.reason ?? null },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.post('/:id/comments', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = commentSchema.parse(req.body);
    const c = await service.addComment(req.workspaceId!, req.auth!.sub, String(req.params.id), input.comment, input.isInternal);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'commented',
      description: `Dodano ${input.isInternal ? 'wewnętrzny ' : ''}komentarz`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { isInternal: input.isInternal, commentId: c.id },
    });
    res.status(201).json({ comment: c });
  } catch (err) { next(err); }
});

router.post('/:id/rate', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rateTicketSchema.parse(req.body);
    const t = await service.rateTicket(req.workspaceId!, req.auth!.sub, String(req.params.id), input.rating, input.comment);
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'updated',
      description: `Oceniono ticket: ${input.rating}/5`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { rating: input.rating },
    });
    res.json({ ticket: t });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteTicket(req.workspaceId!, req.auth!.sub, String(req.params.id));
    void logActivity({
      workspaceId: req.workspaceId!,
      entityType: 'ticket',
      entityId: String(req.params.id),
      actionType: 'deleted',
      description: `Usunięto ticket`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// F3.4: bulk actions
const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  assignedToUserId: z.string().uuid().nullable(),
});
const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  to: z.enum(['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED']),
});
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

router.post('/bulk-assign', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = bulkAssignSchema.parse(req.body);
    const results = await Promise.allSettled(
      input.ids.map((id) => service.updateTicket(req.workspaceId!, req.auth!.sub, id, { assignedToUserId: input.assignedToUserId })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    res.json({ ok, failed, total: results.length });
  } catch (err) { next(err); }
});

router.post('/bulk-status', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = bulkStatusSchema.parse(req.body);
    const results = await Promise.allSettled(
      input.ids.map((id) => service.transitionTicket(req.workspaceId!, req.auth!.sub, id, input.to as TicketStatus)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    res.json({ ok, failed, total: results.length });
  } catch (err) { next(err); }
});

router.post('/bulk-delete', requireAccess(MODULES.TICKETS, 'delete'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = bulkDeleteSchema.parse(req.body);
    const results = await Promise.allSettled(
      input.ids.map((id) => service.deleteTicket(req.workspaceId!, req.auth!.sub, id)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    res.json({ ok, failed, total: results.length });
  } catch (err) { next(err); }
});

// F4.9: ticket attachments (multer)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/home/adrian/infradesk/backend-v2/uploads';
try { fs.mkdirSync(path.join(UPLOADS_DIR, 'tickets'), { recursive: true }); } catch { /* noop */ }
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.cpl', '.dll', '.jar', '.hta', '.lnk', '.reg', '.sh', '.app', '.svg',
]);
const BLOCKED_MIME = new Set([
  'application/x-msdownload', 'application/x-msi', 'application/x-msdos-program',
  'application/x-bat', 'application/x-sh', 'application/javascript', 'text/javascript',
  'image/svg+xml', 'application/x-shockwave-flash',
]);
const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOADS_DIR, 'tickets')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) return cb(new Error(`Niedozwolony typ pliku: ${ext}`));
    if (BLOCKED_MIME.has((file.mimetype || '').toLowerCase())) {
      return cb(new Error(`Niedozwolony mime: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// GET /tickets/:id/attachments — lista
router.get('/:id/attachments', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // cross-workspace MSP — sprawdź czy ticket dostępny
    const t = await service.getTicket(req.workspaceId!, String(req.params.id)).catch(() => null);
    if (!t) throw HttpError.notFound();
    const attachments = await prisma.attachment.findMany({
      where: { ticketId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, uploadedByUserId: true, createdAt: true },
    });
    res.json({ attachments });
  } catch (err) { next(err); }
});

// POST /tickets/:id/attachments — upload
router.post('/:id/attachments', requireAccess(MODULES.TICKETS, 'edit'), ticketUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw HttpError.badRequest('Brak pliku');
    const t = await service.getTicket(req.workspaceId!, String(req.params.id)).catch(() => null);
    if (!t) throw HttpError.notFound();
    const att = await prisma.attachment.create({
      data: {
        workspaceId: req.workspaceId!,
        ticketId: String(req.params.id),
        uploadedByUserId: req.auth!.sub,
        fileName: req.file.originalname.slice(0, 200),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        storageKey: `tickets/${req.file.filename}`,
      },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    });
    res.status(201).json({ attachment: att });
  } catch (err) { next(err); }
});

// GET /tickets/:id/attachments/:aid/file — auth-gated stream
router.get('/:id/attachments/:aid/file', requireAccess(MODULES.TICKETS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Single query: RLS filter (workspaceId match) is via the ticket join — covers MSP cross-ws too.
    const visibleWs = await service.resolveAccessibleWorkspaceIds(req.workspaceId!);
    const att = await prisma.attachment.findFirst({
      where: {
        id: String(req.params.aid),
        ticketId: String(req.params.id),
        ticket: { workspaceId: { in: visibleWs }, deletedAt: null },
      },
      select: { storageKey: true, fileName: true, mimeType: true, fileSize: true },
    });
    if (!att) throw HttpError.notFound();
    const safeRoot = path.resolve(UPLOADS_DIR);
    const filePath = path.resolve(path.join(safeRoot, att.storageKey));
    if (!filePath.startsWith(safeRoot + path.sep)) throw HttpError.notFound();
    if (!fs.existsSync(filePath)) throw HttpError.notFound();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.fileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(att.fileSize));
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

// DELETE /tickets/:id/attachments/:aid
router.delete('/:id/attachments/:aid', requireAccess(MODULES.TICKETS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await service.getTicket(req.workspaceId!, String(req.params.id)).catch(() => null);
    if (!t) throw HttpError.notFound();
    const att = await prisma.attachment.findFirst({
      where: { id: String(req.params.aid), ticketId: String(req.params.id) },
      select: { id: true, storageKey: true },
    });
    if (!att) throw HttpError.notFound();
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.storageKey)); } catch { /* noop */ }
    await prisma.attachment.delete({ where: { id: att.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;

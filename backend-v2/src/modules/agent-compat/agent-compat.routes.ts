/**
 * V1 AGENT COMPATIBILITY LAYER
 * ------------------------------------------------------------------
 * Purpose: Keep V1 desktop agents (v4.x, ~59 installs) working after
 * DNS cutover from V1 backend → V2 backend at infradesk.pl.
 *
 * Mount: /api/agent  (NOT under /api/v2 — that is already taken by
 * the modern agents router at /api/v2/agents).
 *
 * Strategy:
 *   - Accept `Authorization: Bearer <agentToken>` (V1 sent a 96-char
 *     hex token; V2 signs its own base64url tokens). Lookup tries the
 *     plaintext column first, then agentTokenHash (sha256) as fallback.
 *   - Reuse V2 Prisma models directly (no separate service layer —
 *     V1 behaviour is specific enough that translating is cleaner than
 *     dragging V2 services through a compat adapter).
 *   - Shape responses to match what V1 desktop agent code parses.
 *
 * NOT covered (by design — see README / report):
 *   - /rustdesk/* admin endpoints (no V2 impl; skipped)
 *   - /:id/approve, /:id/push-update etc. admin endpoints (covered by
 *     /api/v2/agents/admin/* — V1 admin UI is dead after cutover)
 *   - /:id/command (rate-limited JWT-signed websocket push; V2 doesn't
 *     have the matching remoteCommand infra yet)
 *
 * ------------------------------------------------------------------
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import crypto from 'crypto';
import { prismaBg as prisma } from "../../lib/prisma-bg";
import { agentRegisterLimiter } from '../../middleware/rateLimit';
import { HttpError } from '../../utils/httpError';
import { hashToken } from '../../lib/crypto';

// ──────────────────────────────────────────────────────────────────
// Uploads
// ──────────────────────────────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/home/adrian/infradesk/backend-v2/uploads';
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }

const DOWNLOADS_STORAGE_DIR = process.env.DOWNLOADS_DIR ?? '/var/www/infradesk-v2/downloads';

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

// ──────────────────────────────────────────────────────────────────
// Auth helper — accept V1 bearer tokens
// ──────────────────────────────────────────────────────────────────
type AgentCtx = {
  id: string;
  workspaceId: string;
  deviceId: string | null;
  status: string;
  hostname: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactPhone: string | null;
  agentToken: string;
};

async function agentAuth(req: Request): Promise<AgentCtx> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw HttpError.unauthorized('Token required');
  const token = header.slice(7).trim();

  // Try plaintext agentToken first (V2 stores both; V1 tokens are plaintext in this column).
  let reg = await prisma.agentRegistration.findUnique({
    where: { agentToken: token },
    select: {
      id: true, workspaceId: true, deviceId: true, status: true, hostname: true,
      contactEmail: true, contactFirstName: true, contactLastName: true, contactPhone: true,
      agentToken: true,
    },
  });

  // Fallback: sha256 hash (in case V1 stored only hashed)
  if (!reg) {
    const tokenHash = hashToken(token);
    reg = await prisma.agentRegistration.findUnique({
      where: { agentTokenHash: tokenHash },
      select: {
        id: true, workspaceId: true, deviceId: true, status: true, hostname: true,
        contactEmail: true, contactFirstName: true, contactLastName: true, contactPhone: true,
        agentToken: true,
      },
    });
  }

  if (!reg) throw HttpError.unauthorized('Invalid agent token');
  return reg as AgentCtx;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function primaryMac(networkIfaces: unknown): string | undefined {
  if (!Array.isArray(networkIfaces)) return undefined;
  const skip = ['loopback', 'lo', 'virtual', 'vmware', 'vethernet', 'docker'];
  const iface = (networkIfaces as Array<{ mac?: string; name?: string }>).find(i =>
    i.mac && i.mac !== '00:00:00:00:00:00' &&
    !skip.some(s => (i.name ?? '').toLowerCase().includes(s)),
  );
  return iface?.mac?.toLowerCase();
}

function osLabel(data: Record<string, unknown>): string | undefined {
  return [data.osInfo, data.windowsVersion].filter(Boolean).join(' ').trim() || undefined;
}

// V2 tickets use richer statuses than the reduced V1 set.  The V1 tray UI
// renders labels keyed off OPEN/IN_PROGRESS/RESOLVED/CLOSED only.
const V1_STATUS_MAP: Record<string, string> = {
  NEW: 'OPEN',
  OPEN: 'OPEN',
  ASSIGNED: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING: 'IN_PROGRESS',
  WAITING_FOR_CLIENT: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  COMPLETED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CLOSED',
};

// ──────────────────────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────────────────────
const router = Router();

// POST /api/agent/register — public
// V1 clients send a big hardware bundle; we store what fits the V2 schema
// and generate a fresh token.  If an agent with the same workspace+hostname+serial
// already exists we re-emit its current token (idempotent).
router.post('/register', agentRegisterLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body ?? {};
    const hostname: string = body.hostname ?? 'unknown-host';
    const serial: string | undefined = body.serialNumber ?? undefined;
    const mac = primaryMac(body.networkIfaces);
    const osInfo = osLabel(body);

    // Resolve workspace from tenantKey (V1 — treated as a slug fallback in V2)
    // or explicit workspaceSlug. V2 schema has no workspaceKey column, so V1
    // tenantKey values that used to match workspaceKey will simply fall through.
    let workspaceId: string | null = null;
    if (body.tenantKey) {
      const ws = await prisma.workspace.findUnique({
        where: { slug: String(body.tenantKey) },
        select: { id: true, isActive: true },
      }).catch(() => null);
      if (ws?.isActive) workspaceId = ws.id;
    }
    if (!workspaceId && body.workspaceSlug) {
      const ws = await prisma.workspace.findUnique({
        where: { slug: body.workspaceSlug },
        select: { id: true, isActive: true },
      });
      if (ws?.isActive) workspaceId = ws.id;
    }

    // If there's already a registration for this (workspace?, hostname, serial) reuse it
    const existing = workspaceId
      ? await prisma.agentRegistration.findFirst({
          where: {
            workspaceId,
            hostname,
            ...(serial ? { serialNumber: serial } : {}),
          },
          select: { id: true, agentToken: true, status: true, deviceId: true },
        })
      : null;

    if (existing) {
      // Refresh lastSeen so admin console can tell the agent is alive.
      await prisma.agentRegistration.update({
        where: { id: existing.id },
        data: { lastSeen: new Date() },
      });
      res.status(201).json({
        token: existing.agentToken,
        tokenHash: hashToken(existing.agentToken),
        status: existing.status,
        deviceId: existing.deviceId,
        registrationId: existing.id,
        reused: true,
      });
      return;
    }

    // Must have a workspace to create a new AgentRegistration (NOT NULL in V2 schema).
    if (!workspaceId) {
      throw HttpError.badRequest(
        'Brak identyfikacji workspace — podaj tenantKey lub workspaceSlug',
        'workspace_required',
      );
    }

    const token = crypto.randomBytes(48).toString('hex');
    const reg = await prisma.agentRegistration.create({
      data: {
        workspaceId,
        agentToken: token,
        agentTokenHash: hashToken(token),
        agentVersion: body.appVersion ?? 'unknown',
        status: 'PENDING',
        hostname,
        serialNumber: serial,
        osName: osInfo,
        osVersion: body.windowsVersion ?? undefined,
        cpuModel: body.cpuModel ?? undefined,
        ramMb: typeof body.ramTotalGb === 'number' ? Math.round(body.ramTotalGb * 1024) : undefined,
        currentUser: body.currentUser ?? undefined,
        companyName: body.companyName ?? undefined,
        nip: typeof body.nip === 'string' ? body.nip.replace(/[-\s]/g, '') : undefined,
        contactFirstName: body.contactFirstName ?? undefined,
        contactLastName: body.contactLastName ?? undefined,
        contactEmail: body.contactEmail ?? undefined,
        contactPhone: body.contactPhone ?? undefined,
        allowRustdesk: body.allowRustdesk ?? true,
        allowMonitoring: body.allowMonitoring ?? true,
      },
      select: { id: true, agentToken: true, status: true, deviceId: true },
    });

    // Touch MAC silently (stored in serverMetrics or ignored — V2 schema has no macAddress column here)
    void mac; // reserved for future telemetry merge

    res.status(201).json({
      token: reg.agentToken,
      tokenHash: hashToken(reg.agentToken),
      status: reg.status,
      deviceId: reg.deviceId,
      registrationId: reg.id,
      reused: false,
    });
  } catch (err) { next(err); }
});

// GET /api/agent/status — V1 agent polls this to know if approved.
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    res.json({
      status: reg.status,
      deviceId: reg.deviceId,
      registered: true,
      approved: reg.status === 'ACTIVE',
      workspaceId: reg.workspaceId,
    });
  } catch (err) { next(err); }
});

// POST /api/agent/metrics — heartbeat + telemetry.
router.post('/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status === 'REJECTED') throw HttpError.forbidden('Agent rejected');

    const body = req.body ?? {};

    // Only touch fields that exist in V2 schema; archive the rest into serverMetrics.
    const { serverMetrics: extraMetrics, ...rest } = body as Record<string, unknown>;
    const merged = {
      ...(typeof extraMetrics === 'object' && extraMetrics ? extraMetrics : {}),
      cpuUsage: rest.cpuUsage,
      ramUsage: rest.ramUsage,
      diskFree: rest.diskFree,
      diskTotal: rest.diskTotal,
      cpuTempC: rest.cpuTempC,
      diskInfo: rest.diskInfo,
      networkIfaces: rest.networkIfaces,
      installedSoftware: rest.installedSoftware,
      ipAddress: rest.ipAddress,
      lastBootTime: rest.lastBootTime,
      domain: rest.domain,
    };

    await prisma.agentRegistration.update({
      where: { id: reg.id },
      data: {
        lastSeen: new Date(),
        serverMetrics: merged as never,
        currentUser: typeof rest.currentUser === 'string' ? rest.currentUser : undefined,
        diskFreeGb: typeof rest.diskFree === 'number' ? rest.diskFree : undefined,
        diskTotalGb: typeof rest.diskTotal === 'number' ? rest.diskTotal : undefined,
        agentVersion: typeof rest.appVersion === 'string' ? rest.appVersion : undefined,
        cpuModel: typeof rest.cpuModel === 'string' ? rest.cpuModel : undefined,
        ramMb: typeof rest.ramTotalGb === 'number' ? Math.round(rest.ramTotalGb * 1024) : undefined,
        osVersion: typeof rest.windowsVersion === 'string' ? rest.windowsVersion : undefined,
        hostname: typeof rest.hostname === 'string' && rest.hostname.length > 0 ? rest.hostname : undefined,
      },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/agent/ticket — agent creates incident on behalf of its device.
const agentTicketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
});
router.post('/ticket', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');

    const input = agentTicketSchema.parse(req.body);

    const ws = await prisma.workspace.findUnique({
      where: { id: reg.workspaceId },
      select: { id: true, isActive: true },
    });
    if (!ws?.isActive) throw HttpError.conflict('Workspace inactive — admin must re-approve agent');

    // Dedup: if an open ticket with same title exists for this device, just bump updatedAt
    const existing = await prisma.ticket.findFirst({
      where: {
        workspaceId: reg.workspaceId,
        deviceId: reg.deviceId ?? undefined,
        source: 'AGENT',
        title: input.title,
        status: { in: ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] },
      },
      select: { id: true, ticketNumber: true },
    });
    if (existing) {
      await prisma.ticket.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
      res.status(200).json({ id: existing.id, ticketId: existing.id, ticketNumber: existing.ticketNumber });
      return;
    }

    // Resolve location from device if possible, else workspace's first location.
    let locationId: string | null = null;
    if (reg.deviceId) {
      const dev = await prisma.device.findUnique({
        where: { id: reg.deviceId },
        select: { locationId: true },
      });
      if (dev?.locationId) locationId = dev.locationId;
    }
    if (!locationId) {
      const loc = await prisma.location.findFirst({
        where: { workspaceId: reg.workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (loc) locationId = loc.id;
    }

    // Resolve author (system user or first OWNER)
    let authorId: string | null = null;
    const sys = await prisma.user.findUnique({
      where: { email: 'agent@infradesk.system' },
      select: { id: true },
    }).catch(() => null);
    if (sys) authorId = sys.id;
    if (!authorId) {
      const owner = await prisma.membership.findFirst({
        where: { workspaceId: reg.workspaceId, role: 'OWNER' },
        select: { userId: true },
      }).catch(() => null);
      if (owner) authorId = owner.userId;
    }
    if (!authorId) throw HttpError.internal('No author available for agent ticket');

    const count = await prisma.ticket.count({ where: { workspaceId: reg.workspaceId } });
    const ticketNumber = `T-${String(count + 1).padStart(4, '0')}`;

    const reporterName =
      [reg.contactFirstName, reg.contactLastName].filter(Boolean).join(' ') ||
      reg.hostname || 'Agent';

    const ticket = await prisma.ticket.create({
      data: {
        workspaceId: reg.workspaceId,
        ticketNumber,
        title: input.title,
        description: input.description ?? '',
        status: 'NEW',
        priority: (input.priority ?? 'MEDIUM') as never,
        type: 'INCIDENT',
        source: 'AGENT',
        deviceId: reg.deviceId ?? undefined,
        locationId: locationId ?? undefined,
        createdByUserId: authorId,
        requesterName: reporterName,
        requesterPhone: reg.contactPhone ?? undefined,
        requesterEmail: reg.contactEmail ?? undefined,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      },
      select: { id: true, ticketNumber: true, title: true, description: true, status: true },
    });

    res.status(201).json({
      id: ticket.id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
    });
  } catch (err) { next(err); }
});

// GET /api/agent/tickets — list tickets for this agent's device
router.get('/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) {
      res.json([]);
      return;
    }

    const tickets = await prisma.ticket.findMany({
      where: { workspaceId: reg.workspaceId, deviceId: reg.deviceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, ticketNumber: true, title: true, description: true,
        status: true, priority: true, source: true, serviceMode: true,
        createdAt: true, updatedAt: true, resolvedAt: true, resolutionSummary: true,
      },
    });

    // V1 desktop expected a bare array, not { tickets: [...] }.
    const shaped = tickets.map(t => ({
      ...t,
      number: t.ticketNumber,
      rawStatus: t.status,
      status: V1_STATUS_MAP[t.status as string] ?? t.status,
    }));
    res.json(shaped);
  } catch (err) { next(err); }
});

// GET /api/agent/tickets/:id
router.get('/tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) throw HttpError.notFound('Agent has no device linked');

    const t = await prisma.ticket.findFirst({
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId },
      select: {
        id: true, ticketNumber: true, title: true, description: true,
        status: true, priority: true, source: true, serviceMode: true,
        createdAt: true, updatedAt: true, resolvedAt: true, resolutionSummary: true,
        comments: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, comment: true, createdAt: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!t) throw HttpError.notFound('Ticket not found');

    res.json({
      ...t,
      number: t.ticketNumber,
      rawStatus: t.status,
      status: V1_STATUS_MAP[t.status as string] ?? t.status,
    });
  } catch (err) { next(err); }
});

// POST /api/agent/tickets/:id/comments
router.post('/tickets/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) throw HttpError.notFound('Agent has no device linked');

    const { comment } = (req.body ?? {}) as { comment?: string };
    if (!comment?.trim()) throw HttpError.badRequest('Komentarz nie może być pusty');

    const t = await prisma.ticket.findFirst({
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId },
      select: { id: true },
    });
    if (!t) throw HttpError.notFound('Ticket not found');

    // Resolve author
    let authorId: string | null = null;
    if (reg.contactEmail) {
      const u = await prisma.user.findUnique({ where: { email: reg.contactEmail }, select: { id: true } });
      if (u) authorId = u.id;
    }
    if (!authorId) {
      const sys = await prisma.user.findUnique({ where: { email: 'agent@infradesk.system' }, select: { id: true } }).catch(() => null);
      if (sys) authorId = sys.id;
    }
    if (!authorId) throw HttpError.internal('No comment author available');

    const prefix = reg.hostname ? `[z komputera ${reg.hostname}] ` : '';
    const created = await prisma.ticketComment.create({
      data: {
        ticketId: t.id,
        userId: authorId,
        comment: `${prefix}${comment.trim()}`,
        isInternal: false,
      },
      select: {
        id: true, comment: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// POST /api/agent/tickets/:id/cancel
router.post('/tickets/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) throw HttpError.notFound('Agent has no device linked');

    const t = await prisma.ticket.findFirst({
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId },
      select: { id: true, status: true },
    });
    if (!t) throw HttpError.notFound('Ticket not found');

    const cancellable = new Set(['NEW', 'OPEN', 'ASSIGNED']);
    if (!cancellable.has(t.status as string)) {
      throw HttpError.conflict('Zgłoszenie już w realizacji — nie można anulować. Napisz wiadomość do technika.');
    }

    const updated = await prisma.ticket.update({
      where: { id: t.id },
      data: { status: 'CANCELLED', resolvedAt: new Date(), resolutionSummary: 'Anulowane przez klienta' },
      select: { id: true, status: true, ticketNumber: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// PATCH /api/agent/tickets/:id — edit title/description while NEW/OPEN
router.patch('/tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) throw HttpError.notFound('Agent has no device linked');

    const t = await prisma.ticket.findFirst({
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId },
      select: { id: true, status: true },
    });
    if (!t) throw HttpError.notFound('Ticket not found');

    const editable = new Set(['NEW', 'OPEN']);
    if (!editable.has(t.status as string)) {
      throw HttpError.conflict('Zgłoszenie już przypisane — edycja zablokowana. Dodaj komentarz z zmianami.');
    }

    const body = (req.body ?? {}) as { title?: string; description?: string };
    const update: Record<string, unknown> = {};
    if (body.title?.trim()) update.title = body.title.trim().slice(0, 500);
    if (body.description?.trim()) update.description = body.description.trim();
    if (Object.keys(update).length === 0) throw HttpError.badRequest('Brak zmian');

    const updated = await prisma.ticket.update({
      where: { id: t.id },
      data: update,
      select: { id: true, ticketNumber: true, title: true, description: true, status: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/agent/upload — image attachment
router.post(
  '/upload',
  async (req, _res, next) => {
    try { await agentAuth(req); next(); } catch (err) { next(err); }
  },
  upload.single('file'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
      res.json({ url: `/uploads/${req.file.filename}` });
    } catch (err) { next(err); }
  },
);

// ──────────────────────────────────────────────────────────────────
// Backup endpoints
// ──────────────────────────────────────────────────────────────────
// V2's BackupConfig schema differs significantly from V1 (column renames,
// password encryption scheme differs, encrypted keys at rest).  V1 agents
// expect decrypted SQL/FTP passwords inline.  Until V2 is populated with
// backup configs we return an empty array — prevents spurious "missing config"
// errors on the agent side.  /start|complete|failed still touch
// BackupHistory so tech dashboards show activity.
router.get('/backup-configs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    // Only return configs bound to THIS agent registration (V2 schema: agentRegistrationId)
    const configs = await prisma.backupConfig.findMany({
      where: { workspaceId: reg.workspaceId, agentRegistrationId: reg.id },
      select: {
        id: true, name: true, type: true,
        sqlHost: true, sqlPort: true, sqlDatabase: true, sqlUsername: true,
        folderPath: true, localBackupPath: true, useInfradeskCloud: true,
        googleDriveFolder: true,
        cronSchedule: true, retentionDays: true, encryptBackups: true,
        lastRunAt: true,
      },
    });
    res.json(configs);
  } catch (err) { next(err); }
});

router.post('/backup/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await agentAuth(req);
    const { configId } = (req.body ?? {}) as { configId?: string };
    if (!configId) throw HttpError.badRequest('configId required');

    // Touch last-run + create RUNNING history row.
    await prisma.backupConfig.update({
      where: { id: configId },
      data: { lastRunAt: new Date(), lastStatus: 'RUNNING' },
    }).catch(() => undefined);

    const history = await prisma.backupHistory.create({
      data: { backupConfigId: configId, status: 'RUNNING', startedAt: new Date() },
      select: { id: true },
    });
    res.json({ historyId: history.id, ok: true });
  } catch (err) { next(err); }
});

router.post('/backup/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await agentAuth(req);
    const { historyId, sizeBytes, googleDriveId } = (req.body ?? {}) as {
      historyId?: string; sizeBytes?: number | string; fileName?: string; googleDriveId?: string;
    };
    if (!historyId) throw HttpError.badRequest('historyId required');

    const history = await prisma.backupHistory.update({
      where: { id: historyId },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        sizeBytes: sizeBytes !== undefined ? BigInt(sizeBytes) : undefined,
        googleDriveId: googleDriveId ?? undefined,
      },
      select: { id: true, backupConfigId: true, sizeBytes: true, completedAt: true },
    });
    await prisma.backupConfig.update({
      where: { id: history.backupConfigId },
      data: { lastStatus: 'SUCCESS' },
    }).catch(() => undefined);

    res.json({
      ok: true,
      historyId: history.id,
      completedAt: history.completedAt,
      sizeBytes: history.sizeBytes !== null ? Number(history.sizeBytes) : null,
    });
  } catch (err) { next(err); }
});

router.post('/backup/failed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await agentAuth(req);
    const { configId, error } = (req.body ?? {}) as { configId?: string; error?: string };
    if (!configId) throw HttpError.badRequest('configId required');

    const history = await prisma.backupHistory.create({
      data: {
        backupConfigId: configId,
        status: 'FAILED',
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: typeof error === 'string' ? error.slice(0, 4000) : 'Unknown error',
      },
      select: { id: true, completedAt: true },
    });
    await prisma.backupConfig.update({
      where: { id: configId },
      data: { lastStatus: 'FAILED' },
    }).catch(() => undefined);

    res.json({ ok: true, historyId: history.id, completedAt: history.completedAt });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────
// DYSK — agent reads files visible to its workspace
//   - workspace type CLIENT → owner = related MSP provider; sees PUBLIC + CLIENT
//   - workspace type MSP/INTERNAL_IT → sees own files (PUBLIC + CLIENT + INTERNAL)
// ──────────────────────────────────────────────────────────────────

async function resolveDownloadsOwner(agentWorkspaceId: string): Promise<{
  ownerId: string;
  isClient: boolean;
}> {
  const ws = await prisma.workspace.findUnique({
    where: { id: agentWorkspaceId },
    select: { id: true, type: true },
  });
  if (!ws) throw HttpError.forbidden('Workspace not found');
  if (ws.type === 'CLIENT') {
    const rel = await prisma.workspaceRelation.findFirst({
      where: { clientWorkspaceId: ws.id, status: 'ACTIVE' },
      select: { providerWorkspaceId: true },
    });
    if (!rel) return { ownerId: ws.id, isClient: true };
    return { ownerId: rel.providerWorkspaceId, isClient: true };
  }
  return { ownerId: ws.id, isClient: false };
}

router.get('/downloads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    const { ownerId, isClient } = await resolveDownloadsOwner(reg.workspaceId);
    const allowedVis: Array<'INTERNAL' | 'CLIENT' | 'PUBLIC'> = isClient
      ? ['CLIENT', 'PUBLIC']
      : ['INTERNAL', 'CLIENT', 'PUBLIC'];

    const where: Record<string, unknown> = {
      workspaceId: ownerId,
      deletedAt: null,
      visibility: { in: allowedVis },
    };

    if (isClient) {
      const clientWsId = reg.workspaceId;
      where.AND = [
        {
          OR: [
            { visibility: 'PUBLIC' as never },
            {
              visibility: 'CLIENT' as never,
              OR: [
                { targetClientWorkspaceIds: { isEmpty: true } },
                { targetClientWorkspaceIds: { has: clientWsId } },
              ],
            },
          ],
        },
      ];
    }

    const files = await prisma.downloadFile.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true, category: true, name: true, description: true,
        fileName: true, mimeType: true, sizeBytes: true,
        visibility: true, downloadCount: true,
        createdAt: true, updatedAt: true,
      },
    });

    res.json({
      files: files.map((f) => ({
        id: f.id,
        category: f.category,
        name: f.name,
        description: f.description,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes.toString(),
        visibility: f.visibility,
        downloadCount: f.downloadCount,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    });
  } catch (err) { next(err); }
});

router.get('/downloads/:id/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    const { ownerId, isClient } = await resolveDownloadsOwner(reg.workspaceId);
    const allowedVis: Array<'INTERNAL' | 'CLIENT' | 'PUBLIC'> = isClient
      ? ['CLIENT', 'PUBLIC']
      : ['INTERNAL', 'CLIENT', 'PUBLIC'];

    const file = await prisma.downloadFile.findFirst({
      where: {
        id: String(req.params.id),
        workspaceId: ownerId,
        deletedAt: null,
        visibility: { in: allowedVis },
      },
      select: {
        id: true, fileName: true, mimeType: true, storedName: true,
        visibility: true, targetClientWorkspaceIds: true,
      },
    });
    if (!file) throw HttpError.notFound('File not found');

    if (isClient && file.visibility === 'CLIENT') {
      const targets = file.targetClientWorkspaceIds ?? [];
      if (targets.length > 0 && !targets.includes(reg.workspaceId)) {
        throw HttpError.notFound('File not found');
      }
    }

    const fullPath = path.join(DOWNLOADS_STORAGE_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) throw HttpError.notFound('File missing on disk');

    await prisma.downloadFile.update({
      where: { id: file.id },
      data: { downloadCount: { increment: 1 } },
    }).catch(() => undefined);

    res.setHeader('Content-Type', file.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) { next(err); }
});

export default router;

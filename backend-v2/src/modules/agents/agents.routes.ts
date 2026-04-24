import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { randomToken, hashToken } from '../../lib/crypto';
import {
  isAgentOnline, notifyAgent, sendCommandAndWait, findRelayAgents,
} from '../agents-ws/agents-ws.server';
import { logActivity, reqContext } from '../activity-logs/logActivity';

const router = Router();

// --------------------------------------------------------------------------
// Agent-authenticated endpoints (Bearer token, no user auth)
// --------------------------------------------------------------------------

async function authAgent(req: Request): Promise<{ registrationId: string; deviceId: string | null; workspaceId: string; status: string }> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw HttpError.unauthorized('Missing agent token');
  const token = header.slice(7).trim();
  const tokenHash = hashToken(token);
  const reg = await prisma.agentRegistration.findUnique({
    where: { agentTokenHash: tokenHash },
    select: { id: true, deviceId: true, workspaceId: true, status: true },
  });
  if (!reg) throw HttpError.unauthorized('Invalid agent token');
  return { registrationId: reg.id, deviceId: reg.deviceId, workspaceId: reg.workspaceId, status: reg.status };
}

// Public registration — agent calls this with hardware fingerprint.
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      workspaceSlug: z.string().min(1).max(80),
      hostname: z.string().min(1).max(120),
      agentVersion: z.string().max(40).optional(),
      manufacturer: z.string().max(120).optional(),
      model: z.string().max(120).optional(),
      serialNumber: z.string().max(120).optional(),
      osName: z.string().max(60).optional(),
      osVersion: z.string().max(60).optional(),
      cpuModel: z.string().max(120).optional(),
      ramMb: z.number().int().optional(),
      companyName: z.string().max(200).optional(),
      nip: z.string().max(20).optional(),
      contactFirstName: z.string().max(100).optional(),
      contactLastName: z.string().max(100).optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().max(40).optional(),
    }).parse(req.body);

    const workspace = await prisma.workspace.findUnique({
      where: { slug: input.workspaceSlug },
      select: { id: true, isActive: true },
    });
    if (!workspace || !workspace.isActive) throw HttpError.notFound('Workspace not found');

    // Idempotent by (workspaceId, hostname, serialNumber).
    const existing = await prisma.agentRegistration.findFirst({
      where: { workspaceId: workspace.id, hostname: input.hostname, serialNumber: input.serialNumber ?? null },
      select: { id: true, agentToken: true, status: true },
    });
    if (existing) {
      res.json({ registrationId: existing.id, agentToken: existing.agentToken, status: existing.status, reused: true });
      return;
    }

    const token = randomToken(32);
    const reg = await prisma.agentRegistration.create({
      data: {
        workspaceId: workspace.id,
        agentToken: token,
        agentTokenHash: hashToken(token),
        agentVersion: input.agentVersion ?? 'unknown',
        status: 'PENDING',
        hostname: input.hostname,
        manufacturer: input.manufacturer,
        model: input.model,
        serialNumber: input.serialNumber,
        osName: input.osName,
        osVersion: input.osVersion,
        cpuModel: input.cpuModel,
        ramMb: input.ramMb,
        companyName: input.companyName,
        nip: input.nip,
        contactFirstName: input.contactFirstName,
        contactLastName: input.contactLastName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
      },
      select: { id: true, agentToken: true, status: true },
    });
    res.status(201).json({ registrationId: reg.id, agentToken: reg.agentToken, status: reg.status, reused: false });
  } catch (err) { next(err); }
});

// Heartbeat + telemetry — agent → server.
router.post('/telemetry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await authAgent(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not approved');

    const input = z.object({
      metrics: z.record(z.unknown()).optional(),
      currentUser: z.string().max(120).optional(),
      diskFreeGb: z.number().optional(),
      diskTotalGb: z.number().optional(),
      agentVersion: z.string().max(40).optional(),
    }).parse(req.body);

    await prisma.agentRegistration.update({
      where: { id: reg.registrationId },
      data: {
        lastSeen: new Date(),
        serverMetrics: (input.metrics ?? undefined) as never,
        currentUser: input.currentUser,
        diskFreeGb: input.diskFreeGb,
        diskTotalGb: input.diskTotalGb,
        agentVersion: input.agentVersion ?? undefined,
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------------------
// Admin endpoints (user auth + workspace + MODULES.DEVICES edit)
// --------------------------------------------------------------------------

const adminRouter = Router();
adminRouter.use(requireAuth, requireWorkspace);

adminRouter.get('/', requireAccess(MODULES.DEVICES, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ status: z.string().optional() }).parse(req.query);
    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.status) where.status = { in: q.status.split(',') };
    const agents = await prisma.agentRegistration.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: {
        id: true, hostname: true, status: true, agentVersion: true, lastSeen: true,
        manufacturer: true, model: true, osName: true, osVersion: true,
        companyName: true, contactFirstName: true, contactLastName: true, contactEmail: true,
        createdAt: true, deviceId: true,
      },
    });
    res.json({ agents });
  } catch (err) { next(err); }
});

const approveSchema = z.object({
  locationId: z.string().uuid(),
  deviceName: z.string().min(1).max(120),
  category: z.enum(['WORKSTATION', 'SERVER', 'ROUTER', 'SWITCH', 'FIREWALL', 'PRINTER', 'SCANNER', 'CCTV', 'PHONE', 'IOT', 'OTHER']).default('WORKSTATION'),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

adminRouter.post('/:id/approve', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = approveSchema.parse(req.body);
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
    });
    if (!reg) throw HttpError.notFound();
    if (reg.status === 'ACTIVE') throw HttpError.badRequest('Agent jest już zatwierdzony', 'already_active');

    const loc = await prisma.location.findFirst({
      where: { id: input.locationId, workspaceId: req.workspaceId!, deletedAt: null },
      select: { id: true },
    });
    if (!loc) throw HttpError.badRequest('Location nie należy do workspace', 'invalid_location');

    const { default: crypto } = await import('crypto');
    const qrCodeValue = `IDSK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const updated = await prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          workspaceId: req.workspaceId!,
          locationId: input.locationId,
          name: input.deviceName,
          hostname: reg.hostname,
          category: input.category,
          criticality: input.criticality,
          status: 'ACTIVE',
          qrCodeValue,
          serialNumber: reg.serialNumber,
          manufacturer: reg.manufacturer,
          model: reg.model,
          operatingSystem: reg.osName,
          osVersion: reg.osVersion,
        },
      });
      return tx.agentRegistration.update({
        where: { id: reg.id },
        data: { status: 'ACTIVE', deviceId: device.id, approvedAt: new Date(), approvedByUserId: req.auth!.sub },
      });
    });
    res.json({ agent: updated });
  } catch (err) { next(err); }
});

adminRouter.post('/:id/reject', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, status: true },
    });
    if (!reg) throw HttpError.notFound();
    const updated = await prisma.agentRegistration.update({
      where: { id: reg.id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectedByUserId: req.auth!.sub },
    });
    res.json({ agent: updated });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------------------
// Push-command admin endpoints (restored from V1)
// Target: /api/v2/agents/admin/:id/<action>
// All require MODULES.DEVICES:edit (same gate as approve/reject).
// --------------------------------------------------------------------------

// Helper: find an agent that belongs to the caller's workspace.
async function findAgentInWorkspace(agentId: string, workspaceId: string) {
  return prisma.agentRegistration.findFirst({
    where: { id: agentId, workspaceId },
    select: {
      id: true, workspaceId: true, status: true, hostname: true,
      deviceId: true, agentToken: true,
      device: { select: { id: true, macAddress: true, name: true } },
    },
  });
}

// Map known agent error codes to HTTP status.
function mapAgentError(err: unknown): { status: number; code: string; message: string } {
  const e = err as Error & { code?: string };
  const code = e?.code ?? '';
  const message = e?.message ?? 'Agent command failed';
  if (code === 'AGENT_OFFLINE') return { status: 503, code: 'agent_offline', message: 'Agent jest offline' };
  if (code === 'AGENT_TIMEOUT') return { status: 504, code: 'agent_timeout', message: 'Agent nie odpowiedzial w czasie' };
  return { status: 500, code: 'agent_error', message };
}

// -----------------------------------------------------------------
// POST /admin/:id/wake -- Wake-on-LAN via LAN-peer agent relay
// Body: {} (uses Device.macAddress if available)
// Response: { ok: true, mac, relayAgents }
// -----------------------------------------------------------------
adminRouter.post('/:id/wake', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await findAgentInWorkspace(String(req.params.id), req.workspaceId!);
    if (!reg) throw HttpError.notFound();
    const mac = reg.device?.macAddress;
    if (!mac) throw HttpError.badRequest('Urzadzenie nie ma zapisanego adresu MAC', 'no_mac');

    // Find other online agents in the same workspace to relay the magic packet.
    const relayAgentIds = await findRelayAgents(reg.workspaceId, reg.id);
    if (relayAgentIds.length === 0) {
      throw HttpError.conflict('Brak innych aktywnych agentow na tej sieci -- nie mozna wyslac pakietu WoL');
    }

    let relayed = 0;
    for (const agentId of relayAgentIds) {
      if (notifyAgent(agentId, { type: 'wake', mac })) relayed += 1;
    }

    await logActivity({
      workspaceId: reg.workspaceId,
      entityType: 'agent',
      entityId: reg.id,
      actionType: 'wake',
      description: `WoL: ${reg.hostname ?? ''} (${mac})`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { mac, relayAgents: relayed },
    });

    res.json({ ok: true, mac, relayAgents: relayed });
  } catch (err) { next(err); }
});

// -----------------------------------------------------------------
// POST /admin/:id/push-command -- generic push with ack/timeout
// Body: { type, payload? }  where type in {
//   'windows_update' | 'restart_service' | 'system_reboot' | 'install_software' | 'schedule_task'
// }
// Response: { ok: true, ack?: <agent reply> }   on success
//           503 agent_offline | 504 agent_timeout on failure
// -----------------------------------------------------------------
const pushCommandSchema = z.object({
  type: z.enum([
    'windows_update', 'restart_service', 'system_reboot',
    'install_software', 'schedule_task', 'backup_run', 'update',
  ]),
  payload: z.record(z.unknown()).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});

adminRouter.post('/:id/push-command', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = pushCommandSchema.parse(req.body);
    const reg = await findAgentInWorkspace(String(req.params.id), req.workspaceId!);
    if (!reg) throw HttpError.notFound();
    if (reg.status !== 'ACTIVE') throw HttpError.conflict('Agent nie jest aktywny', 'not_active');
    if (!isAgentOnline(reg.id)) throw HttpError.conflict('Agent jest offline', 'agent_offline');

    // Command-specific validation + payload assembly.
    const payload: Record<string, unknown> = { type: body.type, ...(body.payload ?? {}) };
    switch (body.type) {
      case 'restart_service': {
        const svc = (body.payload?.serviceName ?? body.payload?.service_name) as string | undefined;
        if (!svc || typeof svc !== 'string' || !svc.trim()) {
          throw HttpError.badRequest('serviceName required');
        }
        payload.serviceName = svc.trim();
        break;
      }
      case 'install_software': {
        const pkg = body.payload?.package as string | undefined;
        if (!pkg || !/^[A-Za-z0-9._\-+]{1,128}$/.test(pkg)) {
          throw HttpError.badRequest('package invalid');
        }
        payload.package = pkg;
        break;
      }
      case 'system_reboot': {
        const delay = Number(body.payload?.delay ?? body.payload?.delaySec ?? 60);
        payload.delay = Math.max(0, Math.min(3600, delay));
        break;
      }
      case 'windows_update': {
        // passthrough of scheduleTime if provided
        break;
      }
    }

    let ack: Record<string, unknown> | undefined;
    try {
      ack = await sendCommandAndWait(reg.id, payload, { timeoutMs: body.timeoutMs ?? 30000 });
    } catch (err) {
      await logActivity({
        workspaceId: reg.workspaceId,
        entityType: 'agent',
        entityId: reg.id,
        actionType: `push_${body.type}_failed`,
        description: `Push ${body.type} -> ${reg.hostname ?? ''} FAILED: ${(err as Error).message}`,
        performedByUserId: req.auth!.sub,
        ...reqContext(req),
        metadata: { type: body.type, error: (err as Error).message },
      });
      const mapped = mapAgentError(err);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
      return;
    }

    await logActivity({
      workspaceId: reg.workspaceId,
      entityType: 'agent',
      entityId: reg.id,
      actionType: `push_${body.type}`,
      description: `Push ${body.type} -> ${reg.hostname ?? ''}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { type: body.type, payload: Object.keys(body.payload ?? {}) },
    });

    res.json({ ok: true, ack });
  } catch (err) { next(err); }
});

// -----------------------------------------------------------------
// POST /admin/:id/run-speedtest -- synchronous speedtest
// Response: { ok: true, result: { download_mbps, upload_mbps, ping_ms } }
// -----------------------------------------------------------------
adminRouter.post('/:id/run-speedtest', requireAccess(MODULES.DEVICES, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await findAgentInWorkspace(String(req.params.id), req.workspaceId!);
    if (!reg) throw HttpError.notFound();
    if (reg.status !== 'ACTIVE') throw HttpError.conflict('Agent nie jest aktywny', 'not_active');
    if (!isAgentOnline(reg.id)) throw HttpError.conflict('Agent jest offline', 'agent_offline');

    let ack: Record<string, unknown>;
    try {
      // Speedtest takes longer -- give it up to 90s.
      ack = await sendCommandAndWait(reg.id, { type: 'speedtest' }, { timeoutMs: 90_000 });
    } catch (err) {
      const mapped = mapAgentError(err);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
      return;
    }

    await logActivity({
      workspaceId: reg.workspaceId,
      entityType: 'agent',
      entityId: reg.id,
      actionType: 'speedtest',
      description: `Speedtest -> ${reg.hostname ?? ''}`,
      performedByUserId: req.auth!.sub,
      ...reqContext(req),
      metadata: { result: ack },
    });

    // Shape a clean result: agent may reply with { data: {...} } or flat fields.
    const result = (ack.data as Record<string, unknown>) ?? ack;
    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

// -----------------------------------------------------------------
// GET /admin/:id/online -- cheap online check used by UI to enable/disable buttons
// -----------------------------------------------------------------
adminRouter.get('/:id/online', requireAccess(MODULES.DEVICES, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await prisma.agentRegistration.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, status: true, lastSeen: true },
    });
    if (!reg) throw HttpError.notFound();
    res.json({
      id: reg.id,
      status: reg.status,
      online: isAgentOnline(reg.id),
      lastSeen: reg.lastSeen,
    });
  } catch (err) { next(err); }
});

router.use('/admin', adminRouter);

export default router;

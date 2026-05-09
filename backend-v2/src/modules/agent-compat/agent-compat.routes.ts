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
import { hashToken, decrypt, randomToken } from '../../lib/crypto';
import { verifyPassword, hashPassword, validatePasswordStrength } from '../../lib/password';
import { sendVerificationEmail } from '../../lib/mailer';
import { assertTransition, type TicketStatus } from '../../utils/ticketStateMachine';
import { resolveSlaForTicket } from '../tickets/tickets.service';
import { logger } from '../../lib/logger';

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

    // Login/signup flow — agent v5.0.5 webview wysyła:
    //   companyName, nip, contactFirstName, contactLastName, contactPhone,
    //   contactEmail, email, password, registrationNotes, allowRustdesk/Monitoring
    // Starsze wersje (Tk) wysyłają: email, password, name, company
    if (!workspaceId && typeof body.email === 'string' && typeof body.password === 'string') {
      const emailLc = body.email.toLowerCase().trim();
      const fname =
        (typeof body.contactFirstName === 'string' && body.contactFirstName.trim()) ||
        (typeof body.name === 'string' ? body.name.trim().split(/\s+/)[0] : '') ||
        '';
      const lname =
        (typeof body.contactLastName === 'string' && body.contactLastName.trim()) ||
        (typeof body.name === 'string' ? body.name.trim().split(/\s+/).slice(1).join(' ') : '') ||
        fname;
      const companyName =
        (typeof body.companyName === 'string' && body.companyName.trim()) ||
        (typeof body.company === 'string' ? body.company.trim() : '') ||
        '';
      const nipDigits = typeof body.nip === 'string' ? body.nip.replace(/[-\s]/g, '') : '';

      const user = await prisma.user.findUnique({
        where: { email: emailLc },
        select: { id: true, passwordHash: true, isActive: true, lockedUntil: true },
      });

      // 1. Jeśli podano NIP, spróbuj znaleźć istniejący workspace po taxId
      let nipWorkspaceId: string | null = null;
      if (nipDigits.length >= 10) {
        const ws = await prisma.workspace.findFirst({
          where: { taxId: nipDigits, isActive: true },
          select: { id: true },
        });
        if (ws) nipWorkspaceId = ws.id;
      }

      if (user) {
        // LOGIN flow — istniejący user
        if (!user.isActive) {
          throw HttpError.unauthorized('Konto nieaktywne — sprawdź email weryfikacyjny', 'user_inactive');
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw HttpError.unauthorized('Konto zablokowane — odczekaj kilka minut', 'user_locked');
        }
        const ok = await verifyPassword(user.passwordHash, body.password);
        if (!ok) {
          throw HttpError.unauthorized('Nieprawidłowe hasło', 'invalid_password');
        }
        // Jeśli podano NIP istniejącego workspace i user jest jego członkiem — użyj go.
        // Dla rejestracji agenta wystarczy ACTIVE lub INVITED (sam dostęp do danych
        // dalej wymaga ACTIVE — pilnowane gdzie indziej). AgentRegistration goes
        // PENDING anyway and admin approves separately.
        if (nipWorkspaceId) {
          const m = await prisma.membership.findFirst({
            where: { userId: user.id, workspaceId: nipWorkspaceId, status: { in: ['ACTIVE', 'INVITED'] } },
            select: { workspaceId: true },
          });
          if (m) {
            workspaceId = m.workspaceId;
          } else {
            throw HttpError.forbidden(
              `Twoje konto nie jest członkiem workspace dla NIP ${nipDigits}. Poproś admina o zaproszenie.`,
              'not_workspace_member',
            );
          }
        } else {
          const m = await prisma.membership.findFirst({
            where: { userId: user.id, status: 'ACTIVE' },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: { workspaceId: true, workspace: { select: { isActive: true } } },
          });
          if (!m || !m.workspace.isActive) {
            throw HttpError.forbidden('Brak aktywnego workspace dla tego użytkownika', 'no_workspace');
          }
          workspaceId = m.workspaceId;
        }
      } else {
        // SIGNUP flow — nowy user
        if (!fname || !lname || !companyName) {
          throw HttpError.badRequest(
            'Brak danych do rejestracji — wypełnij imię, nazwisko i nazwę firmy',
            'signup_fields_missing',
          );
        }
        const pwCheck = validatePasswordStrength(body.password);
        if (!pwCheck.ok) {
          throw HttpError.badRequest(pwCheck.reason ?? 'Hasło zbyt słabe', 'weak_password');
        }
        if (nipWorkspaceId) {
          // NIP wskazuje na istniejący workspace — utwórz usera + PENDING membership.
          // Admin musi zaakceptować zarówno membership jak i AgentRegistration.
          const passwordHash = await hashPassword(body.password);
          const verifyTokenPlain = randomToken(24);
          await prisma.$transaction(async (tx) => {
            const u = await tx.user.create({
              data: {
                email: emailLc,
                firstName: fname,
                lastName: lname,
                phone: typeof body.contactPhone === 'string' ? body.contactPhone : null,
                passwordHash,
                emailVerified: false,
                emailVerifyToken: hashToken(verifyTokenPlain),
                emailVerifySentAt: new Date(),
              },
              select: { id: true },
            });
            await tx.membership.create({
              data: {
                userId: u.id,
                workspaceId: nipWorkspaceId!,
                role: 'MEMBER',
                scope: 'FULL',
                isDefault: true,
                status: 'INVITED',
              },
            });
          });
          // Wyślij email weryfikacyjny — best effort. NIE blokuje rejestracji asystenta.
          void sendVerificationEmail(emailLc, verifyTokenPlain, fname);
          workspaceId = nipWorkspaceId;
        } else {
          // Brak istniejącego workspace o tym NIP — pełny signup nowej firmy
          const baseSlug = companyName
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 40) || 'workspace';
          let slug = baseSlug;
          for (let i = 2; i < 100; i++) {
            const exists = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
            if (!exists) break;
            slug = `${baseSlug}-${i}`;
          }
          const passwordHash = await hashPassword(body.password);
          const verifyTokenPlain = randomToken(24);
          const created = await prisma.$transaction(async (tx) => {
            const u = await tx.user.create({
              data: {
                email: emailLc,
                firstName: fname,
                lastName: lname,
                phone: typeof body.contactPhone === 'string' ? body.contactPhone : null,
                passwordHash,
                emailVerified: false,
                emailVerifyToken: hashToken(verifyTokenPlain),
                emailVerifySentAt: new Date(),
              },
              select: { id: true },
            });
            const ws = await tx.workspace.create({
              data: {
                name: companyName,
                slug,
                type: 'MSP',
                plan: 'PRO',
                trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                taxId: nipDigits || null,
              },
              select: { id: true },
            });
            await tx.membership.create({
              data: {
                userId: u.id,
                workspaceId: ws.id,
                role: 'OWNER',
                scope: 'FULL',
                isDefault: true,
                status: 'ACTIVE',
              },
            });
            return { workspaceId: ws.id };
          });
          // Wyślij email weryfikacyjny — best effort. NIE blokuje rejestracji asystenta.
          void sendVerificationEmail(emailLc, verifyTokenPlain, fname);
          workspaceId = created.workspaceId;
        }
      }
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
      // Refresh lastSeen + uzupelnij/aktualizuj dane kontaktowe ze swiezego payloadu.
      const reuseEmail =
        (typeof body.contactEmail === 'string' && body.contactEmail.trim()) ||
        (typeof body.email === 'string' ? body.email.trim() : '') || undefined;
      const reuseFirst =
        (typeof body.contactFirstName === 'string' && body.contactFirstName.trim()) ||
        (typeof body.name === 'string' ? body.name.trim().split(/\s+/)[0] : '') || undefined;
      const reuseLast =
        (typeof body.contactLastName === 'string' && body.contactLastName.trim()) ||
        (typeof body.name === 'string' ? body.name.trim().split(/\s+/).slice(1).join(' ') : '') || undefined;
      const reusePhone = typeof body.contactPhone === 'string' ? body.contactPhone : undefined;
      const reuseCompany =
        (typeof body.companyName === 'string' && body.companyName.trim()) ||
        (typeof body.company === 'string' ? body.company.trim() : '') || undefined;
      const reuseNip = typeof body.nip === 'string' ? body.nip.replace(/[-\s]/g, '') : undefined;
      await prisma.agentRegistration.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          ...(reuseEmail ? { contactEmail: reuseEmail.toLowerCase() } : {}),
          ...(reuseFirst ? { contactFirstName: reuseFirst } : {}),
          ...(reuseLast ? { contactLastName: reuseLast } : {}),
          ...(reusePhone ? { contactPhone: reusePhone } : {}),
          ...(reuseCompany ? { companyName: reuseCompany } : {}),
          ...(reuseNip ? { nip: reuseNip } : {}),
          ...(typeof body.currentUser === 'string' ? { currentUser: body.currentUser } : {}),
        },
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

    // Login-flow fallback: agent v5 wysyla "email" zamiast "contactEmail".
    // Jezeli email pasuje do uzytkownika w workspace, dociagnij imie/nazwisko/telefon.
    const loginEmail =
      typeof body.contactEmail === 'string' ? body.contactEmail :
      typeof body.email === 'string' ? body.email : undefined;
    let userFirstName = body.contactFirstName as string | undefined;
    let userLastName = body.contactLastName as string | undefined;
    let userPhone = body.contactPhone as string | undefined;
    if (loginEmail && (!userFirstName || !userLastName)) {
      const u = await prisma.user.findUnique({
        where: { email: loginEmail.toLowerCase() },
        select: { firstName: true, lastName: true, phone: true },
      }).catch(() => null);
      if (u) {
        userFirstName = userFirstName ?? u.firstName ?? undefined;
        userLastName = userLastName ?? u.lastName ?? undefined;
        userPhone = userPhone ?? u.phone ?? undefined;
      }
    }

    const token = crypto.randomBytes(48).toString('hex');
    // Walidacja długości pól żeby agent z aktywnym tokenem nie mógł wstawić MB tekstu
    const safeStr = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' ? v.slice(0, max) : undefined;
    const reg = await prisma.agentRegistration.create({
      data: {
        workspaceId,
        agentToken: token,
        agentTokenHash: hashToken(token),
        agentVersion: safeStr(body.appVersion, 40) ?? 'unknown',
        status: 'PENDING',
        hostname,
        serialNumber: serial,
        osName: osInfo,
        osVersion: safeStr(body.windowsVersion, 60),
        cpuModel: safeStr(body.cpuModel, 120),
        ramMb: typeof body.ramTotalGb === 'number' ? Math.round(body.ramTotalGb * 1024) : undefined,
        currentUser: safeStr(body.currentUser, 120),
        companyName: safeStr(body.companyName, 200),
        nip: typeof body.nip === 'string' ? body.nip.replace(/[-\s]/g, '').slice(0, 20) : undefined,
        contactFirstName: userFirstName,
        contactLastName: userLastName,
        contactEmail: loginEmail,
        contactPhone: userPhone,
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

    // Walidacja długości — agent z aktywnym tokenem nie może wstawić MB tekstu
    const safeStr2 = (v: unknown, max: number): string | undefined =>
      typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined;
    await prisma.agentRegistration.update({
      where: { id: reg.id },
      data: {
        lastSeen: new Date(),
        serverMetrics: merged as never,
        currentUser: safeStr2(rest.currentUser, 120),
        diskFreeGb: typeof rest.diskFree === 'number' ? rest.diskFree : undefined,
        diskTotalGb: typeof rest.diskTotal === 'number' ? rest.diskTotal : undefined,
        agentVersion: safeStr2(rest.appVersion, 40),
        cpuModel: safeStr2(rest.cpuModel, 120),
        ramMb: typeof rest.ramTotalGb === 'number' ? Math.round(rest.ramTotalGb * 1024) : undefined,
        osVersion: safeStr2(rest.windowsVersion, 60),
        hostname: safeStr2(rest.hostname, 120),
      },
    });

    // Sync wykryte IDs zdalnego dostępu do Device — agent skanuje system
    // i wysyła rustdeskId/anydeskId/teamviewerId, ale były zapisywane tylko
    // do AgentRegistration.serverMetrics. Panel czyta z Device.* — sync poniżej.
    if (reg.deviceId) {
      const deviceUpdate: Record<string, string> = {};
      if (typeof rest.rustdeskId === 'string'   && rest.rustdeskId.trim())   deviceUpdate.rustdeskId   = rest.rustdeskId.trim();
      if (typeof rest.anydeskId === 'string'    && rest.anydeskId.trim())    deviceUpdate.anydeskId    = rest.anydeskId.trim();
      if (typeof rest.teamviewerId === 'string' && rest.teamviewerId.trim()) deviceUpdate.teamviewerId = rest.teamviewerId.trim();
      if (typeof rest.ipAddress === 'string'    && rest.ipAddress.trim())    deviceUpdate.ipAddress    = rest.ipAddress.trim();
      if (Object.keys(deviceUpdate).length > 0) {
        try {
          await prisma.device.update({ where: { id: reg.deviceId }, data: deviceUpdate });
        } catch {
          // Device może być soft-deleted lub inny race — nie blokuj heartbeatu.
        }
      }
    }

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
    // F1.2: deletedAt: null — żeby nie wskrzeszać soft-deleted
    const existing = await prisma.ticket.findFirst({
      where: {
        workspaceId: reg.workspaceId,
        deviceId: reg.deviceId ?? undefined,
        source: 'AGENT',
        title: input.title,
        status: { in: ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] },
        deletedAt: null,
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

    const reporterName =
      [reg.contactFirstName, reg.contactLastName].filter(Boolean).join(' ') ||
      reg.hostname || 'Agent';

    // F1.1: ujednolicony format `T-YYYY-NNNN` — taki sam jak nextTicketNumber()
    // używany w tickets.service.ts. Wcześniej agent dawał `T-NNNN` co rozjeżdżało
    // numerację w workspace.
    // Race-safe: retry on P2002 z incrementem (do 10 prób).
    const year = new Date().getFullYear();
    const numberPrefix = `T-${year}-`;
    let ticket: { id: string; ticketNumber: string; title: string; description: string; status: string } | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const last = await prisma.ticket.findFirst({
        where: { workspaceId: reg.workspaceId, ticketNumber: { startsWith: numberPrefix } },
        orderBy: { ticketNumber: 'desc' },
        select: { ticketNumber: true },
      });
      let nextN = 1;
      if (last) {
        const m = last.ticketNumber.match(/-(\d+)$/);
        if (m) nextN = parseInt(m[1]!, 10) + 1;
      }
      const candidate = `${numberPrefix}${String(nextN + attempt).padStart(4, '0')}`;
      // R6: Apply SLA z helper (przy pierwszej próbie tylko)
      const slaPriority = (input.priority ?? 'MEDIUM') as string;
      const sla = attempt === 0 ? await resolveSlaForTicket(reg.workspaceId, slaPriority) : { slaResponseMinutes: null, slaResolveMinutes: null };
      try {
        ticket = await prisma.ticket.create({
          data: {
            workspaceId: reg.workspaceId,
            ticketNumber: candidate,
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
            slaResponseMinutes: sla.slaResponseMinutes,
            slaResolveMinutes: sla.slaResolveMinutes,
            // F1.3: TicketEvent('created') — pełen audyt także dla agent submissions
            events: { create: { userId: authorId, eventType: 'created', toValue: 'NEW', metadata: { source: 'agent' } } },
          },
          select: { id: true, ticketNumber: true, title: true, description: true, status: true },
        });
        break;
      } catch (e: unknown) {
        const code = (e as { code?: string } | null)?.code;
        if (code === 'P2002') {
          lastErr = e;
          continue; // retry z wyższym numerem
        }
        throw e;
      }
    }
    if (!ticket) {
      throw lastErr instanceof Error
        ? lastErr
        : HttpError.conflict('Nie udało się wygenerować unikalnego numeru ticketu po 10 próbach', 'ticket_number_collision');
    }

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
      where: { workspaceId: reg.workspaceId, deviceId: reg.deviceId, deletedAt: null },
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
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId, deletedAt: null },
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
    // F1.5: dodatkowy TicketEvent('commented') żeby historia była pełna
    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.ticketComment.create({
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
      await tx.ticketEvent.create({
        data: {
          ticketId: t.id,
          userId: authorId,
          eventType: 'commented',
          metadata: { commentId: c.id, isInternal: false, source: 'agent' },
        },
      });
      return c;
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// POST /api/agent/tickets/:id/cancel
// F1.4: użyj state machine + TicketEvent('status_changed'). Wcześniej ustawiało
// resolvedAt (CANCELLED ≠ RESOLVED) i nie pisało eventu — historia kłamała.
router.post('/tickets/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reg = await agentAuth(req);
    if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent not active');
    if (!reg.deviceId) throw HttpError.notFound('Agent has no device linked');

    const t = await prisma.ticket.findFirst({
      where: { id: String(req.params.id), deviceId: reg.deviceId, workspaceId: reg.workspaceId, deletedAt: null },
      select: { id: true, status: true, ticketNumber: true },
    });
    if (!t) throw HttpError.notFound('Ticket not found');

    // Resolve canceller (contactEmail user lub system fallback)
    let cancellerId: string | null = null;
    if (reg.contactEmail) {
      const u = await prisma.user.findUnique({ where: { email: reg.contactEmail }, select: { id: true } });
      if (u) cancellerId = u.id;
    }
    if (!cancellerId) {
      const sys = await prisma.user.findUnique({ where: { email: 'agent@infradesk.system' }, select: { id: true } }).catch(() => null);
      if (sys) cancellerId = sys.id;
    }

    try {
      assertTransition(t.status as TicketStatus, 'CANCELLED');
    } catch (err) {
      throw HttpError.conflict(
        'Zgłoszenie już w realizacji — nie można anulować. Napisz wiadomość do technika.',
        'illegal_transition',
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ticket.update({
        where: { id: t.id },
        data: {
          status: 'CANCELLED',
          // FX.3: NIE ustawiać closedAt ani resolvedAt dla CANCELLED.
          // closedAt/resolvedAt to "rzeczywiste ukończenie" — anulowanie to nie
          // ukończenie. Konsystencja z service.transitionTicket.
          resolutionSummary: 'Anulowane przez klienta',
        },
        select: { id: true, status: true, ticketNumber: true },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: t.id,
          userId: cancellerId,
          eventType: 'status_changed',
          fromValue: t.status,
          toValue: 'CANCELLED',
          metadata: { reason: 'cancelled_by_client', source: 'agent' },
        },
      });
      return u;
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

// POST /api/agent/upload — image attachment from agent (only ACTIVE agents).
router.post(
  '/upload',
  async (req: Request, _res, next) => {
    try {
      const reg = await agentAuth(req);
      if (reg.status !== 'ACTIVE') throw HttpError.forbidden('Agent musi być zatwierdzony', 'agent_not_active');
      (req as Request & { _agentReg?: typeof reg })._agentReg = reg;
      next();
    } catch (err) { next(err); }
  },
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'Brak pliku' }); return; }
      const reg = (req as Request & { _agentReg?: { workspaceId: string; id: string } })._agentReg;
      // Audit trail for cleanup — Attachment requires uploadedByUserId, agents have no
      // User row, so we log to ActivityLog instead. Cron-cleanup może później wymieść
      // pliki bez referencji w ActivityLog/Ticket.
      if (reg) {
        void prisma.activityLog.create({
          data: {
            workspaceId: reg.workspaceId,
            entityType: 'agent_upload',
            entityId: reg.id,
            actionType: 'file_uploaded',
            description: `Agent ${reg.id.slice(0, 8)} uploaded ${req.file.originalname.slice(0, 80)}`,
            performedByUserId: null,
            metadata: { storageKey: req.file.filename, fileSize: req.file.size, mimeType: req.file.mimetype },
          },
        }).catch((e) => logger.warn({ err: e, file: req.file?.filename }, '[agent-upload] activity log failed'));
      }
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
    // Configs bound to THIS agent registration. Schema field names (sqlDatabase,
    // sqlUsername) różnią się od tego czego oczekuje agent v5 (sqlDatabases,
    // sqlUser, sqlPassword). Mapowanie poniżej + dekodowanie hasła.
    const configs = await prisma.backupConfig.findMany({
      where: { workspaceId: reg.workspaceId, agentRegistrationId: reg.id },
      select: {
        id: true, name: true, type: true,
        sqlHost: true, sqlPort: true, sqlDatabase: true, sqlUsername: true,
        sqlPasswordEnc: true, sqlPasswordIv: true, sqlPasswordAuthTag: true,
        folderPath: true, localBackupPath: true, useInfradeskCloud: true,
        googleDriveFolder: true,
        cronSchedule: true, retentionDays: true, encryptBackups: true,
        lastRunAt: true,
      },
    });
    const mapped = configs.map((c) => {
      let sqlPassword: string | undefined;
      if (c.sqlPasswordEnc && c.sqlPasswordIv && c.sqlPasswordAuthTag) {
        try {
          sqlPassword = decrypt({
            ciphertext: c.sqlPasswordEnc,
            iv: c.sqlPasswordIv,
            authTag: c.sqlPasswordAuthTag,
          });
        } catch (e) {
          // jeśli decrypt failuje, pomijamy — agent użyje Windows Auth (-E)
        }
      }
      return {
        id: c.id, name: c.name, type: c.type,
        sqlHost: c.sqlHost, sqlPort: c.sqlPort,
        // alias names that agent v5 expects
        sqlDatabases: c.sqlDatabase ?? '',
        sqlDatabase: c.sqlDatabase, // kept for forward compat
        sqlUser: c.sqlUsername ?? '',
        sqlUsername: c.sqlUsername, // kept for forward compat
        sqlPassword: sqlPassword,
        folderPath: c.folderPath, localBackupPath: c.localBackupPath,
        useInfradeskCloud: c.useInfradeskCloud,
        googleDriveFolder: c.googleDriveFolder,
        cronSchedule: c.cronSchedule, retentionDays: c.retentionDays,
        encryptBackups: c.encryptBackups,
        lastRunAt: c.lastRunAt,
      };
    });
    res.json(mapped);
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

// Partner IT — czasowe udostępnianie zasobów (urządzenia / hasła / RustDesk-launch)
// firmom-partnerom przez secure share link (jak download PIN, ale per-resource).

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { logger } from '../../lib/logger';

const router = Router();
router.use(requireAuth, requireWorkspace);

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url'); // 32 znaki URL-safe
}

// ─── POST /api/v2/partner-shares — utwórz nowy share ──────────────────
const createSchema = z.object({
  resourceType: z.enum(['DEVICE', 'CREDENTIAL', 'RUSTDESK_LAUNCH']),
  resourceId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(24),
  partnerEmail: z.string().email().max(255).optional(),
  partnerName: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});

router.post('/', requireAccess(MODULES.VAULT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

    // Walidacja istnienia zasobu w workspace
    if (input.resourceType === 'DEVICE' || input.resourceType === 'RUSTDESK_LAUNCH') {
      const device = await prisma.device.findFirst({
        where: { id: input.resourceId, workspaceId: req.workspaceId!, deletedAt: null },
        select: { id: true, rustdeskId: true },
      });
      if (!device) throw HttpError.notFound('Urządzenie nie istnieje w tym workspace');
      if (input.resourceType === 'RUSTDESK_LAUNCH' && !device.rustdeskId) {
        throw HttpError.badRequest('Urządzenie nie ma ustawionego RustDesk ID', 'no_rustdesk_id');
      }
    } else if (input.resourceType === 'CREDENTIAL') {
      const cred = await prisma.credential.findFirst({
        where: { id: input.resourceId, workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!cred) throw HttpError.notFound('Hasło nie istnieje w tym workspace');
    }

    // Generuj unikalny token (retry przy kolizji)
    let share: { id: string; shareToken: string; expiresAt: Date } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateToken();
      try {
        const created = await prisma.partnerShare.create({
          data: {
            workspaceId: req.workspaceId!,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            shareToken: token,
            shareTokenHash: hashToken(token),
            partnerEmail: input.partnerEmail ?? null,
            partnerName: input.partnerName ?? null,
            note: input.note ?? null,
            expiresAt,
            createdByUserId: req.auth!.sub,
          },
          select: { id: true, shareToken: true, expiresAt: true },
        });
        share = created;
        break;
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code !== 'P2002') throw err;
      }
    }
    if (!share) throw HttpError.internal('Nie udało się wygenerować unikalnego tokena');

    res.status(201).json({
      share: {
        id: share.id,
        shareUrl: `https://infradesk.pl/share/${share.shareToken}`,
        token: share.shareToken,
        expiresAt: share.expiresAt,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/v2/partner-shares — lista wystawionych share'ów ─────────
router.get('/', requireAccess(MODULES.VAULT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.partnerShare.findMany({
      where: { workspaceId: req.workspaceId! },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const now = Date.now();
    res.json({
      shares: items.map((s) => ({
        id: s.id,
        resourceType: s.resourceType,
        resourceId: s.resourceId,
        partnerEmail: s.partnerEmail,
        partnerName: s.partnerName,
        note: s.note,
        expiresAt: s.expiresAt,
        usedAt: s.usedAt,
        usedFromIp: s.usedFromIp,
        accessCount: s.accessCount,
        revokedAt: s.revokedAt,
        createdAt: s.createdAt,
        status:
          s.revokedAt ? 'REVOKED'
            : s.expiresAt.getTime() < now ? 'EXPIRED'
              : s.usedAt ? 'USED'
                : 'ACTIVE',
        // Token NIE jest zwracany — generowany tylko przy CREATE.
        shareUrl: s.revokedAt || s.expiresAt.getTime() < now ? null : `https://infradesk.pl/share/${s.shareToken}`,
      })),
    });
  } catch (err) { next(err); }
});

// ─── DELETE /api/v2/partner-shares/:id — odwołaj share ────────────────
router.delete('/:id', requireAccess(MODULES.VAULT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.partnerShare.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, revokedAt: true },
    });
    if (!existing) throw HttpError.notFound('Share nie znaleziony');
    if (existing.revokedAt) {
      res.json({ ok: true, alreadyRevoked: true });
      return;
    }
    await prisma.partnerShare.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    logger.info({ shareId: existing.id, by: req.auth!.sub }, '[partner-shares] revoked');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;

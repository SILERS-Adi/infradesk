import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

// 8 znaków, alfabet bez O/0/I/1/L (czytelnie po telefonie).
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePin(length = 8): string {
  const out: string[] = [];
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out.push(PIN_ALPHABET[bytes[i] % PIN_ALPHABET.length]);
  }
  return out.join('');
}

const generateSchema = z.object({
  resource: z.enum(['rustdesk']).default('rustdesk'),
  note: z.string().max(120).optional().nullable(),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(24),
});

router.post(
  '/',
  requireAccess(MODULES.DOWNLOADS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = generateSchema.parse(req.body ?? {});
      const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

      // Retry on the rare collision (32 chars, 8-long → 32^8 = 1.1T combos).
      for (let attempt = 0; attempt < 5; attempt++) {
        const pin = generatePin(8);
        try {
          const created = await prisma.downloadPin.create({
            data: {
              workspaceId: req.workspaceId!,
              pin,
              resource: input.resource,
              note: input.note?.trim() || null,
              createdByUserId: req.auth!.sub,
              expiresAt,
            },
          });
          res.status(201).json({
            pin: {
              id: created.id,
              pin: created.pin,
              resource: created.resource,
              note: created.note,
              expiresAt: created.expiresAt,
              createdAt: created.createdAt,
            },
          });
          return;
        } catch (err: unknown) {
          const code = (err as { code?: string }).code;
          if (code !== 'P2002') throw err;
          // unique violation → retry with new PIN
        }
      }
      throw HttpError.internal('Nie udało się wygenerować unikalnego PIN-u, spróbuj ponownie');
    } catch (err) { next(err); }
  },
);

router.get(
  '/',
  requireAccess(MODULES.DOWNLOADS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.downloadPin.findMany({
        where: { workspaceId: req.workspaceId! },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const now = Date.now();
      res.json({
        pins: items.map((p) => ({
          id: p.id,
          pin: p.pin,
          resource: p.resource,
          note: p.note,
          expiresAt: p.expiresAt,
          usedAt: p.usedAt,
          usedFromIp: p.usedFromIp,
          revokedAt: p.revokedAt,
          createdAt: p.createdAt,
          status:
            p.revokedAt ? 'REVOKED'
              : p.usedAt ? 'USED'
                : p.expiresAt.getTime() < now ? 'EXPIRED'
                  : 'ACTIVE',
        })),
      });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  requireAccess(MODULES.DOWNLOADS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.downloadPin.findFirst({
        where: { id: String(req.params.id), workspaceId: req.workspaceId! },
        select: { id: true, revokedAt: true, usedAt: true },
      });
      if (!existing) throw HttpError.notFound('PIN nie znaleziony');
      if (existing.revokedAt || existing.usedAt) {
        res.json({ ok: true, alreadyInactive: true });
        return;
      }
      await prisma.downloadPin.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// ────────────────────────────────────────────────────────────────────
// Personal PIN serwisanta — wielokrotnego użytku, ustawiany na profilu.
// ────────────────────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: { personalDownloadPin: true },
    });
    res.json({ pin: u?.personalDownloadPin ?? null });
  } catch (err) { next(err); }
});

// Min 8 znaków — przy 4 i alfabecie 36 (case-insensitive po toUpperCase) przestrzeń ~1.7M = brute-force.
const personalPinSchema = z.object({
  pin: z.string().min(8).max(32).regex(/^[A-Za-z0-9]+$/, 'Tylko litery i cyfry').nullable(),
});

router.put('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = personalPinSchema.parse(req.body);
    const value = input.pin ? input.pin.trim().toUpperCase() : null;

    if (value) {
      const taken = await prisma.user.findFirst({
        where: { personalDownloadPin: value, NOT: { id: req.auth!.sub } },
        select: { id: true },
      });
      if (taken) throw HttpError.conflict('Ten PIN jest już zajęty przez innego użytkownika', 'pin_taken');
    }

    const updated = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: { personalDownloadPin: value },
      select: { personalDownloadPin: true },
    });
    res.json({ pin: updated.personalDownloadPin });
  } catch (err) { next(err); }
});

export default router;

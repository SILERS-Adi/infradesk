import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prismaBg as prisma } from "../../lib/prisma-bg";
import { HttpError } from '../../utils/httpError';
import { logger } from '../../lib/logger';

const router = Router();

// Public RustDesk download — gated by:
//   1. one-time PIN generated from panel (DownloadPin table, consumed on use)
//   2. technician's personal reusable PIN (User.personalDownloadPin)
const RUSTDESK_URL = process.env.RUSTDESK_DOWNLOAD_URL
  ?? 'https://github.com/rustdesk/rustdesk/releases/download/1.3.6/rustdesk-1.3.6-x86_64.exe';
const RUSTDESK_FILENAME = process.env.RUSTDESK_FILENAME
  ?? RUSTDESK_URL.split('/').pop()
  ?? 'rustdesk-1.3.6-x86_64.exe';

const pinLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Za dużo prób. Spróbuj ponownie za chwilę.' },
});

// ──────────────────────────────────────────────────────────────────────────
// Public company lookup by NIP — używane przy rejestracji do auto-uzupełnienia
// nazwy i adresu firmy. Źródła:
//   1. MF biała lista VAT (publiczne, bez auth)  https://wl-api.mf.gov.pl
//   2. CEIDG fallback (jeśli ustawiony token w .env) dla działalności jednoosobowych
// ──────────────────────────────────────────────────────────────────────────

const lookupLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Za dużo zapytań. Spróbuj ponownie za chwilę.' },
});

interface CompanyLookup {
  name: string;
  taxId: string;
  regon: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  source: 'mf' | 'ceidg';
}

function parsePolishAddress(addr: string | null | undefined): { street: string | null; postalCode: string | null; city: string | null } {
  if (!addr) return { street: null, postalCode: null, city: null };
  // Typowy format MF: "ul. Krakowska 5 lok. 3, 00-123 Warszawa"
  const match = addr.match(/^(.*?),\s*(\d{2}-\d{3})\s+(.+?)\s*$/);
  if (match) {
    return { street: match[1].trim(), postalCode: match[2], city: match[3] };
  }
  return { street: addr, postalCode: null, city: null };
}

async function lookupViaMf(nip: string): Promise<CompanyLookup | null> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${today}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const data = await r.json() as {
      result?: {
        subject?: {
          name?: string;
          nip?: string;
          regon?: string;
          workingAddress?: string;
          residenceAddress?: string;
        } | null;
      };
    };
    const subject = data.result?.subject;
    if (!subject?.name) return null;
    const addr = parsePolishAddress(subject.workingAddress ?? subject.residenceAddress ?? null);
    return {
      name: subject.name,
      taxId: subject.nip ?? nip,
      regon: subject.regon ?? null,
      addressLine1: addr.street,
      postalCode: addr.postalCode,
      city: addr.city,
      source: 'mf',
    };
  } catch {
    return null;
  }
}

async function lookupViaCeidg(nip: string): Promise<CompanyLookup | null> {
  const token = process.env.CEIDG_API_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://dane.biznes.gov.pl/api/ceidg/v3/firmy?nip=${nip}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (r.status === 204 || !r.ok) return null;
    const data = await r.json() as { firmy?: Array<Record<string, unknown>> };
    const firma = data.firmy?.[0];
    if (!firma) return null;
    const adres = (firma.adresDzialalnosci ?? {}) as Record<string, string>;
    return {
      name: (firma.nazwa as string) ?? '',
      taxId: (firma.nip as string) ?? nip,
      regon: (firma.regon as string) ?? null,
      addressLine1: [adres.ulica, adres.budynek].filter(Boolean).join(' ') || null,
      postalCode: adres.kod ?? null,
      city: adres.miasto ?? null,
      source: 'ceidg',
    };
  } catch {
    return null;
  }
}

router.get('/company-lookup', lookupLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ nip: z.string() });
    const input = schema.parse(req.query);
    const nip = input.nip.replace(/[^0-9]/g, '');
    if (nip.length !== 10) throw HttpError.badRequest('NIP musi mieć 10 cyfr', 'invalid_nip');

    // 1) MF biała lista — najszybsze, bez auth
    let result = await lookupViaMf(nip);
    // 2) CEIDG fallback (działalności jednoosobowe nieaktywne w MF VAT)
    if (!result) result = await lookupViaCeidg(nip);

    if (!result) {
      res.json({ found: false });
      return;
    }
    res.json({ found: true, data: result });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────
// Partner IT — resolve share token (publiczny, bez logowania).
// Zwraca dane zasobu (DEVICE / RUSTDESK_LAUNCH) lub jednorazowo odsłonięte hasło (CREDENTIAL).
// ──────────────────────────────────────────────────────────────────────────

const partnerShareLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Za dużo zapytań. Spróbuj ponownie za chwilę.' },
});

function partnerHashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

router.get('/partner-share/:token', partnerShareLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token).trim();
    if (token.length < 16 || token.length > 128) throw HttpError.badRequest('Nieprawidłowy token');

    const share = await prisma.partnerShare.findUnique({
      where: { shareTokenHash: partnerHashToken(token) },
      select: {
        id: true, workspaceId: true, resourceType: true, resourceId: true,
        partnerName: true, partnerEmail: true, note: true,
        expiresAt: true, revokedAt: true, accessCount: true, usedAt: true,
        workspace: { select: { name: true } },
      },
    });
    if (!share) throw HttpError.notFound('Link jest nieprawidłowy lub został usunięty');
    if (share.revokedAt) throw HttpError.forbidden('Link został odwołany przez właściciela', 'share_revoked');
    if (share.expiresAt.getTime() < Date.now()) throw HttpError.forbidden('Link wygasł', 'share_expired');

    const ip = req.ip ?? null;

    // Pobierz dane zasobu zgodnie z typem
    let payload: Record<string, unknown>;
    if (share.resourceType === 'DEVICE') {
      const device = await prisma.device.findUnique({
        where: { id: share.resourceId },
        select: {
          id: true, name: true, hostname: true, category: true,
          ipAddress: true, macAddress: true, operatingSystem: true, osVersion: true,
          rustdeskId: true, rdpAddress: true, anydeskId: true, teamviewerId: true, sshAddress: true,
          location: { select: { name: true, city: true, addressLine1: true } },
        },
      });
      if (!device) throw HttpError.notFound('Urządzenie zostało usunięte');
      payload = { kind: 'DEVICE', device };
    } else if (share.resourceType === 'RUSTDESK_LAUNCH') {
      const device = await prisma.device.findUnique({
        where: { id: share.resourceId },
        select: { name: true, rustdeskId: true },
      });
      if (!device?.rustdeskId) throw HttpError.notFound('Urządzenie nie ma RustDesk ID');
      payload = {
        kind: 'RUSTDESK_LAUNCH',
        deviceName: device.name,
        rustdeskId: device.rustdeskId,
        launchUrl: `rustdesk://connection/new/${encodeURIComponent(device.rustdeskId)}`,
      };
    } else {
      // CREDENTIAL — jednorazowe odsłonięcie. Po pierwszym GET token przestaje działać.
      if (share.usedAt) throw HttpError.forbidden('Hasło zostało już raz odsłonięte. Skontaktuj się z właścicielem o nowy link.', 'credential_already_revealed');
      const cred = await prisma.credential.findUnique({
        where: { id: share.resourceId },
        select: {
          id: true, name: true, username: true, urlOrHost: true, notes: true, category: true,
          passwordEncrypted: true, passwordIv: true, passwordAuthTag: true,
        },
      });
      if (!cred) throw HttpError.notFound('Hasło zostało usunięte');

      // Decrypt z VAULT_MASTER_KEY (AES-256-GCM)
      let decrypted = '';
      try {
        const masterKey = process.env.VAULT_MASTER_KEY;
        if (!masterKey) throw new Error('VAULT_MASTER_KEY not configured');
        const key = crypto.createHash('sha256').update(masterKey).digest();
        const iv = Buffer.from(cred.passwordIv, 'base64');
        const authTag = Buffer.from(cred.passwordAuthTag, 'base64');
        const ciphertext = Buffer.from(cred.passwordEncrypted, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
      } catch (err) {
        logger.warn({ err, credentialId: share.resourceId }, '[partner-share] credential decrypt failed');
        throw HttpError.internal('Nie udało się odszyfrować hasła — skontaktuj się z administratorem');
      }

      payload = {
        kind: 'CREDENTIAL',
        credential: {
          name: cred.name,
          category: cred.category,
          username: cred.username,
          password: decrypted,
          urlOrHost: cred.urlOrHost,
          notes: cred.notes,
        },
      };
    }

    // Update access (bypass RLS via update)
    await prisma.partnerShare.update({
      where: { id: share.id },
      data: {
        usedAt: share.usedAt ?? new Date(),
        usedFromIp: ip,
        accessCount: { increment: 1 },
      },
    });

    res.json({
      ok: true,
      share: {
        workspaceName: share.workspace.name,
        partnerName: share.partnerName,
        note: share.note,
        expiresAt: share.expiresAt,
      },
      ...payload,
    });
  } catch (err) { next(err); }
});

router.post('/downloads/verify-pin', pinLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ pin: z.string().min(1).max(40) });
    const input = schema.parse(req.body);
    const candidate = input.pin.trim().toUpperCase();
    const ip = req.ip ?? null;

    // 1) try one-time PIN — atomic claim using updateMany so two concurrent uses race-safe.
    const claim = await prisma.downloadPin.updateMany({
      where: {
        pin: candidate,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
        usedFromIp: ip ?? undefined,
      },
    });

    if (claim.count > 0) {
      res.json({ ok: true, url: RUSTDESK_URL, fileName: RUSTDESK_FILENAME, kind: 'one-time' });
      return;
    }

    // 2) try personal technician PIN — reusable, no consumption.
    const tech = await prisma.user.findFirst({
      where: { personalDownloadPin: candidate, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (tech) {
      res.json({ ok: true, url: RUSTDESK_URL, fileName: RUSTDESK_FILENAME, kind: 'personal' });
      return;
    }

    throw HttpError.forbidden('Nieprawidłowy lub wykorzystany PIN', 'invalid_pin');
  } catch (err) { next(err); }
});

/**
 * GET /api/v2/public/workspace
 *
 * Returns branding + basic info for the workspace resolved from Host header.
 * Called by the frontend BEFORE login so login page can show "Logowanie — Dwór Osmolice"
 * with proper logo/color. If Host is global (v2.infradesk.pl) → returns `workspace: null`.
 */
router.get('/workspace', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.resolvedWorkspace) {
      res.json({ workspace: null, subdomain: req.hostSubdomain ?? null });
      return;
    }
    res.json({
      workspace: {
        slug: req.resolvedWorkspace.slug,
        name: req.resolvedWorkspace.name,
        type: req.resolvedWorkspace.type,
        branding: {
          logoUrl: req.resolvedWorkspace.brandingLogoUrl,
          primaryColor: req.resolvedWorkspace.brandingPrimaryColor,
        },
      },
      subdomain: req.hostSubdomain,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/v2/public/workspace/exists?slug=foo
 * Used by registration form to check if slug is taken before submitting.
 */
router.get('/workspace/exists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.query.slug ?? '').toLowerCase().trim();
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      res.json({ available: false, reason: 'invalid_format' });
      return;
    }
    const existing = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    res.json({ available: !existing, slug });
  } catch (err) { next(err); }
});

export default router;

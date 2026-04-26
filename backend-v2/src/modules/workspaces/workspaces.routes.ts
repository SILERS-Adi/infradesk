import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';
import { prismaBg } from '../../lib/prisma-bg';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';

const router = Router();

// ──────────────────────────────────────────────────────────────────
// Logo uploads (workspace branding)
// ──────────────────────────────────────────────────────────────────
const LOGOS_DIR = process.env.LOGOS_DIR || '/home/adrian/infradesk/backend-v2/uploads/logos';
try { fs.mkdirSync(LOGOS_DIR, { recursive: true }); } catch { /* ignore */ }

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const wsId = req.workspaceId ?? 'unknown';
    cb(null, `${wsId}-${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Dozwolone tylko obrazy: JPG, PNG, WebP, SVG'));
  },
});

const createSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  type: z.enum(['MSP', 'CLIENT', 'INTERNAL_IT']).default('MSP'),
});

router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.auth!.sub, status: 'ACTIVE' },
      select: {
        id: true, role: true, scope: true, isDefault: true,
        workspace: { select: { id: true, slug: true, name: true, type: true, plan: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ workspaces: memberships });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    const dup = await prismaBg.workspace.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (dup) throw HttpError.conflict('Slug jest zajęty', 'slug_taken');
    const workspace = await prismaBg.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { ...input, plan: 'STARTER' } });
      await tx.membership.create({
        data: {
          userId: req.auth!.sub, workspaceId: ws.id,
          role: 'OWNER', scope: 'FULL', isDefault: false, status: 'ACTIVE',
        },
      });
      return ws;
    });
    res.status(201).json({ workspace });
  } catch (err) { next(err); }
});

router.get('/current', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ws = await prisma.workspace.findUnique({ where: { id: req.workspaceId! } });
    res.json({ workspace: ws });
  } catch (err) { next(err); }
});

router.patch(
  '/current',
  requireAuth,
  requireWorkspace,
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Pre-process input: empty strings → null for nullable fields,
      // website auto-prefixes https:// if missing, country lenient with empty.
      const raw = (req.body ?? {}) as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (trimmed === '') {
            // Treat empty string as null for nullable optional fields,
            // and skip entirely for required-ish fields like name/country/locale/etc.
            if (['name', 'country', 'locale', 'timezone', 'currency', 'primaryColor'].includes(k)) {
              continue;
            }
            cleaned[k] = null;
          } else {
            cleaned[k] = trimmed;
          }
        } else {
          cleaned[k] = v;
        }
      }
      // Auto-prefix website with https:// if user typed bare domain
      if (typeof cleaned.website === 'string' && cleaned.website && !/^https?:\/\//i.test(cleaned.website)) {
        cleaned.website = `https://${cleaned.website}`;
      }

      const schema = z.object({
        name: z.string().min(2).max(120).trim().optional(),
        taxId: z.string().max(50).nullable().optional(),
        regon: z.string().max(50).nullable().optional(),
        krs: z.string().max(50).nullable().optional(),
        logoUrl: z.string().max(500).nullable().optional(),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        locale: z.string().max(10).optional(),
        timezone: z.string().max(60).optional(),
        currency: z.string().length(3).optional(),
        addressLine1: z.string().max(200).nullable().optional(),
        addressLine2: z.string().max(200).nullable().optional(),
        postalCode: z.string().max(20).nullable().optional(),
        city: z.string().max(120).nullable().optional(),
        country: z.string().length(2).optional(),
        email: z.string().email().max(200).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        website: z.string().url().max(300).nullable().optional(),
      });
      const input = schema.parse(cleaned);
      const ws = await prisma.workspace.update({ where: { id: req.workspaceId! }, data: input });
      res.json({ workspace: ws });
    } catch (err) { next(err); }
  },
);

// POST /workspaces/current/logo — multipart upload (field: "logo")
router.post(
  '/current/logo',
  requireAuth,
  requireWorkspace,
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  (req: Request, res: Response, next: NextFunction) => {
    logoUpload.single('logo')(req, res, (err) => {
      if (err instanceof multer.MulterError) return next(HttpError.badRequest(err.message));
      if (err) return next(HttpError.badRequest(err.message ?? 'Upload failed'));
      return next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) throw HttpError.badRequest('Brak pliku');
      const logoUrl = `/uploads/logos/${file.filename}`;
      const ws = await prisma.workspace.update({
        where: { id: req.workspaceId! },
        data: { logoUrl },
        select: { id: true, logoUrl: true },
      });
      res.status(201).json({ workspace: ws, logoUrl });
    } catch (err) { next(err); }
  },
);

// DELETE /workspaces/current/logo — remove logo reference (file left on disk for safety)
router.delete(
  '/current/logo',
  requireAuth,
  requireWorkspace,
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.workspace.update({ where: { id: req.workspaceId! }, data: { logoUrl: null } });
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// ──────────────────────────────────────────────────────────────────
// Plan & Modules — canonical module catalog + per-workspace toggles
// ──────────────────────────────────────────────────────────────────

// Canonical module catalog. `plan` = minimum plan required to enable.
// Kept here (not DB) so keys stay in-sync with backend `MODULES` constant.
const MODULE_CATALOG: Array<{
  key: string;
  label: string;
  description: string;
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
}> = [
  { key: 'tickets',     label: 'Tickety',              description: 'Zarządzanie zgłoszeniami od klientów i wewnętrznymi.',     plan: 'STARTER' },
  { key: 'devices',     label: 'Urządzenia',           description: 'Inwentaryzacja sprzętu, konfiguracja, historia serwisu.', plan: 'STARTER' },
  { key: 'sessions',    label: 'Sesje pracy',          description: 'Rejestrowanie czasu pracy i rozliczanie z klientami.',    plan: 'STARTER' },
  { key: 'vault',       label: 'Sejf haseł',           description: 'Bezpieczne przechowywanie credentiali per urządzenie.',   plan: 'STARTER' },
  { key: 'clients',     label: 'CRM (kontakty)',       description: 'Klienci, kontakty, umowy i warunki rozliczeń.',           plan: 'STARTER' },
  { key: 'orders',      label: 'Zakupy',               description: 'Zamówienia sprzętu, magazyn, dostawy do klientów.',       plan: 'STARTER' },
  { key: 'delegations', label: 'Delegacje',            description: 'Wyjazdy serwisowe, kalkulacja kosztów i diet.',           plan: 'STARTER' },
  { key: 'backups',     label: 'Backupy',              description: 'Monitoring zadań backupu i alerty w razie awarii.',       plan: 'PRO' },
  { key: 'monitoring',  label: 'Monitoring',           description: 'Audit Score, uptime i health-check urządzeń.',            plan: 'PRO' },
  { key: 'ai.copilot',  label: 'AI Copilot (Iris)',    description: 'AI asystent do diagnostyki, pisania odpowiedzi, KB.',     plan: 'PRO' },
  { key: 'downloads',   label: 'Dysk',                 description: 'Pliki do pobrania: instalatory, instrukcje, narzędzia.',  plan: 'STARTER' },
  { key: 'gps',         label: 'GPS Field Service',    description: 'Śledzenie techników w terenie, route optimization.',      plan: 'ENTERPRISE' },
];

const PLAN_ORDER = { STARTER: 0, PRO: 1, ENTERPRISE: 2 } as const;
type PlanKey = keyof typeof PLAN_ORDER;

// GET /workspaces/current/plan — plan details + billing dates
router.get('/current/plan', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: req.workspaceId! },
      select: { id: true, plan: true, planStartedAt: true, planExpiresAt: true, trialEndsAt: true, currency: true },
    });
    if (!ws) throw HttpError.notFound('Workspace not found');
    res.json({ plan: ws });
  } catch (err) { next(err); }
});

// PUT /workspaces/current/plan — change plan (super-admin only; pre-Stripe escape hatch)
router.put('/current/plan', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.auth?.isSuperAdmin) {
      res.status(403).json({ error: 'forbidden', message: 'Plan zmienia super-admin' });
      return;
    }
    const schema = z.object({ plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']) });
    const input = schema.parse(req.body);
    const updated = await prisma.workspace.update({
      where: { id: req.workspaceId! },
      data: {
        plan: input.plan,
        planStartedAt: new Date(),
        planExpiresAt: null,
        trialEndsAt: null,
      },
      select: { id: true, plan: true, planStartedAt: true, planExpiresAt: true, trialEndsAt: true, currency: true },
    });
    res.json({ plan: updated });
  } catch (err) { next(err); }
});

// GET /workspaces/current/modules — canonical catalog + which are enabled
router.get('/current/modules', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: req.workspaceId! },
      select: { plan: true },
    });
    if (!ws) throw HttpError.notFound('Workspace not found');
    const enabled = await prisma.workspaceModule.findMany({
      where: { workspaceId: req.workspaceId! },
      select: { moduleKey: true, enabled: true },
    });
    const enabledMap = new Map(enabled.map((m) => [m.moduleKey, m.enabled]));
    const currentTier = PLAN_ORDER[ws.plan as PlanKey] ?? 0;
    const modules = MODULE_CATALOG.map((m) => {
      const unlocked = PLAN_ORDER[m.plan] <= currentTier;
      const explicit = enabledMap.get(m.key);
      // Default: when unlocked → enabled, when locked → disabled (unless explicit override).
      const enabledVal = explicit === undefined ? unlocked : explicit && unlocked;
      return {
        key: m.key,
        label: m.label,
        description: m.description,
        requiredPlan: m.plan,
        unlocked,
        enabled: enabledVal,
      };
    });
    res.json({ modules, currentPlan: ws.plan });
  } catch (err) { next(err); }
});

// PATCH /workspaces/current/modules — toggle a single module
router.patch(
  '/current/modules',
  requireAuth,
  requireWorkspace,
  requireAccess(MODULES.WORKSPACE_SETTINGS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        moduleKey: z.string().min(1).max(60),
        enabled: z.boolean(),
      });
      const input = schema.parse(req.body);
      const catalogEntry = MODULE_CATALOG.find((m) => m.key === input.moduleKey);
      if (!catalogEntry) throw HttpError.badRequest('Nieznany moduł', 'unknown_module');
      const ws = await prisma.workspace.findUnique({
        where: { id: req.workspaceId! },
        select: { plan: true },
      });
      if (!ws) throw HttpError.notFound('Workspace not found');
      const currentTier = PLAN_ORDER[ws.plan as PlanKey] ?? 0;
      if (input.enabled && PLAN_ORDER[catalogEntry.plan] > currentTier) {
        throw HttpError.badRequest(
          `Moduł wymaga planu ${catalogEntry.plan}`,
          'plan_upgrade_required',
        );
      }
      const row = await prisma.workspaceModule.upsert({
        where: {
          workspaceId_moduleKey: { workspaceId: req.workspaceId!, moduleKey: input.moduleKey },
        },
        create: {
          workspaceId: req.workspaceId!,
          moduleKey: input.moduleKey,
          enabled: input.enabled,
          requiredPlan: catalogEntry.plan,
        },
        update: { enabled: input.enabled, requiredPlan: catalogEntry.plan },
      });
      res.json({ module: row });
    } catch (err) { next(err); }
  },
);

// GET /workspaces/current/costs — monthly cost breakdown (AI, storage, backup) + 6mo trend
router.get('/current/costs', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // --- AI cost this month ---
    const aiThisMonth = await prisma.llmUsage.aggregate({
      where: { workspaceId, createdAt: { gte: thisMonthStart } },
      _sum: { costPln: true },
      _count: true,
    });

    // --- Storage cost: estimate from downloads files (Dysk) ---
    // Flat estimate: 0.50 PLN per 1 GB stored per month.
    const STORAGE_PLN_PER_GB = 0.5;
    const BACKUP_PLN_FLAT = 0; // TODO: integrate with backup jobs once metered

    // Try to estimate from DownloadFile table (may not exist — wrap in try/catch).
    let storageBytes = 0;
    try {
      const storageAgg = await (prisma as unknown as {
        downloadFile: { aggregate: (args: unknown) => Promise<{ _sum: { sizeBytes: bigint | null } }> };
      }).downloadFile.aggregate({
        where: { workspaceId },
        _sum: { sizeBytes: true },
      });
      storageBytes = Number(storageAgg._sum.sizeBytes ?? 0);
    } catch {
      storageBytes = 0;
    }
    const storageGb = storageBytes / (1024 * 1024 * 1024);
    const storagePln = storageGb * STORAGE_PLN_PER_GB;

    const aiPln = Number(aiThisMonth._sum.costPln ?? 0);
    const totalPln = aiPln + storagePln + BACKUP_PLN_FLAT;

    // --- 6 months trend: AI cost per month ---
    const trend: Array<{ month: string; ai: number; storage: number; backup: number; total: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      const monthAi = await prisma.llmUsage.aggregate({
        where: { workspaceId, createdAt: { gte: start, lt: end } },
        _sum: { costPln: true },
      });
      const ai = Number(monthAi._sum.costPln ?? 0);
      // Storage/backup are not historical — use current estimate for current month, 0 otherwise.
      const monthStorage = i === 0 ? storagePln : 0;
      const monthBackup = i === 0 ? BACKUP_PLN_FLAT : 0;
      trend.push({
        month: start.toISOString().slice(0, 7),
        ai: Math.round(ai * 100) / 100,
        storage: Math.round(monthStorage * 100) / 100,
        backup: Math.round(monthBackup * 100) / 100,
        total: Math.round((ai + monthStorage + monthBackup) * 100) / 100,
      });
    }

    res.json({
      month: thisMonthStart.toISOString().slice(0, 7),
      breakdown: {
        ai: { costPln: Math.round(aiPln * 100) / 100, calls: aiThisMonth._count },
        storage: { costPln: Math.round(storagePln * 100) / 100, bytes: storageBytes, gb: Math.round(storageGb * 100) / 100 },
        backup: { costPln: BACKUP_PLN_FLAT },
      },
      totalPln: Math.round(totalPln * 100) / 100,
      trend,
    });
  } catch (err) { next(err); }
});

// GET /workspaces/current/invoices — payment history (placeholder until Stripe integration)
router.get('/current/invoices', requireAuth, requireWorkspace, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: wire to Stripe / internal Invoice model once billing integration lands (Sprint 6).
    res.json({ invoices: [] });
  } catch (err) { next(err); }
});

export default router;

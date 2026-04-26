/**
 * /api/v2/storage — VPS disk dashboard, per-workspace usage, quota management.
 *
 * Permissions: super-admin OR MSP/INTERNAL_IT workspace owner.
 * For super-admin: shows ALL workspaces.
 * For MSP owner: shows their workspace + related CLIENT workspaces (via WorkspaceRelation).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { prismaBg } from '../../lib/prisma-bg';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { HttpError } from '../../utils/httpError';

const execAsync = promisify(exec);

const router = Router();
router.use(requireAuth, requireWorkspace);

// Permission gate: super-admin OR (workspace type MSP/INTERNAL_IT AND user is OWNER).
async function requireStorageAdmin(req: Request): Promise<{ isSuperAdmin: boolean }> {
  if (req.auth?.isSuperAdmin) return { isSuperAdmin: true };

  const ms = await prismaBg.membership.findFirst({
    where: {
      userId: req.auth!.sub,
      workspaceId: req.workspaceId!,
      status: 'ACTIVE',
      role: 'OWNER',
    },
    select: { id: true, workspace: { select: { type: true } } },
  });
  if (!ms) throw HttpError.forbidden('Storage management requires OWNER role or super-admin');
  if (ms.workspace.type !== 'MSP' && ms.workspace.type !== 'INTERNAL_IT') {
    throw HttpError.forbidden('Only MSP/INTERNAL_IT owners or super-admins can access storage');
  }
  return { isSuperAdmin: false };
}

// Compute disk usage for a single workspace: Dysk files + completed Backup history.
async function computeWorkspaceUsage(workspaceId: string): Promise<{
  dyskBytes: bigint;
  backupBytes: bigint;
  total: bigint;
}> {
  const [dyskAgg, backupAgg] = await Promise.all([
    prismaBg.downloadFile.aggregate({
      where: { workspaceId, deletedAt: null },
      _sum: { sizeBytes: true },
    }),
    prismaBg.backupHistory.aggregate({
      where: {
        config: { workspaceId },
        status: 'SUCCESS',
      },
      _sum: { sizeBytes: true },
    }),
  ]);
  const dyskBytes = dyskAgg._sum?.sizeBytes ?? BigInt(0);
  const backupBytes = backupAgg._sum?.sizeBytes ?? BigInt(0);
  return { dyskBytes, backupBytes, total: dyskBytes + backupBytes };
}

// Get list of workspaces visible to the caller.
async function visibleWorkspaceIds(req: Request, isSuperAdmin: boolean): Promise<string[]> {
  if (isSuperAdmin) {
    const all = await prismaBg.workspace.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    return all.map((w) => w.id);
  }
  // MSP/INTERNAL_IT owner: own workspace + related CLIENT workspaces.
  const rels = await prismaBg.workspaceRelation.findMany({
    where: { providerWorkspaceId: req.workspaceId!, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });
  return [req.workspaceId!, ...rels.map((r) => r.clientWorkspaceId)];
}

// ── GET /storage/overview — VPS df + summary ───────────────────────────────
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isSuperAdmin } = await requireStorageAdmin(req);

    let vps: { totalBytes: number; usedBytes: number; freeBytes: number; usedPct: number } | null = null;
    if (isSuperAdmin) {
      try {
        // df --output for stable parsing
        const { stdout } = await execAsync('df --output=size,used,avail,pcent /var/www -B1 | tail -1');
        const parts = stdout.trim().split(/\s+/);
        const totalBytes = parseInt(parts[0] ?? '0', 10);
        const usedBytes = parseInt(parts[1] ?? '0', 10);
        const freeBytes = parseInt(parts[2] ?? '0', 10);
        const usedPct = parseInt((parts[3] ?? '0').replace('%', ''), 10);
        vps = { totalBytes, usedBytes, freeBytes, usedPct };
      } catch (e) {
        // df not available on this host; leave vps=null
      }
    }

    const wsIds = await visibleWorkspaceIds(req, isSuperAdmin);
    const allUsages = await Promise.all(wsIds.map(async (id) => ({
      id, usage: await computeWorkspaceUsage(id),
    })));
    const totalDysk = allUsages.reduce((s, u) => s + u.usage.dyskBytes, BigInt(0));
    const totalBackup = allUsages.reduce((s, u) => s + u.usage.backupBytes, BigInt(0));

    res.json({
      vps,
      summary: {
        workspaceCount: wsIds.length,
        dyskBytes: totalDysk.toString(),
        backupBytes: totalBackup.toString(),
        totalBytes: (totalDysk + totalBackup).toString(),
      },
    });
  } catch (err) { next(err); }
});

// ── GET /storage/workspaces — list with usage + quota ──────────────────────
router.get('/workspaces', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isSuperAdmin } = await requireStorageAdmin(req);
    const wsIds = await visibleWorkspaceIds(req, isSuperAdmin);

    const workspaces = await prismaBg.workspace.findMany({
      where: { id: { in: wsIds }, deletedAt: null },
      select: {
        id: true, name: true, type: true, isActive: true,
        storageQuotaBytes: true, plan: true, createdAt: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const items = await Promise.all(workspaces.map(async (w) => {
      const usage = await computeWorkspaceUsage(w.id);
      const quotaBytes = w.storageQuotaBytes ? w.storageQuotaBytes.toString() : null;
      const usedBytes = usage.total.toString();
      const usedPct = w.storageQuotaBytes && w.storageQuotaBytes > BigInt(0)
        ? Number((usage.total * BigInt(10000)) / w.storageQuotaBytes) / 100
        : null;
      return {
        id: w.id,
        name: w.name,
        type: w.type,
        plan: w.plan,
        isActive: w.isActive,
        quotaBytes,
        usedBytes,
        dyskBytes: usage.dyskBytes.toString(),
        backupBytes: usage.backupBytes.toString(),
        usedPct,
      };
    }));

    res.json({ workspaces: items });
  } catch (err) { next(err); }
});

// ── PUT /storage/workspaces/:id/quota — super-admin only ───────────────────
const quotaSchema = z.object({
  quotaBytes: z.number().int().min(0).max(100 * 1024 ** 4).nullable(),
});

router.put('/workspaces/:id/quota', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.auth?.isSuperAdmin) {
      throw HttpError.forbidden('Only super-admin can change storage quotas');
    }
    const { quotaBytes } = quotaSchema.parse(req.body);
    const id = String(req.params.id);

    const updated = await prisma.workspace.update({
      where: { id },
      data: { storageQuotaBytes: quotaBytes === null ? null : BigInt(quotaBytes) },
      select: { id: true, name: true, type: true, storageQuotaBytes: true },
    });
    res.json({
      id: updated.id, name: updated.name, type: updated.type,
      quotaBytes: updated.storageQuotaBytes ? updated.storageQuotaBytes.toString() : null,
    });
  } catch (err) { next(err); }
});

export default router;

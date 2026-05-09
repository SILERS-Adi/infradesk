import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { prismaBg } from '../../lib/prisma-bg';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { enforceStorageLimit } from '../../utils/planLimits';
import { logActivity, reqContext } from '../activity-logs/logActivity';

// Downloads Center — MSP uploads installers/manuals/tools, serwisanci+clients DL.

const router = Router();

const STORAGE_DIR = process.env.DOWNLOADS_DIR ?? '/var/www/infradesk-v2/downloads';
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const ALLOWED_EXT = new Set([
  '.exe', '.msi', '.zip', '.apk', '.pdf', '.docx', '.xlsx', '.pptx',
  '.doc', '.xls', '.ppt', '.txt', '.log', '.jpg', '.jpeg', '.png',
  '.gif', '.webp', '.svg', '.tar', '.gz', '.7z', '.dmg', '.iso',
  '.csv', '.json', '.xml', '.ps1', '.bat', '.sh',
]);

async function ensureStorage(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

function safeExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return ext.replace(/[/\\]/g, '');
}

function sanitizeDisplayName(name: string): string {
  return name.replace(/[/\\\x00-\x1F]/g, '').trim().slice(0, 200);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = safeExt(file.originalname);
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new HttpError(400, 'unsupported_type', `File type not allowed: ${ext || '(none)'}`));
    }
    cb(null, true);
  },
});

router.use(requireAuth, requireWorkspace);

async function resolveOwnerWorkspace(clientWorkspaceId: string): Promise<{
  ownerId: string;
  isClient: boolean;
}> {
  // Use prismaBg (RLS bypass) — auth middleware already verified that this user
  // owns the workspaceId; RLS context can be dropped by multer streaming for
  // large uploads, causing the same workspace lookup to return null.
  const ws = await prismaBg.workspace.findUnique({
    where: { id: clientWorkspaceId },
    select: { id: true, type: true },
  });
  if (!ws) throw HttpError.forbidden('Workspace not found');
  if (ws.type === 'CLIENT') {
    const rel = await prismaBg.workspaceRelation.findFirst({
      where: { clientWorkspaceId: ws.id, status: 'ACTIVE' },
      select: { providerWorkspaceId: true },
    });
    if (!rel) return { ownerId: ws.id, isClient: true };
    return { ownerId: rel.providerWorkspaceId, isClient: true };
  }
  return { ownerId: ws.id, isClient: false };
}

const listQuery = z.object({
  category: z.string().min(1).max(80).optional(),
  visibility: z.enum(['INTERNAL', 'CLIENT', 'PUBLIC']).optional(),
  search: z.string().min(1).max(120).optional(),
});

router.get(
  '/',
  requireAccess(MODULES.DOWNLOADS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, visibility, search } = listQuery.parse(req.query);
      const { ownerId, isClient } = await resolveOwnerWorkspace(req.workspaceId!);

      const allowedVis: Array<'INTERNAL' | 'CLIENT' | 'PUBLIC'> = isClient
        ? ['CLIENT', 'PUBLIC']
        : ['INTERNAL', 'CLIENT', 'PUBLIC'];

      const where: Record<string, unknown> = {
        workspaceId: ownerId,
        deletedAt: null,
        visibility: visibility && allowedVis.includes(visibility)
          ? visibility
          : { in: allowedVis },
      };
      if (category) where.category = category;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { fileName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Per-client targeting for CLIENT workspaces: they see CLIENT files that
      // either target everyone (empty array) or target them specifically.
      // PUBLIC is unaffected. INTERNAL is excluded by allowedVis above.
      if (isClient) {
        const clientWsId = req.workspaceId!;
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
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      const categories = await prisma.downloadFile.groupBy({
        by: ['category'],
        where: { workspaceId: ownerId, deletedAt: null, visibility: { in: allowedVis } },
        _count: { _all: true },
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
          targetClientWorkspaceIds: f.targetClientWorkspaceIds,
          downloadCount: f.downloadCount,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          uploadedBy: f.uploadedBy,
        })),
        categories: categories.map((c) => ({ category: c.category, count: c._count._all })),
        readOnly: isClient,
      });
    } catch (err) {
      next(err);
    }
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().min(1).max(80),
  visibility: z.enum(['INTERNAL', 'CLIENT', 'PUBLIC']).default('INTERNAL'),
  // Accept JSON-string (multipart/form-data) or array. Items validated as uuid below.
  targetClientWorkspaceIds: z
    .union([z.array(z.string().uuid()).max(500), z.string()])
    .optional(),
});

function parseTargetIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const j = JSON.parse(trimmed);
        if (Array.isArray(j)) return j.filter((x): x is string => typeof x === 'string' && x.length > 0);
      } catch { /* fall through */ }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function validateTargetIds(providerWorkspaceId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = Array.from(new Set(ids));
  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId, clientWorkspaceId: { in: unique } },
    select: { clientWorkspaceId: true },
  });
  const found = new Set(relations.map((r) => r.clientWorkspaceId));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw HttpError.badRequest(
      `Unknown target client workspace IDs: ${missing.join(', ')}`,
      'invalid_target_clients',
    );
  }
}

router.post(
  '/',
  requireAccess(MODULES.DOWNLOADS, 'edit'),
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(HttpError.badRequest(`File exceeds ${Math.floor(MAX_BYTES / 1_048_576)}MB limit`, 'file_too_large'));
        }
        return next(HttpError.badRequest(err.message, 'upload_error'));
      }
      return next(err);
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerId, isClient } = await resolveOwnerWorkspace(req.workspaceId!);
      if (isClient) throw HttpError.forbidden('Clients cannot upload downloads');

      const file = req.file;
      if (!file) throw HttpError.badRequest('Missing file (field name: "file")', 'no_file');

      // Storage quota: plan-driven limit (Workspace.storageQuotaBytes nadpisuje jako manual override).
      const used = await prismaBg.downloadFile.aggregate({
        where: { workspaceId: ownerId, deletedAt: null },
        _sum: { sizeBytes: true },
      });
      const backupUsed = await prismaBg.backupHistory.aggregate({
        where: { config: { workspaceId: ownerId }, status: 'SUCCESS' },
        _sum: { sizeBytes: true },
      });
      const usedBytes = (used._sum?.sizeBytes ?? BigInt(0)) + (backupUsed._sum?.sizeBytes ?? BigInt(0));
      await enforceStorageLimit(ownerId, usedBytes, BigInt(file.size));

      const input = createSchema.parse({ ...req.body });

      const targetIds = parseTargetIds(input.targetClientWorkspaceIds);
      // Meaningful only for CLIENT; ignore silently for INTERNAL/PUBLIC.
      const effectiveTargetIds = input.visibility === 'CLIENT' ? targetIds : [];
      if (effectiveTargetIds.length > 0) {
        await validateTargetIds(ownerId, effectiveTargetIds);
      }

      const originalName = sanitizeDisplayName(file.originalname) || 'file';
      const ext = safeExt(originalName);
      if (!ALLOWED_EXT.has(ext)) {
        throw HttpError.badRequest(`File type not allowed: ${ext || '(none)'}`, 'unsupported_type');
      }
      const storedName = `${crypto.randomUUID()}${ext}`;
      const displayName = sanitizeDisplayName(input.name ?? originalName) || originalName;

      await ensureStorage();
      const fullPath = path.join(STORAGE_DIR, storedName);
      await fs.writeFile(fullPath, file.buffer);

      const created = await prismaBg.downloadFile.create({
        data: {
          workspaceId: ownerId,
          category: input.category.trim(),
          name: displayName,
          description: input.description?.toString().trim() || null,
          fileName: originalName,
          storedName,
          mimeType: file.mimetype || null,
          sizeBytes: BigInt(file.size),
          visibility: input.visibility,
          targetClientWorkspaceIds: effectiveTargetIds,
          uploadedByUserId: req.auth!.sub,
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      const ctx = reqContext(req);
      void logActivity({
        workspaceId: ownerId,
        entityType: 'download_file',
        entityId: created.id,
        actionType: 'uploaded',
        description: `Uploaded file "${created.name}" (${created.category}, ${Number(created.sizeBytes)} bytes)`,
        performedByUserId: req.auth!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      res.status(201).json({
        file: {
          id: created.id,
          category: created.category,
          name: created.name,
          description: created.description,
          fileName: created.fileName,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes.toString(),
          visibility: created.visibility,
          targetClientWorkspaceIds: created.targetClientWorkspaceIds,
          downloadCount: created.downloadCount,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          uploadedBy: created.uploadedBy,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/file',
  requireAccess(MODULES.DOWNLOADS, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerId, isClient } = await resolveOwnerWorkspace(req.workspaceId!);
      const allowedVis = isClient
        ? ['CLIENT', 'PUBLIC']
        : ['INTERNAL', 'CLIENT', 'PUBLIC'];

      const fileWhere: Record<string, unknown> = {
        id: String(req.params.id),
        workspaceId: ownerId,
        deletedAt: null,
        visibility: { in: allowedVis as never },
      };
      if (isClient) {
        const clientWsId = req.workspaceId!;
        fileWhere.OR = [
          { visibility: 'PUBLIC' as never },
          {
            visibility: 'CLIENT' as never,
            OR: [
              { targetClientWorkspaceIds: { isEmpty: true } },
              { targetClientWorkspaceIds: { has: clientWsId } },
            ],
          },
        ];
      }

      const file = await prisma.downloadFile.findFirst({ where: fileWhere });
      if (!file) throw HttpError.notFound('File not found');

      const fullPath = path.join(STORAGE_DIR, file.storedName);
      try {
        await fs.access(fullPath);
      } catch {
        throw HttpError.notFound('File missing on disk');
      }

      prisma.downloadFile.update({
        where: { id: file.id },
        data: { downloadCount: { increment: 1 } },
      }).catch(() => { /* swallow */ });

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', file.sizeBytes.toString());
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      );
      res.setHeader('Cache-Control', 'private, no-cache');

      const { createReadStream } = await import('node:fs');
      const stream = createReadStream(fullPath);
      stream.on('error', (e) => next(e));
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1).max(80).optional(),
  visibility: z.enum(['INTERNAL', 'CLIENT', 'PUBLIC']).optional(),
  targetClientWorkspaceIds: z.array(z.string().uuid()).max(500).optional(),
});

router.patch(
  '/:id',
  requireAccess(MODULES.DOWNLOADS, 'edit'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerId, isClient } = await resolveOwnerWorkspace(req.workspaceId!);
      if (isClient) throw HttpError.forbidden('Clients cannot edit downloads');
      const input = patchSchema.parse(req.body);

      const existing = await prisma.downloadFile.findFirst({
        where: { id: String(req.params.id), workspaceId: ownerId, deletedAt: null },
      });
      if (!existing) throw HttpError.notFound('File not found');

      // Decide next state for targetClientWorkspaceIds:
      // - if caller sent the field, honor it (but clear unless resulting visibility is CLIENT)
      // - if caller changes visibility away from CLIENT, force clear stale target list
      // - otherwise leave untouched
      const nextVisibility = input.visibility ?? existing.visibility;
      let nextTargetIds: string[] | undefined;
      if (input.targetClientWorkspaceIds !== undefined) {
        nextTargetIds = nextVisibility === 'CLIENT' ? input.targetClientWorkspaceIds : [];
      } else if (input.visibility !== undefined && input.visibility !== 'CLIENT') {
        nextTargetIds = [];
      }
      if (nextTargetIds && nextTargetIds.length > 0) {
        await validateTargetIds(ownerId, nextTargetIds);
      }

      const updated = await prisma.downloadFile.update({
        where: { id: existing.id },
        data: {
          name: input.name !== undefined ? sanitizeDisplayName(input.name) : undefined,
          description:
            input.description === null
              ? null
              : input.description !== undefined
                ? input.description.toString().trim() || null
                : undefined,
          category: input.category !== undefined ? input.category.trim() : undefined,
          visibility: input.visibility,
          targetClientWorkspaceIds: nextTargetIds,
        },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      const ctx = reqContext(req);
      void logActivity({
        workspaceId: ownerId,
        entityType: 'download_file',
        entityId: updated.id,
        actionType: 'updated',
        description: `Updated file "${updated.name}"`,
        performedByUserId: req.auth!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      res.json({
        file: {
          id: updated.id,
          category: updated.category,
          name: updated.name,
          description: updated.description,
          fileName: updated.fileName,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes.toString(),
          visibility: updated.visibility,
          targetClientWorkspaceIds: updated.targetClientWorkspaceIds,
          downloadCount: updated.downloadCount,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          uploadedBy: updated.uploadedBy,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireAccess(MODULES.DOWNLOADS, 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerId, isClient } = await resolveOwnerWorkspace(req.workspaceId!);
      if (isClient) throw HttpError.forbidden('Clients cannot delete downloads');

      const existing = await prisma.downloadFile.findFirst({
        where: { id: String(req.params.id), workspaceId: ownerId, deletedAt: null },
      });
      if (!existing) throw HttpError.notFound('File not found');

      await prisma.downloadFile.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      const ctx = reqContext(req);
      void logActivity({
        workspaceId: ownerId,
        entityType: 'download_file',
        entityId: existing.id,
        actionType: 'deleted',
        description: `Deleted file "${existing.name}"`,
        performedByUserId: req.auth!.sub,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

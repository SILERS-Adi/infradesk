import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const IS_PROD = process.env.NODE_ENV === 'production';
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '200', 10);

const prisma = global.__prisma ?? new PrismaClient({
  log: IS_PROD
    ? [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }]
    : [{ emit: 'event', level: 'query' }, { emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }],
  // Connection pool: Prisma default is 5 connections (num_physical_cpus * 2 + 1).
  // For VPS: set via DATABASE_URL?connection_limit=10&pool_timeout=10
});

// Slow query detection (production)
if (IS_PROD) {
  // @ts-ignore — Prisma event types
  prisma.$on('query' as any, (e: any) => {
    if (e.duration > SLOW_QUERY_MS) {
      console.warn('[SLOW QUERY]', JSON.stringify({
        duration: e.duration,
        query: e.query?.slice(0, 200),
        params: e.params?.slice(0, 100),
      }));
    }
  });
}

// Log all errors
// @ts-ignore
prisma.$on('error' as any, (e: any) => {
  console.error('[DB ERROR]', e.message);
});

// ── Soft delete middleware ──────────────────────────────────────────
// Auto-filter deletedAt: null on findMany/findFirst for models with soft delete.
// To include deleted records, pass { where: { deletedAt: { not: null } } } explicitly.
const SOFT_DELETE_MODELS = new Set(['Device', 'Location', 'Ticket']);

prisma.$use(async (params, next) => {
  if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) return next(params);

  // findMany / findFirst — auto-exclude soft-deleted
  if (params.action === 'findMany' || params.action === 'findFirst') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    // Only add filter if deletedAt is not explicitly queried
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }

  // count — auto-exclude soft-deleted
  if (params.action === 'count') {
    if (!params.args) params.args = {};
    if (!params.args.where) params.args.where = {};
    if (params.args.where.deletedAt === undefined) {
      params.args.where.deletedAt = null;
    }
  }

  // delete → soft delete (update deletedAt instead of real delete)
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }

  // deleteMany → soft deleteMany
  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (!params.args) params.args = {};
    params.args.data = { deletedAt: new Date() };
  }

  return next(params);
});

if (!IS_PROD) {
  global.__prisma = prisma;
}

export default prisma;

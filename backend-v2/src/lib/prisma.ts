import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { getCurrentRequestContext } from './requestContext';

/**
 * Regular Prisma client — for HTTP request handlers running after requireAuth + requireWorkspace.
 *
 * RLS STRATEGY D (see scripts/rls-poc-v3.ts for the design POC):
 *   Every query is transparently wrapped in an interactive transaction. The wrapper
 *   sets three session vars via SELECT set_config(...) with the `is_local=true` flag,
 *   which behaves exactly like SET LOCAL — scoped to the current transaction.
 *   Then the operation is RE-INVOKED on the transaction client (tx), guaranteeing
 *   that the data query runs on the same physical connection as SET LOCAL.
 *
 * WHY re-invoke and not `query(args)`:
 *   Prisma's `query(args)` callback in a `$extends({ query })` hook is bound to the
 *   BASE client, not to any tx. Calling `query(args)` inside `base.$transaction`
 *   executes the query on a different connection (from the pool), so SET LOCAL
 *   that was set on the tx connection is not visible. POC v2 confirmed this failure.
 *
 * WHEN context is absent (`ctx === null`):
 *   We pass-through without a wrapper tx. This happens for:
 *     - startup / shutdown calls
 *     - any caller that didn't go through requireAuth (public routes, agent-compat,
 *       cron jobs — they MUST use prismaBg instead)
 *   After Etap 5 (NOBYPASSRLS), a pass-through query on a workspace-scoped table
 *   will return zero rows because RLS policies match on NULL workspace context.
 *   This is a safety by default — missing context == no data.
 *
 * DO NOT use this client for background jobs or pre-auth lookups. Use prismaBg.
 */
const base = new PrismaClient({
  log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

export const prisma = base.$extends({
  query: {
    $allOperations: async ({ args, query, operation, model }) => {
      const ctx = getCurrentRequestContext();
      if (!ctx) return query(args);

      return base.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true)`,
          'app.current_workspace', ctx.workspaceId ?? '',
          'app.current_user', ctx.userId,
          'app.is_super_admin', ctx.isSuperAdmin ? '1' : '0',
        );

        // Re-invoke operation on the tx client (same connection as SET LOCAL).
        // Model method (e.g. user.findFirst, ticket.update, etc.)
        if (model && (tx as never as Record<string, Record<string, (a: unknown) => unknown>>)[model]?.[operation]) {
          return (tx as never as Record<string, Record<string, (a: unknown) => unknown>>)[model][operation](args);
        }

        // Non-model ops: $queryRaw, $queryRawUnsafe, $executeRaw, $executeRawUnsafe, $transaction.
        const txAny = tx as never as Record<string, (...a: unknown[]) => unknown>;
        if (typeof txAny[operation] === 'function') {
          // Tagged-template raw: args is a single array (template strings + values).
          if (operation === '$queryRaw' || operation === '$executeRaw') {
            return txAny[operation](args);
          }
          // $queryRawUnsafe / $executeRawUnsafe: args is [sql, ...params].
          if (Array.isArray(args)) return txAny[operation](...args);
          // $transaction(callback) or other single-arg ops.
          return txAny[operation](args);
        }

        // Defensive fallback — no path matched. Log and pass through on base.
        return query(args);
      });
    },
  },
});

process.on('beforeExit', async () => {
  await base.$disconnect();
});

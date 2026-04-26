import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request RLS context.
 *
 * Written by: requireAuth middleware (initializes), requireWorkspace middleware (fills workspaceId).
 * Read by:    src/lib/prisma.ts extension ($allOperations hook) to set Postgres session vars
 *             via SET LOCAL in a wrapper transaction (Strategy D — see scripts/rls-poc-v3.ts).
 *
 * Mutable box pattern: we run() a box once (in requireAuth) and then requireWorkspace
 * mutates box.current.workspaceId rather than calling run() again. This keeps the same
 * AsyncLocalStorage frame so downstream Prisma extension sees the updated workspaceId.
 *
 * If store is missing (e.g. public route, startup, background timer) Prisma extension
 * falls back to pass-through — no SET LOCAL, no wrapper tx. Those flows MUST use prismaBg.
 */
export interface RlsContext {
  userId: string;
  workspaceId: string | null;
  isSuperAdmin: boolean;
}

interface ContextBox {
  current: RlsContext;
}

export const requestContextStore = new AsyncLocalStorage<ContextBox>();

export function getCurrentRequestContext(): RlsContext | null {
  return requestContextStore.getStore()?.current ?? null;
}

/**
 * Call from requireWorkspace after req.workspaceId is resolved.
 * Silently no-op if no context is active (route was not under requireAuth).
 */
export function updateWorkspaceInContext(workspaceId: string): void {
  const box = requestContextStore.getStore();
  if (box) box.current.workspaceId = workspaceId;
}

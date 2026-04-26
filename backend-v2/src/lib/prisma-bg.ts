import { PrismaClient } from "@prisma/client";
import { config } from "../config";

/**
 * Background / system Prisma client.
 *
 * Uses DATABASE_URL_BG (user `infradesk_v2_bg`, BYPASSRLS=true).
 *
 * WHEN to use `prismaBg`:
 *   - Startup (connect/disconnect), cron jobs, schedulers
 *   - Pre-authentication middleware (resolveWorkspaceFromHost)
 *   - WebSocket agent lookups (agent-token auth, no JWT)
 *   - Public routes without user context (/api/v2/public/*)
 *   - Agent-compat endpoints (V1 token auth)
 *   - Auth login / OIDC flows that run BEFORE workspace is known
 *   - IMAP sync (cross-workspace cron)
 *
 * WHEN to use regular `prisma` (./prisma.ts):
 *   - Every HTTP handler after requireAuth + requireWorkspace
 *   - Every service layer called from such handlers
 *   - Anything that must respect workspace isolation via RLS
 *
 * Rule of thumb: if you do not have req.auth + req.workspaceId, use prismaBg.
 */
export const prismaBg = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_BG! } },
  log: config.isProduction ? ["warn", "error"] : ["warn", "error"],
});

process.on("beforeExit", async () => {
  await prismaBg.$disconnect();
});

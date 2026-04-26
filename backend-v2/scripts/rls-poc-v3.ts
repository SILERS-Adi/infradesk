/**
 * POC v3: Strategy D — extension wraps in $transaction AND re-invokes operation on tx.
 * Goal: SET LOCAL visible to the actual data query.
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const base = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_BG! } },
});

// Simulated request context (in real app: AsyncLocalStorage)
let fakeContext: { userId: string; workspaceId: string | null; isSuperAdmin: boolean } | null = null;

const stratD = base.$extends({
  query: {
    $allOperations: async ({ args, query, operation, model }: any) => {
      const ctx = fakeContext;
      if (!ctx) return query(args);

      return (base as any).$transaction(async (tx: any) => {
        // Set RLS context on THIS transaction connection
        await tx.$executeRawUnsafe(
          "SELECT set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true)",
          "app.current_workspace", ctx.workspaceId ?? "",
          "app.current_user", ctx.userId,
          "app.is_super_admin", ctx.isSuperAdmin ? "1" : "0",
        );

        // Re-invoke operation on tx — goes through same connection as SET LOCAL
        if (model && tx[model]?.[operation]) {
          return tx[model][operation](args);
        }
        // Non-model ops: $queryRaw, $queryRawUnsafe, $executeRaw, $executeRawUnsafe
        if (typeof tx[operation] === "function") {
          // $queryRaw/$executeRaw get tagged template (array); Unsafe gets (sql, ...params)
          if (operation === "$queryRaw" || operation === "$executeRaw") {
            return tx[operation](args);
          }
          if (Array.isArray(args)) return tx[operation](...args);
          return tx[operation](args);
        }
        // Should not happen; fallback
        return query(args);
      });
    },
  },
});

async function main(): Promise<void> {
  console.log("========== TEST 14: Strategy D — query sees SET LOCAL ==========");
  fakeContext = { userId: "test-user", workspaceId: "test-ws-strategy-d", isSuperAdmin: false };
  const r14: Array<{ v: string | null }> = await (stratD as any).$queryRawUnsafe(
    "SELECT current_setting('app.current_workspace', true) AS v"
  );
  console.log(`Strategy D result: ${JSON.stringify(r14[0])}`);
  console.log(`  Expected: {"v":"test-ws-strategy-d"} → context visible via $queryRawUnsafe`);
  console.log(`  Observed: ${r14[0].v === "test-ws-strategy-d" ? "WORKS ✅" : "BROKEN ❌"}`);

  console.log("\n========== TEST 15: Strategy D — model query sees context ==========");
  // Model queries use Prisma-generated SQL which we cannot directly introspect for set_config.
  // Indirect verification: count queries execute without error.
  fakeContext = { userId: "test-user", workspaceId: "test-ws-d-2", isSuperAdmin: false };
  const c: number = await (stratD as any).user.count();
  console.log(`user.count via Strategy D: ${c}`);
  console.log(`  If no error and count > 0 → operation dispatched to tx correctly`);

  console.log("\n========== TEST 16: Strategy D — $transaction callback context propagation ==========");
  fakeContext = { userId: "test-user", workspaceId: "test-ws-d-3", isSuperAdmin: false };
  try {
    const r16 = await (stratD as any).$transaction(async (tx: any) => {
      // The extension wrapped this $transaction call. Inside: user gets inner tx.
      // user calls tx.$queryRawUnsafe — does THIS go through extension again?
      const r: Array<{ v: string | null }> = await tx.$queryRawUnsafe(
        "SELECT current_setting('app.current_workspace', true) AS v"
      );
      return r[0];
    });
    console.log(`Nested tx inner context: ${JSON.stringify(r16)}`);
    console.log(`  Expected: {"v":"test-ws-d-3"} (outer SET LOCAL visible to inner ops)`);
    console.log(`  Observed: ${(r16 as any).v === "test-ws-d-3" ? "WORKS ✅" : "BROKEN ❌"}`);
  } catch (err: any) {
    console.log(`TEST 16 FAILED with error: ${err.message}`);
  }

  console.log("\n========== TEST 17: No context → pass-through (no wrapper tx) ==========");
  fakeContext = null;
  const r17: Array<{ n: number }> = await (stratD as any).$queryRawUnsafe("SELECT 1 AS n");
  console.log(`Pass-through result: ${JSON.stringify(r17[0])}`);
  console.log(`  Expected: {"n":1} (operation completes without context)`);
}

main()
  .catch((err) => { console.error("[POC v3 FATAL]", err); process.exit(1); })
  .finally(async () => { await base.$disconnect(); });

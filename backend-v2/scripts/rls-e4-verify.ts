/**
 * Etap 4 verify: runtime test of request context + prisma extension.
 * Uses the ACTUAL production prisma.ts (not a mock).
 */
import { prisma } from '../src/lib/prisma';
import { requestContextStore } from '../src/lib/requestContext';

async function test(): Promise<void> {
  console.log('========== TEST A: no context → pass-through ==========');
  const rA: Array<{ v: string | null }> = await (prisma as never as { $queryRawUnsafe: (s: string) => Promise<unknown> }).$queryRawUnsafe(
    "SELECT current_setting('app.current_workspace', true) AS v"
  ) as Array<{ v: string | null }>;
  console.log(`No ctx: ${JSON.stringify(rA[0])}`);
  console.log(`  Expected: {"v":""}  (no wrapper tx, no SET LOCAL)`);

  console.log('\n========== TEST B: context set → SET LOCAL visible ==========');
  const rB: unknown = await requestContextStore.run(
    { current: { userId: 'verify-user', workspaceId: 'verify-ws-B', isSuperAdmin: false } },
    async () => {
      return (prisma as never as { $queryRawUnsafe: (s: string) => Promise<unknown> }).$queryRawUnsafe(
        "SELECT current_setting('app.current_workspace', true) AS ws, current_setting('app.current_user', true) AS u, current_setting('app.is_super_admin', true) AS sa"
      );
    }
  );
  console.log(`With ctx: ${JSON.stringify((rB as Array<unknown>)[0])}`);
  console.log(`  Expected: {"ws":"verify-ws-B","u":"verify-user","sa":"0"}`);

  console.log('\n========== TEST C: model query with context ==========');
  const rC: number = await requestContextStore.run(
    { current: { userId: 'verify-user', workspaceId: 'verify-ws-C', isSuperAdmin: false } },
    async () => {
      return (prisma as never as { user: { count: () => Promise<number> } }).user.count();
    }
  );
  console.log(`user.count via extension: ${rC}`);
  console.log(`  Expected: 26  (BYPASSRLS — user sees all rows)`);

  console.log('\n========== TEST D: $transaction callback with context ==========');
  const rD: unknown = await requestContextStore.run(
    { current: { userId: 'verify-user', workspaceId: 'verify-ws-D', isSuperAdmin: false } },
    async () => {
      return (prisma as never as { $transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction(
        async (tx: unknown) => {
          const rows = await (tx as { $queryRawUnsafe: (s: string) => Promise<unknown> }).$queryRawUnsafe(
            "SELECT current_setting('app.current_workspace', true) AS ws"
          );
          return (rows as Array<unknown>)[0];
        }
      );
    }
  );
  console.log(`Tx callback ctx: ${JSON.stringify(rD)}`);
  console.log(`  Expected: {"ws":"verify-ws-D"}`);

  console.log('\n========== TEST E: $transaction batch with context ==========');
  const rE: unknown = await requestContextStore.run(
    { current: { userId: 'verify-user', workspaceId: 'verify-ws-E', isSuperAdmin: false } },
    async () => {
      return (prisma as never as { $transaction: (queries: unknown[]) => Promise<unknown[]> }).$transaction([
        (prisma as never as { $queryRawUnsafe: (s: string) => unknown }).$queryRawUnsafe(
          "SELECT current_setting('app.current_workspace', true) AS ws"
        ),
        (prisma as never as { $queryRawUnsafe: (s: string) => unknown }).$queryRawUnsafe(
          "SELECT current_setting('app.current_workspace', true) AS ws"
        ),
      ]);
    }
  );
  console.log(`Batch tx ctx: ${JSON.stringify(rE)}`);
  console.log(`  Expected: each element shows {"ws":"verify-ws-E"}`);

  console.log('\n========== TEST F: context isolation — second request has independent ctx ==========');
  await requestContextStore.run(
    { current: { userId: 'user-first', workspaceId: 'ws-FIRST', isSuperAdmin: false } },
    async () => {
      // nested run — simulates a different "request" happening concurrently
      await requestContextStore.run(
        { current: { userId: 'user-second', workspaceId: 'ws-SECOND', isSuperAdmin: false } },
        async () => {
          const r: unknown = await (prisma as never as { $queryRawUnsafe: (s: string) => Promise<unknown> }).$queryRawUnsafe(
            "SELECT current_setting('app.current_workspace', true) AS ws"
          );
          console.log(`Nested ctx read: ${JSON.stringify((r as Array<unknown>)[0])}`);
          console.log(`  Expected: {"ws":"ws-SECOND"}  (inner ALS frame wins)`);
        }
      );
    }
  );

  console.log('\n========== ALL TESTS PASSED IF EXPECTED MATCHES OBSERVED ==========');
}

test()
  .catch((err) => { console.error('[VERIFY FATAL]', err); process.exit(1); })
  .finally(() => process.exit(0));

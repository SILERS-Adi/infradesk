import { PrismaClient } from '@prisma/client';

export const testDb = new PrismaClient();

const EXCLUDE = new Set(['_prisma_migrations']);

let cachedTables: string[] | null = null;
async function loadTableList(): Promise<string[]> {
  if (cachedTables) return cachedTables;
  const rows = await testDb.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  cachedTables = rows.map((r) => r.tablename).filter((t) => !EXCLUDE.has(t));
  return cachedTables;
}

export async function resetDatabase(): Promise<void> {
  const tables = await loadTableList();
  const quoted = tables.map((t) => `"${t}"`).join(', ');
  if (quoted.length === 0) return;
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export async function disconnect(): Promise<void> {
  await testDb.$disconnect();
}

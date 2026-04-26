/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';

const prisma = new PrismaClient();

async function connectV1(): Promise<PgClient> {
  const hosts = ['172.18.0.3', '172.18.0.2'];
  for (const host of hosts) {
    const c = new PgClient({ host, port: 5432, user: 'infradesk', password: 'infradesk', database: 'infradesk' });
    try { await c.connect(); console.log(`V1 connected ${host}`); return c; }
    catch { /* try next */ }
  }
  throw new Error('no V1 conn');
}

async function main(): Promise<void> {
  const v1 = await connectV1();
  const v1Ws = (await v1.query(`SELECT id, slug FROM "Workspace"`)).rows;
  const v2Ws = await prisma.workspace.findMany({ select: { id: true, slug: true } });
  const slugToV2 = new Map(v2Ws.map((w) => [w.slug, w.id]));
  const wsMap = new Map<string, string>();
  for (const w of v1Ws) {
    const v2 = slugToV2.get(w.slug as string);
    if (v2) wsMap.set(w.id, v2);
  }

  const v1Devs = (await v1.query(`SELECT "workspaceId", name, "rustdeskId" FROM "Device" WHERE "deletedAt" IS NULL AND "rustdeskId" IS NOT NULL`)).rows;
  console.log(`V1 devices with rustdeskId: ${v1Devs.length}`);

  let updated = 0, notFound = 0, alreadySet = 0;
  for (const d of v1Devs) {
    const v2Ws = wsMap.get(d.workspaceId);
    if (!v2Ws) { notFound++; continue; }
    const v2Dev = await prisma.device.findFirst({
      where: { workspaceId: v2Ws, name: d.name, deletedAt: null },
      select: { id: true, rustdeskId: true },
    });
    if (!v2Dev) { notFound++; continue; }
    if (v2Dev.rustdeskId === d.rustdeskId) { alreadySet++; continue; }
    await prisma.device.update({ where: { id: v2Dev.id }, data: { rustdeskId: d.rustdeskId } });
    updated++;
  }
  console.log(`\nupdated: ${updated}`);
  console.log(`already set: ${alreadySet}`);
  console.log(`not found in V2: ${notFound}`);
  await v1.end();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

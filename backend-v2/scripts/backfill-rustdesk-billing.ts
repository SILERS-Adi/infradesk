/* eslint-disable no-console */
/**
 * One-shot backfill: pobranych z RustDesk sesji ustaw poprawne workspaceId (MSP)
 * i clientWorkspaceId (jeśli urządzenie należy do klienta).
 *
 * Wcześniej sync zapisywał `workspaceId = device.workspaceId` (czyli workspace KLIENTA),
 * przez co billing/summary endpoint (filtruje po providerze MSP) ich nie widział.
 *
 * Idempotent — sesje już poprawnie zmapowane są pomijane.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_BG ?? process.env.DATABASE_URL } } });

async function main(): Promise<void> {
  console.log('━━━ Backfill RustDesk WorkSession billing context ━━━');

  const relations = await prisma.workspaceRelation.findMany({
    where: { status: 'ACTIVE' },
    select: { clientWorkspaceId: true, providerWorkspaceId: true },
  });
  const providerByClient = new Map(relations.map((r) => [r.clientWorkspaceId, r.providerWorkspaceId]));
  console.log(`  active relations: ${relations.length}`);

  const sessions = await prisma.workSession.findMany({
    where: { notes: { startsWith: 'rustdesk:' } },
    select: {
      id: true, workspaceId: true, clientWorkspaceId: true,
      device: { select: { workspace: { select: { id: true, type: true } } } },
    },
  });
  console.log(`  rustdesk sessions: ${sessions.length}`);

  let updated = 0, alreadyOk = 0, noDevice = 0;
  for (const s of sessions) {
    const dws = s.device?.workspace;
    if (!dws) { noDevice++; continue; }

    let targetWs: string;
    let targetClient: string | null;
    if (dws.type === 'CLIENT') {
      const provider = providerByClient.get(dws.id);
      if (provider) {
        targetWs = provider;
        targetClient = dws.id;
      } else {
        targetWs = dws.id;
        targetClient = null;
      }
    } else {
      targetWs = dws.id;
      targetClient = null;
    }

    if (s.workspaceId === targetWs && s.clientWorkspaceId === targetClient) { alreadyOk++; continue; }

    await prisma.workSession.update({
      where: { id: s.id },
      data: { workspaceId: targetWs, clientWorkspaceId: targetClient },
    });
    updated++;
  }

  console.log(`\n━━━ DONE ━━━`);
  console.log(`  updated:        ${updated}`);
  console.log(`  already correct: ${alreadyOk}`);
  console.log(`  no device:      ${noDevice}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });

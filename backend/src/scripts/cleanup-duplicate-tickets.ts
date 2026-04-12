/**
 * Cleanup duplicate agent tickets.
 *
 * For each group of AGENT tickets with the same (workspaceId, deviceId, title)
 * that are still open, keep only the OLDEST one and soft-delete the rest.
 *
 * Tickets that have comments, tasks, orders, or work sessions are NEVER deleted.
 *
 * Usage:  npx tsx src/scripts/cleanup-duplicate-tickets.ts
 *         Add --dry-run to preview without changing anything.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== CLEANING DUPLICATES ===');

  // Get all open AGENT tickets
  const allAgentTickets = await prisma.ticket.findMany({
    where: {
      source: 'AGENT' as any,
      status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING'] },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: { comments: true, tasks: true, orders: true, workSessions: true },
      },
    },
  });

  // Group by (workspaceId, deviceId, title)
  const groups = new Map<string, typeof allAgentTickets>();
  for (const t of allAgentTickets) {
    const key = `${t.workspaceId}|${t.deviceId ?? 'null'}|${t.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  let totalDeleted = 0;

  for (const [, tickets] of groups) {
    if (tickets.length < 2) continue;

    const [keep, ...duplicates] = tickets; // oldest first (sorted by createdAt asc)
    console.log(`\n"${keep.title}" (${tickets.length} tickets) — keeping ${keep.ticketNumber}`);

    for (const dup of duplicates) {
      const c = dup._count;
      const hasWork = c.comments > 0 || c.tasks > 0 || c.orders > 0 || c.workSessions > 0;
      if (hasWork) {
        console.log(`  SKIP ${dup.ticketNumber} — has work (${c.comments}c ${c.tasks}t ${c.orders}o ${c.workSessions}s)`);
        continue;
      }

      console.log(`  DELETE ${dup.ticketNumber} (${dup.createdAt.toISOString().slice(0, 16)})`);
      if (!DRY_RUN) {
        await prisma.ticket.update({
          where: { id: dup.id },
          data: { deletedAt: new Date(), status: 'CLOSED' as any },
        });
      }
      totalDeleted++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would soft-delete' : 'Soft-deleted'}: ${totalDeleted} duplicate tickets`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

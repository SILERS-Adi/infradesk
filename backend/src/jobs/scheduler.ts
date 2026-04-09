/**
 * BullMQ Job Scheduler — replaces setInterval background jobs.
 *
 * Jobs:
 * 1. backup-cleanup: every 6 hours — removes expired backup files
 * 2. rustdesk-sync: every 2 minutes — imports RustDesk sessions to WorkSession
 * 3. monitoring-alerts: every 5 minutes — checks device health, sends alerts
 *
 * Requires Redis. If Redis is unavailable, falls back to setInterval (legacy).
 */

import { Queue, Worker, QueueScheduler } from 'bullmq';
import { isRedisConnected } from '../lib/redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = {
  host: new URL(REDIS_URL).hostname || 'localhost',
  port: parseInt(new URL(REDIS_URL).port || '6379', 10),
};

let schedulerStarted = false;

export async function startJobScheduler() {
  if (schedulerStarted) return;

  // Check if Redis is available
  if (!isRedisConnected()) {
    console.log('[Jobs] Redis not available — using legacy setInterval fallback');
    startLegacyJobs();
    return;
  }

  try {
    const queue = new Queue('infradesk-jobs', { connection });

    // Remove old repeatable jobs (idempotent)
    const existing = await queue.getRepeatableJobs();
    for (const job of existing) {
      await queue.removeRepeatableByKey(job.key);
    }

    // Schedule repeatable jobs
    await queue.add('backup-cleanup', {}, {
      repeat: { every: 6 * 60 * 60 * 1000 }, // every 6 hours
      removeOnComplete: 10,
      removeOnFail: 50,
    });

    await queue.add('rustdesk-sync', {}, {
      repeat: { every: 2 * 60 * 1000 }, // every 2 minutes
      removeOnComplete: 5,
      removeOnFail: 20,
    });

    await queue.add('monitoring-alerts', {}, {
      repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
      removeOnComplete: 5,
      removeOnFail: 20,
    });

    await queue.add('sla-check', {}, {
      repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
      removeOnComplete: 5,
      removeOnFail: 20,
    });

    // Worker processes jobs
    const worker = new Worker('infradesk-jobs', async (job) => {
      switch (job.name) {
        case 'backup-cleanup': {
          const { cleanupOldBackups } = await import('../modules/backup/backup.service');
          await cleanupOldBackups();
          return { cleaned: true };
        }

        case 'rustdesk-sync': {
          const prisma = (await import('../lib/prisma')).default;
          const { syncCompletedRustDeskSessions } = await import('../utils/rustdesk');
          const result = await syncCompletedRustDeskSessions(prisma);
          if (result.created > 0) console.log(`[Jobs] RustDesk sync: ${result.created} sessions`);
          return result;
        }

        case 'monitoring-alerts': {
          const { checkAndAlert } = await import('../utils/monitoring');
          await checkAndAlert();
          return { checked: true };
        }

        case 'sla-check': {
          const { checkSlaBreaches } = await import('../utils/slaChecker');
          return await checkSlaBreaches();
        }

        default:
          console.warn(`[Jobs] Unknown job: ${job.name}`);
      }
    }, {
      connection,
      concurrency: 1, // One job at a time — prevents duplicate processing
    });

    worker.on('failed', (job, err) => {
      console.error(`[Jobs] ${job?.name} failed:`, err.message);
    });

    // Run rustdesk-sync once on startup
    await queue.add('rustdesk-sync', { startup: true }, {
      delay: 10_000, // 10s after start
      removeOnComplete: 1,
    });

    schedulerStarted = true;
    console.log('[Jobs] BullMQ scheduler started (3 repeatable jobs)');
  } catch (err) {
    console.warn('[Jobs] BullMQ init failed — falling back to setInterval:', (err as Error).message);
    startLegacyJobs();
  }
}

/** Legacy fallback when Redis is not available */
function startLegacyJobs() {
  const { cleanupOldBackups } = require('../modules/backup/backup.service');
  const { checkAndAlert } = require('../utils/monitoring');

  setInterval(() => cleanupOldBackups().catch((e: Error) => console.error('Backup cleanup error:', e)), 6 * 60 * 60 * 1000);

  setInterval(async () => {
    try {
      const prisma = (await import('../lib/prisma')).default;
      const { syncCompletedRustDeskSessions } = await import('../utils/rustdesk');
      const result = await syncCompletedRustDeskSessions(prisma);
      if (result.created > 0) console.log(`RustDesk sync: ${result.created} sessions`);
    } catch { /* silent */ }
  }, 2 * 60 * 1000);

  setTimeout(async () => {
    try {
      const prisma = (await import('../lib/prisma')).default;
      const { syncCompletedRustDeskSessions } = await import('../utils/rustdesk');
      await syncCompletedRustDeskSessions(prisma);
    } catch { /* silent */ }
  }, 10_000);

  setInterval(() => checkAndAlert().catch((e: Error) => console.error('Alert check error:', e)), 5 * 60 * 1000);

  // SLA breach check every 5 minutes
  setInterval(async () => {
    try {
      const { checkSlaBreaches } = await import('../utils/slaChecker');
      await checkSlaBreaches();
    } catch { /* silent */ }
  }, 5 * 60 * 1000);

  schedulerStarted = true;
  console.log('[Jobs] Legacy setInterval scheduler started');
}

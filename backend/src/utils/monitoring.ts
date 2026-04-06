/**
 * Production monitoring — metrics, health checks, alerting.
 * Lightweight, no external dependencies (runs on a single VPS).
 */

import prisma from '../lib/prisma';
import os from 'os';
import fs from 'fs';
import { agentConnections } from './websocket';

// ── Metrics collector ─────────────────────────────────────────────────────────

interface Metrics {
  requests: { total: number; byStatus: Record<string, number> };
  responseTimes: number[];
  errors: { count: number; last: string | null };
  startedAt: string;
}

const metrics: Metrics = {
  requests: { total: 0, byStatus: {} },
  responseTimes: [],
  errors: { count: 0, last: null },
  startedAt: new Date().toISOString(),
};

const MAX_RESPONSE_TIMES = 1000; // rolling window

export function recordRequest(statusCode: number, durationMs: number) {
  metrics.requests.total++;
  const bucket = `${Math.floor(statusCode / 100)}xx`;
  metrics.requests.byStatus[bucket] = (metrics.requests.byStatus[bucket] || 0) + 1;

  metrics.responseTimes.push(durationMs);
  if (metrics.responseTimes.length > MAX_RESPONSE_TIMES) {
    metrics.responseTimes.shift();
  }
}

export function recordError(message: string) {
  metrics.errors.count++;
  metrics.errors.last = message;
}

export function getMetrics() {
  const times = metrics.responseTimes;
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

  return {
    uptime: process.uptime(),
    startedAt: metrics.startedAt,
    requests: {
      total: metrics.requests.total,
      ...metrics.requests.byStatus,
    },
    responseTime: { avg, p95, p99, samples: times.length },
    errors: metrics.errors,
    websockets: agentConnections.size,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    system: {
      loadAvg: os.loadavg().map(l => Math.round(l * 100) / 100),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
      cpus: os.cpus().length,
    },
  };
}

// ── Health checks ─────────────────────────────────────────────────────────────

interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

export async function deepHealthCheck(): Promise<{
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  services: Record<string, ServiceHealth>;
}> {
  const services: Record<string, ServiceHealth> = {};

  // PostgreSQL
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    services.db = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (e: any) {
    services.db = { status: 'down', latencyMs: Date.now() - dbStart, error: e.message };
  }

  // Disk space
  try {
    const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
    const stats = fs.statfsSync?.(uploadsDir) ?? null;
    if (stats) {
      const freeGb = Math.round((stats.bfree * stats.bsize) / 1024 / 1024 / 1024 * 10) / 10;
      services.disk = freeGb < 1
        ? { status: 'degraded', error: `Low disk: ${freeGb}GB free` }
        : { status: 'ok' };
    } else {
      services.disk = { status: 'ok' }; // statfsSync not available on Windows
    }
  } catch {
    services.disk = { status: 'ok' }; // non-critical
  }

  // Memory
  const freeMemPct = (os.freemem() / os.totalmem()) * 100;
  services.memory = freeMemPct < 10
    ? { status: 'degraded', error: `Low memory: ${Math.round(freeMemPct)}% free` }
    : { status: 'ok' };

  // WebSocket
  services.websocket = { status: 'ok' };

  // Overall
  const statuses = Object.values(services).map(s => s.status);
  const overall = statuses.includes('down') ? 'down'
    : statuses.includes('degraded') ? 'degraded'
    : 'ok';

  return {
    status: overall,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services,
  };
}

// ── Simple alerting ───────────────────────────────────────────────────────────

interface AlertState {
  lastSent: Record<string, number>; // alert key → timestamp
  cooldownMs: number;
}

const alertState: AlertState = {
  lastSent: {},
  cooldownMs: 15 * 60 * 1000, // 15 min cooldown between same alerts
};

export async function checkAndAlert() {
  const health = await deepHealthCheck();

  const alerts: string[] = [];

  if (health.services.db?.status === 'down') {
    alerts.push('DATABASE DOWN — PostgreSQL is unreachable');
  }
  if (health.services.memory?.status === 'degraded') {
    alerts.push(`LOW MEMORY — ${health.services.memory.error}`);
  }
  if (health.services.disk?.status === 'degraded') {
    alerts.push(`LOW DISK — ${health.services.disk.error}`);
  }

  const errRate = metrics.requests.total > 100
    ? ((metrics.requests.byStatus['5xx'] || 0) / metrics.requests.total) * 100
    : 0;
  if (errRate > 5) {
    alerts.push(`HIGH ERROR RATE — ${errRate.toFixed(1)}% of requests returning 5xx`);
  }

  for (const msg of alerts) {
    const key = msg.split('—')[0].trim();
    const now = Date.now();
    if (alertState.lastSent[key] && now - alertState.lastSent[key] < alertState.cooldownMs) {
      continue; // cooldown active
    }
    alertState.lastSent[key] = now;

    console.error(`[ALERT] ${msg}`);

    // Send email alert if mailer is configured
    try {
      const { sendMail } = await import('../lib/mailer');
      const alertEmail = process.env.ALERT_EMAIL;
      if (alertEmail) {
        await sendMail(
          alertEmail,
          `[InfraDesk ALERT] ${key}`,
          `<p style="color:red;font-weight:bold">${msg}</p>
           <p>Server: ${os.hostname()}<br>Time: ${new Date().toISOString()}</p>
           <pre>${JSON.stringify(health, null, 2)}</pre>`
        );
      }
    } catch { /* alerting should never crash the app */ }
  }
}

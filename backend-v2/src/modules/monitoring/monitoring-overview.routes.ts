import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';

const router = Router();
router.use(requireAuth, requireWorkspace);

const ONLINE_WINDOW_MIN = 10;

interface AgentMetricsSnapshot {
  auditScore?: number;
  cpuUsage?: number;
  ramUsagePercent?: number;
  diskUsagePercent?: number;
  onlineSince?: string;
  [key: string]: unknown;
}

/**
 * Aggregated overview: counts, devices with audit scores, alert histogram (7d).
 */
router.get(
  '/overview',
  requireAccess(MODULES.MONITORING, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId!;
      const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MIN * 60_000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

      const [devices, activeAlertsBySev, alertsLast7d, deviceCount] = await Promise.all([
        prisma.device.findMany({
          where: { workspaceId, deletedAt: null },
          select: {
            id: true, name: true, hostname: true, category: true, criticality: true, status: true,
            ipAddress: true, operatingSystem: true, locationId: true,
            location: { select: { id: true, name: true, city: true } },
            agent: {
              select: {
                lastSeen: true, serverMetrics: true, agentVersion: true, status: true,
              },
            },
            alerts: {
              where: { resolved: false },
              select: { id: true, severity: true },
            },
          },
          orderBy: { name: 'asc' },
        }),
        prisma.monitoringAlert.groupBy({
          by: ['severity'],
          where: { workspaceId, resolved: false },
          _count: true,
        }),
        prisma.monitoringAlert.findMany({
          where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
          select: { severity: true, createdAt: true, resolved: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.device.count({ where: { workspaceId, deletedAt: null } }),
      ]);

      // Shape device rows with audit snapshot.
      const deviceRows = devices.map((d) => {
        const agent = d.agent;
        const snap = (agent?.serverMetrics as AgentMetricsSnapshot | null) ?? null;
        const isOnline = !!(agent?.lastSeen && agent.lastSeen >= onlineCutoff);
        const openAlerts = d.alerts;
        const criticalAlerts = openAlerts.filter((a) => a.severity === 'CRITICAL').length;
        const highAlerts = openAlerts.filter((a) => a.severity === 'HIGH').length;
        return {
          id: d.id,
          name: d.name,
          hostname: d.hostname,
          category: d.category,
          criticality: d.criticality,
          status: d.status,
          ipAddress: d.ipAddress,
          operatingSystem: d.operatingSystem,
          location: d.location,
          online: isOnline,
          lastSeen: agent?.lastSeen ?? null,
          agentVersion: agent?.agentVersion ?? null,
          auditScore: typeof snap?.auditScore === 'number' ? snap.auditScore : null,
          cpuUsage: typeof snap?.cpuUsage === 'number' ? snap.cpuUsage : null,
          ramUsagePercent: typeof snap?.ramUsagePercent === 'number' ? snap.ramUsagePercent : null,
          diskUsagePercent: typeof snap?.diskUsagePercent === 'number' ? snap.diskUsagePercent : null,
          openAlerts: openAlerts.length,
          criticalAlerts,
          highAlerts,
        };
      });

      // 7-day histogram bucketed by day.
      const dayBuckets: Record<string, { day: string; total: number; critical: number; high: number; resolved: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60_000);
        const key = d.toISOString().slice(0, 10);
        dayBuckets[key] = { day: key, total: 0, critical: 0, high: 0, resolved: 0 };
      }
      for (const a of alertsLast7d) {
        const key = a.createdAt.toISOString().slice(0, 10);
        const b = dayBuckets[key];
        if (!b) continue;
        b.total++;
        if (a.severity === 'CRITICAL') b.critical++;
        if (a.severity === 'HIGH') b.high++;
        if (a.resolved) b.resolved++;
      }
      const histogram = Object.values(dayBuckets);

      // Flatten severity counts.
      const alertsBySev: Record<string, number> = {
        INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
      };
      for (const row of activeAlertsBySev) {
        alertsBySev[row.severity] = row._count;
      }

      const onlineCount = deviceRows.filter((d) => d.online).length;
      const scoredDevices = deviceRows.filter((d) => d.auditScore !== null);
      const avgScore =
        scoredDevices.length > 0
          ? Math.round(scoredDevices.reduce((s, d) => s + (d.auditScore ?? 0), 0) / scoredDevices.length)
          : null;

      res.json({
        summary: {
          totalDevices: deviceCount,
          onlineDevices: onlineCount,
          offlineDevices: deviceCount - onlineCount,
          activeAlerts: Object.values(alertsBySev).reduce((s, n) => s + n, 0),
          criticalAlerts: alertsBySev.CRITICAL,
          avgAuditScore: avgScore,
        },
        alertsBySeverity: alertsBySev,
        histogram,
        devices: deviceRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Network map — devices grouped by location with basic topology hints.
 */
router.get(
  '/network',
  requireAccess(MODULES.MONITORING, 'view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId!;
      const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MIN * 60_000);

      const locations = await prisma.location.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          id: true, name: true, city: true,
          devices: {
            where: { deletedAt: null },
            select: {
              id: true, name: true, category: true, criticality: true, ipAddress: true,
              agent: { select: { lastSeen: true } },
              alerts: { where: { resolved: false }, select: { severity: true } },
            },
          },
        },
      });

      const nodes = locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        deviceCount: loc.devices.length,
        devices: loc.devices.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          criticality: d.criticality,
          ipAddress: d.ipAddress,
          online: !!(d.agent?.lastSeen && d.agent.lastSeen >= onlineCutoff),
          lastSeen: d.agent?.lastSeen ?? null,
          hasCritical: d.alerts.some((a) => a.severity === 'CRITICAL'),
          hasHigh: d.alerts.some((a) => a.severity === 'HIGH'),
          alertCount: d.alerts.length,
        })),
      }));

      res.json({ nodes });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

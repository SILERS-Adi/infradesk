import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();

router.use(authenticate, withWorkspaceMembership);

// History — audit score trend over time
router.get('/history', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentId, type = 'audit', days = '30' } = req.query as Record<string, string>;
    const since = new Date(Date.now() - parseInt(days) * 86400000);

    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];

    const where: any = {
      type,
      createdAt: { gte: since },
      agent: { workspaceId: { in: wsIds } },
    };
    if (agentId) where.agentRegId = agentId;

    const snapshots = await prisma.metricsSnapshot.findMany({
      where,
      select: { id: true, agentRegId: true, score: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    res.json(snapshots);
  } catch (err) { next(err); }
});

// Alerts — list active alerts for workspace
router.get('/alerts', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resolved = 'false' } = req.query as Record<string, string>;
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];

    const alerts = await prisma.monitoringAlert.findMany({
      where: {
        workspaceId: { in: wsIds },
        resolved: resolved === 'true',
      },
      include: {
        agent: { select: { id: true, hostname: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(alerts);
  } catch (err) { next(err); }
});

// Resolve alert
router.patch('/alerts/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await prisma.monitoringAlert.update({
      where: { id: req.params.id },
      data: { resolved: true },
    });
    res.json(alert);
  } catch (err) { next(err); }
});

// Dashboard summary — aggregated stats across all agents
router.get('/summary', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getMspWorkspaceIds } = require('../../utils/mspScope');
    const wsIds: string[] = req.workspaceId ? await getMspWorkspaceIds(req.workspaceId) : [];

    const agents = await prisma.agentRegistration.findMany({
      where: { workspaceId: { in: wsIds }, status: 'ACTIVE' },
      select: {
        id: true, hostname: true, serverMetrics: true,
        cpuUsage: true, ramUsage: true, diskFree: true, diskTotal: true, lastSeen: true,
      },
    });

    let totalNetDevices = 0;
    let healthyDisks = 0;
    let failingDisks = 0;
    let runningServices = 0;
    let stoppedServices = 0;
    let criticalEvents = 0;
    let auditScores: number[] = [];
    let activeAlerts = 0;

    for (const a of agents) {
      const m = a.serverMetrics as any;
      if (!m) continue;

      if (m.networkScan?.devices) totalNetDevices += m.networkScan.devices.length;
      if (m.smartDisks) {
        for (const d of m.smartDisks) {
          const h = d.health?.toLowerCase();
          if (h === 'healthy' || h === 'ok') healthyDisks++;
          else failingDisks++;
        }
      }
      if (m.services) {
        for (const s of m.services) {
          if (s.status === 'Running') runningServices++;
          else stoppedServices++;
        }
      }
      if (m.criticalEvents) criticalEvents += m.criticalEvents.length;
      if (m.securityAudit?.score != null) auditScores.push(m.securityAudit.score);
    }

    activeAlerts = await prisma.monitoringAlert.count({
      where: { workspaceId: { in: wsIds }, resolved: false },
    });

    const avgScore = auditScores.length
      ? Math.round(auditScores.reduce((s, v) => s + v, 0) / auditScores.length)
      : null;

    res.json({
      totalAgents: agents.length,
      onlineAgents: agents.filter(a => a.lastSeen && (Date.now() - new Date(a.lastSeen).getTime()) < 5 * 60000).length,
      totalNetDevices,
      healthyDisks,
      failingDisks,
      runningServices,
      stoppedServices,
      criticalEvents,
      avgScore,
      activeAlerts,
    });
  } catch (err) { next(err); }
});

// PDF report for agent
router.get('/report/:agentId', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { generateAuditReport } = await import('./monitoring.pdf');
    const pdf = await generateAuditReport(req.params.agentId, req.workspaceId!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit_report_${req.params.agentId.slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) { res.status(400).json({ error: 'No workspace' }); return; }

    const tickets = await prisma.ticket.findMany({
      where: { workspaceId: wsId },
      select: {
        id: true, status: true, priority: true, type: true,
        reportedAt: true, resolvedAt: true, completedAt: true,
        locationId: true, assignedToId: true,
        location: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const total = tickets.length;
    const now = new Date();

    // By status
    const byStatus: Record<string, number> = {};
    tickets.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });

    // By priority
    const byPriority: Record<string, number> = {};
    tickets.forEach(t => { byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; });

    // By type
    const byType: Record<string, number> = {};
    tickets.forEach(t => { byType[t.type] = (byType[t.type] || 0) + 1; });

    // Monthly (last 12 months)
    const monthly: Record<string, number> = {};
    tickets.forEach(t => {
      const m = t.reportedAt.toISOString().slice(0, 7); // YYYY-MM
      monthly[m] = (monthly[m] || 0) + 1;
    });
    const monthlyStats = Object.entries(monthly)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    // Top locations
    const locMap: Record<string, { name: string; count: number }> = {};
    tickets.forEach(t => {
      if (t.location) {
        if (!locMap[t.location.id]) locMap[t.location.id] = { name: t.location.name, count: 0 };
        locMap[t.location.id].count++;
      }
    });
    const topLocations = Object.values(locMap).sort((a, b) => b.count - a.count).slice(0, 10);

    // Per technician
    const techMap: Record<string, { name: string; count: number; resolved: number }> = {};
    tickets.forEach(t => {
      if (t.assignedTo) {
        const name = `${t.assignedTo.firstName} ${t.assignedTo.lastName}`;
        if (!techMap[t.assignedTo.id]) techMap[t.assignedTo.id] = { name, count: 0, resolved: 0 };
        techMap[t.assignedTo.id].count++;
        if (t.status === 'COMPLETED' || t.status === 'RESOLVED') techMap[t.assignedTo.id].resolved++;
      }
    });
    const perTechnician = Object.values(techMap).sort((a, b) => b.count - a.count);

    // Average resolution time (hours) — for completed tickets
    const resolved = tickets.filter(t => (t.resolvedAt || t.completedAt) && t.reportedAt);
    let avgResolutionHours = 0;
    if (resolved.length > 0) {
      const totalHours = resolved.reduce((s, t) => {
        const end = t.resolvedAt || t.completedAt || now;
        return s + (end.getTime() - t.reportedAt.getTime()) / 3600000;
      }, 0);
      avgResolutionHours = parseFloat((totalHours / resolved.length).toFixed(1));
    }

    res.json({
      total,
      open: (byStatus['PENDING'] || 0) + (byStatus['ASSIGNED'] || 0) + (byStatus['IN_PROGRESS'] || 0),
      resolved: (byStatus['RESOLVED'] || 0) + (byStatus['COMPLETED'] || 0),
      avgResolutionHours,
      byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      byPriority: Object.entries(byPriority).map(([priority, count]) => ({ priority, count })),
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
      monthlyStats,
      topLocations,
      perTechnician,
    });
  } catch (err) { next(err); }
});

export default router;

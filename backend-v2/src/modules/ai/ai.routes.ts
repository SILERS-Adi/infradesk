import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { MODULES } from '../../utils/canAccess';
import { complete } from '../../lib/llm';
import { HttpError } from '../../utils/httpError';
import { enforceAiCallLimit } from '../../utils/planLimits';

const router = Router();
router.use(requireAuth, requireWorkspace);

const IRIS_SYSTEM = `Jesteś Iris — AI copilot InfraDesk, asystent dla techników IT.
Pomagasz w diagnostyce urządzeń, pisaniu odpowiedzi do klientów, podsumowywaniu ticketów i znajdowaniu rozwiązań typowych problemów.
Odpowiadasz po polsku, zwięźle i konkretnie. Używasz terminologii technicznej tam gdzie to uzasadnione.
Jeśli nie masz wystarczających danych, przyznaj to — nie zmyślaj.`;

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(20_000),
  })).min(1).max(40),
  model: z.enum(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']).optional(),
});

router.post('/chat', requireAccess(MODULES.AI_COPILOT, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = chatSchema.parse(req.body);
    // Cost guard: enforce per-plan miesięczny limit Iris AI calls
    await enforceAiCallLimit(req.workspaceId!);
    const result = await complete({
      workspaceId: req.workspaceId!,
      userId: req.auth!.sub,
      feature: 'iris_chat',
      model: input.model,
      system: IRIS_SYSTEM,
      messages: input.messages,
      temperature: 0.7,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('ANTHROPIC_API_KEY')) {
      next(HttpError.badRequest('AI nie jest skonfigurowane (brak klucza Anthropic)', 'ai_not_configured'));
      return;
    }
    next(err);
  }
});

// GET /ai/usage — aggregated cost + token history
router.get('/usage', requireAccess(MODULES.AI_COPILOT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(90).default(30),
    }).parse(req.query);
    const since = new Date(Date.now() - q.days * 86_400_000);
    const workspaceId = req.workspaceId!;

    const [byFeature, byModel, total, daily] = await Promise.all([
      prisma.llmUsage.groupBy({
        by: ['feature'],
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costPln: true },
        _count: true,
      }),
      prisma.llmUsage.groupBy({
        by: ['model'],
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costPln: true },
        _count: true,
      }),
      prisma.llmUsage.aggregate({
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costPln: true },
        _count: true,
      }),
      prisma.llmUsage.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { createdAt: true, costPln: true, inputTokens: true, outputTokens: true, feature: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Bucket daily by day string
    const dayBuckets: Record<string, { day: string; costPln: number; tokens: number; calls: number }> = {};
    for (let i = q.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      dayBuckets[key] = { day: key, costPln: 0, tokens: 0, calls: 0 };
    }
    for (const u of daily) {
      const key = u.createdAt.toISOString().slice(0, 10);
      const b = dayBuckets[key];
      if (!b) continue;
      b.costPln += Number(u.costPln);
      b.tokens += u.inputTokens + u.outputTokens;
      b.calls++;
    }

    res.json({
      total: {
        calls: total._count,
        inputTokens: total._sum.inputTokens ?? 0,
        outputTokens: total._sum.outputTokens ?? 0,
        costPln: Number(total._sum.costPln ?? 0),
      },
      byFeature: byFeature.map((r) => ({
        feature: r.feature,
        calls: r._count,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        costPln: Number(r._sum.costPln ?? 0),
      })),
      byModel: byModel.map((r) => ({
        model: r.model,
        calls: r._count,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        costPln: Number(r._sum.costPln ?? 0),
      })),
      histogram: Object.values(dayBuckets),
    });
  } catch (err) {
    next(err);
  }
});

// GET /ai/insights — aggregated patterns + anomalies (computed, not LLM-generated for cost)
router.get('/insights', requireAccess(MODULES.AI_COPILOT, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId!;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    const [
      ticketsByCategory,
      ticketsByPriority,
      alertsByType,
      topFailingDevices,
      avgResolutionByCategory,
      totalTickets30d,
      totalTickets7d,
    ] = await Promise.all([
      prisma.ticket.groupBy({
        by: ['category'],
        where: { workspaceId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      prisma.ticket.groupBy({
        by: ['priority'],
        where: { workspaceId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      prisma.monitoringAlert.groupBy({
        by: ['type'],
        where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
        _count: true,
        orderBy: { _count: { type: 'desc' } },
        take: 10,
      }),
      prisma.ticket.groupBy({
        by: ['deviceId'],
        where: { workspaceId, deletedAt: null, createdAt: { gte: thirtyDaysAgo }, deviceId: { not: null } },
        _count: true,
        orderBy: { _count: { deviceId: 'desc' } },
        take: 5,
      }),
      prisma.ticket.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          resolvedAt: { not: null },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { category: true, createdAt: true, resolvedAt: true },
      }),
      prisma.ticket.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.ticket.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
    ]);

    // Avg resolution time per category
    const resByCat: Record<string, { total: number; sumMs: number }> = {};
    for (const t of avgResolutionByCategory) {
      const cat = t.category ?? 'unknown';
      resByCat[cat] ??= { total: 0, sumMs: 0 };
      resByCat[cat].total++;
      resByCat[cat].sumMs += t.resolvedAt!.getTime() - t.createdAt.getTime();
    }
    const avgResolutionHours = Object.entries(resByCat).map(([category, { total, sumMs }]) => ({
      category,
      count: total,
      avgHours: Number((sumMs / total / 3_600_000).toFixed(1)),
    })).sort((a, b) => b.avgHours - a.avgHours);

    // Fetch device names for failing devices
    const deviceIds = topFailingDevices.map((d) => d.deviceId).filter((v): v is string => !!v);
    const devices = deviceIds.length
      ? await prisma.device.findMany({
          where: { id: { in: deviceIds } },
          select: { id: true, name: true, hostname: true },
        })
      : [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    // Velocity: 7d vs avg 7d window from 30d
    const avg7dFromMonth = totalTickets30d / (30 / 7);
    const velocityDelta = avg7dFromMonth > 0
      ? Math.round(((totalTickets7d - avg7dFromMonth) / avg7dFromMonth) * 100)
      : 0;

    res.json({
      ticketVelocity: {
        last7d: totalTickets7d,
        avg7dFromMonth: Math.round(avg7dFromMonth),
        deltaPct: velocityDelta,
      },
      ticketsByCategory: ticketsByCategory.map((r) => ({ key: r.category, count: r._count })),
      ticketsByPriority: ticketsByPriority.map((r) => ({ key: r.priority, count: r._count })),
      topAlertTypes: alertsByType.map((r) => ({ type: r.type, count: r._count })),
      topFailingDevices: topFailingDevices.map((r) => ({
        device: deviceMap.get(r.deviceId!) ?? { id: r.deviceId, name: 'Nieznane urządzenie', hostname: null },
        ticketCount: r._count,
      })),
      avgResolutionHours,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

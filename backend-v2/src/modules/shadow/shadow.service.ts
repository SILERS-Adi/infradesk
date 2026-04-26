import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Shadow Mode: AI records what it WOULD do in parallel with the human user.
 * Later we compare outcomes + generate a weekly ROI report. When accuracy stays
 * > 95% for 4 weeks on a given feature, user can opt-in to auto-apply.
 */

export interface RecordInput {
  workspaceId: string;
  feature: string;               // "ticket_classify", "auto_resolve", "priority_guess", …
  input?: unknown;               // raw context fed to AI (hashed, not stored)
  aiOutput?: unknown;            // what AI would have done
  estimatedValuePln?: number;    // optional ROI estimate
  linkedTicketId?: string;
  linkedSessionId?: string;
}

export async function recordDecision(data: RecordInput): Promise<{ id: string }> {
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(data.input)).digest('hex');
  const created = await prisma.shadowDecision.create({
    data: {
      workspaceId: data.workspaceId,
      feature: data.feature,
      inputHash,
      aiOutput: data.aiOutput as never,
      estimatedValue: data.estimatedValuePln !== undefined ? new Prisma.Decimal(data.estimatedValuePln.toFixed(2)) : null,
      linkedTicketId: data.linkedTicketId,
      linkedSessionId: data.linkedSessionId,
    },
    select: { id: true },
  });
  return created;
}

export interface ResolveInput {
  id: string;
  workspaceId: string;
  humanOutput: unknown;
}

/** Call this when the human's decision is known — auto-marks matched/mismatched. */
export async function resolveDecision(data: ResolveInput): Promise<void> {
  const rec = await prisma.shadowDecision.findFirst({
    where: { id: data.id, workspaceId: data.workspaceId },
    select: { id: true, aiOutput: true, matched: true },
  });
  if (!rec) return;
  if (rec.matched !== null) return; // already resolved
  const matched = JSON.stringify(rec.aiOutput) === JSON.stringify(data.humanOutput);
  await prisma.shadowDecision.update({
    where: { id: rec.id },
    data: { humanOutput: data.humanOutput as never, matched, decidedAt: new Date() },
  });
}

export interface FeatureReport {
  feature: string;
  total: number;
  resolved: number;
  matched: number;
  accuracy: number;          // 0..1
  savedPlnIfAutoApplied: number;
  readyForAutoApply: boolean; // >= 95% accuracy AND >= 30 samples
}

export async function weeklyReport(workspaceId: string, days = 7): Promise<{ since: Date; features: FeatureReport[]; totalSavingsPln: number }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const grouped = await prisma.shadowDecision.groupBy({
    by: ['feature'],
    where: { workspaceId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { estimatedValue: true },
  });

  const features: FeatureReport[] = [];
  for (const g of grouped) {
    const resolved = await prisma.shadowDecision.count({ where: { workspaceId, feature: g.feature, createdAt: { gte: since }, matched: { not: null } } });
    const matched = await prisma.shadowDecision.count({ where: { workspaceId, feature: g.feature, createdAt: { gte: since }, matched: true } });
    const accuracy = resolved > 0 ? matched / resolved : 0;
    const saved = Number(g._sum.estimatedValue ?? 0);
    features.push({
      feature: g.feature,
      total: g._count._all,
      resolved,
      matched,
      accuracy,
      savedPlnIfAutoApplied: saved,
      readyForAutoApply: accuracy >= 0.95 && resolved >= 30,
    });
  }
  const totalSavingsPln = features.reduce((acc, f) => acc + f.savedPlnIfAutoApplied, 0);
  return { since, features, totalSavingsPln };
}

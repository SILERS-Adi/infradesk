// Centralna definicja limitów per plan + helper enforcement.
// Wartości muszą być zsynchronizowane z UI (CennikPage.tsx, PlanAndModulesPage.tsx).

import { prisma } from '../lib/prisma';
import { HttpError } from './httpError';

export type PlanKey = 'START' | 'TEAM' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  /** Maksymalna liczba aktywnych członków workspace. null = bez limitu. */
  users: number | null;
  /** Maksymalna liczba aktywnych urządzeń. */
  devices: number | null;
  /** Wbudowana przestrzeń na pliki (Dysk + załączniki ticketów). null = bez limitu. */
  storageBytes: bigint | null;
  /** Maksymalna liczba klientów MSP (WorkspaceRelation jako provider). */
  mspClients: number | null;
  /** Limit AI calls (Iris) na bieżący miesiąc. */
  aiCallsMonthly: number | null;
}

const GB = BigInt(1024 * 1024 * 1024);

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  START: {
    users: 3,
    devices: 25,
    storageBytes: 5n * GB,
    mspClients: 1,
    aiCallsMonthly: 100,
  },
  TEAM: {
    users: 10,
    devices: 100,
    storageBytes: 25n * GB,
    mspClients: 5,
    aiCallsMonthly: 500,
  },
  PRO: {
    users: 30,
    devices: 500,
    storageBytes: 100n * GB,
    mspClients: 25,
    aiCallsMonthly: 2_000,
  },
  ENTERPRISE: {
    users: null,
    devices: null,
    storageBytes: 500n * GB,
    mspClients: null,
    aiCallsMonthly: null,
  },
};

const PLAN_LABELS: Record<PlanKey, string> = {
  START: 'Start',
  TEAM: 'Team',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

function nextPlanFor(plan: PlanKey): PlanKey | null {
  if (plan === 'START') return 'TEAM';
  if (plan === 'TEAM') return 'PRO';
  if (plan === 'PRO') return 'ENTERPRISE';
  return null;
}

export class LimitExceededError extends HttpError {
  readonly limitKey: keyof PlanLimits;
  readonly currentPlan: PlanKey;
  readonly limit: number | bigint;
  readonly used: number | bigint;

  constructor(opts: {
    plan: PlanKey;
    key: keyof PlanLimits;
    limit: number | bigint;
    used: number | bigint;
    message: string;
  }) {
    super(402, 'plan_limit_exceeded', opts.message);
    this.limitKey = opts.key;
    this.currentPlan = opts.plan;
    this.limit = opts.limit;
    this.used = opts.used;
  }
}

interface WorkspaceForLimit {
  plan: PlanKey;
  storageQuotaBytes: bigint | null;
}

async function loadWorkspace(workspaceId: string): Promise<WorkspaceForLimit> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, storageQuotaBytes: true },
  });
  if (!ws) throw HttpError.notFound('Workspace not found');
  return { plan: ws.plan as PlanKey, storageQuotaBytes: ws.storageQuotaBytes };
}

function buildMessage(plan: PlanKey, kind: string, used: string, limit: string): string {
  const next = nextPlanFor(plan);
  const upgrade = next
    ? ` Upgrade'uj plan na ${PLAN_LABELS[next]} aby zwiększyć limit.`
    : ' Skontaktuj się z nami aby ustalić indywidualny limit.';
  return `Limit planu ${PLAN_LABELS[plan]} osiągnięty: ${kind} (${used}/${limit}).${upgrade}`;
}

/**
 * Sprawdza czy dodanie 1 nowego elementu mieści się w limicie planu.
 * Rzuca 402 LimitExceededError jeśli przekroczy.
 */
export async function enforceCountLimit(
  workspaceId: string,
  key: 'users' | 'devices' | 'mspClients',
  current: number,
): Promise<void> {
  const ws = await loadWorkspace(workspaceId);
  const limits = PLAN_LIMITS[ws.plan];
  const limit = limits[key];
  if (limit == null) return; // unlimited
  if (current + 1 > limit) {
    const kindLabel: Record<typeof key, string> = {
      users: 'użytkownicy',
      devices: 'urządzenia',
      mspClients: 'klienci MSP',
    };
    throw new LimitExceededError({
      plan: ws.plan,
      key,
      limit,
      used: current,
      message: buildMessage(ws.plan, kindLabel[key], String(current), String(limit)),
    });
  }
}

/**
 * Sprawdza czy dodanie newBytes mieści się w limicie storage'u.
 * Workspace.storageQuotaBytes (jeśli ustawione) ma priorytet nad limitem planu (manual override dla ENT).
 */
export async function enforceStorageLimit(
  workspaceId: string,
  currentBytes: bigint,
  newBytes: bigint,
): Promise<void> {
  const ws = await loadWorkspace(workspaceId);
  const planLimit = PLAN_LIMITS[ws.plan].storageBytes;
  // Override: gdy workspace ma jawnie ustawiony storageQuotaBytes, używaj jego.
  const limit = ws.storageQuotaBytes ?? planLimit;
  if (limit == null) return; // unlimited
  if (currentBytes + newBytes > limit) {
    const usedMb = Number(currentBytes / BigInt(1024 * 1024));
    const limitMb = Number(limit / BigInt(1024 * 1024));
    const remainingMb = Math.max(0, limitMb - usedMb);
    const usedDisplay = limitMb >= 1024 ? `${(usedMb / 1024).toFixed(1)} GB` : `${usedMb} MB`;
    const limitDisplay = limitMb >= 1024 ? `${(limitMb / 1024).toFixed(0)} GB` : `${limitMb} MB`;
    throw new LimitExceededError({
      plan: ws.plan,
      key: 'storageBytes',
      limit,
      used: currentBytes,
      message: buildMessage(
        ws.plan,
        'przestrzeń dyskowa',
        usedDisplay,
        limitDisplay,
      ) + ` Wolne: ~${remainingMb} MB.`,
    });
  }
}

/**
 * Liczy aktywnych członków danego workspace'a (bez INVITED, bez deletedAt).
 */
export async function countActiveMembers(workspaceId: string): Promise<number> {
  return prisma.membership.count({
    where: { workspaceId, status: 'ACTIVE' },
  });
}

/**
 * Liczy aktywne urządzenia (bez deletedAt).
 */
export async function countActiveDevices(workspaceId: string): Promise<number> {
  return prisma.device.count({
    where: { workspaceId, deletedAt: null },
  });
}

/**
 * Liczy aktywne relacje provider→client dla MSP.
 */
export async function countActiveMspClients(providerWorkspaceId: string): Promise<number> {
  return prisma.workspaceRelation.count({
    where: { providerWorkspaceId, status: 'ACTIVE' },
  });
}

/**
 * Egzekwuje miesięczny limit wywołań Iris AI per workspace.
 * Liczy LlmUsage z bieżącego miesiąca (UTC). Rzuca 402 gdy limit przekroczony.
 *
 * Wywoływać PRZED każdym płatnym wywołaniem LLM (chat, classify, summarize itp.).
 */
export async function enforceAiCallLimit(workspaceId: string): Promise<void> {
  const ws = await loadWorkspace(workspaceId);
  const limit = PLAN_LIMITS[ws.plan].aiCallsMonthly;
  if (limit == null) return; // unlimited (ENTERPRISE)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const used = await prisma.llmUsage.count({
    where: { workspaceId, createdAt: { gte: monthStart } },
  });
  if (used >= limit) {
    throw new LimitExceededError({
      plan: ws.plan,
      key: 'aiCallsMonthly',
      limit,
      used,
      message: buildMessage(
        ws.plan,
        'wywołania Iris AI w tym miesiącu',
        String(used),
        String(limit),
      ),
    });
  }
}

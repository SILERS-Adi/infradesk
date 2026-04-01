import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/**
 * Plan feature & limit definitions.
 */
export interface PlanConfig {
  maxAgents: number;
  maxUsers: number;
  features: Set<string>;
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  FREE: {
    maxAgents: 5,
    maxUsers: 1,
    features: new Set([
      'tickets', 'portal', 'monitoring', 'qr', 'mobile',
    ]),
  },
  STARTER: {
    maxAgents: 25,
    maxUsers: 3,
    features: new Set([
      'tickets', 'portal', 'monitoring', 'qr', 'mobile',
      'rustdesk', 'crm', 'sessions', 'orders',
    ]),
  },
  PROFESSIONAL: {
    maxAgents: 100,
    maxUsers: 10,
    features: new Set([
      'tickets', 'portal', 'monitoring', 'qr', 'mobile',
      'rustdesk', 'crm', 'sessions', 'orders',
      'backup', 'billing', 'delegations', 'security_audit',
      'network_scan', 'branding', 'tv', 'partners',
    ]),
  },
  ENTERPRISE: {
    maxAgents: 999999,
    maxUsers: 999999,
    features: new Set([
      'tickets', 'portal', 'monitoring', 'qr', 'mobile',
      'rustdesk', 'crm', 'sessions', 'orders',
      'backup', 'billing', 'delegations', 'security_audit',
      'network_scan', 'branding', 'tv', 'partners',
      'ai', 'custom_domain', 'api_access', 'priority_support',
    ]),
  },
};

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.FREE;
}

/**
 * Middleware: check if workspace's plan includes a specific feature.
 * Usage: router.get('/backup', requireFeature('backup'), handler)
 */
export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      // No workspace = superadmin, allow all
      next();
      return;
    }

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { plan: true },
      });

      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      const config = getPlanConfig(workspace.plan);
      if (!config.features.has(feature)) {
        res.status(403).json({
          error: 'Plan upgrade required',
          feature,
          currentPlan: workspace.plan,
          requiredPlan: getMinPlanForFeature(feature),
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware: check if workspace can add more of a resource (agents, users).
 * Usage: router.post('/users', checkLimit('users'), handler)
 */
export function checkLimit(resource: 'agents' | 'users') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      next();
      return;
    }

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { plan: true, maxAgents: true, maxUsers: true },
      });

      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      const config = getPlanConfig(workspace.plan);
      let current: number;
      let max: number;

      switch (resource) {
        case 'agents':
          current = await prisma.agentRegistration.count({ where: { workspaceId } });
          max = Math.min(config.maxAgents, workspace.maxAgents);
          break;
        case 'users':
          current = await prisma.workspaceMembership.count({ where: { workspaceId } });
          max = Math.min(config.maxUsers, workspace.maxUsers);
          break;
      }

      if (current >= max) {
        res.status(403).json({
          error: `Limit reached: ${current}/${max} ${resource}`,
          resource,
          current,
          max,
          currentPlan: workspace.plan,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Returns workspace plan info + usage.
 */
export async function getWorkspaceUsage(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, maxAgents: true, maxUsers: true },
  });
  if (!workspace) return null;

  const config = getPlanConfig(workspace.plan);
  const [agents, users] = await Promise.all([
    prisma.agentRegistration.count({ where: { workspaceId } }),
    prisma.workspaceMembership.count({ where: { workspaceId } }),
  ]);

  return {
    plan: workspace.plan,
    features: Array.from(config.features),
    limits: {
      agents: { current: agents, max: Math.min(config.maxAgents, workspace.maxAgents) },
      users: { current: users, max: Math.min(config.maxUsers, workspace.maxUsers) },
    },
  };
}

function getMinPlanForFeature(feature: string): string {
  for (const plan of ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']) {
    if (PLAN_CONFIGS[plan].features.has(feature)) return plan;
  }
  return 'ENTERPRISE';
}

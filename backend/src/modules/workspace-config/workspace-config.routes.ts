/**
 * Workspace Configuration API — "Plan i moduły"
 *
 * Central configurator for workspace type, modules, routing, and billing.
 * Endpoints: GET config, POST preview (read-only diff), POST apply (transactional write).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';
import { getMenuProfile, getGroupLabel, getItemLabel, type MenuProfileInput, type OrgType } from '../../lib/menuProfile';
import { syncLegacyFields } from '../../lib/workspaceConfigSync';

const router = Router();
router.use(authenticate, requireWorkspace, withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'));

// ── Types ─────────────────────────────────────────────────────────

type ModuleAction = 'activate' | 'deactivate' | 'start_trial' | 'delegate_to_provider' | 'set_readonly' | 'set_limited';

interface ModuleChange {
  moduleKey: string;
  action: ModuleAction;
}

interface ConfigChangeBody {
  orgType?: OrgType;
  ticketRoutingMode?: string;
  modules?: ModuleChange[];
  platformBillingMode?: 'SELF' | 'PROVIDER';
  accountManagedBy?: 'SELF' | 'PROVIDER';
  detachPolicy?: 'ALLOWED' | 'APPROVAL_REQUIRED' | 'BLOCKED';
}

// ── Helpers ───────────────────────────────────────────────────────

const ACTION_TO_STATE: Record<ModuleAction, string> = {
  activate: 'ACTIVE',
  deactivate: 'INACTIVE',
  start_trial: 'TRIAL',
  delegate_to_provider: 'MANAGED_BY_PROVIDER',
  set_readonly: 'READONLY',
  set_limited: 'LIMITED',
};

// NOTE: After adding new fields to schema, run `npx prisma generate` to update the client.
// TypeScript errors on orgType/modules/etc. will resolve after generation.
async function loadCurrentConfig(wsId: string) {
  const workspace = await (prisma.workspace as any).findUnique({
    where: { id: wsId },
    select: {
      orgType: true,
      organizationType: true,
      plan: true,
      enabledModules: true,
      platformBillingMode: true,
      accountManagedBy: true,
      detachPolicy: true,
      modules: { select: { moduleKey: true, state: true, activatedAt: true, expiresAt: true } },
      helpdeskSettings: true,
      providerRelations: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          providerWorkspaceId: true,
          canReceiveTickets: true,
          isDefaultHelpdeskProvider: true,
          providerWorkspace: { select: { id: true, name: true } },
        },
      },
      clientRelations: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          clientWorkspaceId: true,
          canReceiveTickets: true,
          clientWorkspace: { select: { id: true, name: true } },
        },
      },
    },
  });
  return workspace;
}

function buildMenuInput(
  orgType: OrgType,
  ticketRoutingMode: string,
  modules: { moduleKey: string; state: string }[],
  plan: string,
  role: string,
  isSuperAdmin: boolean,
): MenuProfileInput {
  return { orgType, ticketRoutingMode, modules, plan, role: role as any, isSuperAdmin };
}

// ── GET /api/workspace-config ─────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const ws = await loadCurrentConfig(wsId);
    if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

    res.json({
      orgType: ws.orgType,
      organizationType: ws.organizationType,
      ticketRoutingMode: ws.helpdeskSettings?.ticketRoutingMode ?? 'internal_only',
      modules: ws.modules,
      enabledModules: ws.enabledModules,
      plan: ws.plan,
      platformBillingMode: ws.platformBillingMode,
      accountManagedBy: ws.accountManagedBy,
      detachPolicy: ws.detachPolicy,
      providerRelations: ws.providerRelations,
      clientRelations: ws.clientRelations,
      helpdeskSettings: ws.helpdeskSettings,
    });
  } catch (err) { next(err); }
});

// ── POST /api/workspace-config/preview ────────────────────────────

router.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const ws = await loadCurrentConfig(wsId);
    if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

    const body = req.body as ConfigChangeBody;
    const role = req.membership?.role ?? 'ADMIN';
    const isSuperAdmin = !!req.user?.isSuperAdmin;

    // Current state
    const currentOrgType = ws.orgType as OrgType;
    const currentRouting = ws.helpdeskSettings?.ticketRoutingMode ?? 'internal_only';
    const currentModules = ws.modules.map(m => ({ moduleKey: m.moduleKey, state: m.state }));

    const currentMenu = getMenuProfile(buildMenuInput(
      currentOrgType, currentRouting, currentModules, ws.plan, role, isSuperAdmin,
    ));

    // Proposed state
    const proposedOrgType = body.orgType ?? currentOrgType;
    const proposedRouting = body.ticketRoutingMode ?? currentRouting;

    // Merge module changes
    const proposedModules = [...currentModules];
    if (body.modules) {
      for (const change of body.modules) {
        const newState = ACTION_TO_STATE[change.action];
        if (!newState) continue;
        const idx = proposedModules.findIndex(m => m.moduleKey === change.moduleKey);
        if (idx >= 0) {
          proposedModules[idx] = { ...proposedModules[idx], state: newState };
        } else {
          proposedModules.push({ moduleKey: change.moduleKey, state: newState });
        }
      }
    }

    const proposedMenu = getMenuProfile(buildMenuInput(
      proposedOrgType, proposedRouting, proposedModules, ws.plan, role, isSuperAdmin,
    ));

    // Compute diff
    const currentGroupSet = new Set(currentMenu.visibleGroups);
    const proposedGroupSet = new Set(proposedMenu.visibleGroups);
    const currentItemSet = new Set(currentMenu.visibleItems);
    const proposedItemSet = new Set(proposedMenu.visibleItems);

    const added: { type: string; id: string; label: string }[] = [];
    const removed: { type: string; id: string; label: string }[] = [];
    const modified: { id: string; from: string; to: string; label: string }[] = [];

    for (const g of proposedMenu.visibleGroups) {
      if (!currentGroupSet.has(g)) added.push({ type: 'group', id: g, label: getGroupLabel(g) });
    }
    for (const g of currentMenu.visibleGroups) {
      if (!proposedGroupSet.has(g)) removed.push({ type: 'group', id: g, label: getGroupLabel(g) });
    }
    for (const i of proposedMenu.visibleItems) {
      if (!currentItemSet.has(i)) added.push({ type: 'item', id: i, label: getItemLabel(i) });
    }
    for (const i of currentMenu.visibleItems) {
      if (!proposedItemSet.has(i)) removed.push({ type: 'item', id: i, label: getItemLabel(i) });
    }

    // Readonly changes
    const currentReadonlySet = new Set(currentMenu.readonlySections);
    for (const s of proposedMenu.readonlySections) {
      if (!currentReadonlySet.has(s)) {
        modified.push({ id: s, from: 'editable', to: 'readonly', label: getGroupLabel(s) || getItemLabel(s) });
      }
    }

    // Count affected users
    const affectedUsers = await countAffectedUsers(wsId, currentMenu, proposedMenu);

    // Build human-readable summary
    const summary = buildSummary(
      currentOrgType, proposedOrgType,
      currentRouting, proposedRouting,
      body, added, removed, modified, affectedUsers,
      ws.providerRelations,
    );

    // Blockers (hard validation)
    const blockers: string[] = [];
    if (proposedOrgType === 'CLIENT') {
      const hasProvider = ws.providerRelations.some(r => r.canReceiveTickets);
      if (!hasProvider) {
        blockers.push('Typ CLIENT wymaga aktywnej relacji z firmą IT (provider z canReceiveTickets = true)');
      }
    }

    // Warnings (soft)
    const warnings: string[] = [];
    if (proposedOrgType === 'CLIENT' && proposedRouting !== 'send_to_default_provider') {
      warnings.push('Typ CLIENT wymaga routingu "send_to_default_provider" — zostanie ustawiony automatycznie');
    }

    res.json({
      current: currentMenu,
      proposed: proposedMenu,
      changes: { added, removed, modified },
      summary,
      affectedUsers,
      warnings,
      blockers,
    });
  } catch (err) { next(err); }
});

// ── POST /api/workspace-config/apply ──────────────────────────────

router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const ws = await loadCurrentConfig(wsId);
    if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

    const body = req.body as ConfigChangeBody;
    const proposedOrgType = body.orgType ?? ws.orgType as OrgType;

    // ── HARD VALIDATION ──

    // CLIENT must have active provider with canReceiveTickets
    if (proposedOrgType === 'CLIENT') {
      const hasProvider = ws.providerRelations.some(r => r.canReceiveTickets);
      if (!hasProvider) {
        res.status(422).json({
          error: 'Zmiana na typ CLIENT wymaga aktywnej relacji z firmą IT',
          code: 'MISSING_PROVIDER_RELATION',
        });
        return;
      }
    }

    // CLIENT forces send_to_default_provider routing
    let ticketRoutingMode = body.ticketRoutingMode ?? ws.helpdeskSettings?.ticketRoutingMode ?? 'internal_only';
    if (proposedOrgType === 'CLIENT') {
      ticketRoutingMode = 'send_to_default_provider';
    }

    // ── TRANSACTIONAL APPLY ──

    await prisma.$transaction(async (tx) => {
      // 1. Update Workspace canonical fields
      await tx.workspace.update({
        where: { id: wsId },
        data: {
          orgType: proposedOrgType as any,
          platformBillingMode: (body.platformBillingMode ?? ws.platformBillingMode) as any,
          accountManagedBy: (body.accountManagedBy ?? ws.accountManagedBy) as any,
          detachPolicy: (body.detachPolicy ?? ws.detachPolicy) as any,
        },
      });

      // 2. Upsert WorkspaceModule rows
      if (body.modules) {
        for (const change of body.modules) {
          const newState = ACTION_TO_STATE[change.action];
          if (!newState) continue;

          const expiresAt = change.action === 'start_trial'
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // +14 days
            : null;

          await tx.workspaceModule.upsert({
            where: {
              workspaceId_moduleKey: { workspaceId: wsId, moduleKey: change.moduleKey as any },
            },
            create: {
              workspaceId: wsId,
              moduleKey: change.moduleKey as any,
              state: newState as any,
              expiresAt,
            },
            update: {
              state: newState as any,
              expiresAt,
            },
          });
        }
      }

      // 3. Upsert WorkspaceHelpdeskSettings
      await tx.workspaceHelpdeskSettings.upsert({
        where: { workspaceId: wsId },
        create: {
          workspaceId: wsId,
          ticketRoutingMode,
        },
        update: {
          ticketRoutingMode,
        },
      });
    });

    // 4. Sync legacy fields (outside transaction — non-critical)
    await syncLegacyFields(wsId);

    // Return updated config
    const updated = await loadCurrentConfig(wsId);
    res.json({
      orgType: updated!.orgType,
      organizationType: updated!.organizationType,
      ticketRoutingMode: updated!.helpdeskSettings?.ticketRoutingMode ?? 'internal_only',
      modules: updated!.modules,
      enabledModules: updated!.enabledModules,
      plan: updated!.plan,
      platformBillingMode: updated!.platformBillingMode,
      accountManagedBy: updated!.accountManagedBy,
      detachPolicy: updated!.detachPolicy,
      providerRelations: updated!.providerRelations,
      clientRelations: updated!.clientRelations,
      helpdeskSettings: updated!.helpdeskSettings,
    });
  } catch (err) { next(err); }
});

// ── Summary builder ───────────────────────────────────────────────

function buildSummary(
  currentOrg: OrgType, proposedOrg: OrgType,
  currentRouting: string, proposedRouting: string,
  body: ConfigChangeBody,
  added: { type: string; id: string; label: string }[],
  removed: { type: string; id: string; label: string }[],
  modified: { id: string; from: string; to: string; label: string }[],
  affectedUsers: number,
  providerRelations: { providerWorkspace: { name: string } }[],
): { icon: string; text: string }[] {
  const summary: { icon: string; text: string }[] = [];

  // Org type change
  if (currentOrg !== proposedOrg) {
    const names: Record<string, string> = { CLIENT: 'Klient', INTERNAL_IT: 'Wewnętrzne IT', MSP: 'Firma IT / MSP' };
    summary.push({ icon: '~', text: `Typ organizacji zmieni się z "${names[currentOrg]}" na "${names[proposedOrg]}"` });
  }

  // Routing change
  if (currentRouting !== proposedRouting) {
    const routingNames: Record<string, string> = {
      internal_only: 'wewnętrzna obsługa',
      send_to_default_provider: 'automatyczne wysyłanie do firmy IT',
      ask_each_time: 'wybór przy każdym zgłoszeniu',
    };
    summary.push({ icon: '~', text: `Routing zgłoszeń zmieni się na: ${routingNames[proposedRouting] ?? proposedRouting}` });
  }

  // Provider routing
  if (proposedOrg === 'CLIENT' && providerRelations.length > 0) {
    summary.push({ icon: 'info', text: `Zgłoszenia będą trafiać do partnera IT: ${providerRelations[0].providerWorkspace.name}` });
  }

  // Billing
  if (body.platformBillingMode === 'PROVIDER') {
    summary.push({ icon: 'info', text: 'Abonament będzie opłacany przez partnera IT' });
  }
  if (body.accountManagedBy === 'PROVIDER') {
    summary.push({ icon: 'info', text: 'Konto będzie zarządzane przez partnera IT' });
  }

  // Added sections
  for (const a of added.filter(x => x.type === 'group')) {
    if (a.label) summary.push({ icon: '+', text: `Sekcja "${a.label}" zostanie dodana` });
  }

  // Removed sections
  for (const r of removed.filter(x => x.type === 'group')) {
    if (r.label) summary.push({ icon: '-', text: `Sekcja "${r.label}" zostanie ukryta` });
  }

  // Modified (readonly)
  for (const m of modified) {
    if (m.to === 'readonly' && m.label) {
      summary.push({ icon: '~', text: `${m.label} przejdzie w tryb readonly` });
    }
  }

  // Module actions
  if (body.modules) {
    for (const mod of body.modules) {
      const keyLabel = MODULE_LABELS[mod.moduleKey] ?? mod.moduleKey;
      switch (mod.action) {
        case 'activate':
          summary.push({ icon: '+', text: `Moduł "${keyLabel}" zostanie aktywowany` });
          break;
        case 'deactivate':
          summary.push({ icon: '-', text: `Moduł "${keyLabel}" zostanie wyłączony` });
          break;
        case 'start_trial':
          summary.push({ icon: '+', text: `Moduł "${keyLabel}" — rozpocznie się 14-dniowy test` });
          break;
        case 'delegate_to_provider':
          summary.push({ icon: '~', text: `Moduł "${keyLabel}" — zarządzanie przekazane providerowi` });
          break;
        case 'set_readonly':
          summary.push({ icon: '~', text: `Moduł "${keyLabel}" przejdzie w tryb tylko do odczytu` });
          break;
        case 'set_limited':
          summary.push({ icon: '~', text: `Moduł "${keyLabel}" będzie dostępny w trybie ograniczonym` });
          break;
      }
    }
  }

  // Affected users
  if (affectedUsers > 0) {
    summary.push({ icon: '-', text: `${affectedUsers} użytkowników straci dostęp do ukrytych sekcji` });
  }

  return summary;
}

const MODULE_LABELS: Record<string, string> = {
  INFRASTRUCTURE: 'Infrastruktura IT',
  SERVICE_DESK: 'Service Desk',
  INVOICING: 'Fakturowanie',
  PACKAGING: 'Pakowanie',
  SKP: 'SKP',
  AI: 'Asystent AI',
};

// ── Affected users counter ────────────────────────────────────────

async function countAffectedUsers(
  wsId: string,
  currentMenu: { visibleItems: string[] },
  proposedMenu: { visibleItems: string[] },
): Promise<number> {
  const removedItems = currentMenu.visibleItems.filter(i => !proposedMenu.visibleItems.includes(i));
  if (removedItems.length === 0) return 0;

  // Count non-admin members who will lose visible sections
  const members = await prisma.workspaceMembership.count({
    where: {
      workspaceId: wsId,
      status: 'ACTIVE',
      role: { in: ['TECHNICIAN', 'MEMBER', 'VIEWER'] },
    },
  });

  return members;
}

export default router;

/**
 * Synchronizes canonical fields → legacy fields for backward compatibility.
 *
 * CANONICAL (new — source of truth):
 *   - Workspace.orgType (enum OrganizationType)
 *   - WorkspaceModule (table with ModuleKey + ModuleState)
 *
 * LEGACY (kept in sync — do NOT use for new features):
 *   - Workspace.organizationType (free string)
 *   - Workspace.enabledModules (string[])
 *
 * Call after every workspace-config apply.
 */

import prisma from './prisma';

// Canonical OrganizationType enum → legacy organizationType string
const ORG_TYPE_TO_LEGACY: Record<string, string> = {
  MSP: 'msp',
  CLIENT: 'client',
  INTERNAL_IT: 'internal_it',
};

// Canonical ModuleKey enum → legacy enabledModules string
const MODULE_KEY_TO_STRING: Record<string, string> = {
  INFRASTRUCTURE: 'infrastructure',
  SERVICE_DESK: 'service-desk',
  INVOICING: 'invoicing',
  PACKAGING: 'packaging',
  SKP: 'skp',
  AI: 'ai',
};

// States that count as "enabled" in the legacy enabledModules[] array
const ENABLED_STATES = new Set(['ACTIVE', 'TRIAL']);

export async function syncLegacyFields(workspaceId: string): Promise<void> {
  // 1. Read current canonical state
  // NOTE: Uses `as any` until `npx prisma generate` is run with the updated schema.
  const workspace = await (prisma.workspace as any).findUnique({
    where: { id: workspaceId },
    select: {
      orgType: true,
      modules: {
        select: { moduleKey: true, state: true },
      },
    },
  });

  if (!workspace) return;

  // 2. Compute legacy values
  const legacyOrgType = ORG_TYPE_TO_LEGACY[workspace.orgType] ?? 'internal_it';

  const legacyModules: string[] = [];
  for (const m of workspace.modules) {
    if (ENABLED_STATES.has(m.state)) {
      const legacyKey = MODULE_KEY_TO_STRING[m.moduleKey];
      if (legacyKey) legacyModules.push(legacyKey);
    }
  }

  // 3. Update legacy fields
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      organizationType: legacyOrgType,
      enabledModules: legacyModules,
    },
  });
}

// Reverse mapping for migration/backfill: legacy string → canonical enum value
export const LEGACY_ORG_TO_CANONICAL: Record<string, string> = {
  msp: 'MSP',
  it_operator: 'MSP',
  client: 'CLIENT',
  client_external_it: 'CLIENT',
  internal_it: 'INTERNAL_IT',
};

export const LEGACY_MODULE_TO_KEY: Record<string, string[]> = {
  'infrastructure': ['INFRASTRUCTURE'],
  'service-desk': ['SERVICE_DESK'],
  'invoicing': ['INVOICING'],
  'packaging': ['PACKAGING'],
  'skp': ['SKP'],
  'ai': ['AI'],
  'helpdesk': ['INFRASTRUCTURE', 'SERVICE_DESK'],
  'service': ['SKP'],
};

/**
 * Backfill script: Migrate enabledModules[] → WorkspaceModule table.
 *
 * Run AFTER the 20260407_workspace_config migration:
 *   npx tsx src/scripts/migrate-workspace-config.ts
 *
 * Safe to re-run — uses upsert (skipDuplicates).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Legacy enabledModules string → canonical ModuleKey enum
const STRING_TO_MODULE_KEY: Record<string, string[]> = {
  'infrastructure': ['INFRASTRUCTURE'],
  'service-desk': ['SERVICE_DESK'],
  'invoicing': ['INVOICING'],
  'packaging': ['PACKAGING'],
  'skp': ['SKP'],
  'ai': ['AI'],
  // Legacy keys that expand to multiple modules
  'helpdesk': ['INFRASTRUCTURE', 'SERVICE_DESK'],
  'service': ['SKP'],
};

async function main() {
  console.log('Starting workspace config migration...');

  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      enabledModules: true,
      organizationType: true,
      orgType: true,
    },
  });

  console.log(`Found ${workspaces.length} workspaces to process.`);

  let modulesCreated = 0;
  let skipped = 0;

  for (const ws of workspaces) {
    // Collect unique module keys from enabledModules
    const moduleKeys = new Set<string>();
    for (const legacyKey of ws.enabledModules) {
      const mapped = STRING_TO_MODULE_KEY[legacyKey];
      if (mapped) {
        mapped.forEach(k => moduleKeys.add(k));
      } else {
        console.warn(`  [WARN] Unknown module key "${legacyKey}" in workspace ${ws.id} — skipping`);
      }
    }

    // Upsert WorkspaceModule rows
    for (const moduleKey of moduleKeys) {
      try {
        await prisma.workspaceModule.upsert({
          where: {
            workspaceId_moduleKey: {
              workspaceId: ws.id,
              moduleKey: moduleKey as any,
            },
          },
          create: {
            workspaceId: ws.id,
            moduleKey: moduleKey as any,
            state: 'ACTIVE',
          },
          update: {}, // no-op if already exists
        });
        modulesCreated++;
      } catch (err: any) {
        console.warn(`  [WARN] Failed to upsert ${moduleKey} for workspace ${ws.id}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\nDone! Created/verified ${modulesCreated} WorkspaceModule rows. Skipped: ${skipped}.`);
  console.log('orgType backfill was already done in the SQL migration.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

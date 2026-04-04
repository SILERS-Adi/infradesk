import prisma from '../lib/prisma';

export interface TicketRoutingResult {
  providerWorkspaceId: string | null;
  requiresUserChoice: boolean;
  isInternal: boolean;
  availableProviders?: { id: string; name: string }[];
}

/**
 * Resolves which workspace should handle a ticket from the given workspace.
 *
 * Used by:
 * - Ticket creation form
 * - AI assistant auto-create
 * - Agent alerts auto-create
 * - QR scan ticket creation
 * - Public ticket form
 */
export async function resolveTicketProvider(workspaceId: string): Promise<TicketRoutingResult> {
  // 1. Get helpdesk settings
  const settings = await prisma.workspaceHelpdeskSettings.findUnique({
    where: { workspaceId },
  });

  // No settings = internal only (default)
  if (!settings || settings.ticketRoutingMode === 'internal_only') {
    return { providerWorkspaceId: null, requiresUserChoice: false, isInternal: true };
  }

  // 2. send_to_default_provider
  if (settings.ticketRoutingMode === 'send_to_default_provider') {
    if (settings.defaultProviderWorkspaceId) {
      // Verify relation still active
      const relation = await prisma.workspaceRelation.findFirst({
        where: {
          clientWorkspaceId: workspaceId,
          providerWorkspaceId: settings.defaultProviderWorkspaceId,
          status: 'ACTIVE',
          canReceiveTickets: true,
        },
      });
      if (relation) {
        return {
          providerWorkspaceId: settings.defaultProviderWorkspaceId,
          requiresUserChoice: false,
          isInternal: false,
        };
      }
    }
    // Default provider not found or inactive → fallback to internal
    return { providerWorkspaceId: null, requiresUserChoice: false, isInternal: true };
  }

  // 3. ask_each_time
  if (settings.ticketRoutingMode === 'ask_each_time') {
    // Get all active providers for this client
    const relations = await prisma.workspaceRelation.findMany({
      where: {
        clientWorkspaceId: workspaceId,
        status: 'ACTIVE',
        canReceiveTickets: true,
      },
      include: {
        providerWorkspace: { select: { id: true, name: true } },
      },
    });

    const providers = relations.map(r => ({
      id: r.providerWorkspace.id,
      name: r.providerWorkspace.name,
    }));

    // Include "internal" as an option
    return {
      providerWorkspaceId: null,
      requiresUserChoice: providers.length > 0,
      isInternal: providers.length === 0,
      availableProviders: providers,
    };
  }

  // Fallback
  return { providerWorkspaceId: null, requiresUserChoice: false, isInternal: true };
}

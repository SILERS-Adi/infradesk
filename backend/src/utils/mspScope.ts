import prisma from '../lib/prisma';

/**
 * For MSP workspaces, returns array of [own workspace + all client workspaces].
 * For non-MSP, returns just [own workspace].
 */
export async function getMspWorkspaceIds(workspaceId: string): Promise<string[]> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationType: true },
  });

  if (!ws || (ws.organizationType !== 'msp' && ws.organizationType !== 'it_operator')) {
    return [workspaceId];
  }

  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId: workspaceId, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });

  return [workspaceId, ...relations.map(r => r.clientWorkspaceId)];
}

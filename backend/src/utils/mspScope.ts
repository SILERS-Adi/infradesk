import prisma from '../lib/prisma';

/**
 * For MSP workspaces, returns array of [own workspace + all client workspaces].
 * For non-MSP, returns just [own workspace].
 */
export async function getMspWorkspaceIds(workspaceId: string): Promise<string[]> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { orgType: true, organizationType: true },
  });

  if (!ws) return [workspaceId];

  // Prefer canonical orgType, fallback to legacy organizationType
  const isMsp = ws.orgType
    ? (ws.orgType === 'MSP' || ws.orgType === 'IT_OPERATOR')
    : (ws.organizationType === 'msp' || ws.organizationType === 'it_operator');

  if (!isMsp) return [workspaceId];

  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId: workspaceId, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });

  return [workspaceId, ...relations.map(r => r.clientWorkspaceId)];
}

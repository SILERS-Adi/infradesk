import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import { CreateDelegationInput, UpdateDelegationInput } from './delegations.validation';

const delegationSelect = {
  id: true, delegationNumber: true, workspaceId: true, title: true, description: true,
  scheduledAt: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
};

async function generateDelegationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.delegation.count({ where: { delegationNumber: { startsWith: `DEL-${year}-` } } });
  return `DEL-${year}-${String(count + 1).padStart(4, '0')}`;
}

export async function listDelegations(params: { assignedToUserId?: string; workspaceId?: string | null }) {
  const where: Record<string, unknown> = {};
  if (params.workspaceId) where.workspaceId = params.workspaceId;
  if (params.assignedToUserId) where.assignedToUserId = params.assignedToUserId;
  return prisma.delegation.findMany({ where, orderBy: { createdAt: 'desc' }, select: delegationSelect });
}

export async function getDelegationById(id: string) {
  const d = await prisma.delegation.findUnique({ where: { id }, select: delegationSelect });
  if (!d) throw new AppError('Delegation not found', 404);
  return d;
}

export async function createDelegation(data: CreateDelegationInput, createdByUserId: string) {
  const delegationNumber = await generateDelegationNumber();
  const d = await prisma.delegation.create({
    data: {
      delegationNumber, workspaceId: data.workspaceId, createdByUserId,
      assignedToUserId: data.assignedToUserId,
      title: data.title, description: data.description,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
    select: delegationSelect,
  });
  await logActivity(prisma, {
    entityType: 'Delegation', entityId: d.id, actionType: 'CREATE',
    description: `Delegation ${d.delegationNumber} created: "${d.title}"`,
    performedByUserId: createdByUserId,
  });
  return d;
}

export async function updateDelegation(id: string, data: UpdateDelegationInput, performedByUserId: string) {
  const existing = await prisma.delegation.findUnique({ where: { id } });
  if (!existing) throw new AppError('Delegation not found', 404);
  return prisma.delegation.update({
    where: { id },
    data: { ...data, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined },
    select: delegationSelect,
  });
}

export async function deleteDelegation(id: string, performedByUserId: string) {
  const d = await prisma.delegation.findUnique({ where: { id } });
  if (!d) throw new AppError('Delegation not found', 404);
  await prisma.delegation.delete({ where: { id } });
  await logActivity(prisma, {
    entityType: 'Delegation', entityId: id, actionType: 'DELETE',
    description: `Delegation ${d.delegationNumber} deleted`,
    performedByUserId,
  });
}

import prisma from '../../lib/prisma';
import type { CreateContractorInput, UpdateContractorInput } from './contractors.validation';

export async function listContractors(params: {
  workspaceId: string; search?: string; page?: number; perPage?: number;
}) {
  const { workspaceId, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { nip: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.invoicingContractor.findMany({
      where: where as any,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.invoicingContractor.count({ where: where as any }),
  ]);

  return { items, total };
}

export async function getContractor(id: string, workspaceId: string) {
  return prisma.invoicingContractor.findFirst({ where: { id, workspaceId } });
}

export async function createContractor(data: CreateContractorInput, workspaceId: string) {
  return prisma.invoicingContractor.create({ data: { ...data, workspaceId } });
}

export async function updateContractor(id: string, data: UpdateContractorInput, workspaceId: string) {
  const existing = await prisma.invoicingContractor.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;
  return prisma.invoicingContractor.update({ where: { id }, data });
}

export async function deleteContractor(id: string, workspaceId: string) {
  const existing = await prisma.invoicingContractor.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.invoicingContractor.delete({ where: { id } });
  return true;
}

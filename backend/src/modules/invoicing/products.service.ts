import prisma from '../../lib/prisma';
import type { CreateProductInput, UpdateProductInput } from './products.validation';

export async function listProducts(params: {
  workspaceId: string; search?: string; page?: number; perPage?: number;
}) {
  const { workspaceId, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.invoicingProduct.findMany({
      where: where as any, orderBy: { name: 'asc' },
      skip: (page - 1) * perPage, take: perPage,
    }),
    prisma.invoicingProduct.count({ where: where as any }),
  ]);
  return { items, total };
}

export async function getProduct(id: string, workspaceId: string) {
  return prisma.invoicingProduct.findFirst({ where: { id, workspaceId } });
}

export async function createProduct(data: CreateProductInput, workspaceId: string) {
  return prisma.invoicingProduct.create({ data: { ...data, workspaceId } });
}

export async function updateProduct(id: string, data: UpdateProductInput, workspaceId: string) {
  const existing = await prisma.invoicingProduct.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;
  return prisma.invoicingProduct.update({ where: { id }, data });
}

export async function deleteProduct(id: string, workspaceId: string) {
  const existing = await prisma.invoicingProduct.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.invoicingProduct.delete({ where: { id } });
  return true;
}

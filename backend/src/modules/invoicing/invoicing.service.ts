import prisma from '../../lib/prisma';
import type { CreateDocumentInput, UpdateDocumentInput } from './invoicing.validation';

const documentSelect = {
  id: true,
  workspaceId: true,
  number: true,
  type: true,
  status: true,
  contractorName: true,
  contractorNip: true,
  totalNet: true,
  totalVat: true,
  totalGross: true,
  issuedAt: true,
  dueDate: true,
  notes: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  items: true,
};

export async function listDocuments(params: {
  workspaceId: string;
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  perPage?: number;
}) {
  const { workspaceId, status, type, search, page = 1, perPage = 50 } = params;
  const where: Record<string, unknown> = { workspaceId };

  if (status) where.status = status.toUpperCase();
  if (type) {
    const types = type.split(',').map(t => t.trim().toUpperCase());
    where.type = { in: types };
  }
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { contractorName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.invoiceDocument.findMany({
      where: where as any,
      orderBy: { issuedAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        contractorName: true,
        totalNet: true,
        totalVat: true,
        totalGross: true,
        issuedAt: true,
      },
    }),
    prisma.invoiceDocument.count({ where: where as any }),
  ]);

  // Map to frontend-compatible format
  const mapped = items.map(d => ({
    id: d.id,
    type: d.type.toLowerCase(),
    number: d.number,
    buyer_name: d.contractorName,
    net_total: Number(d.totalNet),
    vat_total: Number(d.totalVat),
    gross_total: Number(d.totalGross),
    status: d.status.toLowerCase(),
    issue_date: d.issuedAt.toISOString().slice(0, 10),
  }));

  return { items: mapped, total };
}

export async function getDocument(id: string, workspaceId: string) {
  const doc = await prisma.invoiceDocument.findFirst({
    where: { id, workspaceId },
    select: documentSelect,
  });
  if (!doc) return null;

  // Map to frontend-compatible format
  return {
    id: doc.id,
    type: doc.type.toLowerCase(),
    number: doc.number,
    status: doc.status.toLowerCase(),
    issue_date: doc.issuedAt.toISOString().slice(0, 10),
    sale_date: doc.issuedAt.toISOString().slice(0, 10),
    due_date: doc.dueDate?.toISOString().slice(0, 10) || null,
    payment_method: 'przelew',
    currency: 'PLN',
    seller_name: 'Moja Firma Sp. z o.o.',
    seller_nip: null,
    seller_street: null,
    seller_city: null,
    seller_zip: null,
    seller_bank_name: null,
    seller_bank_account: null,
    buyer_name: doc.contractorName,
    buyer_nip: doc.contractorNip,
    buyer_street: null,
    buyer_city: null,
    buyer_zip: null,
    net_total: Number(doc.totalNet),
    vat_total: Number(doc.totalVat),
    gross_total: Number(doc.totalGross),
    paid_amount: doc.status === 'PAID' ? Number(doc.totalGross) : 0,
    split_payment: false,
    reverse_charge: false,
    is_tp: false,
    ksef_number: null,
    ksef_status: null,
    notes: doc.notes,
    internal_notes: null,
    corrected_document_id: null,
    source_document_id: null,
    items: doc.items.map((item, idx) => ({
      id: item.id,
      position: idx + 1,
      name: item.name,
      unit: 'szt',
      quantity: Number(item.quantity),
      unit_price_net: Number(item.priceNet),
      vat_rate: item.vatRate,
      discount_percent: 0,
      net_value: Number(item.totalNet),
      vat_value: Number(item.totalVat),
      gross_value: Number(item.totalGross),
      pkwiu: null,
      gtu: null,
      product_id: null,
    })),
    created_at: doc.createdAt.toISOString(),
  };
}

export async function createDocument(data: CreateDocumentInput, workspaceId: string, userId: string) {
  const doc = await prisma.invoiceDocument.create({
    data: {
      workspaceId,
      number: data.number,
      type: data.type as any,
      status: data.status as any,
      contractorName: data.contractorName,
      contractorNip: data.contractorNip,
      totalNet: data.totalNet,
      totalVat: data.totalVat,
      totalGross: data.totalGross,
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes,
      createdById: userId,
      items: {
        create: data.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          priceNet: item.priceNet,
          vatRate: item.vatRate,
          totalNet: item.totalNet,
          totalVat: item.totalVat,
          totalGross: item.totalGross,
        })),
      },
    },
    select: documentSelect,
  });
  return doc;
}

export async function updateDocument(id: string, data: UpdateDocumentInput, workspaceId: string) {
  const existing = await prisma.invoiceDocument.findFirst({ where: { id, workspaceId } });
  if (!existing) return null;

  // If items provided, delete old and create new
  if (data.items) {
    await prisma.invoiceDocumentItem.deleteMany({ where: { documentId: id } });
  }

  const doc = await prisma.invoiceDocument.update({
    where: { id },
    data: {
      ...(data.number !== undefined && { number: data.number }),
      ...(data.type !== undefined && { type: data.type as any }),
      ...(data.status !== undefined && { status: data.status as any }),
      ...(data.contractorName !== undefined && { contractorName: data.contractorName }),
      ...(data.contractorNip !== undefined && { contractorNip: data.contractorNip }),
      ...(data.totalNet !== undefined && { totalNet: data.totalNet }),
      ...(data.totalVat !== undefined && { totalVat: data.totalVat }),
      ...(data.totalGross !== undefined && { totalGross: data.totalGross }),
      ...(data.issuedAt !== undefined && { issuedAt: new Date(data.issuedAt) }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.items && {
        items: {
          create: data.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            priceNet: item.priceNet,
            vatRate: item.vatRate,
            totalNet: item.totalNet,
            totalVat: item.totalVat,
            totalGross: item.totalGross,
          })),
        },
      }),
    },
    select: documentSelect,
  });
  return doc;
}

export async function deleteDocument(id: string, workspaceId: string) {
  const existing = await prisma.invoiceDocument.findFirst({ where: { id, workspaceId } });
  if (!existing) return false;
  await prisma.invoiceDocument.delete({ where: { id } });
  return true;
}

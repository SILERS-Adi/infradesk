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

  // Try to enrich buyer data from Contractor table (match by NIP or name)
  let buyerContractor: any = null;
  if (doc.contractorNip || doc.contractorName) {
    buyerContractor = await prisma.invoicingContractor.findFirst({
      where: {
        workspaceId,
        OR: [
          doc.contractorNip ? { nip: doc.contractorNip } : undefined,
          doc.contractorName ? { name: doc.contractorName } : undefined,
        ].filter(Boolean) as any,
      },
    });
  }

  // Get workspace info + invoicing settings for seller details
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, legalName: true, taxId: true, city: true, addressLine1: true, postalCode: true, email: true, phone: true },
  });
  const invSettings = await prisma.workspaceSetting.findMany({
    where: { workspaceId, key: { startsWith: 'inv_' } },
  });
  const sm: Record<string, string> = {};
  for (const s of invSettings) sm[s.key] = s.value;

  // Parse bank accounts
  let bankAccounts: any[] = [];
  try { bankAccounts = JSON.parse(sm['inv_bank_accounts'] || '[]'); } catch {}
  const defaultBank = bankAccounts.find((a: any) => a.isDefault) || bankAccounts[0];

  // Map to frontend-compatible format
  return {
    id: doc.id,
    type: doc.type.toLowerCase(),
    number: doc.number,
    status: doc.status.toLowerCase(),
    issue_date: doc.issuedAt.toISOString().slice(0, 10),
    sale_date: doc.issuedAt.toISOString().slice(0, 10),
    due_date: doc.dueDate?.toISOString().slice(0, 10) || null,
    payment_method: sm['inv_default_payment_method'] || 'przelew',
    currency: sm['inv_default_currency'] || 'PLN',
    seller_name: ws?.legalName || ws?.name || 'Brak danych sprzedawcy',
    seller_nip: ws?.taxId || null,
    seller_regon: sm['inv_regon'] || null,
    seller_street: ws?.addressLine1 || null,
    seller_city: ws?.city || null,
    seller_zip: ws?.postalCode || null,
    seller_email: ws?.email || null,
    seller_phone: ws?.phone || null,
    seller_bank_name: defaultBank?.bankName || null,
    seller_bank_account: defaultBank?.accountNumber || null,
    buyer_name: doc.contractorName,
    buyer_nip: doc.contractorNip,
    buyer_regon: buyerContractor?.regon || null,
    buyer_street: buyerContractor?.address || null,
    buyer_city: buyerContractor?.city || null,
    buyer_zip: (buyerContractor as any)?.postalCode || null,
    buyer_email: buyerContractor?.email || null,
    buyer_phone: buyerContractor?.phone || null,
    buyer_country: (buyerContractor as any)?.country || 'PL',
    net_total: Number(doc.totalNet),
    vat_total: Number(doc.totalVat),
    gross_total: Number(doc.totalGross),
    paid_amount: doc.status === 'PAID' ? Number(doc.totalGross) : 0,
    split_payment: sm['inv_split_payment'] === 'true' || Number(doc.totalGross) > 15000,
    cash_method: sm['inv_cash_method'] === 'true',
    reverse_charge: sm['inv_reverse_charge'] === 'true',
    footer_note: sm['inv_footer_note'] || null,
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

const TYPE_PREFIX: Record<string, string> = {
  SALE_INVOICE: 'FV', PROFORMA: 'PRO', ADVANCE: 'FZ', FINAL: 'FK',
  RECEIPT: 'PAR', PURCHASE_INVOICE: 'FVZ', CORRECTION: 'KOR',
  VAT_MARGIN: 'FVM', BILL: 'R',
  WDT: 'WDT', WNT: 'WNT', EXPORT: 'FEXP', IMPORT: 'FIMP',
  WZ: 'WZ', PZ: 'PZ', MM: 'MM', KP: 'KP', KW: 'KW',
  ESTIMATE: 'OF', ORDER: 'ZAM',
  ACCOUNTING_NOTE: 'NK', CORRECTION_NOTE: 'NKor',
};

async function generateNumber(type: string, workspaceId: string): Promise<string> {
  const prefix = TYPE_PREFIX[type] || 'DOC';
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();

  // Count docs of this type in current month
  const startOfMonth = new Date(year, now.getMonth(), 1);
  const endOfMonth = new Date(year, now.getMonth() + 1, 1);
  const count = await prisma.invoiceDocument.count({
    where: { workspaceId, type: type as any, issuedAt: { gte: startOfMonth, lt: endOfMonth } },
  });

  return `${prefix}/${count + 1}/${month}/${year}`;
}

export async function createDocument(data: CreateDocumentInput, workspaceId: string, userId: string) {
  // Auto-generate number if not provided
  const number = data.number?.trim() || await generateNumber(data.type, workspaceId);

  const doc = await prisma.invoiceDocument.create({
    data: {
      workspaceId,
      number,
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

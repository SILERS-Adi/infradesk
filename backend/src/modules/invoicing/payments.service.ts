import prisma from '../../lib/prisma';
import type { CreatePaymentInput } from './payments.validation';

export async function listPayments(params: {
  workspaceId: string; search?: string; status?: string; page?: number; perPage?: number;
}) {
  const { workspaceId, search, status, page = 1, perPage = 50 } = params;

  // Get all documents with their payments
  const docs = await prisma.invoiceDocument.findMany({
    where: { workspaceId },
    select: {
      id: true, number: true, contractorName: true, totalGross: true,
      dueDate: true, issuedAt: true, status: true,
      payments: { select: { id: true, amount: true, paidAt: true, method: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });

  // Map to payment view
  const items = docs.map(d => {
    const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
    const gross = Number(d.totalGross);
    const remaining = Math.max(0, gross - paid);
    const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && remaining > 0;

    let paymentStatus = 'unpaid';
    if (remaining <= 0) paymentStatus = 'paid';
    else if (paid > 0) paymentStatus = 'partial';
    else if (isOverdue) paymentStatus = 'overdue';

    return {
      documentId: d.id,
      documentNumber: d.number,
      contractorName: d.contractorName,
      gross: parseFloat(gross.toFixed(2)),
      paid: parseFloat(paid.toFixed(2)),
      remaining: parseFloat(remaining.toFixed(2)),
      dueDate: d.dueDate?.toISOString().slice(0, 10) || null,
      issuedAt: d.issuedAt.toISOString().slice(0, 10),
      paymentStatus,
      paymentsCount: d.payments.length,
    };
  });

  // Filter
  let filtered = items;
  if (status) filtered = filtered.filter(i => i.paymentStatus === status);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i =>
      i.documentNumber.toLowerCase().includes(q) ||
      i.contractorName.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  return { items: paged, total };
}

export async function createPayment(data: CreatePaymentInput, workspaceId: string) {
  // Verify document belongs to workspace
  const doc = await prisma.invoiceDocument.findFirst({ where: { id: data.documentId, workspaceId } });
  if (!doc) return null;

  const payment = await prisma.invoicingPayment.create({
    data: {
      workspaceId,
      documentId: data.documentId,
      amount: data.amount,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      method: data.method,
      notes: data.notes,
    },
  });

  // Update document paidAmount
  const allPayments = await prisma.invoicingPayment.findMany({ where: { documentId: data.documentId } });
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
  const gross = Number(doc.totalGross);

  let newStatus = doc.status;
  if (totalPaid >= gross) newStatus = 'PAID';
  else if (totalPaid > 0) newStatus = 'PARTIALLY_PAID';

  await prisma.invoiceDocument.update({
    where: { id: data.documentId },
    data: { status: newStatus as any },
  });

  return payment;
}

export async function deletePayment(id: string, workspaceId: string) {
  const payment = await prisma.invoicingPayment.findFirst({ where: { id, workspaceId } });
  if (!payment) return false;
  await prisma.invoicingPayment.delete({ where: { id } });
  return true;
}

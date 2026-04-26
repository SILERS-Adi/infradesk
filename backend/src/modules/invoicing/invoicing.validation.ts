import { z } from 'zod';

export const createDocumentSchema = z.object({
  number: z.string().optional(), // empty = auto-generate
  type: z.enum([
    'SALE_INVOICE', 'CORRECTION', 'PROFORMA', 'ADVANCE', 'FINAL',
    'RECEIPT', 'PURCHASE_INVOICE', 'VAT_MARGIN', 'BILL',
    'WDT', 'WNT', 'EXPORT', 'IMPORT',
    'WZ', 'PZ', 'MM', 'KP', 'KW',
    'ESTIMATE', 'ORDER', 'ACCOUNTING_NOTE', 'CORRECTION_NOTE',
  ]).default('SALE_INVOICE'),
  status: z.enum(['DRAFT', 'ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']).default('DRAFT'),
  contractorName: z.string().min(1),
  contractorNip: z.string().optional(),
  totalNet: z.number().default(0),
  totalVat: z.number().default(0),
  totalGross: z.number().default(0),
  issuedAt: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().optional().default('szt'),
    quantity: z.number().default(1),
    priceNet: z.number().default(0),
    vatRate: z.string().default('23'),
    discount: z.number().optional().default(0),
    totalNet: z.number().default(0),
    totalVat: z.number().default(0),
    totalGross: z.number().default(0),
  })).default([]),
});

export const updateDocumentSchema = createDocumentSchema.partial();

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

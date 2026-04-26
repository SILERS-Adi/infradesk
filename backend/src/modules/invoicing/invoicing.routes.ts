import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createDocumentSchema, updateDocumentSchema } from './invoicing.validation';
import * as ctrl from './invoicing.controller';

function generateInvoiceHtml(doc: any): string {
  const fmtPLN = (v: any) => {
    const n = typeof v === 'number' ? v : parseFloat(v) || 0;
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
  };
  const typeLabel: Record<string, string> = {
    sale_invoice: 'Faktura VAT', proforma: 'Faktura Proforma', advance: 'Faktura Zaliczkowa',
    final: 'Faktura Końcowa', receipt: 'Paragon', purchase_invoice: 'Faktura Zakupu',
    correction: 'Faktura Korygująca', vat_margin: 'Faktura VAT Marża', bill: 'Rachunek',
    wdt: 'Faktura WDT', wnt: 'Faktura WNT', export: 'Faktura Eksportowa', import: 'Faktura Importowa',
    wz: 'Wydanie Zewnętrzne (WZ)', pz: 'Przyjęcie Zewnętrzne (PZ)', mm: 'Przesunięcie Międzymagazynowe (MM)',
    kp: 'KP — Dowód Wpłaty', kw: 'KW — Dowód Wypłaty',
    estimate: 'Oferta', order: 'Zamówienie',
    accounting_note: 'Nota Księgowa', correction_note: 'Nota Korygująca',
  };
  const title = typeLabel[doc.type] || 'Dokument';

  const itemsHtml = (doc.items || []).map((it: any, i: number) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${it.name || ''}</td>
      <td style="text-align:center">${it.unit || 'szt'}</td>
      <td style="text-align:right">${it.quantity ?? 0}</td>
      <td style="text-align:right">${fmtPLN(it.unit_price_net ?? it.unit_price)}</td>
      <td style="text-align:right">${fmtPLN(it.net_value ?? it.net)}</td>
      <td style="text-align:center">${it.vat_rate || '23'}${it.vat_rate === 'zw' || it.vat_rate === 'np' ? '' : '%'}</td>
      <td style="text-align:right">${fmtPLN(it.vat_value ?? it.vat)}</td>
      <td style="text-align:right"><strong>${fmtPLN(it.gross_value ?? it.gross)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${title} ${doc.number}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a2e; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 16px; border-bottom: 2px solid #6366F1; }
  .doc-title { font-size: 22px; font-weight: 800; color: #6366F1; }
  .doc-number { font-size: 14px; font-weight: 600; color: #374151; margin-top: 4px; }
  .doc-dates { text-align: right; font-size: 10px; color: #6b7280; }
  .doc-dates div { margin-bottom: 3px; }
  .doc-dates strong { color: #1a1a2e; }
  .parties { display: flex; gap: 40px; margin-bottom: 28px; }
  .party { flex: 1; }
  .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6366F1; margin-bottom: 6px; }
  .party-name { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 2px; }
  .party-detail { font-size: 10px; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f3f4f6; padding: 8px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
  .total-row.grand { font-size: 14px; font-weight: 800; color: #6366F1; border-top: 2px solid #6366F1; border-bottom: none; padding-top: 10px; }
  .payment { background: #f9fafb; padding: 14px; border-radius: 8px; margin-bottom: 16px; font-size: 10px; }
  .payment strong { color: #1a1a2e; }
  .notes { font-size: 10px; color: #6b7280; margin-top: 16px; }
  .footer { margin-top: 60px; display: flex; justify-content: space-between; }
  .signature { width: 200px; text-align: center; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 9px; color: #9ca3af; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="doc-title">${title}</div>
      <div class="doc-number">Nr: ${doc.number}</div>
    </div>
    <div class="doc-dates">
      <div>Data wystawienia: <strong>${doc.issue_date}</strong></div>
      ${doc.sale_date ? `<div>Data sprzedaży: <strong>${doc.sale_date}</strong></div>` : ''}
      ${doc.due_date ? `<div>Termin płatności: <strong>${doc.due_date}</strong></div>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Sprzedawca</div>
      <div class="party-name">${doc.seller_name || '—'}</div>
      ${doc.seller_nip ? `<div class="party-detail">NIP: ${doc.seller_nip}</div>` : ''}
      ${doc.seller_regon ? `<div class="party-detail">REGON: ${doc.seller_regon}</div>` : ''}
      ${doc.seller_street ? `<div class="party-detail">${doc.seller_street}</div>` : ''}
      ${doc.seller_zip || doc.seller_city ? `<div class="party-detail">${doc.seller_zip || ''} ${doc.seller_city || ''}</div>` : ''}
      ${doc.seller_phone ? `<div class="party-detail" style="margin-top:4px">Tel: ${doc.seller_phone}</div>` : ''}
      ${doc.seller_email ? `<div class="party-detail">Email: ${doc.seller_email}</div>` : ''}
      ${doc.seller_bank_name || doc.seller_bank_account ? `<div class="party-detail" style="margin-top:6px;padding:6px 8px;background:#f0f1f3;border-radius:4px">
        ${doc.seller_bank_name ? `<div style="font-size:9px;color:#9ca3af">Bank: ${doc.seller_bank_name}</div>` : ''}
        ${doc.seller_bank_account ? `<div style="font-weight:600;color:#1a1a2e;letter-spacing:0.03em">${doc.seller_bank_account}</div>` : ''}
      </div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Nabywca</div>
      <div class="party-name">${doc.buyer_name || '—'}</div>
      ${doc.buyer_nip ? `<div class="party-detail">NIP: ${doc.buyer_nip}</div>` : ''}
      ${doc.buyer_street ? `<div class="party-detail">${doc.buyer_street}</div>` : ''}
      ${doc.buyer_zip || doc.buyer_city ? `<div class="party-detail">${doc.buyer_zip || ''} ${doc.buyer_city || ''}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">Lp.</th>
        <th style="text-align:left">Nazwa</th>
        <th style="width:50px">Jm.</th>
        <th style="width:50px;text-align:right">Ilość</th>
        <th style="width:80px;text-align:right">Cena netto</th>
        <th style="width:80px;text-align:right">Wartość netto</th>
        <th style="width:50px;text-align:center">VAT</th>
        <th style="width:70px;text-align:right">Kwota VAT</th>
        <th style="width:90px;text-align:right">Brutto</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>Razem netto</span><span>${fmtPLN(doc.net_total)}</span></div>
      <div class="total-row"><span>Razem VAT</span><span>${fmtPLN(doc.vat_total)}</span></div>
      <div class="total-row grand"><span>Do zapłaty</span><span>${fmtPLN(doc.gross_total)}</span></div>
    </div>
  </div>

  <div class="payment">
    <div style="display:flex;gap:30px;flex-wrap:wrap">
      <div>Sposób płatności: <strong>${doc.payment_method || 'przelew'}</strong></div>
      ${doc.due_date ? `<div>Termin płatności: <strong>${doc.due_date}</strong></div>` : ''}
      <div>Waluta: <strong>${doc.currency || 'PLN'}</strong></div>
    </div>
    ${doc.seller_bank_account ? `<div style="margin-top:8px;padding:8px 10px;background:#eef2ff;border-radius:6px;border:1px solid #e0e7ff">
      <div style="font-size:9px;color:#6b7280;margin-bottom:2px">Numer konta do wpłat:</div>
      <div style="font-size:12px;font-weight:700;color:#1a1a2e;letter-spacing:0.04em">${doc.seller_bank_account}</div>
      ${doc.seller_bank_name ? `<div style="font-size:9px;color:#6b7280">${doc.seller_bank_name}</div>` : ''}
    </div>` : ''}
  </div>

  ${doc.notes ? `<div class="notes"><strong>Uwagi:</strong> ${doc.notes}</div>` : ''}

  <div class="footer">
    <div class="signature">Podpis osoby upoważnionej<br>do wystawienia dokumentu</div>
    <div class="signature">Podpis osoby upoważnionej<br>do odbioru dokumentu</div>
  </div>
</body>
</html>`;
}

const router = Router();

router.use(authenticate, requireWorkspace);

// List documents
router.get('/', ctrl.listDocuments);

// Get single document
router.get('/:id', ctrl.getDocument);

// Create document
router.post('/',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(createDocumentSchema),
  ctrl.createDocument,
);

// Update document
router.put('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'),
  validate(updateDocumentSchema),
  ctrl.updateDocument,
);

// PDF generation
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const { getDocument } = await import('./invoicing.service');
    const doc = await getDocument(req.params.id, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Dokument nie znaleziony' }); return; }

    const html = generateInvoiceHtml(doc);

    // Use puppeteer-like approach: return HTML that browser prints
    // For now: return HTML with print-ready CSS — frontend opens in new tab and prints
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// Duplicate document
router.post('/:id/duplicate', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { getDocument, createDocument } = await import('./invoicing.service');
    const doc = await getDocument(req.params.id, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Dokument nie znaleziony' }); return; }

    const newDoc = await createDocument({
      type: doc.type.toUpperCase(),
      number: '', // auto-generate
      status: 'DRAFT',
      contractorName: doc.buyer_name,
      contractorNip: doc.buyer_nip,
      totalNet: doc.net_total,
      totalVat: doc.vat_total,
      totalGross: doc.gross_total,
      issuedAt: new Date().toISOString().slice(0, 10),
      dueDate: null,
      notes: doc.notes,
      items: doc.items?.map((i: any) => ({
        name: i.name, quantity: i.quantity, priceNet: i.unit_price,
        vatRate: i.vat_rate, totalNet: i.net, totalVat: i.vat, totalGross: i.gross,
      })) || [],
    }, req.workspaceId!, req.user!.userId);

    res.json(newDoc);
  } catch (err) { next(err); }
});

// Send document by email
router.post('/:id/send-email', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { to, customMessage } = req.body as { to: string; customMessage?: string };
    if (!to?.trim() || !/@/.test(to)) { res.status(400).json({ error: 'Nieprawidłowy email' }); return; }

    const { getDocument } = await import('./invoicing.service');
    const doc = await getDocument(req.params.id, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Dokument nie znaleziony' }); return; }

    const { sendMailWithAttachment, emailTemplate } = await import('../../lib/mailer');
    const typeLabel: Record<string, string> = {
      sale_invoice: 'faktura VAT', proforma: 'faktura proforma', advance: 'faktura zaliczkowa',
      final: 'faktura końcowa', correction: 'faktura korygująca', receipt: 'paragon',
    };
    const typeName = typeLabel[doc.type] || 'dokument';
    const subject = `${doc.type === 'sale_invoice' ? 'Faktura' : typeName.charAt(0).toUpperCase() + typeName.slice(1)} ${doc.number} — ${doc.seller_name}`;

    const fmtPLN = (v: any) => {
      const n = typeof v === 'number' ? v : parseFloat(v) || 0;
      return n.toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' zł';
    };

    const bodyHtml = emailTemplate(`
      <h2 style="color:#1a1a2e;margin:0 0 16px">Dzień dobry,</h2>
      <p style="color:#334155;line-height:1.6;margin:0 0 16px">
        W załączniku przesyłamy ${typeName} <strong>${doc.number}</strong> na kwotę <strong>${fmtPLN(doc.gross_total)}</strong>.
      </p>
      ${doc.due_date ? `<p style="color:#334155;line-height:1.6;margin:0 0 16px">Termin płatności: <strong>${doc.due_date}</strong></p>` : ''}
      ${doc.seller_bank_account ? `<p style="color:#334155;line-height:1.6;margin:0 0 16px">
        Numer konta do wpłat: <strong style="font-family:monospace">${doc.seller_bank_account}</strong>
      </p>` : ''}
      ${customMessage ? `<div style="background:#f3f4f6;padding:14px;border-radius:8px;margin:16px 0;color:#334155;line-height:1.6">${customMessage.replace(/\n/g, '<br>')}</div>` : ''}
      <p style="color:#64748b;font-size:12px;margin:24px 0 0">W razie pytań prosimy o kontakt.</p>
      <p style="color:#64748b;font-size:12px;margin:4px 0 0">Pozdrawiamy,<br><strong>${doc.seller_name}</strong></p>
    `);

    const pdfHtml = generateInvoiceHtml(doc);

    await sendMailWithAttachment(to.trim(), subject, bodyHtml, [
      {
        filename: `${doc.number.replace(/\//g, '_')}.html`,
        content: pdfHtml,
        contentType: 'text/html; charset=utf-8',
      },
    ]);

    res.json({ ok: true, sentTo: to });
  } catch (err: any) {
    if (err.statusCode === 503) {
      res.status(503).json({ error: 'SMTP nie skonfigurowany — skonfiguruj w ustawieniach' });
    } else next(err);
  }
});

// Create correction for document
router.post('/:id/correct', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { getDocument, createDocument } = await import('./invoicing.service');
    const doc = await getDocument(req.params.id, req.workspaceId!);
    if (!doc) { res.status(404).json({ error: 'Dokument nie znaleziony' }); return; }

    // Correction: same items but with negative values (reversal)
    const correctionItems = doc.items?.map((i: any) => ({
      name: i.name,
      unit: i.unit || 'szt',
      quantity: -i.quantity,
      priceNet: i.unit_price,
      vatRate: i.vat_rate,
      totalNet: -i.net,
      totalVat: -i.vat,
      totalGross: -i.gross,
    })) || [];

    const newDoc = await createDocument({
      type: 'CORRECTION',
      number: '', // auto-generate KOR/...
      status: 'DRAFT',
      contractorName: doc.buyer_name,
      contractorNip: doc.buyer_nip,
      totalNet: -doc.net_total,
      totalVat: -doc.vat_total,
      totalGross: -doc.gross_total,
      issuedAt: new Date().toISOString().slice(0, 10),
      dueDate: null,
      notes: `Korekta do dokumentu ${doc.number}`,
      items: correctionItems,
    }, req.workspaceId!, req.user!.userId);

    res.json(newDoc);
  } catch (err) { next(err); }
});

// Delete document
router.delete('/:id',
  withWorkspaceMembership,
  authorizeWorkspace('OWNER', 'ADMIN'),
  requirePermission('invoicing.documents', 'DELETE'),
  ctrl.deleteDocument,
);

export default router;

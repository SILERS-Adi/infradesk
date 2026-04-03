import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import prisma from '../../lib/prisma';
import { sendMail } from '../../lib/mailer';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate);

// ── Create payment intent (placeholder for Stripe/Przelewy24) ──
router.post('/create-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { workspaceId, billingCycle, amount } = req.body;
    if (!workspaceId || !amount) { res.status(400).json({ error: 'workspaceId and amount required' }); return; }

    // Verify ownership
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access' }); return; }

    // TODO: Integrate with Stripe/Przelewy24
    // For now, return a placeholder payment URL
    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    res.json({
      paymentId,
      status: 'pending',
      message: 'Płatności online będą dostępne wkrótce. Skontaktuj się z nami: kontakt@infradesk.pl',
      // paymentUrl: `https://checkout.stripe.com/...` — future
    });
  } catch (err) { next(err); }
});

// ── Generate and send proforma PDF ──
router.post('/send-proforma', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { workspaceId } = req.body;
    if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }

    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access' }); return; }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, email: true, taxId: true, legalName: true, addressLine1: true, postalCode: true, city: true, billingCycle: true, monthlyPrice: true, lastConfig: true },
    });
    if (!workspace || !workspace.email) { res.status(400).json({ error: 'Workspace email not configured' }); return; }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } });

    // Calculate amount
    const monthly = workspace.monthlyPrice || 0;
    const isYearly = workspace.billingCycle === 'YEARLY';
    const amount = isYearly ? Math.round(monthly * 12 * 0.9) : monthly;
    const period = isYearly ? '12 miesięcy (roczne)' : '1 miesiąc';
    const proformaNumber = `PRO/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${Date.now().toString(36).toUpperCase()}`;

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfReady = new Promise<Buffer>(resolve => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('PROFORMA', { align: 'right' });
    doc.fontSize(10).font('Helvetica').text(proformaNumber, { align: 'right' });
    doc.text(`Data: ${new Date().toLocaleDateString('pl-PL')}`, { align: 'right' });
    doc.moveDown(2);

    // Seller
    doc.fontSize(11).font('Helvetica-Bold').text('Sprzedawca:');
    doc.fontSize(10).font('Helvetica');
    doc.text('SILERS Adrian Błaszczykowski');
    doc.text('ul. Przykładowa 1, 00-000 Warszawa');
    doc.text('NIP: 0000000000');
    doc.text('kontakt@infradesk.pl');
    doc.moveDown();

    // Buyer
    doc.fontSize(11).font('Helvetica-Bold').text('Nabywca:');
    doc.fontSize(10).font('Helvetica');
    doc.text(workspace.legalName || workspace.name);
    if (workspace.addressLine1) doc.text(`${workspace.addressLine1}, ${workspace.postalCode || ''} ${workspace.city || ''}`);
    if (workspace.taxId) doc.text(`NIP: ${workspace.taxId}`);
    doc.text(workspace.email);
    doc.moveDown(2);

    // Table header
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Usługa', 50, tableTop, { width: 280 });
    doc.text('Okres', 330, tableTop, { width: 100 });
    doc.text('Kwota netto', 430, tableTop, { width: 100, align: 'right' });
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    // Table row
    doc.font('Helvetica').fontSize(10);
    const rowY = tableTop + 25;
    doc.text('InfraDesk — pakiet usług', 50, rowY, { width: 280 });
    doc.text(period, 330, rowY, { width: 100 });
    doc.text(`${amount},00 PLN`, 430, rowY, { width: 100, align: 'right' });

    // Total
    doc.moveDown(3);
    const totalY = rowY + 40;
    doc.moveTo(50, totalY).lineTo(545, totalY).stroke();
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(`Razem netto: ${amount},00 PLN`, 50, totalY + 10, { align: 'right' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`VAT 23%: ${Math.round(amount * 0.23)},00 PLN`, { align: 'right' });
    doc.font('Helvetica-Bold');
    doc.text(`Razem brutto: ${Math.round(amount * 1.23)},00 PLN`, { align: 'right' });

    // Footer
    doc.moveDown(3);
    doc.fontSize(9).font('Helvetica').fillColor('#666');
    doc.text('Proforma nie jest dokumentem księgowym. Po dokonaniu wpłaty zostanie wystawiona faktura VAT.', 50, undefined, { align: 'center' });
    doc.text('Termin płatności: 7 dni od daty wystawienia.', { align: 'center' });

    doc.end();
    const pdfBuffer = await pdfReady;

    // Send email with PDF attachment
    const cfg = await getSmtpConfigForProforma();

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    await transporter.sendMail({
      from: cfg.from,
      to: workspace.email,
      cc: user?.email !== workspace.email ? user?.email : undefined,
      subject: `Proforma ${proformaNumber} — InfraDesk`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Proforma — InfraDesk</h2>
          <p>W załączeniu przesyłamy proformę <strong>${proformaNumber}</strong> na kwotę <strong>${amount},00 PLN netto</strong>.</p>
          <p>Termin płatności: <strong>7 dni</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">Po zaksięgowaniu wpłaty usługa zostanie aktywowana automatycznie.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 11px;">InfraDesk by SILERS · infradesk.pl</p>
        </div>
      `,
      attachments: [{
        filename: `proforma-${proformaNumber.replace(/\//g, '-')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    res.json({ success: true, proformaNumber, sentTo: workspace.email });
  } catch (err) { next(err); }
});

// Helper to get SMTP config
async function getSmtpConfigForProforma() {
  const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
  const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return { host: map.smtp_host, port: parseInt(map.smtp_port || '587'), user: map.smtp_user, pass: map.smtp_pass, from: map.smtp_from || 'noreply@infradesk.pl' };
}

// ── Activate workspace after payment ──
router.post('/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { workspaceId, paymentId } = req.body;
    if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }

    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access' }); return; }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) { res.status(404).json({ error: 'Workspace not found' }); return; }

    const isYearly = ws.billingCycle === 'YEARLY';
    const paidUntil = new Date();
    paidUntil.setMonth(paidUntil.getMonth() + (isYearly ? 12 : 1));

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { subscriptionStatus: 'ACTIVE', isActive: true, paidUntil },
    });

    res.json({ success: true, subscriptionStatus: 'ACTIVE', paidUntil });
  } catch (err) { next(err); }
});

export default router;

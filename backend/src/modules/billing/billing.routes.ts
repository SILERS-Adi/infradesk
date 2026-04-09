import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';
import { sendMail, emailTemplate, emailHeading, emailText, emailMuted } from '../../lib/mailer';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate, requireWorkspace);

// ── Plan prices (netto PLN) ──
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  STARTER:      { monthly: 4900, yearly: 49900 },      // 49 zł/mies or 499 zł/rok
  PROFESSIONAL: { monthly: 14900, yearly: 149900 },     // 149 zł/mies or 1499 zł/rok
  ENTERPRISE:   { monthly: 29900, yearly: 299900 },     // 299 zł/mies or 2999 zł/rok
};

const PAY_GATEWAY = process.env.PAY_GATEWAY_URL || 'https://pay.infradesk.pl';

// ── Create payment via pay.infradesk.pl (PayNow) ──
router.post('/create-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { workspaceId, plan, billingCycle } = req.body;
    if (!workspaceId || !plan) { res.status(400).json({ error: 'workspaceId and plan required' }); return; }

    const prices = PLAN_PRICES[plan];
    if (!prices) { res.status(400).json({ error: 'Invalid plan' }); return; }

    // Verify ownership
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId, workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    });
    if (!membership) { res.status(403).json({ error: 'No access' }); return; }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, email: true } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, lastName: true } });

    const isYearly = billingCycle === 'YEARLY';
    const amount = isYearly ? prices.yearly : prices.monthly;
    const period = isYearly ? '12 miesięcy' : '1 miesiąc';

    // Create payment in pay.infradesk.pl gateway
    const payRes = await fetch(`${PAY_GATEWAY}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount, // grosze
        description: `InfraDesk ${plan} — ${period}`,
        buyerEmail: user?.email || ws?.email || '',
        buyerName: user ? `${user.firstName} ${user.lastName}` : ws?.name || '',
        clientId: workspaceId,
        type: 'subscription',
        metadata: JSON.stringify({ workspaceId, plan, billingCycle, userId }),
        continueUrl: `https://infradesk.pl/billing?payment=success&plan=${plan}`,
      }),
    });

    if (!payRes.ok) {
      const err = await payRes.text();
      console.error('[Billing] Payment gateway error:', err);
      res.status(502).json({ error: 'Błąd bramki płatności' }); return;
    }

    const payData = await payRes.json() as { id: string; redirectUrl: string; status: string };

    // Save payment reference
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        billingCycle: isYearly ? 'YEARLY' : 'MONTHLY',
        monthlyPrice: prices.monthly / 100,
        lastConfig: { plan, billingCycle, paymentId: payData.id } as any,
      },
    });

    res.json({
      paymentId: payData.id,
      redirectUrl: payData.redirectUrl,
      status: payData.status,
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
      html: emailTemplate(
        emailHeading('Proforma') +
        emailText(`W załączeniu przesyłamy proformę <strong>${proformaNumber}</strong> na kwotę <strong>${amount},00 PLN netto</strong>.`) +
        emailText('Termin płatności: <strong>7 dni</strong>.') +
        emailMuted('Po zaksięgowaniu wpłaty usługa zostanie aktywowana automatycznie.')
      ),
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

// ── Payment webhook (called by pay.infradesk.pl after PayNow notification) ──
// This is a public endpoint — verified by shared secret
const PAY_WEBHOOK_SECRET = process.env.PAY_WEBHOOK_SECRET || 'infradesk-pay-webhook-2026';

// Separate router without auth for webhook
import { Router as WebhookRouter } from 'express';
export const billingWebhookRouter = WebhookRouter();

billingWebhookRouter.post('/payment-callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = req.headers['x-webhook-secret'] as string;
    if (secret !== PAY_WEBHOOK_SECRET) { res.status(401).json({ error: 'Invalid webhook secret' }); return; }

    const { paymentId, status, clientId, metadata } = req.body;
    if (!paymentId || !status) { res.status(400).json({ error: 'paymentId and status required' }); return; }

    console.log(`[Billing] Payment callback: ${paymentId} → ${status} (workspace: ${clientId})`);

    if (status === 'CONFIRMED' && clientId) {
      // Parse metadata for plan info
      let plan = 'STARTER';
      let billingCycle = 'MONTHLY';
      try {
        const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        if (meta?.plan) plan = meta.plan;
        if (meta?.billingCycle) billingCycle = meta.billingCycle;
      } catch {}

      const isYearly = billingCycle === 'YEARLY';
      const paidUntil = new Date();
      paidUntil.setMonth(paidUntil.getMonth() + (isYearly ? 12 : 1));

      await prisma.workspace.update({
        where: { id: clientId },
        data: {
          subscriptionStatus: 'ACTIVE',
          plan: plan as any,
          isActive: true,
          paidUntil,
          paidAt: new Date(),
        },
      });

      console.log(`[Billing] Workspace ${clientId} activated: ${plan} until ${paidUntil.toISOString()}`);
    }

    res.json({ accepted: true });
  } catch (err) { next(err); }
});

export default router;

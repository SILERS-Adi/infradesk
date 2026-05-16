// Billing — integracja z pay.infradesk.pl gateway (Paynow).
// Etap C: checkout (klient klika "wybierz plan" → przekierowanie do Paynow) + webhook (po confirmed → aktywuj plan).

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { prismaBg } from '../../lib/prisma-bg';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { HttpError } from '../../utils/httpError';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import {
  verifyWebhookSignature,
  extractWebhookActivation,
  calculateNewExpiry,
  generateInvoiceNumber,
  calculateInvoiceTotals,
  formatBuyerAddress,
  buildInvoiceItemName,
  type WebhookBody,
} from './billing.service';

const router = Router();

// ─── Cennik (PLN/mc → grosze) — synced with frontend ───────────────────────
type PlanKey = 'START' | 'TEAM' | 'PRO' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';

const PRICES_PLN_MC: Record<PlanKey, number | null> = {
  START: 49,
  TEAM: 149,
  PRO: 399,
  ENTERPRISE: null,
};
const YEARLY_DISCOUNT = 0.2;

interface ChargeCalc {
  amountGrosze: number;          // do payment gateway
  amountNet: number;             // PLN netto
  description: string;
  periodMonths: number;          // ile miesięcy doładowuje
}

function calculateCharge(plan: PlanKey, cycle: Cycle): ChargeCalc {
  const monthlyPln = PRICES_PLN_MC[plan];
  if (monthlyPln == null) throw HttpError.badRequest('Plan ENTERPRISE jest negocjowany indywidualnie — skontaktuj się z nami', 'plan_negotiable');

  if (cycle === 'monthly') {
    return {
      amountGrosze: monthlyPln * 100,
      amountNet: monthlyPln,
      description: `InfraDesk ${plan} — abonament miesięczny`,
      periodMonths: 1,
    };
  }
  const yearlyPln = Math.round(monthlyPln * 12 * (1 - YEARLY_DISCOUNT));
  return {
    amountGrosze: yearlyPln * 100,
    amountNet: yearlyPln,
    description: `InfraDesk ${plan} — abonament roczny (12 mc, -20%)`,
    periodMonths: 12,
  };
}

function hmacSign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

// ─── POST /api/v2/billing/checkout ───────────────────────────────────────
// Auth + workspace + role OWNER (tylko owner workspace'a może zmieniać plan).
const checkoutSchema = z.object({
  plan: z.enum(['START', 'TEAM', 'PRO', 'ENTERPRISE']),
  cycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

// In-memory idempotency cache — wystarczy dla single-instance pm2.
// Przy klastrze użyć Redis. Klucz: `${userId}:${idempotencyKey}` → response payload.
const checkoutIdempotencyCache = new Map<string, { exp: number; payload: unknown }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_KEY_RX = /^[A-Za-z0-9_-]{1,128}$/;

// Periodic sweeper — bez tego klucze nigdy ponownie nie odczytane gniją wiecznie.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of checkoutIdempotencyCache) {
    if (now > v.exp) checkoutIdempotencyCache.delete(k);
  }
}, 60_000).unref();

function getCachedIdempotency(key: string): unknown | null {
  const v = checkoutIdempotencyCache.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) {
    checkoutIdempotencyCache.delete(key);
    return null;
  }
  return v.payload;
}

router.post('/billing/checkout', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!config.PAY_INTERNAL_API_KEY) {
      throw HttpError.internal('Gateway płatności nie jest skonfigurowany (PAY_INTERNAL_API_KEY)');
    }
    const rawIdemp = req.header('Idempotency-Key');
    const idempotencyKey = rawIdemp && IDEMPOTENCY_KEY_RX.test(rawIdemp) ? rawIdemp : null;
    if (idempotencyKey) {
      const cached = getCachedIdempotency(`${req.auth!.sub}:${idempotencyKey}`);
      if (cached) {
        res.json(cached);
        return;
      }
    }
    const input = checkoutSchema.parse(req.body);
    const charge = calculateCharge(input.plan, input.cycle);

    // Tylko OWNER może kupić plan dla workspace'a.
    const ownership = await prisma.membership.findFirst({
      where: { workspaceId: req.workspaceId!, userId: req.auth!.sub, status: 'ACTIVE', role: 'OWNER' },
      select: { id: true },
    });
    if (!ownership) throw HttpError.forbidden('Tylko właściciel workspace może wybrać plan', 'not_owner');

    // Pobierz dane workspace'a + usera (do faktury)
    const ws = await prisma.workspace.findUnique({
      where: { id: req.workspaceId! },
      select: { id: true, name: true, slug: true, taxId: true, email: true },
    });
    if (!ws) throw HttpError.notFound('Workspace not found');

    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: { email: true, firstName: true, lastName: true, phone: true },
    });
    if (!user) throw HttpError.notFound('User not found');

    // Wywołanie pay.infradesk.pl
    const body = JSON.stringify({
      amount: charge.amountGrosze,
      description: charge.description,
      buyerEmail: user.email,
      buyerName: `${user.firstName} ${user.lastName}`.trim(),
      buyerPhone: user.phone ?? undefined,
      clientId: ws.id,
      type: 'SUBSCRIPTION',
      metadata: {
        workspaceId: ws.id,
        workspaceSlug: ws.slug,
        workspaceName: ws.name,
        taxId: ws.taxId,
        plan: input.plan,
        cycle: input.cycle,
        periodMonths: charge.periodMonths,
        amountNet: charge.amountNet,
        userEmail: user.email,
        userId: req.auth!.sub,
      },
      continueUrl: `${(config.CORS_ORIGIN.split(',')[0] ?? 'https://infradesk.pl').trim()}/dashboard?paid=ok`,
    });
    const sig = hmacSign(body, config.PAY_INTERNAL_API_KEY);

    const r = await fetch(`${config.PAY_GATEWAY_URL}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Infradesk-Signature': sig },
      body,
    });
    if (!r.ok) {
      const errBody = await r.text();
      logger.warn({ status: r.status, body: errBody }, '[billing] gateway rejected checkout');
      throw HttpError.internal(`Gateway płatności nie odpowiada (${r.status})`);
    }
    const result = await r.json() as { id: string; paymentId: string; redirectUrl: string; status: string };

    const payload = {
      checkoutUrl: result.redirectUrl,
      paymentId: result.id,
      paynowId: result.paymentId,
      amountNet: charge.amountNet,
      amountGross: Math.round(charge.amountNet * 1.23 * 100) / 100, // 23% VAT
      plan: input.plan,
      cycle: input.cycle,
    };
    if (idempotencyKey) {
      checkoutIdempotencyCache.set(`${req.auth!.sub}:${idempotencyKey}`, { exp: Date.now() + IDEMPOTENCY_TTL_MS, payload });
    }
    res.json(payload);
  } catch (err) { next(err); }
});

// ─── POST /api/v2/webhooks/payment ───────────────────────────────────────
// Public endpoint, weryfikowany HMAC z PAY_WEBHOOK_SECRET. Wywoływany przez pay.infradesk.pl
// po Paynow notification z statusem CONFIRMED|REJECTED|EXPIRED|ABANDONED|ERROR|REFUNDED.
//
// Etap B (P0.2/P0.3/P0.4):
//   - signature verification MUSI mieć rawBody (express.json verify hook). Jeśli
//     brak → 400 (a NIE fallback do JSON.stringify który mógłby być spoofowany).
//   - workspaceId MUSI być w meta.workspaceId (HMAC-signed przez nasz checkout).
//     Brak fallbacku do body.clientId — to było P0.3 tampering vector.
//   - idempotency oparta o `Payment.paymentId @unique` (database-level), nie
//     o findFirst(activityLog) z catch swallow → twarde zabezpieczenie przed
//     race condition.
type PaymentWebhookStatus = 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'ABANDONED' | 'ERROR' | 'REFUNDED' | 'PENDING' | 'NEW';

export const paymentWebhookHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!config.PAY_WEBHOOK_SECRET) {
      logger.warn('[billing] PAY_WEBHOOK_SECRET not configured — webhook disabled');
      res.status(503).json({ error: 'webhook_not_configured' });
      return;
    }

    // P0.2 — signature verification BEZ fallbacku. Pure function w service.
    const sig = req.headers['x-pay-signature'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? null;
    const verify = verifyWebhookSignature(rawBody, sig, config.PAY_WEBHOOK_SECRET);
    if (!verify.ok) {
      const httpStatus = verify.reason === 'missing_raw_body' ? 400 : 401;
      logger.warn({ reason: verify.reason }, '[billing] webhook signature reject');
      res.status(httpStatus).json({ error: verify.reason });
      return;
    }

    const body = req.body as WebhookBody & { status: PaymentWebhookStatus };
    logger.info(
      { paymentId: body.paymentId, status: body.status, workspaceId: body.metadata?.workspaceId },
      '[billing] webhook',
    );

    // Process tylko CONFIRMED (aktywacja). REJECTED/etc — zapisujemy do Payment
    // żeby admin widział historię, plus wysyłamy email do ownera o nieudanej
    // płatności (P1.16). Plan NIE downgraduje się od razu — workspace żyje
    // do planExpiresAt, dopiero job trial-expiry downgrade po expiry.
    if (body.status !== 'CONFIRMED') {
      const mappedStatus = (body.status === 'REJECTED' || body.status === 'EXPIRED' || body.status === 'ABANDONED' || body.status === 'REFUNDED')
        ? body.status
        : 'EXPIRED';
      await prismaBg.payment.upsert({
        where: { paymentId: body.paymentId },
        create: {
          workspaceId: body.metadata?.workspaceId ?? body.clientId ?? '__unknown__',
          paymentId: body.paymentId,
          paynowId: body.paynowId ?? null,
          externalId: body.externalId ?? null,
          amountGrosze: body.amount ?? 0,
          status: mappedStatus,
          metadata: (body.metadata as object) ?? {},
        },
        update: { status: mappedStatus },
      }).catch((err: unknown) => logger.warn({ err, paymentId: body.paymentId }, '[billing] non-confirmed payment upsert failed'));

      // P1.16 — owner email o nieudanej płatności. Tylko gdy mamy email i to
      // nie REFUNDED (refund to nie awaria — to świadomy zwrot pieniędzy).
      if (body.metadata?.userEmail && mappedStatus !== 'REFUNDED') {
        const planLabel = body.metadata.plan ?? '?';
        const reason = mappedStatus === 'REJECTED' ? 'odrzucona przez bank/gateway'
          : mappedStatus === 'EXPIRED' ? 'wygasła (link nieaktywny)'
          : 'anulowana';
        void sendMail({
          to: body.metadata.userEmail,
          subject: `Płatność za plan ${planLabel} nie powiodła się — InfraDesk`,
          text: `Niestety, próba płatności za plan ${planLabel} ${reason}. Twój obecny plan działa dalej do końca opłaconego okresu. Możesz spróbować ponownie w panelu: https://infradesk.pl/plan-and-modules`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
              <h2 style="font-size:20px;margin:0 0 16px">Płatność nieudana</h2>
              <p>Niestety, próba płatności za plan <strong>${planLabel}</strong> ${reason}.</p>
              <p>Twój obecny plan działa dalej do końca opłaconego okresu. Możesz spróbować ponownie:</p>
              <p style="text-align:center;margin:28px 0">
                <a href="https://infradesk.pl/plan-and-modules" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Spróbuj ponownie</a>
              </p>
              <p style="color:#9ca3af;font-size:12px;margin-top:20px">Pytania? Odpisz na ten email lub napisz na biuro@silers.pl</p>
            </div>`,
        });
      }

      res.status(202).json({ accepted: true, action: 'logged_only', status: body.status });
      return;
    }

    // P0.3 — extract workspace activation BEZ fallbacku do body.clientId.
    const activation = extractWebhookActivation(body);
    if (!activation.ok) {
      logger.warn({ reason: activation.reason, paymentId: body.paymentId }, '[billing] activation rejected');
      const httpStatus = activation.reason === 'workspace_clientid_mismatch' ? 400 : 202;
      res.status(httpStatus).json({ accepted: httpStatus === 202, action: activation.reason });
      return;
    }
    const { workspaceId, plan, periodMonths, cycle, metadata: meta } = activation;

    // P0.4 — database-level idempotency. Próba INSERT z duplikatem paymentId
    // rzuca P2002 (unique constraint), wtedy traktujemy jako duplicate.
    // prismaBg — webhook nie ma user/workspace context (RLS by zablokował update).
    const ws = await prismaBg.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true, name: true, plan: true, planExpiresAt: true, planStartedAt: true,
        taxId: true, addressLine1: true, addressLine2: true, postalCode: true, city: true,
      },
    });
    if (!ws) {
      logger.warn({ workspaceId }, '[billing] webhook for unknown workspace');
      res.status(202).json({ accepted: true, action: 'noop_unknown_workspace' });
      return;
    }

    const now = new Date();
    const newExpiry = calculateNewExpiry(ws.planExpiresAt, periodMonths, now);

    // P1.17/D4 — invoice numbering per-workspace per-month. Czytamy ostatnią
    // fakturę w tym workspace dla bieżącego miesiąca i inkrementujemy. Sequence
    // BEZ unique-on-prefix index w bazie, ale unique([workspaceId, invoiceNumber])
    // zapobiega kolizji w race condition (P2002 → retry z next seq).
    const yearMonthPrefix = `FV/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/`;
    const lastInvoice = await prismaBg.invoice.findFirst({
      where: { workspaceId, invoiceNumber: { startsWith: yearMonthPrefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const nextSeq = lastInvoice
      ? parseInt(lastInvoice.invoiceNumber.split('/')[3] ?? '0', 10) + 1
      : 1;
    const invoiceNumber = generateInvoiceNumber(nextSeq, now);
    const totals = calculateInvoiceTotals(body.amount); // VAT 23% domyślnie
    const buyerAddress = formatBuyerAddress(ws);
    const itemName = buildInvoiceItemName(plan, cycle);

    // Atomic transaction: INSERT Payment + UPDATE Workspace + INSERT Invoice +
    // INSERT InvoiceItem + LOG ActivityLog razem. Jeśli Payment.paymentId
    // duplikat — cała transakcja się rolluje, workspace NIE zostaje
    // zaktualizowany podwójnie i NIE wystawiamy duplikatu faktury.
    let createdInvoiceId: string | null = null;
    try {
      const result = await prismaBg.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            workspaceId,
            paymentId: body.paymentId,
            paynowId: body.paynowId ?? null,
            externalId: body.externalId ?? null,
            amountGrosze: body.amount,
            status: 'CONFIRMED',
            plan,
            cycle: cycle ?? 'monthly',
            periodMonths,
            metadata: (meta as object),
            paidAt: body.paidAt ? new Date(body.paidAt) : now,
          },
        });
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            plan,
            // P1.14 — planStartedAt zachowuje original signup; nie nadpisujemy gdy już set
            planStartedAt: ws.planStartedAt ?? now,
            planExpiresAt: newExpiry,
            trialEndsAt: null,
          },
        });
        const invoice = await tx.invoice.create({
          data: {
            workspaceId,
            invoiceNumber,
            type: 'VAT',
            status: 'ISSUED',
            sellerName: 'SILERS Adrian Błaszczykowski',
            sellerTaxId: 'PL8261941094',
            sellerAddress: 'ul. Żeromskiego 28\n08-400 Garwolin',
            buyerName: ws.name,
            buyerTaxId: ws.taxId,
            buyerAddress,
            netTotal: totals.netDecimal,
            vatTotal: totals.vatDecimal,
            grossTotal: totals.grossDecimal,
            currency: 'PLN',
            issueDate: now,
            saleDate: now,
            dueDate: now, // już opłacone
            paymentMethod: 'TRANSFER',
            paidAt: now,
            paidAmount: totals.grossDecimal,
            items: {
              create: [{
                name: itemName,
                quantity: 1,
                unitNet: totals.netDecimal,
                vatRate: totals.vatRate,
                netTotal: totals.netDecimal,
                vatTotal: totals.vatDecimal,
                grossTotal: totals.grossDecimal,
                unit: 'szt.',
              }],
            },
          },
          select: { id: true },
        });
        await tx.activityLog.create({
          data: {
            workspaceId,
            entityType: 'workspace',
            entityId: workspaceId,
            actionType: 'plan_paid_activated',
            description: `Plan ${plan} (${cycle ?? 'monthly'}) aktywowany — opłacone ${(body.amount / 100).toFixed(2)} zł netto. Faktura ${invoiceNumber}. Wygasa ${newExpiry.toISOString().slice(0, 10)}.`,
            performedByUserId: meta.userId ?? null,
            metadata: {
              paymentId: body.paymentId,
              paynowId: body.paynowId ?? null,
              externalId: body.externalId ?? null,
              amountGrosze: body.amount,
              plan,
              cycle: cycle ?? 'monthly',
              periodMonths,
              invoiceNumber,
              invoiceId: invoice.id,
            },
          },
        });
        return { invoiceId: invoice.id };
      });
      createdInvoiceId = result.invoiceId;
    } catch (err: unknown) {
      // P2002 = unique constraint violation on Payment.paymentId → duplicate webhook
      const errObj = err as { code?: string };
      if (errObj?.code === 'P2002') {
        logger.info({ paymentId: body.paymentId }, '[billing] webhook duplicate (db unique) — idempotent skip');
        res.status(200).json({ accepted: true, action: 'duplicate_ignored' });
        return;
      }
      throw err;
    }

    // P1.17/D4 — faktura wystawiona automatycznie w transakcji powyżej.
    // Klient dostaje link do widoku HTML faktury (drukowalny → zapis do PDF).
    // KSeF 2026-07-01: integracja w osobnym sprincie (model już ma pola
    // ksefXml/ksefStatus przygotowane).

    // Email "Plan aktywowany + link do faktury" do owner'a (P1.18 — defer-fix
    // odpadł, bo faktura już GOTOWA przed wysłaniem maila)
    if (meta.userEmail) {
      const invoiceUrl = createdInvoiceId
        ? `https://infradesk.pl/billing/invoices/${createdInvoiceId}`
        : 'https://infradesk.pl/billing';
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h2 style="font-size:20px;margin:0 0 16px">Plan ${plan} aktywowany</h2>
          <p>Dziękujemy za płatność.</p>
          <p>Twój workspace <strong>${ws.name}</strong> ma teraz plan <strong>${plan}</strong> aktywny do <strong>${newExpiry.toISOString().slice(0, 10)}</strong>.</p>
          <p>Wystawiliśmy fakturę VAT <strong>${invoiceNumber}</strong> na kwotę <strong>${totals.grossDecimal.toFixed(2)} zł brutto</strong>.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${invoiceUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Pobierz fakturę</a>
            <a href="https://infradesk.pl/plan-and-modules" style="display:inline-block;background:transparent;color:#6366f1;padding:12px 28px;border:1px solid #6366f1;border-radius:8px;text-decoration:none;font-weight:600;margin-left:8px">Otwórz panel</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">Netto: ${totals.netDecimal.toFixed(2)} zł · VAT 23%: ${totals.vatDecimal.toFixed(2)} zł · Brutto: ${totals.grossDecimal.toFixed(2)} zł · ID transakcji: ${body.externalId ?? body.paymentId}</p>
        </div>
      `;
      void sendMail({
        to: meta.userEmail,
        subject: `Plan ${plan} aktywowany — faktura ${invoiceNumber} — InfraDesk`,
        text: `Dziękujemy! Plan ${plan} aktywny do ${newExpiry.toISOString().slice(0, 10)}. Faktura ${invoiceNumber} (${totals.grossDecimal.toFixed(2)} zł brutto): ${invoiceUrl}`,
        html,
      });
    }

    res.status(200).json({ accepted: true, action: 'plan_activated', plan, expiresAt: newExpiry });
  } catch (err) { next(err); }
};

router.post('/webhooks/payment', paymentWebhookHandler);

// ─── GET /api/v2/billing/invoices — lista faktur dla aktualnego workspace
// P1.17/D4: klient widzi historię swoich faktur (do księgowości / Ctrl+P → PDF).
router.get('/billing/invoices', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { workspaceId: req.workspaceId!, deletedAt: null },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        status: true,
        issueDate: true,
        dueDate: true,
        paidAt: true,
        netTotal: true,
        vatTotal: true,
        grossTotal: true,
        currency: true,
      },
      take: 100,
    });
    res.json({
      invoices: invoices.map((inv) => ({
        ...inv,
        netTotal: Number(inv.netTotal),
        vatTotal: Number(inv.vatTotal),
        grossTotal: Number(inv.grossTotal),
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/v2/billing/invoices/:id — JSON pojedynczej faktury (do widoku UI)
router.get('/billing/invoices/:id', requireAuth, requireWorkspace, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId!, deletedAt: null },
      include: { items: true },
    });
    if (!invoice) throw HttpError.notFound('Faktura nie znaleziona');
    res.json({
      invoice: {
        ...invoice,
        netTotal: Number(invoice.netTotal),
        vatTotal: Number(invoice.vatTotal),
        grossTotal: Number(invoice.grossTotal),
        paidAmount: invoice.paidAmount ? Number(invoice.paidAmount) : null,
        items: invoice.items.map((it: typeof invoice.items[number]) => ({
          ...it,
          quantity: Number(it.quantity),
          unitNet: Number(it.unitNet),
          vatRate: Number(it.vatRate),
          netTotal: Number(it.netTotal),
          vatTotal: Number(it.vatTotal),
          grossTotal: Number(it.grossTotal),
        })),
      },
    });
  } catch (err) { next(err); }
});

export default router;

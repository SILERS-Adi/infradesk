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

interface WebhookBody {
  paymentId: string;
  paynowId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'ABANDONED' | 'ERROR' | 'REFUNDED' | 'PENDING' | 'NEW';
  externalId: string;
  amount: number;
  clientId?: string | null;
  type?: string | null;
  metadata?: {
    workspaceId?: string;
    plan?: PlanKey;
    cycle?: Cycle;
    periodMonths?: number;
    amountNet?: number;
    userEmail?: string;
    userId?: string;
  } | null;
  paidAt?: string | null;
}

export const paymentWebhookHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!config.PAY_WEBHOOK_SECRET) {
      logger.warn('[billing] PAY_WEBHOOK_SECRET not configured — webhook disabled');
      res.status(503).json({ error: 'webhook_not_configured' });
      return;
    }
    const sig = req.headers['x-pay-signature'] as string | undefined;
    if (!sig) { res.status(401).json({ error: 'missing_signature' }); return; }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
    const expected = hmacSign(rawBody, config.PAY_WEBHOOK_SECRET);
    let valid = false;
    try {
      valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch { /* length mismatch → false */ }
    if (!valid) { res.status(401).json({ error: 'invalid_signature' }); return; }

    const body = req.body as WebhookBody;
    logger.info({ paymentId: body.paymentId, status: body.status, workspaceId: body.metadata?.workspaceId }, '[billing] webhook');

    // Process tylko CONFIRMED (aktywacja). REJECTED/etc tylko logujemy.
    if (body.status !== 'CONFIRMED') {
      res.status(202).json({ accepted: true, action: 'logged_only' });
      return;
    }

    const meta = body.metadata;
    const workspaceId = meta?.workspaceId ?? body.clientId;
    if (!workspaceId || !meta?.plan || !meta?.periodMonths) {
      logger.warn({ body }, '[billing] webhook missing metadata — cannot activate plan');
      res.status(202).json({ accepted: true, action: 'noop_no_metadata' });
      return;
    }

    // Defensywnie: jeżeli oba są podane i się różnią, odrzuć (potencjalne tampering)
    if (meta?.workspaceId && body.clientId && meta.workspaceId !== body.clientId) {
      logger.warn({ metaWs: meta.workspaceId, bodyClient: body.clientId, paymentId: body.paymentId },
        '[billing] webhook workspaceId/clientId mismatch — rejected');
      res.status(400).json({ error: 'workspace_clientid_mismatch' });
      return;
    }

    // Idempotency: jeśli ten paymentId był już przetworzony, NIE aktywuj ponownie
    // (Paynow może retransmitować webhook przy timeout-ach → podwójne przedłużenie planu).
    const alreadyProcessed = await prismaBg.activityLog.findFirst({
      where: {
        workspaceId,
        actionType: 'plan_paid_activated',
        metadata: { path: ['paymentId'], equals: body.paymentId },
      },
      select: { id: true, createdAt: true },
    });
    if (alreadyProcessed) {
      logger.info({ paymentId: body.paymentId, processedAt: alreadyProcessed.createdAt },
        '[billing] webhook already processed — idempotent skip');
      res.status(200).json({ accepted: true, action: 'duplicate_ignored', processedAt: alreadyProcessed.createdAt });
      return;
    }

    // prismaBg — webhook nie ma user/workspace context (RLS by zablokował update)
    const ws = await prismaBg.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, plan: true, planExpiresAt: true },
    });
    if (!ws) {
      logger.warn({ workspaceId }, '[billing] webhook for unknown workspace');
      res.status(202).json({ accepted: true, action: 'noop_unknown_workspace' });
      return;
    }

    // Wylicz nowy planExpiresAt — przedłuża istniejący jeśli jeszcze aktywny.
    const now = new Date();
    const baseDate = ws.planExpiresAt && ws.planExpiresAt > now ? ws.planExpiresAt : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + meta.periodMonths);

    await prismaBg.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: meta.plan,
        planStartedAt: now,
        planExpiresAt: newExpiry,
        trialEndsAt: null,
      },
    });

    await prismaBg.activityLog.create({
      data: {
        workspaceId,
        entityType: 'workspace',
        entityId: workspaceId,
        actionType: 'plan_paid_activated',
        description: `Plan ${meta.plan} (${meta.cycle ?? 'monthly'}) aktywowany — opłacone ${(body.amount / 100).toFixed(2)} zł netto. Wygasa ${newExpiry.toISOString().slice(0, 10)}.`,
        performedByUserId: meta.userId ?? null,
        metadata: {
          paymentId: body.paymentId,
          paynowId: body.paynowId,
          externalId: body.externalId,
          amountGrosze: body.amount,
          plan: meta.plan,
          cycle: meta.cycle,
          periodMonths: meta.periodMonths,
        },
      },
    }).catch((err: unknown) => logger.warn({ err }, '[billing] activity log failed'));

    // TODO(idfaktura): po skończeniu projektu id-faktura.pl wstawić tu wywołanie:
    //   await fetch('https://faktura.infradesk.pl/api/invoices', {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${IDFAKTURA_API_KEY}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       buyer: { taxId: ws.taxId, name: ws.name, address: {...} },
    //       lines: [{ name: meta.description, qty: 1, netPrice: meta.amountNet, vatRate: 23 }],
    //       paymentRef: body.externalId,
    //       paidAt: body.paidAt,
    //     }),
    //   });
    // Aktualnie faktura wystawiana ręcznie — user dostaje "faktura osobno w 24h" w mailu.

    // Email "Plan aktywowany" do owner'a
    if (meta.userEmail) {
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h2 style="font-size:20px;margin:0 0 16px">Plan ${meta.plan} aktywowany</h2>
          <p>Dziękujemy za płatność.</p>
          <p>Twój workspace <strong>${ws.name}</strong> ma teraz plan <strong>${meta.plan}</strong> aktywny do <strong>${newExpiry.toISOString().slice(0, 10)}</strong>.</p>
          <p>Faktura VAT zostanie wysłana osobno w ciągu 24h.</p>
          <p style="text-align:center;margin:28px 0">
            <a href="https://infradesk.pl/plan-and-modules" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Otwórz panel</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:20px">Zapłacono: ${(body.amount / 100).toFixed(2)} zł netto · ID transakcji: ${body.externalId}</p>
        </div>
      `;
      void sendMail({
        to: meta.userEmail,
        subject: `Plan ${meta.plan} aktywowany — InfraDesk`,
        text: `Dziękujemy! Plan ${meta.plan} aktywny do ${newExpiry.toISOString().slice(0, 10)}. Zobacz w panelu: https://infradesk.pl/plan-and-modules`,
        html,
      });
    }

    res.status(200).json({ accepted: true, action: 'plan_activated', plan: meta.plan, expiresAt: newExpiry });
  } catch (err) { next(err); }
};

router.post('/webhooks/payment', paymentWebhookHandler);

export default router;

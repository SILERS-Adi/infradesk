// Billing — czyste, testowalne funkcje pomocnicze do webhook handlera.
// Wydzielone z billing.routes.ts żeby móc je unit-testować bez Express/DB.

import crypto from 'node:crypto';

/**
 * Weryfikacja HMAC-SHA256 signature webhooka.
 *
 * Po fixie P0.2: NIE robi fallbacku do `JSON.stringify(req.body)`. Jeśli body
 * parser nie wstrzyknął `rawBody`, signature verification jest niemożliwa →
 * zwracamy false, handler powinien zwrócić 400. Defense-in-depth: nawet gdyby
 * ktoś przyszłość usunął `verify` hook w express.json(), webhook by stał, nie
 * był spoofowalny.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | null | undefined,
  signature: string | null | undefined,
  secret: string,
): { ok: true } | { ok: false; reason: 'missing_signature' | 'missing_raw_body' | 'invalid_signature' } {
  if (!signature) return { ok: false, reason: 'missing_signature' };
  if (rawBody === null || rawBody === undefined) return { ok: false, reason: 'missing_raw_body' };

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const expected = crypto.createHmac('sha256', secret).update(bodyStr).digest('base64');

  try {
    const expBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signature);
    if (expBuf.length !== sigBuf.length) return { ok: false, reason: 'invalid_signature' };
    return crypto.timingSafeEqual(expBuf, sigBuf)
      ? { ok: true }
      : { ok: false, reason: 'invalid_signature' };
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }
}

export interface WebhookMetadata {
  workspaceId?: string;
  workspaceSlug?: string;
  plan?: 'START' | 'TEAM' | 'PRO' | 'ENTERPRISE';
  cycle?: 'monthly' | 'yearly';
  periodMonths?: number;
  amountNet?: number;
  userEmail?: string;
  userId?: string;
}

export interface WebhookBody {
  paymentId: string;
  paynowId?: string;
  externalId?: string;
  status: string;
  amount: number;
  clientId?: string;
  metadata: WebhookMetadata | null;
  paidAt?: string | null;
}

/**
 * Wyciąga zaufany workspaceId i parametry aktywacji planu z webhook body.
 *
 * Po fixie P0.3: NIE robi fallbacku do `body.clientId`. Tylko `metadata.workspaceId`
 * jest źródłem prawdy — bo metadata jest podpisane razem z resztą body przez nasz
 * własny `/billing/checkout` (HMAC), więc atakujący nie może go sfabrykować bez
 * znajomości `PAY_WEBHOOK_SECRET`.
 *
 * `body.clientId` to wartość przekazana przez Paynow, może być w żądaniu nawet
 * gdy metadata zniknęło — używana wcześniej jako fallback. To kanał ataku:
 * atakujący wysyła `body.clientId = ofiara`, bez metadata → poprzedni kod
 * aktywował plan na ofierze.
 *
 * Dodatkowo: gdy `body.clientId` jest podany i RÓŻNI się od `metadata.workspaceId`,
 * odrzucamy całkowicie (potencjalne tampering).
 */
export function extractWebhookActivation(
  body: WebhookBody,
): { ok: true; workspaceId: string; plan: NonNullable<WebhookMetadata['plan']>; periodMonths: number; cycle: WebhookMetadata['cycle']; metadata: WebhookMetadata }
  | { ok: false; reason: 'missing_metadata' | 'missing_workspace_id' | 'missing_plan' | 'missing_period_months' | 'workspace_clientid_mismatch' } {
  const meta = body.metadata;
  if (!meta) return { ok: false, reason: 'missing_metadata' };
  if (!meta.workspaceId) return { ok: false, reason: 'missing_workspace_id' };
  if (!meta.plan) return { ok: false, reason: 'missing_plan' };
  if (!meta.periodMonths || meta.periodMonths < 1) return { ok: false, reason: 'missing_period_months' };

  // Anti-tampering: jeśli body.clientId podany i różni się od meta.workspaceId, reject.
  if (body.clientId && body.clientId !== meta.workspaceId) {
    return { ok: false, reason: 'workspace_clientid_mismatch' };
  }

  return {
    ok: true,
    workspaceId: meta.workspaceId,
    plan: meta.plan,
    periodMonths: meta.periodMonths,
    cycle: meta.cycle,
    metadata: meta,
  };
}

/**
 * Liczy nowy `planExpiresAt` przedłużając istniejący jeśli jeszcze aktywny.
 * Nie ulega po prostu `+1 month od now()` gdy plan jeszcze aktywny → klient nie
 * traci dni za które zapłacił. Jeśli plan wygasł — start liczenia od `now`.
 */
export function calculateNewExpiry(
  currentExpiresAt: Date | null,
  periodMonths: number,
  now: Date = new Date(),
): Date {
  const baseDate = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
  const newExpiry = new Date(baseDate);
  newExpiry.setMonth(newExpiry.getMonth() + periodMonths);
  return newExpiry;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice generation — automatyczne fakturowanie po payment CONFIRMED.
// P1.17/D4: wbudowane invoicing (bez zależności od id-faktura.pl, do KSeF 2026-07).
// ═══════════════════════════════════════════════════════════════════════════════

export function generateInvoiceNumber(seq: number, date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const nnnn = String(seq).padStart(4, '0');
  return `FV/${yyyy}/${mm}/${nnnn}`;
}

export interface InvoiceTotals {
  netDecimal: number;
  vatDecimal: number;
  grossDecimal: number;
  vatRate: number;
}

/**
 * Liczy net/VAT/gross z amountGrosze (z webhooka). VAT 23% hardcoded dla PL
 * klientów. Pełny multi-VAT (EU reverse charge, zwolnieni) — KSeF post-MVP.
 * Reverse: `amount` z gateway to NET grosze (zapisane w meta.amountNet).
 */
export function calculateInvoiceTotals(amountGrosze: number, vatRate: number = 23): InvoiceTotals {
  const netDecimal = amountGrosze / 100;
  const vatDecimal = Math.round(netDecimal * (vatRate / 100) * 100) / 100;
  const grossDecimal = Math.round((netDecimal + vatDecimal) * 100) / 100;
  return { netDecimal, vatDecimal, grossDecimal, vatRate };
}

export interface InvoiceBuyer {
  name: string;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
}

export function formatBuyerAddress(buyer: InvoiceBuyer): string {
  const lines = [
    buyer.addressLine1,
    buyer.addressLine2,
    [buyer.postalCode, buyer.city].filter(Boolean).join(' '),
  ].filter(Boolean);
  return lines.join('\n') || '(adres nie podany)';
}

export function buildInvoiceItemName(plan: string, cycle: string | null | undefined): string {
  const cycleLabel = cycle === 'yearly' ? 'roczny' : 'miesięczny';
  return `InfraDesk ${plan} — abonament ${cycleLabel}`;
}

import crypto from 'node:crypto';
import {
  verifyWebhookSignature,
  extractWebhookActivation,
  calculateNewExpiry,
  generateInvoiceNumber,
  calculateInvoiceTotals,
  formatBuyerAddress,
  buildInvoiceItemName,
  type WebhookBody,
} from '../../src/modules/billing/billing.service';

const SECRET = 'test-webhook-secret-32-chars-min-ok';

function signPayload(payload: object | string, secret: string = SECRET): { rawBody: Buffer; sig: string } {
  const rawBody = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf-8');
  const sig = crypto.createHmac('sha256', secret).update(rawBody.toString('utf-8')).digest('base64');
  return { rawBody, sig };
}

describe('billing.service / verifyWebhookSignature', () => {
  it('accepts a correctly-signed body', () => {
    const { rawBody, sig } = signPayload({ paymentId: 'pay-1', amount: 12345 });
    expect(verifyWebhookSignature(rawBody, sig, SECRET)).toEqual({ ok: true });
  });

  it('rejects when signature is missing', () => {
    const { rawBody } = signPayload({ paymentId: 'pay-1' });
    expect(verifyWebhookSignature(rawBody, undefined, SECRET)).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('rejects when rawBody is missing (P0.2 — fallback do JSON.stringify wyłączony)', () => {
    expect(verifyWebhookSignature(null, 'anything', SECRET)).toEqual({ ok: false, reason: 'missing_raw_body' });
    expect(verifyWebhookSignature(undefined, 'anything', SECRET)).toEqual({ ok: false, reason: 'missing_raw_body' });
  });

  it('rejects spoofed signature (signed with different secret)', () => {
    const { rawBody } = signPayload({ paymentId: 'pay-1' });
    const bad = crypto.createHmac('sha256', 'wrong-secret').update(rawBody.toString('utf-8')).digest('base64');
    expect(verifyWebhookSignature(rawBody, bad, SECRET)).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects when attacker changes body after signing', () => {
    const { sig } = signPayload({ paymentId: 'pay-1', amount: 100 });
    const tampered = Buffer.from(JSON.stringify({ paymentId: 'pay-1', amount: 999999 }), 'utf-8');
    expect(verifyWebhookSignature(tampered, sig, SECRET)).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects when signature length differs (timing-safe path)', () => {
    const { rawBody } = signPayload({ paymentId: 'pay-1' });
    expect(verifyWebhookSignature(rawBody, 'short', SECRET)).toEqual({ ok: false, reason: 'invalid_signature' });
  });
});

describe('billing.service / extractWebhookActivation (P0.3)', () => {
  const okBody: WebhookBody = {
    paymentId: 'pay-1',
    paynowId: 'paynow-1',
    externalId: 'ext-1',
    status: 'CONFIRMED',
    amount: 12345,
    clientId: 'ws-1',
    metadata: {
      workspaceId: 'ws-1',
      plan: 'PRO',
      cycle: 'monthly',
      periodMonths: 1,
      amountNet: 399,
      userId: 'user-1',
      userEmail: 'a@b.pl',
    },
  };

  it('accepts when meta.workspaceId is present and matches body.clientId', () => {
    const r = extractWebhookActivation(okBody);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workspaceId).toBe('ws-1');
      expect(r.plan).toBe('PRO');
      expect(r.periodMonths).toBe(1);
    }
  });

  it('accepts when body.clientId is absent (metadata is the only source of truth)', () => {
    const r = extractWebhookActivation({ ...okBody, clientId: undefined });
    expect(r.ok).toBe(true);
  });

  it('REJECTS when metadata is missing — attacker cannot activate via body.clientId fallback', () => {
    // Klasyk P0.3: poprzednio fallback do body.clientId aktywował plan na cudzym workspace.
    const r = extractWebhookActivation({ ...okBody, metadata: null, clientId: 'victim-ws-id' });
    expect(r).toEqual({ ok: false, reason: 'missing_metadata' });
  });

  it('REJECTS when meta.workspaceId is missing — no fallback', () => {
    const r = extractWebhookActivation({
      ...okBody,
      metadata: { plan: 'PRO', periodMonths: 1, cycle: 'monthly' },
      clientId: 'victim-ws-id',
    });
    expect(r).toEqual({ ok: false, reason: 'missing_workspace_id' });
  });

  it('REJECTS when meta.workspaceId differs from body.clientId (tampering)', () => {
    const r = extractWebhookActivation({ ...okBody, clientId: 'different-ws-id' });
    expect(r).toEqual({ ok: false, reason: 'workspace_clientid_mismatch' });
  });

  it('rejects when plan missing', () => {
    const r = extractWebhookActivation({
      ...okBody,
      metadata: { workspaceId: 'ws-1', periodMonths: 1 },
    });
    expect(r).toEqual({ ok: false, reason: 'missing_plan' });
  });

  it('rejects when periodMonths missing or zero', () => {
    expect(extractWebhookActivation({
      ...okBody,
      metadata: { workspaceId: 'ws-1', plan: 'PRO' },
    })).toEqual({ ok: false, reason: 'missing_period_months' });
    expect(extractWebhookActivation({
      ...okBody,
      metadata: { workspaceId: 'ws-1', plan: 'PRO', periodMonths: 0 },
    })).toEqual({ ok: false, reason: 'missing_period_months' });
  });
});

describe('billing.service / invoice helpers (P1.17 — auto-invoicing)', () => {
  it('generateInvoiceNumber follows FV/YYYY/MM/NNNN format', () => {
    expect(generateInvoiceNumber(1, new Date('2026-05-15'))).toBe('FV/2026/05/0001');
    expect(generateInvoiceNumber(42, new Date('2026-12-01'))).toBe('FV/2026/12/0042');
    expect(generateInvoiceNumber(9999, new Date('2027-01-15'))).toBe('FV/2027/01/9999');
  });

  it('calculateInvoiceTotals computes correct PL VAT (23% default)', () => {
    // 399 PLN netto → 91.77 VAT → 490.77 brutto
    const r = calculateInvoiceTotals(39900);
    expect(r.netDecimal).toBe(399);
    expect(r.vatDecimal).toBe(91.77);
    expect(r.grossDecimal).toBe(490.77);
    expect(r.vatRate).toBe(23);
  });

  it('calculateInvoiceTotals handles 49 PLN START plan', () => {
    const r = calculateInvoiceTotals(4900);
    expect(r.netDecimal).toBe(49);
    expect(r.vatDecimal).toBe(11.27);
    expect(r.grossDecimal).toBe(60.27);
  });

  it('calculateInvoiceTotals supports custom VAT rate (EU 0% reverse charge)', () => {
    const r = calculateInvoiceTotals(39900, 0);
    expect(r.netDecimal).toBe(399);
    expect(r.vatDecimal).toBe(0);
    expect(r.grossDecimal).toBe(399);
    expect(r.vatRate).toBe(0);
  });

  it('formatBuyerAddress joins lines and skips empty', () => {
    expect(formatBuyerAddress({
      name: 'X',
      taxId: null,
      addressLine1: 'ul. Testowa 1',
      addressLine2: null,
      postalCode: '00-001',
      city: 'Warszawa',
    })).toBe('ul. Testowa 1\n00-001 Warszawa');

    expect(formatBuyerAddress({
      name: 'X',
      taxId: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
    })).toBe('(adres nie podany)');
  });

  it('buildInvoiceItemName labels cycle in Polish', () => {
    expect(buildInvoiceItemName('PRO', 'monthly')).toBe('InfraDesk PRO — abonament miesięczny');
    expect(buildInvoiceItemName('TEAM', 'yearly')).toBe('InfraDesk TEAM — abonament roczny');
    expect(buildInvoiceItemName('START', null)).toBe('InfraDesk START — abonament miesięczny');
  });
});

describe('billing.service / calculateNewExpiry (P1.14 — przedłużenie)', () => {
  it('extends existing not-yet-expired plan from its current expiresAt', () => {
    const current = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-05-15T00:00:00Z');
    const next = calculateNewExpiry(current, 1, now);
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('starts from now when plan has already expired', () => {
    const current = new Date('2026-04-01T00:00:00Z');
    const now = new Date('2026-05-15T00:00:00Z');
    const next = calculateNewExpiry(current, 1, now);
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  it('starts from now when there is no current expiresAt', () => {
    const now = new Date('2026-05-15T00:00:00Z');
    const next = calculateNewExpiry(null, 12, now);
    expect(next.toISOString().slice(0, 10)).toBe('2027-05-15');
  });
});

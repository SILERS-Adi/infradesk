import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requireWorkspace } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();
router.use(authenticate, requireWorkspace);

// All invoicing settings are stored in WorkspaceSetting with key prefix "inv_"
const SETTING_KEYS = [
  // Company details (supplement workspace fields)
  'inv_regon',
  'inv_krs',
  'inv_court_registry', // sąd rejestrowy
  'inv_share_capital', // kapitał zakładowy

  // Bank accounts (JSON array)
  'inv_bank_accounts', // [{name, bankName, accountNumber, swift, currency, isDefault}]

  // Numbering
  'inv_number_pattern', // e.g. "FV/{nr-m}/{mm}/{yyyy}" or "{nr}/{mm}/{yyyy}"
  'inv_number_reset', // "monthly" | "yearly" | "never"
  'inv_next_number', // current counter

  // Defaults
  'inv_default_payment_days', // e.g. "14"
  'inv_default_payment_method', // "przelew" | "gotowka" | "karta" | etc
  'inv_default_currency', // "PLN"
  'inv_place_of_issue', // e.g. "Warszawa"

  // Annotations
  'inv_split_payment', // "true" | "false" — mechanizm podzielonej płatności
  'inv_cash_method', // "true" | "false" — metoda kasowa
  'inv_footer_note', // custom footer text on invoices
  'inv_reverse_charge', // "true" | "false" — odwrotne obciążenie

  // Module variants
  'inv_use_warehouse', // "true" | "false" — moduł magazynowy (WZ/PZ/MM)
  'inv_use_cash', // "true" | "false" — moduł kasowy (KP/KW)
  'inv_warehouses', // JSON array: [{id, name, code, address, isDefault}]
];

// GET /api/invoicing/settings — get all invoicing settings
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;

    // Get workspace base info
    const ws = await prisma.workspace.findUnique({
      where: { id: wsId },
      select: {
        name: true, legalName: true, taxId: true, email: true, phone: true,
        addressLine1: true, postalCode: true, city: true, country: true, logoUrl: true,
      },
    });

    // Get all inv_ settings
    const settings = await prisma.workspaceSetting.findMany({
      where: { workspaceId: wsId, key: { startsWith: 'inv_' } },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    // Parse bank accounts
    let bankAccounts = [];
    try { bankAccounts = JSON.parse(settingsMap['inv_bank_accounts'] || '[]'); } catch {}

    res.json({
      company: {
        name: ws?.legalName || ws?.name || '',
        nip: ws?.taxId || '',
        regon: settingsMap['inv_regon'] || '',
        krs: settingsMap['inv_krs'] || '',
        courtRegistry: settingsMap['inv_court_registry'] || '',
        shareCapital: settingsMap['inv_share_capital'] || '',
        email: ws?.email || '',
        phone: ws?.phone || '',
        street: ws?.addressLine1 || '',
        postalCode: ws?.postalCode || '',
        city: ws?.city || '',
        country: ws?.country || 'PL',
        logoUrl: ws?.logoUrl || '',
      },
      bankAccounts,
      numbering: {
        pattern: settingsMap['inv_number_pattern'] || '{prefix}/{nr-m}/{mm}/{yyyy}',
        reset: settingsMap['inv_number_reset'] || 'monthly',
        nextNumber: parseInt(settingsMap['inv_next_number'] || '1'),
      },
      defaults: {
        paymentDays: parseInt(settingsMap['inv_default_payment_days'] || '14'),
        paymentMethod: settingsMap['inv_default_payment_method'] || 'przelew',
        currency: settingsMap['inv_default_currency'] || 'PLN',
        placeOfIssue: settingsMap['inv_place_of_issue'] || '',
      },
      annotations: {
        splitPayment: settingsMap['inv_split_payment'] === 'true',
        cashMethod: settingsMap['inv_cash_method'] === 'true',
        reverseCharge: settingsMap['inv_reverse_charge'] === 'true',
        footerNote: settingsMap['inv_footer_note'] || '',
      },
      modules: {
        useWarehouse: settingsMap['inv_use_warehouse'] === 'true',
        useCash: settingsMap['inv_use_cash'] !== 'false', // default ON
      },
      warehouses: (() => {
        try { return JSON.parse(settingsMap['inv_warehouses'] || '[]'); } catch { return []; }
      })(),
    });
  } catch (err) { next(err); }
});

// PUT /api/invoicing/settings — save all invoicing settings
router.put('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wsId = req.workspaceId!;
    const { company, bankAccounts, numbering, defaults, annotations, modules, warehouses } = req.body;

    // Update workspace base fields
    if (company) {
      await prisma.workspace.update({
        where: { id: wsId },
        data: {
          legalName: company.name || undefined,
          taxId: company.nip || undefined,
          email: company.email || undefined,
          phone: company.phone || undefined,
          addressLine1: company.street || undefined,
          postalCode: company.postalCode || undefined,
          city: company.city || undefined,
        },
      });
    }

    // Upsert settings
    const upserts: { key: string; value: string }[] = [];

    if (company) {
      if (company.regon !== undefined) upserts.push({ key: 'inv_regon', value: company.regon });
      if (company.krs !== undefined) upserts.push({ key: 'inv_krs', value: company.krs });
      if (company.courtRegistry !== undefined) upserts.push({ key: 'inv_court_registry', value: company.courtRegistry });
      if (company.shareCapital !== undefined) upserts.push({ key: 'inv_share_capital', value: company.shareCapital });
    }

    if (bankAccounts !== undefined) {
      upserts.push({ key: 'inv_bank_accounts', value: JSON.stringify(bankAccounts) });
    }

    if (numbering) {
      if (numbering.pattern !== undefined) upserts.push({ key: 'inv_number_pattern', value: numbering.pattern });
      if (numbering.reset !== undefined) upserts.push({ key: 'inv_number_reset', value: numbering.reset });
      if (numbering.nextNumber !== undefined) upserts.push({ key: 'inv_next_number', value: String(numbering.nextNumber) });
    }

    if (defaults) {
      if (defaults.paymentDays !== undefined) upserts.push({ key: 'inv_default_payment_days', value: String(defaults.paymentDays) });
      if (defaults.paymentMethod !== undefined) upserts.push({ key: 'inv_default_payment_method', value: defaults.paymentMethod });
      if (defaults.currency !== undefined) upserts.push({ key: 'inv_default_currency', value: defaults.currency });
      if (defaults.placeOfIssue !== undefined) upserts.push({ key: 'inv_place_of_issue', value: defaults.placeOfIssue });
    }

    if (annotations) {
      if (annotations.splitPayment !== undefined) upserts.push({ key: 'inv_split_payment', value: String(annotations.splitPayment) });
      if (annotations.cashMethod !== undefined) upserts.push({ key: 'inv_cash_method', value: String(annotations.cashMethod) });
      if (annotations.reverseCharge !== undefined) upserts.push({ key: 'inv_reverse_charge', value: String(annotations.reverseCharge) });
      if (annotations.footerNote !== undefined) upserts.push({ key: 'inv_footer_note', value: annotations.footerNote });
    }

    if (modules) {
      if (modules.useWarehouse !== undefined) upserts.push({ key: 'inv_use_warehouse', value: String(modules.useWarehouse) });
      if (modules.useCash !== undefined) upserts.push({ key: 'inv_use_cash', value: String(modules.useCash) });
    }

    if (warehouses !== undefined) {
      upserts.push({ key: 'inv_warehouses', value: JSON.stringify(warehouses) });
    }

    for (const { key, value } of upserts) {
      await prisma.workspaceSetting.upsert({
        where: { workspaceId_key: { workspaceId: wsId, key } },
        create: { workspaceId: wsId, key, value },
        update: { value },
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;

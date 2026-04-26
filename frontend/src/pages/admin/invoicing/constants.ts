// ============================================================================
// InfraDesk Invoicing Module — Constants & lookups
// ============================================================================

import type { BadgeColor, DocumentType, DatePreset, ReportTab } from "./types";

// ── Status badge mapping ──

export const STATUS_MAP: Record<string, { label: string; color: BadgeColor }> = {
  draft:          { label: "Szkic",              color: "gray" },
  issued:         { label: "Wystawiona",         color: "blue" },
  sent:           { label: "Wysłana",            color: "purple" },
  paid:           { label: "Zapłacona",          color: "green" },
  partially_paid: { label: "Częściowo zapłacona", color: "yellow" },
  overdue:        { label: "Przeterminowana",    color: "red" },
  cancelled:      { label: "Anulowana",          color: "gray" },
  completed:      { label: "Zrealizowana",       color: "green" },
};

// ── Document type labels (short) ──

export const TYPE_LABELS: Record<string, string> = {
  sale_invoice:        "FV",
  correction:          "FK",
  proforma:            "PF",
  advance:             "FVZ",
  final:               "FVK",
  receipt:             "PA",
  purchase_invoice:    "FZ",
  purchase_correction: "FZK",
  vat_margin:          "FVM",
  bill:                "R",
  wdt:                 "WDT",
  wnt:                 "WNT",
  export:              "EXP",
  import:              "IMP",
  wz:                  "WZ",
  pz:                  "PZ",
  mm:                  "MM",
  pw:                  "PW",
  rw:                  "RW",
  kp:                  "KP",
  kw:                  "KW",
  estimate:            "OF",
  order:               "ZAM",
  order_in:            "ZK",
  order_out:           "ZD",
  offer:               "OF",
  accounting_note:     "NK",
  correction_note:     "NKor",
};

// ── Document type full titles ──

export const DOC_TITLES: Record<string, string> = {
  sale_invoice:        "Faktura VAT",
  correction:          "Faktura korygująca",
  proforma:            "Faktura proforma",
  advance:             "Faktura zaliczkowa",
  final:               "Faktura końcowa",
  receipt:             "Paragon",
  purchase_invoice:    "Faktura zakupu",
  purchase_correction: "Korekta zakupu",
  vat_margin:          "Faktura VAT marża",
  bill:                "Rachunek",
  wdt:                 "Faktura WDT",
  wnt:                 "Faktura WNT",
  export:              "Faktura eksportowa",
  import:              "Faktura importowa",
  wz:                  "Wydanie zewnętrzne (WZ)",
  pz:                  "Przyjęcie zewnętrzne (PZ)",
  mm:                  "Przesunięcie międzymagazynowe (MM)",
  pw:                  "Przyjęcie wewnętrzne (PW)",
  rw:                  "Rozchód wewnętrzny (RW)",
  kp:                  "Dowód wpłaty (KP)",
  kw:                  "Dowód wypłaty (KW)",
  estimate:            "Oferta / wycena",
  order:               "Zamówienie",
  order_in:            "Zamówienie od klienta",
  order_out:           "Zamówienie do dostawcy",
  offer:               "Oferta handlowa",
  accounting_note:     "Nota księgowa",
  correction_note:     "Nota korygująca",
};

// ── Type badge colors ──

export const TYPE_COLORS: Record<string, string> = {
  sale_invoice:        "var(--accent)",
  correction:          "var(--danger)",
  proforma:            "var(--purple)",
  advance:             "var(--warning)",
  final:               "var(--success)",
  receipt:             "var(--info)",
  purchase_invoice:    "var(--info)",
  purchase_correction: "var(--danger)",
};

// ── Payment method labels ──

export const PAYMENT_METHODS: Record<string, string> = {
  przelew:      "Przelew bankowy",
  gotowka:      "Gotówka",
  karta:        "Karta płatnicza",
  blik:         "BLIK",
  za_pobraniem: "Za pobraniem",
  kompensata:   "Kompensata",
};

// ── Sale document types for filtering (excludes purchase/warehouse) ──

export const SALE_DOC_TYPES: DocumentType[] = [
  "sale_invoice",
  "correction",
  "proforma",
  "advance",
  "final",
  "receipt",
];

export const SALE_DOC_TYPES_CSV = SALE_DOC_TYPES.join(",");

// ── Report tabs ──

export const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: "sales",     label: "Sprzedaż" },
  { key: "purchases", label: "Zakupy" },
  { key: "stock",     label: "Magazyn" },
  { key: "vat",       label: "VAT" },
];

// ── Date presets ──

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today",      label: "Dzisiaj" },
  { key: "yesterday",  label: "Wczoraj" },
  { key: "7d",         label: "7 dni" },
  { key: "month",      label: "Ten miesiąc" },
  { key: "prev_month", label: "Poprzedni miesiąc" },
  { key: "year",       label: "Ten rok" },
  { key: "custom",     label: "Własna data" },
];

// ── Status filter options ──

export const STATUS_FILTER_OPTIONS = [
  { value: "",        label: "Wszystkie statusy" },
  { value: "draft",   label: "Szkic" },
  { value: "issued",  label: "Wystawiona" },
  { value: "sent",    label: "Wysłana" },
  { value: "paid",    label: "Zapłacona" },
  { value: "overdue", label: "Przeterminowana" },
];

// ── Type filter options ──

export const TYPE_FILTER_OPTIONS = [
  { value: "",               label: "Wszystkie typy" },
  { value: "sale_invoice",   label: "Faktura VAT" },
  { value: "correction",     label: "Korekta" },
  { value: "proforma",       label: "Proforma" },
  { value: "advance",        label: "Zaliczkowa" },
  { value: "final",          label: "Końcowa" },
  { value: "receipt",        label: "Paragon" },
];

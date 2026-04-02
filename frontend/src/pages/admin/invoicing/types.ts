// ============================================================================
// InfraDesk Invoicing Module — Type definitions
// ============================================================================

// ── Document types ──

export type DocumentType =
  | "sale_invoice"
  | "correction"
  | "proforma"
  | "advance"
  | "final"
  | "receipt"
  | "purchase_invoice"
  | "purchase_correction"
  | "wz"
  | "pz"
  | "mm"
  | "pw"
  | "rw"
  | "order_in"
  | "order_out"
  | "offer";

export type DocumentStatus =
  | "draft"
  | "issued"
  | "sent"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled"
  | "completed";

export type PaymentMethod =
  | "przelew"
  | "gotowka"
  | "karta"
  | "blik"
  | "za_pobraniem"
  | "kompensata";

export type BadgeColor = "gray" | "blue" | "green" | "red" | "yellow" | "purple";

// ── Document ──

export interface DocumentItem {
  id: string;
  position: number;
  name: string;
  unit: string;
  quantity: number;
  unit_price_net: number;
  vat_rate: string;
  discount_percent: number;
  net_value: number;
  vat_value: number;
  gross_value: number;
  pkwiu: string | null;
  gtu: string | null;
  product_id: string | null;
}

export interface Document {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  issue_date: string;
  sale_date: string | null;
  due_date: string | null;
  payment_method: PaymentMethod;
  currency: string;
  // Seller
  seller_name: string;
  seller_nip: string | null;
  seller_street: string | null;
  seller_city: string | null;
  seller_zip: string | null;
  seller_bank_name: string | null;
  seller_bank_account: string | null;
  // Buyer
  buyer_name: string;
  buyer_nip: string | null;
  buyer_street: string | null;
  buyer_city: string | null;
  buyer_zip: string | null;
  // Totals
  net_total: number;
  vat_total: number;
  gross_total: number;
  paid_amount: number;
  // Flags
  split_payment: boolean;
  reverse_charge: boolean;
  is_tp: boolean;
  ksef_number: string | null;
  ksef_status: string | null;
  // Meta
  notes: string | null;
  internal_notes: string | null;
  corrected_document_id: string | null;
  source_document_id: string | null;
  items: DocumentItem[];
  created_at: string;
}

/** Row returned from /documents/ list endpoint */
export interface DocumentRow {
  id: string;
  type: DocumentType;
  number: string;
  buyer_name: string;
  net_total: number;
  vat_total: number;
  gross_total: number;
  status: DocumentStatus;
  issue_date: string;
}

// ── Reports ──

export interface SalesData {
  total_orders: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  by_status: { status: string; count: number; gross: number }[];
  by_vat_rate: { vat_rate: string; net: number; vat: number; gross: number }[];
  daily: { date: string; count: number; gross: number; net: number }[];
  top_products: { name: string; quantity: number; gross: number }[];
  top_contractors: { name: string; count: number; gross: number }[];
}

export interface PurchasesData {
  total: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
  by_supplier: { name: string; count: number; net: number; gross: number }[];
  daily: { date: string; count: number; gross: number }[];
}

export interface StockData {
  total_products: number;
  total_value: number;
  low_stock_count: number;
  movements_today: number;
  by_category: { category: string; count: number; quantity: number; value: number }[];
  low_stock_items: { name: string; sku: string; quantity: number; min: number; unit: string }[];
}

export interface VatItem {
  id: string;
  number: string;
  issue_date: string;
  sale_date: string;
  contractor: string;
  nip: string;
  net_total: number;
  vat_total: number;
  gross_total: number;
  type: string;
  status: string;
  vat_breakdown: Record<string, { net: number; vat: number }>;
}

export interface VatData {
  items: VatItem[];
  summary: Record<string, { net: number; vat: number }>;
  total_count: number;
}

export type ReportTab = "sales" | "purchases" | "stock" | "vat";

export type DatePreset = "today" | "yesterday" | "7d" | "month" | "prev_month" | "year" | "custom";

// ── Import / Export ──

export interface ParsedRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

export interface ImportResult {
  imported: number;
  errors: { row: number; errors: string[]; data: Record<string, string> }[];
  total_rows: number;
}

export type ExportEntity = "documents" | "contractors" | "products" | "payments";

export type ImportEntity = "contractors" | "products";

// ── View mode (documents list) ──

export type DocumentViewMode = "documents" | "invoices";

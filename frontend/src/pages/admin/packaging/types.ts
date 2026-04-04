// ============================================================================
// IDS 1.0 — Packaging Module Types (PakOps Full)
// ============================================================================

export type OrderStatus =
  | 'NEW'
  | 'PAID'
  | 'PICKING'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type Courier =
  | 'inpost'
  | 'dpd'
  | 'ups'
  | 'fedex'
  | 'dhl'
  | 'poczta'
  | 'odbior';

export interface ShipmentItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  weight: number;
}

export interface Shipment {
  id: string;
  orderNumber: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  status: string;
  courier: Courier;
  trackingNumber?: string;
  items: ShipmentItem[];
  totalWeight: number;
  notes?: string;
  packedAt?: string;
  shippedAt?: string;
  createdAt: string;
}

export interface ShipmentRow {
  id: string;
  orderNumber: string;
  clientName: string;
  status: string;
  courier: Courier;
  itemCount: number;
  totalWeight: number;
  createdAt: string;
}

export type BadgeColor = 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'indigo' | 'pink';

// ── PakOps Dashboard ──
export interface DashboardStats {
  NEW: number;
  PAID: number;
  PICKING: number;
  PACKING: number;
  PACKED: number;
  SHIPPED: number;
  DELIVERED: number;
  CANCELLED: number;
  revenueToday: number;
  revenueMonth: number;
}

export interface DashboardChartPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface TopProduct {
  name: string;
  sku?: string;
  image?: string;
  totalQty: number;
  orderCount: number;
}

export interface RecentShipment {
  id: string;
  externalOrderId?: string;
  addressName?: string;
  status: string;
  totalAmount: number | string;
  courierName?: string;
  createdAt: string;
}

// ── Packing ──
export interface PackingQueueItem {
  id: string;
  externalOrderId?: string;
  addressName?: string;
  addressCity?: string;
  addressStreet?: string;
  addressZip?: string;
  addressPhone?: string;
  totalAmount: number | string;
  courierName?: string;
  deliveryMethod?: string;
  status: string;
  _count?: { items: number };
  items: PackingItem[];
}

export interface PackingItem {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number | string;
  image?: string;
}

export interface PackingSession {
  id: string;
  orderId: string;
  status: string;
  checkedItems: string[];
  photos: string[];
  startedAt: string;
  completedAt?: string;
}

// ── PakOps Packing Station types (1:1 port) ──

export interface PakOpsBatch {
  id: string;
  name: string;
  courier_name: string | null;
  total_orders: number;
  packed_orders: number;
  ready_orders: number;
  percent_packed: number;
}

export interface PakOpsOrderToPack {
  id: string;
  allegro_order_id: string;
  customer_name: string | null;
  customer_login: string | null;
  total_amount: number;
  items_count: number;
  delivery_method: string | null;
  delivery_point_id: string | null;
  address_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_phone: string | null;
  buyer_note: string | null;
  status: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    allegro_offer_id: string;
    image_url: string | null;
    unit_price: number;
  }[];
}

export interface PakOpsCheckedItem {
  name: string;
  quantity: number;
  allegro_offer_id: string;
  image_url?: string;
  scanned: boolean;
  qty_scanned: number;
}

export interface PakOpsSessionData {
  id: string;
  items_checked: Record<string, PakOpsCheckedItem>;
  order: {
    id: string;
    allegro_order_id: string;
    customer_name: string | null;
    customer_login: string | null;
    customer_email: string | null;
    total_amount: number;
    delivery_method: string | null;
    delivery_point_id: string | null;
    address_name: string | null;
    address_street: string | null;
    address_city: string | null;
    address_zip: string | null;
    address_phone: string | null;
    buyer_note: string | null;
    is_cod: boolean;
    cod_amount: number | null;
    delivery_cost: number | null;
    currency: string;
    wants_invoice: boolean;
    invoice_company: string | null;
    invoice_nip: string | null;
    invoice_address: string | null;
    allegro_created_at: string | null;
    items: {
      id: string;
      name: string;
      quantity: number;
      allegro_offer_id: string;
      image_url?: string;
      unit_price: number;
    }[];
  };
}

// ── Picking ──
export interface PickingListItem {
  name: string;
  sku?: string;
  image?: string;
  totalQty: number;
  orderCount: number;
  locations?: string[];
}

export interface PickingSession {
  id: string;
  status: string;
  items: PickingSessionItem[];
  startedAt: string;
  completedAt?: string;
}

export interface PickingSessionItem {
  id: string;
  name: string;
  sku?: string;
  requiredQty: number;
  pickedQty: number;
}

// ── Batches ──
export interface Batch {
  id: string;
  name?: string;
  status: string;
  mode: string;
  orderCount: number;
  packedCount: number;
  shippedCount: number;
  courierName?: string;
  createdAt: string;
  orders?: BatchOrder[];
}

export interface BatchOrder {
  id: string;
  externalOrderId?: string;
  addressName?: string;
  status: string;
  totalAmount: number | string;
}

// ── Carriers ──
export interface CourierEntity {
  id: string;
  name: string;
  logo?: string;
  pickupTime?: string;
  saturday: boolean;
  active: boolean;
}

export interface CarrierEntity {
  id: string;
  name: string;
  code: string;
  courierId?: string;
  courierName?: string;
  active: boolean;
}

export interface ClientConfig {
  senderName?: string;
  senderStreet?: string;
  senderCity?: string;
  senderZip?: string;
  senderPhone?: string;
  senderEmail?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultDepth?: number;
  defaultWeight?: number;
}

// ── Customers ──
export interface PackingCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  orderCount: number;
  totalSpent: number | string;
  lastOrderAt?: string;
  notes?: string;
}

// ── Waves ──
export interface Wave {
  id: string;
  name: string;
  courierName: string;
  pickupTime: string;
  orderCount: number;
  packedCount: number;
  shippedCount: number;
  status: string;
}

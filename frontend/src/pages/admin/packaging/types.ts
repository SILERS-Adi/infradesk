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

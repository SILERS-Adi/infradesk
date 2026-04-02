// ============================================================================
// IDS 1.0 — Packaging Module Types
// ============================================================================

export type ShipmentStatus =
  | 'pending'
  | 'packing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'error'
  | 'cancelled';

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
  status: ShipmentStatus;
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
  status: ShipmentStatus;
  courier: Courier;
  itemCount: number;
  totalWeight: number;
  createdAt: string;
}

export type BadgeColor = 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'indigo';

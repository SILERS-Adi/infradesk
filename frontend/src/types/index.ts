// ── Workspace types ─────────────────────────────────────────────────
export type WorkspaceType = 'PERSONAL' | 'COMPANY' | 'MSP';
export type WorkspacePlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type MemberRole = 'OWNER' | 'ADMIN' | 'TECHNICIAN' | 'MEMBER' | 'VIEWER';
export type ScopeType = 'FULL' | 'SCOPED';

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  plan: WorkspacePlan;
  logoUrl?: string | null;
  primaryColor?: string | null;
  role: MemberRole;
  scopeType: ScopeType;
  source: string;
  isDefault: boolean;
  allowedModules: string[] | null;
  managedBy: string | null;
}

export type LocationType = string;
export type DeviceStatus = 'ACTIVE' | 'INACTIVE' | 'BROKEN' | 'RETIRED' | 'IN_SERVICE';
export type DeviceCriticality = 'LOW' | 'MEDIUM' | 'HIGH';
export type CredentialCategory = 'ROUTER' | 'SERVER' | 'WINDOWS' | 'EMAIL' | 'VPN' | 'WIFI' | 'DOMAIN' | 'NAS' | 'CAMERA' | 'OTHER';
export type TicketStatus = 'PENDING' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TicketType = 'INCIDENT' | 'REQUEST' | 'MAINTENANCE' | 'INSTALLATION' | 'OTHER';
export type TicketSource = 'CLIENT_PORTAL' | 'INTERNAL' | 'PHONE' | 'EMAIL' | 'QR_SCAN' | 'AGENT' | 'IN_PERSON' | 'MESSAGE';
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';
export type CrmActivityType = 'PHONE' | 'EMAIL' | 'MEETING' | 'QUOTE';
export type QuoteStatus = 'NEW' | 'PREPARING' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  permissions?: { viewAll?: boolean; orders?: boolean; billing?: boolean };
  isActive: boolean;
  notificationSettings?: {
    emailOnNewTicket?: boolean;
    emailOnTicketUpdate?: boolean;
    emailOnAssignment?: boolean;
  };
  downloadPin?: string | null;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
  lastLoginAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  workspaceId: string;
  clientId?: string; // legacy stub
  name: string;
  type: LocationType;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
  _count?: { devices: number };
}

export interface DeviceType {
  id: string;
  name: string;
  icon?: string;
}

export interface AccessType {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  workspaceId: string;
  clientId?: string; // legacy stub
  locationId: string;
  location?: { id: string; name: string; addressLine1?: string; postalCode?: string; city?: string; country?: string };
  deviceTypeId?: string;
  deviceType?: DeviceType;
  name: string;
  assetTag?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  hostname?: string;
  ipAddress?: string;
  macAddress?: string;
  operatingSystem?: string;
  osVersion?: string;
  purchaseDate?: string;
  warrantyUntil?: string;
  status: DeviceStatus;
  criticality: DeviceCriticality;
  qrCodeValue: string;
  description?: string;
  internalNotes?: string;
  clientVisibleNotes?: string;
  rustdeskId?: string;
  rdpAddress?: string;
  sshAddress?: string;
  anydeskId?: string;
  teamviewerId?: string;
  customRemoteLink?: string;
  assignedUserId?: string;
  assignedUser?: { id: string; firstName: string; lastName: string; email: string };
  installationDate?: string;
  warrantyMonths?: number;
  gpsLat?: number;
  gpsLon?: number;
  createdAt: string;
  updatedAt: string;
  agents?: { lastSeen?: string; currentUser?: string }[];
  agentInfo?: {
    cpuModel?: string; cpuCores?: number; cpuThreads?: number;
    ramTotalGb?: number; gpuModel?: string; motherboard?: string;
    cpuUsage?: number; ramUsage?: number;
    diskFree?: number; diskTotal?: number; cpuTempC?: number;
    diskInfo?: { device: string; mountpoint: string; fstype: string; totalGb: number; freeGb: number; usedPct: number }[];
    networkIfaces?: { name: string; ip: string; mac: string; isUp: boolean }[];
    lastSeen?: string; appVersion?: string;
    windowsVersion?: string; lastBootTime?: string;
  } | null;
}

export interface Credential {
  id: string;
  workspaceId: string;
  clientId?: string; // legacy stub
  locationId?: string;
  location?: { id: string; name: string };
  deviceId?: string;
  device?: { id: string; name: string };
  userId?: string;
  user?: { id: string; firstName: string; lastName: string };
  accessTypeId?: string;
  accessType?: AccessType;
  name: string;
  category: CredentialCategory;
  username?: string;
  urlOrHost?: string;
  port?: number;
  additionalData?: string;
  notes?: string;
  isSharedWithClient: boolean;
  createdByUserId: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  workspaceId: string;
  clientId?: string; // legacy stub
  locationId: string;
  location?: { id: string; name: string };
  deviceId?: string;
  device?: { id: string; name: string; rustdeskId?: string };
  createdByUserId: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedToUserId?: string;
  assignedTo?: { id: string; firstName: string; lastName: string };
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  title: string;
  description: string;
  resolutionSummary?: string;
  attachmentUrls?: string;
  reportedAt: string;
  dueAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  billedInContract?: boolean;
  serviceMode?: 'REMOTE' | 'ONSITE' | null;
  reporterName?: string;
  reporterPhone?: string;
  createdAt: string;
  updatedAt: string;
  comments?: TicketComment[];
}

export interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  user?: { id: string; firstName: string; lastName: string; role?: string };
  comment: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  taskNumber: string;
  ticketId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueAt?: string;
  completedAt?: string;
  notes?: string;
  travelKm?: number | null;
  estimatedMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
  ticket?: {
    id: string;
    ticketNumber: string;
    title: string;
    priority: TicketPriority;
    source?: TicketSource;
    serviceMode?: 'REMOTE' | 'ONSITE' | null;
    reporterName?: string;
    reporterPhone?: string;
    client?: {
      id: string; name: string;
      hasContract?: boolean; contractHours?: number; contractMonthlyValue?: number;
      hourlyRate?: number; contractHourlyRateOverLimit?: number; billingIntervalMinutes?: number;
    };
    location?: { id: string; name: string; contactPersonName?: string; contactPersonPhone?: string };
    device?: {
      id: string; name: string; rustdeskId?: string;
      assignedUser?: { id: string; firstName: string; lastName: string; email: string; phone?: string; avatarUrl?: string };
    };
    createdBy?: { id: string; firstName: string; lastName: string; email?: string; phone?: string; avatarUrl?: string };
  };
  assignedTo?: { id: string; firstName: string; lastName: string; email: string };
  createdBy?: { id: string; firstName: string; lastName: string };
}

export interface ActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  description: string;
  metadataJson?: unknown;
  performedByUserId?: string;
  performedBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

export interface DashboardStats {
  totalClients: number;
  totalLocations: number;
  totalDevices: number;
  openTickets: number;
  overdueTickets: number;
  unassignedTickets?: number;
  myTickets: number;
  recentTickets: Ticket[];
  recentDevices: Device[];
}

/** Stub — Client model removed in workspace migration. Used by legacy wizard. */
export interface Client {
  id: string;
  name: string;
  hasContract?: boolean;
  [key: string]: any;
}

/** Stub — ClientStatus removed in workspace migration */
export type ClientStatus = 'ACTIVE' | 'INACTIVE';

export interface ClientDashboardStats {
  client?: { id: string; name: string; status: string };
  stats: {
    totalDevices: number;
    activeDevices: number;
    brokenDevices: number;
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    totalLocations: number;
  };
  recentTickets: Ticket[];
  recentDevices: Device[];
}

export interface CrmActivity {
  id: string;
  workspaceId: string;
  locationId?: string;
  location?: { id: string; name: string; city?: string };
  deviceId?: string;
  device?: { id: string; name: string };
  createdByUserId: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedToUserId?: string;
  assignedTo?: { id: string; firstName: string; lastName: string };
  type: CrmActivityType;
  title?: string;
  occurredAt: string;
  notes?: string;
  followUpRequired: boolean;
  // PHONE
  contactPerson?: string;
  // EMAIL
  subject?: string;
  attachmentUrls?: string;
  // MEETING
  meetingPlace?: string;
  participants?: string;
  reminderAt?: string;
  // QUOTE
  quoteDescription?: string;
  quoteStatus?: QuoteStatus;
  quoteValue?: number;
  quoteAttachmentUrl?: string;
  linkedTicketId?: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'NEW' | 'PENDING_APPROVAL' | 'IN_PROGRESS' | 'INSTALLED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  orderId: string;
  name: string;
  price?: number;
  quantity: number;
  link?: string;
  addToInventory: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  workspaceId: string;
  ticketId?: string;
  assignedToUserId?: string;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  ticket?: { id: string; ticketNumber: string; title: string };
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedTo?: { id: string; firstName: string; lastName: string };
  items: OrderItem[];
}

export interface Delegation {
  id: string;
  delegationNumber: string;
  workspaceId: string;
  assignedToUserId?: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedTo?: { id: string; firstName: string; lastName: string };
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

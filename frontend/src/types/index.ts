export type UserRole = 'ADMIN' | 'TECHNICIAN' | 'CLIENT';
export type ClientStatus = 'ACTIVE' | 'INACTIVE';
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
  role: UserRole;
  roles: UserRole[];
  permissions?: { viewAll?: boolean; orders?: boolean; billing?: boolean };
  isActive: boolean;
  notificationSettings?: {
    emailOnNewTicket?: boolean;
    emailOnTicketUpdate?: boolean;
    emailOnAssignment?: boolean;
  };
  downloadPin?: string | null;
  avatarUrl?: string | null;
  clientId?: string;
  client?: { id: string; name: string };
  lastLoginAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  clientType: 'COMPANY' | 'INDIVIDUAL';
  name: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notes?: string;
  logoUrl?: string;
  status: ClientStatus;
  // Rozliczenie
  billingIntervalMinutes?: number;
  contractStartDate?: string;
  // Umowa serwisowa
  hasContract?: boolean;
  contractHours?: number;
  contractMonthlyValue?: number;
  contractHourlyRateOverLimit?: number;
  contractScope?: string;
  contractAttachmentUrl?: string;
  hourlyRate?: number;
  enableSecurityAudit?: boolean;
  enableNetworkScan?: boolean;
  enableManagedBackup?: boolean;
  enableMonthlyReport?: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    locations: number;
    devices: number;
    tickets: number;
  };
}

export interface Location {
  id: string;
  clientId: string;
  client?: { id: string; name: string };
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
  clientId: string;
  client?: { id: string; name: string };
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
  clientId: string;
  client?: { id: string; name: string };
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
  clientId: string;
  client?: { id: string; name: string };
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
  createdAt: string;
  updatedAt: string;
  comments?: TicketComment[];
}

export interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  user?: { id: string; firstName: string; lastName: string; role: UserRole };
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
  createdAt: string;
  updatedAt: string;
  ticket?: {
    id: string;
    ticketNumber: string;
    title: string;
    priority: TicketPriority;
    serviceMode?: 'REMOTE' | 'ONSITE' | null;
    client?: { id: string; name: string };
    device?: { id: string; name: string; rustdeskId?: string };
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
  clientId: string;
  client?: { id: string; name: string; logoUrl?: string };
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
  clientId: string;
  ticketId?: string;
  assignedToUserId?: string;
  status: OrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string };
  ticket?: { id: string; ticketNumber: string; title: string };
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedTo?: { id: string; firstName: string; lastName: string };
  items: OrderItem[];
}

export interface Delegation {
  id: string;
  delegationNumber: string;
  clientId: string;
  assignedToUserId?: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string };
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

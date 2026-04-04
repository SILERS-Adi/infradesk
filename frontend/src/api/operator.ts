import { apiClient } from './client';

// Backend returns: { relationId, workspace: {...}, permissions: {...}, stats: {...} }
export interface OperatorClientRaw {
  relationId: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    legalName?: string;
    taxId?: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
    city?: string;
    isActive: boolean;
  };
  clientStatus?: string; // draft | invited | active
  permissions: Record<string, boolean>;
  isDefaultHelpdeskProvider: boolean;
  stats: {
    deviceCount: number;
    ticketCount: number;
    activeTickets: number;
  };
}

// Flattened for UI convenience
export interface OperatorClient {
  id: string;
  relationId: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  city?: string;
  taxId?: string;
  ticketCount: number;
  activeTickets: number;
  deviceCount: number;
  isDefault: boolean;
  clientStatus: string; // draft | invited | active
  createdAt?: string;
}

export interface OperatorTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  workspace?: { id: string; name: string; slug: string };
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface OperatorStats {
  clientCount: number;
  deviceCount: number;
  ticketCount: number;
  activeTickets: number;
  agentCount: number;
}

export interface CreateClientPayload {
  name: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  city?: string;
  locationName?: string;
  activatePortal?: boolean;
  assignedUserId?: string;
}

export const operatorClientApi = {
  activate: (clientWsId: string) =>
    apiClient.post(`/operator/clients/${clientWsId}/activate`).then(r => r.data),
};

function flattenClient(raw: OperatorClientRaw): OperatorClient {
  return {
    id: raw.workspace.id,
    relationId: raw.relationId,
    name: raw.workspace.name,
    slug: raw.workspace.slug,
    email: raw.workspace.email,
    phone: raw.workspace.phone,
    city: raw.workspace.city,
    taxId: raw.workspace.taxId,
    ticketCount: raw.stats.ticketCount,
    activeTickets: raw.stats.activeTickets,
    deviceCount: raw.stats.deviceCount,
    isDefault: raw.isDefaultHelpdeskProvider,
    clientStatus: raw.clientStatus ?? 'active',
  };
}

export const operatorApi = {
  getClients: () =>
    apiClient.get<OperatorClientRaw[]>('/operator/clients').then(r => r.data.map(flattenClient)),

  getTickets: (params?: { clientWorkspaceId?: string; status?: string; page?: number; per_page?: number }) =>
    apiClient.get<{ data: OperatorTicket[]; pagination: { total: number; page: number; per_page: number } }>('/operator/tickets', { params }).then(r => r.data),

  getDevices: (params?: { clientWorkspaceId?: string }) =>
    apiClient.get<any[]>('/operator/devices', { params }).then(r => r.data),

  getStats: () =>
    apiClient.get<OperatorStats>('/operator/stats').then(r => r.data),

  createClient: (data: CreateClientPayload) =>
    apiClient.post<{ workspace: any; relation: any }>('/operator/clients', data).then(r => r.data),
};

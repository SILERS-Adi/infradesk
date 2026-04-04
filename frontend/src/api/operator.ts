import { apiClient } from './client';

export interface OperatorClient {
  id: string;
  name: string;
  slug: string;
  organizationType: string;
  ticketCount: number;
  deviceCount: number;
  userCount: number;
  createdAt: string;
}

export interface OperatorTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  clientWorkspaceName?: string;
  clientWorkspaceId?: string;
  assignedTo?: { firstName: string; lastName: string } | null;
  createdBy?: { firstName: string; lastName: string } | null;
}

export interface OperatorDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  ipAddress?: string;
  clientWorkspaceName?: string;
  clientWorkspaceId?: string;
}

export interface OperatorStats {
  totalClients: number;
  totalTickets: number;
  pendingTickets: number;
  totalDevices: number;
  activeAlerts: number;
}

export const operatorApi = {
  getClients: () =>
    apiClient.get<OperatorClient[]>('/api/operator/clients').then(r => r.data),

  getTickets: (params?: { clientWorkspaceId?: string; status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ tickets: OperatorTicket[]; total: number }>('/api/operator/tickets', { params }).then(r => r.data),

  getDevices: (params?: { clientWorkspaceId?: string; page?: number; limit?: number }) =>
    apiClient.get<{ devices: OperatorDevice[]; total: number }>('/api/operator/devices', { params }).then(r => r.data),

  getStats: () =>
    apiClient.get<OperatorStats>('/api/operator/stats').then(r => r.data),
};

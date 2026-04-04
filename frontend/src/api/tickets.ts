import apiClient from './client';
import type { Ticket, TicketComment, TicketStatus, TicketPriority } from '../types';

export const ticketsApi = {
  getAll: async (params?: {
    clientId?: string;
    status?: string;
    priority?: string;
    assignedToUserId?: string;
    unassigned?: boolean;
    search?: string;
    limit?: string | number;
  }): Promise<Ticket[]> => {
    const { data } = await apiClient.get<{ data: Ticket[]; pagination: unknown }>('/tickets', { params });
    return data.data;
  },

  getOne: async (id: string): Promise<Ticket> => {
    const { data } = await apiClient.get<Ticket>(`/tickets/${id}`);
    return data;
  },

  create: async (payload: Partial<Ticket>): Promise<Ticket> => {
    const { data } = await apiClient.post<Ticket>('/tickets', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Ticket>): Promise<Ticket> => {
    const { data } = await apiClient.patch<Ticket>(`/tickets/${id}`, payload);
    return data;
  },

  addComment: async (id: string, comment: string, isInternal: boolean): Promise<TicketComment> => {
    const { data } = await apiClient.post<TicketComment>(`/tickets/${id}/comments`, { comment, isInternal });
    return data;
  },

  assign: async (id: string, userId: string, serviceMode?: string): Promise<Ticket> => {
    const { data } = await apiClient.post<Ticket>(`/tickets/${id}/assign`, { assignedToUserId: userId, serviceMode });
    return data;
  },

  changeStatus: async (id: string, status: TicketStatus, resolutionSummary?: string): Promise<Ticket> => {
    const { data } = await apiClient.post<Ticket>(`/tickets/${id}/status`, { status, resolutionSummary });
    return data;
  },

  changePriority: async (id: string, priority: TicketPriority): Promise<Ticket> => {
    const { data } = await apiClient.patch<Ticket>(`/tickets/${id}`, { priority });
    return data;
  },

  cancel: async (id: string): Promise<Ticket> => {
    const { data } = await apiClient.post<Ticket>(`/tickets/${id}/cancel`, {});
    return data;
  },

  rate: async (id: string, payload: { rating: number; ratingComment?: string }) => {
    const { data } = await apiClient.post(`/tickets/${id}/rate`, payload);
    return data;
  },
};

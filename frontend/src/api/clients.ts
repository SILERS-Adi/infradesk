import apiClient from './client';
import type { Client } from '../types';

export interface ClientsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const clientsApi = {
  getAll: async (params?: ClientsParams): Promise<Client[]> => {
    const { data } = await apiClient.get<{ data: Client[]; pagination: Pagination }>('/clients', { params });
    return data.data;
  },

  getPaged: async (params?: ClientsParams): Promise<{ data: Client[]; pagination: Pagination }> => {
    const { data } = await apiClient.get<{ data: Client[]; pagination: Pagination }>('/clients', { params });
    return data;
  },

  getOne: async (id: string): Promise<Client> => {
    const { data } = await apiClient.get<Client>(`/clients/${id}`);
    return data;
  },

  create: async (payload: Partial<Client>): Promise<Client> => {
    const { data } = await apiClient.post<Client>('/clients', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Client>): Promise<Client> => {
    const { data } = await apiClient.patch<Client>(`/clients/${id}`, payload);
    return data;
  },

  checkTaxId: async (taxId: string, excludeId?: string): Promise<{ exists: boolean; clientName?: string }> => {
    const { data } = await apiClient.get('/clients/check-nip', { params: { taxId, excludeId } });
    return data;
  },

  deactivate: async (id: string): Promise<void> => {
    await apiClient.post(`/clients/${id}/deactivate`);
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/clients/${id}`);
  },
};

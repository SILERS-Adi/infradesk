import apiClient from './client';
import type { CrmActivity, CrmActivityType, QuoteStatus } from '../types';

interface ListParams {
  clientId?: string;
  type?: CrmActivityType;
  quoteStatus?: QuoteStatus;
  followUp?: boolean;
  page?: number;
  limit?: number;
}

interface CrmListResponse {
  data: CrmActivity[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export const crmApi = {
  getAll: async (params?: ListParams): Promise<CrmActivity[]> => {
    const { data } = await apiClient.get<CrmListResponse>('/crm', { params });
    return data.data;
  },

  getTimeline: async (clientId: string) => {
    const { data } = await apiClient.get<unknown[]>(`/crm/timeline/${clientId}`);
    return data;
  },

  getOne: async (id: string): Promise<CrmActivity> => {
    const { data } = await apiClient.get<CrmActivity>(`/crm/${id}`);
    return data;
  },

  create: async (payload: Partial<CrmActivity> & { clientId?: string; type: CrmActivityType }): Promise<CrmActivity> => {
    const { data } = await apiClient.post<CrmActivity>('/crm', payload);
    return data;
  },

  update: async (id: string, payload: Partial<CrmActivity>): Promise<CrmActivity> => {
    const { data } = await apiClient.patch<CrmActivity>(`/crm/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/crm/${id}`);
  },
};

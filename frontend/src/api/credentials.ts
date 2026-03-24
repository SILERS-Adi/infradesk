import apiClient from './client';
import type { Credential } from '../types';

export const credentialsApi = {
  getAll: async (params?: {
    clientId?: string;
    locationId?: string;
    deviceId?: string;
    category?: string;
  }): Promise<Credential[]> => {
    const { data } = await apiClient.get<{ data: Credential[]; pagination: unknown }>('/credentials', { params });
    return data.data;
  },

  getOne: async (id: string): Promise<Credential> => {
    const { data } = await apiClient.get<Credential>(`/credentials/${id}`);
    return data;
  },

  create: async (payload: Partial<Credential> & { password: string }): Promise<Credential> => {
    const { data } = await apiClient.post<Credential>('/credentials', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Credential> & { password?: string }): Promise<Credential> => {
    const { data } = await apiClient.patch<Credential>(`/credentials/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/credentials/${id}`);
  },

  reveal: async (id: string): Promise<{ password: string }> => {
    const { data } = await apiClient.post<{ password: string }>(`/credentials/${id}/reveal`);
    return data;
  },
};

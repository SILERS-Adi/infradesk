import apiClient from './client';
import type { Location } from '../types';

export const locationsApi = {
  getAll: async (params?: { clientId?: string; search?: string }): Promise<Location[]> => {
    const { data } = await apiClient.get<{ data: Location[]; pagination: unknown }>('/locations', { params });
    return data.data;
  },

  getOne: async (id: string): Promise<Location> => {
    const { data } = await apiClient.get<Location>(`/locations/${id}`);
    return data;
  },

  create: async (payload: Partial<Location>): Promise<Location> => {
    const { data } = await apiClient.post<Location>('/locations', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Location>): Promise<Location> => {
    const { data } = await apiClient.patch<Location>(`/locations/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/locations/${id}`);
  },
};

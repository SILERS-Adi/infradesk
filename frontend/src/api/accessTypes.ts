import apiClient from './client';
import type { AccessType } from '../types';

export const accessTypesApi = {
  getAll: async (): Promise<AccessType[]> => {
    const { data } = await apiClient.get<AccessType[]>('/access-types');
    return data;
  },

  create: async (payload: { name: string; icon?: string; color?: string }): Promise<AccessType> => {
    const { data } = await apiClient.post<AccessType>('/access-types', payload);
    return data;
  },

  update: async (id: string, payload: Partial<{ name: string; icon: string; color: string }>): Promise<AccessType> => {
    const { data } = await apiClient.patch<AccessType>(`/access-types/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/access-types/${id}`);
  },
};

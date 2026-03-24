import apiClient from './client';
import type { User } from '../types';

export const usersApi = {
  getAll: async (params?: { role?: string; clientId?: string }): Promise<User[]> => {
    const { data } = await apiClient.get<{ data: User[]; pagination: unknown }>('/users', { params });
    return data.data;
  },

  getOne: async (id: string): Promise<User> => {
    const { data } = await apiClient.get<User>(`/users/${id}`);
    return data;
  },

  create: async (payload: Partial<User> & { password: string }): Promise<User> => {
    const { data } = await apiClient.post<User>('/users', payload);
    return data;
  },

  update: async (id: string, payload: Partial<User> & { password?: string }): Promise<User> => {
    const { data } = await apiClient.patch<User>(`/users/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },
};

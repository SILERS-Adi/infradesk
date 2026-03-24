import apiClient from './client';
import type { Delegation } from '../types';

export const delegationsApi = {
  getAll: async (params?: { clientId?: string; assignedToUserId?: string }): Promise<Delegation[]> => {
    const { data } = await apiClient.get<Delegation[]>('/delegations', { params });
    return data;
  },
  create: async (payload: {
    clientId: string; assignedToUserId?: string; title: string; description?: string; scheduledAt?: string;
  }): Promise<Delegation> => {
    const { data } = await apiClient.post<Delegation>('/delegations', payload);
    return data;
  },
};

import apiClient from './client';
import type { DashboardStats, ClientDashboardStats } from '../types';

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const { data } = await apiClient.get<DashboardStats>('/dashboard');
    return data;
  },

  getClientStats: async (): Promise<ClientDashboardStats> => {
    const { data } = await apiClient.get<ClientDashboardStats>('/dashboard/client');
    return data;
  },
};

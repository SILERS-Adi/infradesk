import apiClient from './client';
import type { ActivityLog } from '../types';

export const activityLogsApi = {
  getAll: async (params?: {
    entityType?: string;
    entityId?: string;
    actionType?: string;
    performedByUserId?: string;
    limit?: number;
  }): Promise<ActivityLog[]> => {
    const { data } = await apiClient.get<{ data: ActivityLog[]; pagination: unknown }>('/activity-logs', { params });
    return data.data;
  },
};

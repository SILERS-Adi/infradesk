import apiClient from './client';
import type { Task } from '../types';

export const tasksApi = {
  getAll: async (params?: {
    status?: string;
    assignedToUserId?: string;
    all?: boolean;
  }): Promise<Task[]> => {
    const { data } = await apiClient.get<Task[]>('/tasks', { params });
    return data;
  },

  create: async (payload: {
    title: string;
    description?: string;
    assignedToUserId: string;
    dueAt?: string;
    notes?: string;
  }): Promise<Task> => {
    const { data } = await apiClient.post<Task>('/tasks', payload);
    return data;
  },

  getOne: async (id: string): Promise<Task> => {
    const { data } = await apiClient.get<Task>(`/tasks/${id}`);
    return data;
  },

  changeStatus: async (id: string, status: string, notes?: string): Promise<Task> => {
    const { data } = await apiClient.post<Task>(`/tasks/${id}/status`, { status, notes });
    return data;
  },

  update: async (id: string, payload: { notes?: string; dueAt?: string }): Promise<Task> => {
    const { data } = await apiClient.patch<Task>(`/tasks/${id}`, payload);
    return data;
  },
};

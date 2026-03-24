import apiClient from './client';
import type { Order, OrderStatus } from '../types';

export const ordersApi = {
  getAll: async (params?: { clientId?: string; status?: OrderStatus }): Promise<Order[]> => {
    const { data } = await apiClient.get<Order[]>('/orders', { params });
    return data;
  },
  create: async (payload: {
    clientId: string; ticketId?: string; assignedToUserId?: string; notes?: string;
    items: { name: string; price?: number; quantity: number; link?: string; addToInventory: boolean }[];
  }): Promise<Order> => {
    const { data } = await apiClient.post<Order>('/orders', payload);
    return data;
  },
  changeStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    const { data } = await apiClient.post<Order>(`/orders/${id}/status`, { status });
    return data;
  },
};

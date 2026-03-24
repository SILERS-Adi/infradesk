import apiClient from './client';
import type { Device, DeviceType } from '../types';

export const devicesApi = {
  getAll: async (params?: {
    clientId?: string;
    locationId?: string;
    deviceTypeId?: string;
    status?: string;
    search?: string;
  }): Promise<Device[]> => {
    const { data } = await apiClient.get<{ data: Device[]; pagination: unknown }>('/devices', { params });
    return data.data;
  },

  getOne: async (id: string): Promise<Device> => {
    const { data } = await apiClient.get<Device>(`/devices/${id}`);
    return data;
  },

  create: async (payload: Partial<Device>): Promise<Device> => {
    const { data } = await apiClient.post<Device>('/devices', payload);
    return data;
  },

  update: async (id: string, payload: Partial<Device>): Promise<Device> => {
    const { data } = await apiClient.patch<Device>(`/devices/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/devices/${id}`);
  },

  getQr: async (id: string): Promise<string> => {
    const { data } = await apiClient.get<{ qrCode: string }>(`/devices/${id}/qr`);
    return data.qrCode;
  },

  getByQrValue: async (qrCodeValue: string): Promise<Device> => {
    const { data } = await apiClient.get<Device>(`/qr/${qrCodeValue}`);
    return data;
  },

  getTypes: async (): Promise<DeviceType[]> => {
    const { data } = await apiClient.get<DeviceType[]>('/device-types');
    return data;
  },

  createType: async (payload: { name: string; icon?: string }): Promise<DeviceType> => {
    const { data } = await apiClient.post<DeviceType>('/device-types', payload);
    return data;
  },
};

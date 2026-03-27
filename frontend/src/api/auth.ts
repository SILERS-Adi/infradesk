import apiClient from './client';
import type { User } from '../types';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    return data;
  },

  refresh: async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken });
    return data;
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },

  forgotPassword: async (email: string): Promise<{ sent: boolean }> => {
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token: string, password: string): Promise<{ success: boolean }> => {
    const { data } = await apiClient.post('/auth/reset-password', { token, password });
    return data;
  },
};

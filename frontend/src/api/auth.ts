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

  resendVerification: async (): Promise<{ sent: boolean }> => {
    const { data } = await apiClient.post('/auth/resend-verification');
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  /** Refresh using cookie (no body needed — server reads from cookie) */
  refreshFromCookie: async (): Promise<{ accessToken: string; refreshToken: string }> => {
    const { data } = await apiClient.post('/auth/refresh', {});
    return data;
  },

  register: async (payload: {
    accountType: 'company' | 'personal';
    firstName: string; lastName: string; email: string; password: string;
    phone?: string; companyName?: string; companyShortName?: string; taxId?: string;
  }): Promise<LoginResponse & { workspace: { id: string; name: string; slug: string; type: string } }> => {
    const { data } = await apiClient.post('/auth/register', payload);
    return data;
  },

  checkSlug: async (slug: string): Promise<{ slug: string; available: boolean }> => {
    const { data } = await apiClient.get('/auth/check-slug', { params: { slug } });
    return data;
  },
};

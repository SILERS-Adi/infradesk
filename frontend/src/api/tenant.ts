import { apiClient } from './client';

/** Local shape for tenant/workspace settings returned by the API */
interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  tenantKey?: string;
  plan?: string;
  isActive?: boolean;
  logoUrl?: string;
  primaryColor?: string;
  maxAgents?: number;
  maxUsers?: number;
  ownerEmail?: string;
  createdAt?: string;
  _count?: { users: number; clients: number; agents: number; devices: number };
}

export const tenantApi = {
  register: (data: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerPassword: string;
    phone?: string;
  }) => apiClient.post<{ id: string; name: string; slug: string; tenantKey: string; plan: string }>('/tenant/register', data).then(r => r.data),

  getCurrent: () => apiClient.get<TenantInfo>('/tenant/current').then(r => r.data),

  updateCurrent: (data: Partial<Pick<TenantInfo, 'name' | 'logoUrl' | 'primaryColor' | 'domain' | 'plan' | 'isActive' | 'maxAgents' | 'maxUsers'>>) =>
    apiClient.patch<TenantInfo>('/tenant/current', data).then(r => r.data),

  regenerateKey: () => apiClient.post<{ tenantKey: string }>('/tenant/current/regenerate-key').then(r => r.data),

  listAll: () => apiClient.get<TenantInfo[]>('/tenant').then(r => r.data),

  getDownloadInfo: (key: string) =>
    apiClient.get<{ tenantKey: string; tenantName: string; tenantSlug: string; downloadUrl: string }>(`/tenant/download-agent?key=${key}`).then(r => r.data),

  getUsage: () => apiClient.get<{
    plan: string;
    features: string[];
    limits: {
      agents: { current: number; max: number };
      users: { current: number; max: number };
      clients: { current: number; max: number };
    };
  }>('/tenant/current/usage').then(r => r.data),
};

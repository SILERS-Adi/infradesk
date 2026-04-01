import { apiClient } from './client';

export interface Partnership {
  id: string;
  ownerTenantId: string;
  partnerTenantId: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED';
  role: 'VIEWER' | 'REMOTE_SUPPORT' | 'FULL_MANAGEMENT';
  name?: string;
  notes?: string;
  createdAt: string;
  ownerTenant?: { id: string; name: string; slug: string };
  partnerTenant?: { id: string; name: string; slug: string };
  _count?: { sharedDevices: number; tickets: number };
}

export interface PartnerDeviceGroup {
  partnershipId: string;
  ownerName: string;
  ownerSlug: string;
  role: string;
  devices: Array<any>;
}

export interface GuestAccess {
  id: string;
  token: string;
  label: string;
  role: string;
  expiresAt: string;
  usedAt?: string;
  link: string;
}

export const partnersApi = {
  list: () => apiClient.get<{ asOwner: Partnership[]; asPartner: Partnership[] }>('/partners').then(r => r.data),

  getActive: () => apiClient.get<Partnership[]>('/partners/active').then(r => r.data),

  getPartnerDevices: () => apiClient.get<PartnerDeviceGroup[]>('/partners/devices').then(r => r.data),

  invite: (data: { partnerSlug: string; role?: string; name?: string; deviceIds?: string[] }) =>
    apiClient.post<Partnership>('/partners/invite', data).then(r => r.data),

  respond: (id: string, accept: boolean) =>
    apiClient.post<Partnership>(`/partners/${id}/respond`, { accept }).then(r => r.data),

  update: (id: string, data: { role?: string; status?: string; notes?: string }) =>
    apiClient.patch<Partnership>(`/partners/${id}`, data).then(r => r.data),

  shareDevices: (id: string, deviceIds: string[]) =>
    apiClient.post(`/partners/${id}/devices`, { deviceIds }).then(r => r.data),

  unshareDevices: (id: string, deviceIds: string[]) =>
    apiClient.delete(`/partners/${id}/devices`, { data: { deviceIds } }).then(r => r.data),

  // Guest access
  listGuestLinks: () => apiClient.get<GuestAccess[]>('/partners/guest-links').then(r => r.data),

  createGuestLink: (data: { label: string; role?: string; deviceIds?: string[]; expiresInHours?: number }) =>
    apiClient.post<GuestAccess>('/partners/guest-links', data).then(r => r.data),

  // Public guest validation
  validateGuest: (token: string) => apiClient.get(`/partners/guest/${token}`).then(r => r.data),
};

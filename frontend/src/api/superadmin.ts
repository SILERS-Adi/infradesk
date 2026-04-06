import { apiClient } from './client';

export const superadminApi = {
  getConfig: () => apiClient.get('/superadmin/config').then(r => r.data),
  updateConfig: (data: any) => apiClient.patch('/superadmin/config', data).then(r => r.data),
  getTenants: () => apiClient.get('/superadmin/tenants').then(r => r.data),
  createTenant: (data: any) => apiClient.post('/superadmin/tenants', data).then(r => r.data),
  updateTenant: (id: string, data: any) => apiClient.patch(`/superadmin/tenants/${id}`, data).then(r => r.data),
  deleteTenant: (id: string) => apiClient.delete(`/superadmin/tenants/${id}`),
  getUsers: () => apiClient.get('/superadmin/users').then(r => r.data),
  createUser: (data: any) => apiClient.post('/superadmin/users', data).then(r => r.data),
  updateUser: (id: string, data: any) => apiClient.patch(`/superadmin/users/${id}`, data).then(r => r.data),
  resetPassword: (id: string, password: string) => apiClient.post(`/superadmin/users/${id}/reset-password`, { password }).then(r => r.data),
  addMembership: (userId: string, data: any) => apiClient.post(`/superadmin/users/${userId}/memberships`, data).then(r => r.data),
  updateMembership: (userId: string, membershipId: string, data: any) => apiClient.patch(`/superadmin/users/${userId}/memberships/${membershipId}`, data).then(r => r.data),
  removeMembership: (userId: string, membershipId: string) => apiClient.delete(`/superadmin/users/${userId}/memberships/${membershipId}`),
  getWorkspacesList: () => apiClient.get('/superadmin/workspaces-list').then(r => r.data),
  getStats: () => apiClient.get('/superadmin/stats').then(r => r.data),
  testEmail: (type: 'notify' | 'alert', to: string) => apiClient.post('/superadmin/test-email', { type, to }).then(r => r.data),
};

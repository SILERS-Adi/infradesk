import apiClient from './client';

export const downloadsApi = {
  verifyPin: (pin: string) => apiClient.post('/downloads/verify-pin', { pin }),
  requestPin: (email: string) => apiClient.post('/downloads/request-pin', { email }),
  listPinRequests: () => apiClient.get('/downloads/pin-requests').then(r => r.data),
};

export const settingsApi = {
  getSmtp: () => apiClient.get('/settings/smtp').then(r => r.data),
  saveSmtp: (d: Record<string, string | number>) => apiClient.put('/settings/smtp', d),
  testSmtp: (email: string) => apiClient.post('/settings/smtp/test', { email }),
};

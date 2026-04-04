import { apiClient } from './client';
import type { MenuLayout } from '../config/menuRegistry';

export const menuPreferencesApi = {
  get: () => apiClient.get<{ layout: MenuLayout | null }>('/menu-preferences').then(r => r.data.layout),
  save: (layout: MenuLayout) => apiClient.put('/menu-preferences', layout).then(r => r.data),
  reset: () => apiClient.delete('/menu-preferences').then(r => r.data),
};

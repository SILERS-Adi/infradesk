/**
 * Stub — Client API was removed during workspace migration.
 * This file exists to prevent import errors in UnifiedTicketWizard.
 * Client concept is now handled by Workspace.
 */
import apiClient from './client';

export const clientsApi = {
  getAll: async (_params?: any) => [],
  getOne: async (id: string) => ({ id, name: 'Workspace', hasContract: false }),
  search: async (_q: string) => [],
  getPaged: async (_params?: any) => ({ items: [] as any[], total: 0, pages: 1, pagination: { page: 1, pages: 1, total: 0 } }),
  create: async (_data: any) => ({}),
  update: async (_id: string, _data: any) => ({}),
  delete: async (_id: string) => ({}),
  deactivate: async (_id: string) => ({}),
};

/**
 * Stub — Client API was removed during workspace migration.
 * This file exists to prevent import errors in UnifiedTicketWizard.
 * Client concept is now handled by Workspace.
 */
import apiClient from './client';

export const clientsApi = {
  getAll: async (_params?: any): Promise<any[]> => [],
  getOne: async (id: string): Promise<any> => ({ id, name: 'Workspace', hasContract: false }),
  search: async (_q: string): Promise<any[]> => [],
  getPaged: async (_params?: any): Promise<any> => ({ items: [], total: 0, pages: 1, data: [], pagination: { page: 1, pages: 1, total: 0, totalPages: 1 } }),
  create: async (_data: any): Promise<any> => ({}),
  update: async (_id: string, _data: any): Promise<any> => ({}),
  delete: async (_id: string): Promise<any> => ({}),
  deactivate: async (_id: string): Promise<any> => ({}),
  checkTaxId: async (_nip: string, _extra?: any): Promise<any> => ({ valid: false }),
};

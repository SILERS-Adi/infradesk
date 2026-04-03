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
};

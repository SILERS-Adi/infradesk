import { apiClient } from './client';
import type { WorkspaceMembership } from '../types';

export interface WsMember {
  id: string;
  role: string;
  scopeType: string;
  source: string;
  status: string;
  isDefault: boolean;
  allowedModules: string[] | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; phone?: string; avatarUrl?: string | null; isActive: boolean };
  accessGrants: { id: string; resourceType: string; resourceId: string }[];
}

export const workspacesApi = {
  getMyWorkspaces: async (): Promise<WorkspaceMembership[]> => {
    const { data } = await apiClient.get('/workspaces/my');
    return data;
  },

  getMembers: async (): Promise<WsMember[]> => {
    const { data } = await apiClient.get('/workspaces/members');
    return data;
  },

  addMember: async (payload: {
    email: string; role: string; scopeType: string;
    grants?: { resourceType: string; resourceId: string }[];
  }): Promise<WsMember> => {
    const { data } = await apiClient.post('/workspaces/members', payload);
    return data;
  },

  updateMember: async (membershipId: string, payload: {
    role?: string; scopeType?: string;
    grants?: { resourceType: string; resourceId: string }[];
  }): Promise<WsMember> => {
    const { data } = await apiClient.patch(`/workspaces/members/${membershipId}`, payload);
    return data;
  },

  removeMember: async (membershipId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/members/${membershipId}`);
  },
};

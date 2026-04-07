/**
 * API client for workspace configuration ("Plan i moduły").
 */

import { apiClient } from './client';

export type ModuleAction = 'activate' | 'deactivate' | 'start_trial' | 'delegate_to_provider' | 'set_readonly' | 'set_limited';

export interface ConfigChanges {
  orgType?: 'CLIENT' | 'INTERNAL_IT' | 'MSP';
  ticketRoutingMode?: string;
  modules?: { moduleKey: string; action: ModuleAction }[];
  platformBillingMode?: 'SELF' | 'PROVIDER';
  accountManagedBy?: 'SELF' | 'PROVIDER';
  detachPolicy?: 'ALLOWED' | 'APPROVAL_REQUIRED' | 'BLOCKED';
}

export interface PreviewResult {
  current: { visibleGroups: string[]; visibleItems: string[] };
  proposed: { visibleGroups: string[]; visibleItems: string[]; readonlySections: string[] };
  changes: {
    added: { type: string; id: string; label: string }[];
    removed: { type: string; id: string; label: string }[];
    modified: { id: string; from: string; to: string; label: string }[];
  };
  summary: { icon: string; text: string }[];
  affectedUsers: number;
  warnings: string[];
  blockers: string[];
}

export const workspaceConfigApi = {
  getConfig: () =>
    apiClient.get('/workspace-config').then(r => r.data),

  preview: (changes: ConfigChanges): Promise<PreviewResult> =>
    apiClient.post('/workspace-config/preview', changes).then(r => r.data),

  apply: (changes: ConfigChanges) =>
    apiClient.post('/workspace-config/apply', changes).then(r => r.data),
};

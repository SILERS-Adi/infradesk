import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

export interface MyPermissionsResponse {
  id: string;
  role: string;
  accountType: string;
  accessScope: string;
  scopeType: string;
  permissionOverrides: { nodeId: string; level: 'FULL' | 'VIEW' | 'NONE'; canDelete?: boolean }[];
  workspace: { orgType: string };
}

/**
 * Hook: current user's effective permissions for current workspace.
 * Used to filter menu/modules based on RESTRICTED access with overrides.
 */
export function useMyPermissions() {
  return useQuery<MyPermissionsResponse | null>({
    queryKey: ['my-permissions'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<MyPermissionsResponse>('/permissions/me/current');
        return data;
      } catch {
        return null;
      }
    },
    // Refetch aggressively — uprawnienia admin może zmienić w dowolnej chwili,
    // user musi zobaczyć zmianę bez pełnego relogin.
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 30_000,      // poll every 30s while tab is active
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/**
 * Returns true if user can see the given module key according to their overrides.
 * - If no overrides or FULL access: always true
 * - If RESTRICTED: check if override for moduleKey exists and level != 'NONE'
 * - ADMIN / OWNER role bypasses restrictions (they see everything in their workspace)
 */
export function canSeeModule(perms: MyPermissionsResponse | null | undefined, moduleKey: string | undefined): boolean {
  if (!moduleKey) return true;
  if (!perms) return true;  // pending or failed — don't hide (avoid lockout)
  if (perms.role === 'OWNER' || perms.role === 'ADMIN' || perms.accountType === 'ADMIN') return true;
  if (perms.accessScope !== 'RESTRICTED') return true;
  // Build map: nodeId → level
  const map = new Map(perms.permissionOverrides.map(o => [o.nodeId, o.level]));
  // Only explicit NONE blocks. Everything else: visible.
  const exact = map.get(moduleKey);
  if (exact === 'NONE') return false;
  // Check parent: e.g. "service-desk.billing" → parent "service-desk"
  const parent = moduleKey.split('.')[0];
  if (parent !== moduleKey && map.get(parent) === 'NONE') return false;
  // Default: visible (fail-open)
  return true;
}

import { useWorkspace } from '../store/workspaceStore';
import type { MemberRole } from '../types';
import {
  normalizeOrgType, normalizePlan, getFeatureFlags,
  type WorkspaceType, type WorkspacePlan, type FeatureFlags,
} from '../config/menuRegistry';

/**
 * Hook providing workspace-aware context for UI components.
 * Respects preview mode — when active, returns simulated role/scope.
 */
export function useWorkspaceContext() {
  const { current, preview } = useWorkspace();

  const isPreview = !!preview;

  const role = (isPreview ? preview.role : current?.role) as MemberRole | null;
  const scopeType = (isPreview ? preview.scopeType : current?.scopeType) ?? 'FULL';
  const isScoped = scopeType === 'SCOPED';
  const managedBy = current?.managedBy ?? null;
  const source = current?.source ?? null;
  const isMspAssigned = source === 'MSP_ASSIGNED';
  const previewUserName = preview?.userName ?? null;

  // Role checks
  const isOwner = role === 'OWNER';
  const isAdmin = role === 'OWNER' || role === 'ADMIN';
  const isTechnician = role === 'TECHNICIAN';
  const isMember = role === 'MEMBER';
  const isViewer = role === 'VIEWER';

  // Permission helpers
  const canCreate = isOwner || role === 'ADMIN' || role === 'TECHNICIAN';
  const canEdit = isOwner || role === 'ADMIN' || role === 'TECHNICIAN';
  const canDelete = isOwner || role === 'ADMIN';
  const canManageUsers = !isPreview && (isOwner || role === 'ADMIN');
  const canManageSettings = !isPreview && (isOwner || role === 'ADMIN');

  // Workspace type & plan (normalized from old organizationType values)
  const wsType: WorkspaceType = normalizeOrgType(current?.organizationType);
  const wsPlan: WorkspacePlan = normalizePlan(current?.plan);

  // Backward compat alias
  const organizationType = current?.organizationType ?? 'internal_it';

  // Feature flags
  const features: FeatureFlags = getFeatureFlags(wsType, wsPlan);

  // Module access
  const enabledModules = current?.enabledModules ?? ['infrastructure', 'service-desk'];
  const hasModule = (mod: string) => {
    if (enabledModules.includes(mod)) return true;
    if ((mod === 'infrastructure' || mod === 'service-desk') && enabledModules.includes('helpdesk')) return true;
    if (mod === 'skp' && enabledModules.includes('service')) return true;
    return false;
  };

  // Debug
  if (typeof window !== 'undefined' && (window as any).__INFRADESK_DEBUG) {
    console.log('[WorkspaceContext]', { wsType, wsPlan, features, organizationType });
  }

  return {
    workspace: current,
    wsType,
    wsPlan,
    features,
    organizationType,
    role,
    scopeType,
    isScoped,
    isPreview,
    previewUserName,
    managedBy,
    isMspAssigned,
    isOwner,
    isAdmin,
    isTechnician,
    isMember,
    isViewer,
    canCreate,
    canEdit,
    canDelete,
    canManageUsers,
    canManageSettings,
    hasModule,
  };
}

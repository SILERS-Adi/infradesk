import { useWorkspace } from '../store/workspaceStore';
import type { MemberRole } from '../types';

/**
 * Hook providing workspace-aware context for UI components.
 * Respects preview mode — when active, returns simulated role/scope.
 */
export function useWorkspaceContext() {
  const { current, preview } = useWorkspace();

  const isPreview = !!preview;

  // In preview mode, override role and scope from preview membership
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

  // Module access
  const allowedModules = current?.allowedModules ?? null;
  const hasModule = (mod: string) => !allowedModules || allowedModules.includes(mod);

  return {
    workspace: current,
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

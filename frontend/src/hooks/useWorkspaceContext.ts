import { useWorkspace } from '../store/workspaceStore';
import type { MemberRole, ModuleState } from '../types';
import {
  normalizeOrgType, normalizePlan, getFeatureFlags,
  type WorkspaceType, type WorkspacePlan, type FeatureFlags,
} from '../config/menuRegistry';

// States that count as "module visible/enabled"
const MODULE_VISIBLE_STATES = new Set<string>(['ACTIVE', 'TRIAL', 'LIMITED', 'READONLY', 'MANAGED_BY_PROVIDER']);

// Canonical ModuleKey → legacy string key
const MODULE_KEY_TO_LEGACY: Record<string, string> = {
  INFRASTRUCTURE: 'infrastructure',
  SERVICE_DESK: 'service-desk',
  INVOICING: 'invoicing',
  PACKAGING: 'packaging',
  SKP: 'skp',
  AI: 'ai',
};

/**
 * Hook providing workspace-aware context for UI components.
 * Respects preview mode — when active, returns simulated role/scope.
 *
 * Uses canonical orgType + WorkspaceModule when available,
 * falls back to legacy organizationType + enabledModules[].
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

  // Workspace type & plan
  // Prefer canonical orgType (enum), fallback to legacy organizationType (string)
  const wsType: WorkspaceType = current?.orgType
    ? (current.orgType.toLowerCase() as WorkspaceType)
    : normalizeOrgType(current?.organizationType);
  const wsPlan: WorkspacePlan = normalizePlan(current?.plan);

  // Backward compat alias
  const organizationType = current?.organizationType ?? 'internal_it';

  // Canonical orgType for new code
  const orgType = current?.orgType ?? (wsType.toUpperCase() as 'CLIENT' | 'INTERNAL_IT' | 'MSP');

  // Feature flags
  const features: FeatureFlags = getFeatureFlags(wsType, wsPlan);

  // Module access — prefer canonical WorkspaceModule[], fallback to enabledModules[]
  const modules = current?.modules ?? [];
  const enabledModules = current?.enabledModules ?? ['infrastructure', 'service-desk'];

  const hasModule = (mod: string): boolean => {
    // Try canonical modules first
    if (modules.length > 0) {
      // mod could be legacy key (e.g. 'infrastructure') — check both directions
      for (const m of modules) {
        const legacyKey = MODULE_KEY_TO_LEGACY[m.moduleKey] ?? m.moduleKey.toLowerCase().replace('_', '-');
        if (legacyKey === mod && MODULE_VISIBLE_STATES.has(m.state)) return true;
      }
      return false;
    }
    // Fallback to legacy enabledModules
    if (enabledModules.includes(mod)) return true;
    if ((mod === 'infrastructure' || mod === 'service-desk') && enabledModules.includes('helpdesk')) return true;
    if (mod === 'skp' && enabledModules.includes('service')) return true;
    return false;
  };

  const getModuleState = (mod: string): ModuleState | null => {
    for (const m of modules) {
      const legacyKey = MODULE_KEY_TO_LEGACY[m.moduleKey] ?? m.moduleKey.toLowerCase().replace('_', '-');
      if (legacyKey === mod) return m.state;
    }
    return null;
  };

  // Debug
  if (typeof window !== 'undefined' && (window as any).__INFRADESK_DEBUG) {
    console.log('[WorkspaceContext]', { wsType, wsPlan, orgType, features, organizationType, modules });
  }

  return {
    workspace: current,
    wsType,
    wsPlan,
    orgType,
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
    getModuleState,
    modules,
    enabledModules,
  };
}

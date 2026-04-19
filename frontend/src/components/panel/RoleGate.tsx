/**
 * RoleGate — declarative visibility control for ID Panel.
 *
 * Two usage modes:
 *   1. Render children only when the current user matches allowed roles:
 *        <RoleGate allow={['OWNER', 'ADMIN']}><AdminStuff /></RoleGate>
 *
 *   2. Use the `useRole()` hook for conditional logic inside components:
 *        const { role, isMsp, isOwner, can } = useRole();
 *        if (can('manage_billing')) { ... }
 *
 * Abstraction goals:
 *   - Panel treats "MSP" (super-admin seeing operator view) as first-class.
 *   - Workspace membership drives Owner/Admin/Technician/Member/Viewer.
 *   - Capability map is centralized here so pages never hardcode role checks.
 */

import React from 'react';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import type { MemberRole } from '../../types';

export type PanelRole = 'MSP' | MemberRole;

export type Capability =
  | 'view_today'
  | 'view_security'
  | 'view_devices'
  | 'view_tickets'
  | 'view_vault'
  | 'view_billing'
  | 'manage_billing'
  | 'manage_members'
  | 'create_ticket'
  | 'use_ido_chat'
  | 'msp_tools';

const CAPABILITY_MAP: Record<Capability, PanelRole[]> = {
  view_today:      ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER', 'VIEWER'],
  view_security:   ['MSP', 'OWNER', 'ADMIN'],
  view_devices:    ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  view_tickets:    ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  view_vault:      ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN'],
  view_billing:    ['MSP', 'OWNER', 'ADMIN'],
  manage_billing:  ['MSP', 'OWNER'],
  manage_members:  ['MSP', 'OWNER', 'ADMIN'],
  create_ticket:   ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  use_ido_chat:    ['MSP', 'OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  msp_tools:       ['MSP'],
};

export function useRole() {
  const { user } = useAuth();
  const current = useWorkspace(s => s.current);
  const preview = useWorkspace(s => s.preview);

  // Preview mode overrides real role (operator viewing as end-user)
  const effectiveRole: PanelRole = React.useMemo(() => {
    if (preview) return (preview.role as PanelRole) ?? 'MEMBER';
    if (user?.isSuperAdmin) return 'MSP';
    return (current?.role as PanelRole) ?? 'VIEWER';
  }, [user, current, preview]);

  const is = React.useCallback(
    (...roles: PanelRole[]) => roles.includes(effectiveRole),
    [effectiveRole],
  );

  const can = React.useCallback(
    (cap: Capability) => CAPABILITY_MAP[cap]?.includes(effectiveRole) ?? false,
    [effectiveRole],
  );

  return {
    role: effectiveRole,
    isMsp: effectiveRole === 'MSP',
    isOwner: effectiveRole === 'OWNER',
    isAdmin: effectiveRole === 'ADMIN',
    isTech: effectiveRole === 'TECHNICIAN',
    isMember: effectiveRole === 'MEMBER',
    isViewer: effectiveRole === 'VIEWER',
    isPreview: !!preview,
    is,
    can,
  };
}

interface RoleGateProps {
  allow?: PanelRole[];
  deny?: PanelRole[];
  capability?: Capability;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGate({ allow, deny, capability, fallback = null, children }: RoleGateProps) {
  const { role, can } = useRole();

  if (capability && !can(capability)) return <>{fallback}</>;
  if (deny && deny.includes(role)) return <>{fallback}</>;
  if (allow && !allow.includes(role)) return <>{fallback}</>;

  return <>{children}</>;
}

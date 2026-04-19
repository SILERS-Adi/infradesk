/**
 * RoleGate — declarative visibility control for ID Panel.
 *
 * ID PANEL is ONLY for end-client users. MSP operators use the existing /admin
 * panel. A super-admin visiting /panel is redirected out by PanelLayout.
 *
 * Supported roles come directly from WorkspaceMembership.role:
 *   OWNER · ADMIN · TECHNICIAN · MEMBER · VIEWER
 *
 * Usage:
 *   <RoleGate allow={['OWNER', 'ADMIN']}><BillingThing /></RoleGate>
 *   const { role, isOwner, can } = useRole();
 *   if (can('manage_billing')) { ... }
 */

import React from 'react';
import { useWorkspace } from '../../store/workspaceStore';
import type { MemberRole } from '../../types';

export type PanelRole = MemberRole;

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
  | 'use_ido_chat';

const CAPABILITY_MAP: Record<Capability, PanelRole[]> = {
  view_today:      ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER', 'VIEWER'],
  view_security:   ['OWNER', 'ADMIN'],
  view_devices:    ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  view_tickets:    ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  view_vault:      ['OWNER', 'ADMIN', 'TECHNICIAN'],
  view_billing:    ['OWNER', 'ADMIN'],
  manage_billing:  ['OWNER'],
  manage_members:  ['OWNER', 'ADMIN'],
  create_ticket:   ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
  use_ido_chat:    ['OWNER', 'ADMIN', 'TECHNICIAN', 'MEMBER'],
};

export function useRole() {
  const current = useWorkspace(s => s.current);
  const preview = useWorkspace(s => s.preview);

  const effectiveRole: PanelRole = React.useMemo(() => {
    if (preview) return (preview.role as PanelRole) ?? 'MEMBER';
    return (current?.role as PanelRole) ?? 'VIEWER';
  }, [current, preview]);

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

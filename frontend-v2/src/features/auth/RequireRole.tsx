import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { api } from '@/lib/api';

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

interface MeResp { user: { id: string; isSuperAdmin?: boolean } }
interface MembershipResp {
  workspaces: Array<{ workspace: { id: string }; role: Role; status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'; isDefault: boolean }>;
}

export function RequireRole({
  roles,
  children,
  fallback = '/dashboard',
}: {
  roles: readonly Role[];
  children?: ReactElement;
  fallback?: string;
}): ReactElement | null {
  const { data: me, isLoading: meLoading } = useQuery<MeResp>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get('/users/me')).data,
    staleTime: 60_000,
  });
  const { data: ms, isLoading: msLoading } = useQuery<MembershipResp>({
    queryKey: ['workspaces', 'list'],
    queryFn: async () => (await api.get('/workspaces')).data,
    staleTime: 60_000,
  });

  if (meLoading || msLoading) return null;
  if (me?.user?.isSuperAdmin) return children ?? <Outlet />;

  const active = ms?.workspaces?.find((w) => w.status === 'ACTIVE' && w.isDefault) ?? ms?.workspaces?.[0];
  if (!active || !roles.includes(active.role)) return <Navigate to={fallback} replace />;
  return children ?? <Outlet />;
}
